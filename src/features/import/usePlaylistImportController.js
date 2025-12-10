import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import detectProvider from './detectProvider.js';
import usePlaylistImportFlow, { ImportFlowStatus } from './usePlaylistImportFlow.js';
import { extractErrorCode, CODES } from './adapters/types.js';
import { ERROR_MAP } from './errors.js';
import {
  ensureNotesEntries,
  ensureTagsEntries,
  groupRemoteNotes,
} from '../../utils/notesTagsData.js';
import { EMPTY_IMPORT_META } from '../../utils/storageBootstrap.js';
import { normalizeTimestamp } from '../../utils/trackProcessing.js';
import { playlistActions } from '../playlist/actions.js';
import { isPodcastTrack } from '../playlist/helpers.js';
import { focusById, focusElement } from '../../utils/focusById.js';
import { debugFocus } from '../../utils/debug.js';
import usePersistentPlaylistCache from './usePersistentPlaylistCache.js';
import { apiFetch } from '../../lib/apiClient.js';
import { derivePlaylistIdentity } from './playlistIdentity.js';

const REFRESHING_FROM_CACHE_ANNOUNCEMENT = 'Showing saved playlist while refreshing the latest data.';

function normalizeSourceKey(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return trimmed;
}

function computePayloadTotal(payload) {
  if (!payload) return null;
  if (typeof payload.total === 'number' && Number.isFinite(payload.total)) {
    return payload.total;
  }
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  return tracks.length;
}

/**
 * Formats a user-friendly rate limit message.
 *
 * `retryAt` is optionally populated when the import flow returns `{ ok: false, code: ERR_RATE_LIMITED, retryAt }`.
 * If `retryAt` is undefined (e.g., adapter didn't extract Retry-After header, or error was thrown rather than
 * returned), we fall back to a generic message. This defensive approach ensures we never crash on missing data
 * while still providing specific timing when available.
 *
 * @param {number=} retryAt - Unix timestamp (ms) when the rate limit resets, if known.
 * @returns {string}
 */
function formatRateLimitMessage(retryAt) {
  const now = Date.now();
  if (!retryAt || retryAt <= now) {
    return 'Too many requests. Try again shortly.';
  }
  const seconds = Math.ceil((retryAt - now) / 1000);
  return `Too many requests. Try again in ${seconds} seconds.`;
}

/**
 * @typedef {import('./adapters/types.js').ImportMeta} ImportMeta
 * @typedef {import('./adapters/types.js').ImportResult} ImportResult
 */

/**
 * @typedef {Object} PlaylistImportControllerDeps
 * @property {Function} dispatch
 * @property {Function} announce
 * @property {any[]} tracks
 * @property {import('react').MutableRefObject<any[]>} tracksRef
 * @property {import('../../utils/notesTagsData.js').NotesByTrack} notesByTrack
 * @property {Record<string, string[]>} tagsByTrack
 * @property {Function} setScreen
 * @property {Function} pushRecentPlaylist
 * @property {Function} updateRecentCardState
 * @property {Function} setSkipPlaylistFocusManagement
 * @property {Function} markTrackFocusContext
 * @property {import('react').MutableRefObject<string | null>} firstVisibleTrackIdRef
 * @property {import('react').MutableRefObject<boolean>} initialFocusAppliedRef
 * @property {import('react').RefObject<HTMLInputElement>} importInputRef
 * @property {import('react').RefObject<HTMLButtonElement>} reimportBtnRef
 * @property {import('react').RefObject<HTMLButtonElement>} loadMoreBtnRef
 * @property {import('react').MutableRefObject<string>} lastImportUrlRef
 * @property {Function} setPlaylistTitle
 * @property {Function} setImportedAt
 * @property {Function} setLastImportUrl
 * @property {string} playlistTitle
 * @property {string} screen
 * @property {string} lastImportUrl
 * @property {ImportMeta} initialImportMeta
 * @property {number} initialPersistedTrackCount
 */

/**
 * @typedef {Object} PlaylistImportControllerApi
 * @property {string} importUrl
 * @property {(next: string) => void} setImportUrl
 * @property {{ message: string, type: 'cancel' | 'rateLimit' | 'error' } | null} importError
 * @property {(error: { message: string, type: 'cancel' | 'rateLimit' | 'error' } | null) => void} setImportError
 * @property {string | null} providerChip
 * @property {ImportMeta} importMeta
 * @property {(next: ImportMeta | ((prev: ImportMeta) => ImportMeta)) => void} setImportMeta
 * @property {boolean} isInitialImportBusy
 * @property {boolean} isReimportBusy
 * @property {boolean} isLoadMoreBusy
 * @property {boolean} isAnyImportBusy
 * @property {boolean} showInitialSpinner
 * @property {boolean} showReimportSpinner
 * @property {boolean} showLoadMoreSpinner
 * @property {(event?: import('react').FormEvent<HTMLFormElement>) => Promise<void>} handleImport
 * @property {(recent: Record<string, any>) => Promise<{ ok: boolean, error?: string, stale?: boolean }>} handleSelectRecent
 * @property {() => Promise<void>} handleReimport
 * @property {(options?: { mode?: 'manual' | 'background', metaOverride?: ImportMeta }) => Promise<any>} handleLoadMore
 * @property {(options?: { resetHistory?: boolean }) => void} cancelBackgroundPagination
 * @property {(metaOverride?: ImportMeta) => void} startBackgroundPagination
 * @property {BackgroundSyncState} backgroundSync
 * @property {() => void} resetImportFlow
 * @property {'idle' | 'importing' | 'reimporting' | 'loadingMore'} importStatus
 * @property {() => Promise<void>} primeUpstreamServices
 * @property {boolean} isRefreshingCachedData
 * @property {CachedViewInfo | null} cachedViewInfo
 */

/**
 * @typedef {'idle' | 'pending' | 'loading' | 'cooldown' | 'complete' | 'error'} BackgroundSyncStatus
 * @typedef {{ status: BackgroundSyncStatus, loaded: number, total: number|null, lastError: string|null, snapshotId?: string|null }} BackgroundSyncState
 */

/** @type {BackgroundSyncState} */
const DEFAULT_BACKGROUND_SYNC = Object.freeze({
  status: 'complete',
  loaded: 0,
  total: 0,
  lastError: null,
  snapshotId: null,
});

/** @returns {BackgroundSyncState} */
function resolveInitialBackgroundState(initialImportMeta, initialPersistedTrackCount) {
  const base = initialImportMeta ?? EMPTY_IMPORT_META;
  return {
    status: base?.hasMore ? 'pending' : 'complete',
    loaded: initialPersistedTrackCount,
    total:
      typeof base?.total === 'number'
        ? base.total
        : base?.hasMore
          ? null
          : initialPersistedTrackCount,
    lastError: null,
    snapshotId: base?.snapshotId ?? null,
  };
}
/**
 * Central controller hook for playlist import orchestration.
 * Encapsulates URL state, import/reimport/load-more handlers, background pagination,
 * and focus/announcement side-effects while delegating adapter work to usePlaylistImportFlow.
 *
 * @param {PlaylistImportControllerDeps} deps
 * @returns {PlaylistImportControllerApi}
 */
export default function usePlaylistImportController({
  dispatch,
  announce,
  tracks,
  tracksRef,
  notesByTrack,
  tagsByTrack,
  setScreen,
  pushRecentPlaylist,
  updateRecentCardState,
  setSkipPlaylistFocusManagement,
  markTrackFocusContext,
  firstVisibleTrackIdRef,
  initialFocusAppliedRef,
  importInputRef,
  reimportBtnRef,
  loadMoreBtnRef,
  lastImportUrlRef,
  setPlaylistTitle,
  setImportedAt,
  setLastImportUrl,
  playlistTitle,
  screen,
  lastImportUrl,
  initialImportMeta,
  initialPersistedTrackCount,
}) {
  const baseImportMeta = useMemo(
    () => ({ ...EMPTY_IMPORT_META, ...(initialImportMeta ?? {}) }),
    [initialImportMeta],
  );

  const { getCachedResult, rememberCachedResult } = usePersistentPlaylistCache();

  const [importUrl, setImportUrl] = useState('');
  const providerChip = useMemo(() => detectProvider(importUrl || ''), [importUrl]);
  const [importError, setImportError] = useState(null);
  const [importMeta, setImportMeta] = useState(baseImportMeta);
  const importMetaRef = useRef(importMeta);
  useEffect(() => {
    importMetaRef.current = importMeta;
  }, [importMeta]);

  /** @type {[BackgroundSyncState, import('react').Dispatch<import('react').SetStateAction<BackgroundSyncState>>]} */
  const [backgroundSync, setBackgroundSync] = useState(() =>
    resolveInitialBackgroundState(baseImportMeta, initialPersistedTrackCount),
  );
  const [isRefreshingCachedData, setIsRefreshingCachedData] = useState(false);
  const [cachedViewInfo, setCachedViewInfo] = useState(null);

  const rememberResultInCache = useCallback(
    (payload, options = {}) => {
      if (!payload) return;
      const primarySource = normalizeSourceKey(
        options.sourceUrl ?? payload?.meta?.sourceUrl ?? '',
      );
      const identity = derivePlaylistIdentity(payload?.meta, primarySource);
      const canonicalKey = identity?.key ?? (primarySource || null);
      const aliasSet = new Set(
        [
          primarySource,
          normalizeSourceKey(payload?.meta?.sourceUrl ?? ''),
          ...(Array.isArray(options.aliases) ? options.aliases.map(normalizeSourceKey) : []),
        ].filter(Boolean),
      );
      if (!canonicalKey) return;
      aliasSet.delete(canonicalKey);
      rememberCachedResult(canonicalKey, payload, { aliases: Array.from(aliasSet) });
    },
    [rememberCachedResult],
  );

  const syncAnnotations = useCallback(async () => {
    try {
      const response = await apiFetch('/api/db/notes');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error ?? `Failed to sync notes (${response.status})`);
      }
      const { notes: remoteNotes, tags: remoteTags } = groupRemoteNotes(
        Array.isArray(payload?.notes) ? payload.notes : [],
      );
      if (
        Object.keys(remoteNotes).length === 0 &&
        Object.keys(remoteTags).length === 0
      ) {
        return;
      }
      dispatch(playlistActions.mergeRemoteData(remoteNotes, remoteTags));
    } catch (err) {
      console.error('[annotation sync] failed', err);
      throw err;
    }
  }, [dispatch]);

  const {
    status: importStatus,
    loading: importLoading,
    importInitial,
    reimport: reimportPlaylist,
    loadMore: loadMoreTracks,
    resetFlow: resetImportFlow,
    primeUpstreamServices,
  } = usePlaylistImportFlow();

  const hasPrimedUpstreamRef = useRef(false);

  const msgFromCode = useCallback(
    (code) =>
      ERROR_MAP[code] ?? ERROR_MAP[CODES.ERR_UNKNOWN] ?? 'Something went wrong. Please try again.',
    [],
  );

  /** @type {import('react').MutableRefObject<{ key: string | null, requestId: number | null } | null>} */
  const backgroundPagerRef = useRef(null);
  /** @type {import('react').MutableRefObject<Map<string, { promise: Promise<any>, controller: AbortController, mode: 'manual' | 'background', requestId: number }>>} */
  const pagerFlightsRef = useRef(new Map());
  /** @type {import('react').MutableRefObject<Map<string, true>>} */
  const pagerLastSuccessRef = useRef(new Map());
  const pagerCooldownRef = useRef({ until: 0 });
  /** @type {import('react').MutableRefObject<ReturnType<typeof setTimeout> | null>} */
  const pagerResumeTimerRef = useRef(null);
  const pagerRequestIdRef = useRef(0);
  const startBackgroundPaginationRef = useRef(() => {});

  const focusImportInput = useCallback(() => {
    const node = importInputRef?.current;
    if (!node || typeof node.focus !== 'function') return;
    requestAnimationFrame(() => {
      node.focus();
      if (typeof node.select === 'function') {
        node.select();
      }
    });
  }, [importInputRef]);

  const getPagerKey = useCallback((meta) => {
    if (!meta || typeof meta !== 'object') return null;
    const provider =
      typeof meta.provider === 'string' && meta.provider.trim() ? meta.provider.trim() : 'no-provider';
    const playlistId =
      typeof meta.playlistId === 'string' && meta.playlistId.trim()
        ? meta.playlistId.trim()
        : 'no-playlist';
    const snapshotId =
      typeof meta.snapshotId === 'string' && meta.snapshotId.trim()
        ? meta.snapshotId.trim()
        : 'no-snapshot';
    const cursor =
      typeof meta.cursor === 'string' && meta.cursor.trim() ? meta.cursor.trim() : 'no-cursor';
    return `${provider}::${playlistId}::${snapshotId}::${cursor}`;
  }, []);

  const cancelBackgroundPagination = useCallback(
    (options = {}) => {
      if (pagerResumeTimerRef.current) {
        clearTimeout(pagerResumeTimerRef.current);
        pagerResumeTimerRef.current = null;
      }
      pagerFlightsRef.current.forEach((flight) => {
        try {
          flight.controller.abort();
        } catch {
          // ignore cancellation errors
        }
      });
      pagerFlightsRef.current.clear();
      backgroundPagerRef.current = null;
      if (options && options.resetHistory) {
        pagerLastSuccessRef.current.clear();
        pagerCooldownRef.current.until = 0;
      }
      setBackgroundSync((prev) => {
        const hasMore = Boolean(importMetaRef.current?.hasMore);
        return {
          ...prev,
          status: hasMore ? 'pending' : 'complete',
          lastError: null,
        };
      });
    },
    [],
  );
  /**
   * @param {any} payload
   * @param {{
   *   sourceUrl?: string,
   *   announceMessage?: string,
   *   fallbackTitle?: string,
   *   focusBehavior?: 'first-track' | 'heading' | 'default-heading',
   *   recents?: {
   *     importedAt?: number | string | Date | null,
   *     total?: number | null,
   *     coverUrl?: string | null,
   *     lastUsedAt?: number | null,
   *     pinned?: boolean
   *   } | null,
   *   updateLastImportUrl?: boolean
   * }} [options]
   */
  const applyImportResult = useCallback(
    (payload, options = {}) => {
      const {
        sourceUrl,
        announceMessage,
        fallbackTitle,
        focusBehavior = 'first-track',
        recents,
        updateLastImportUrl = true,
      } = options || {};

      cancelBackgroundPagination({ resetHistory: true });
      initialFocusAppliedRef.current = false;

      const mapped = Array.isArray(payload?.tracks) ? payload.tracks : [];
      const rawMeta = payload?.meta ?? {};
      const importedTimestamp = payload?.importedAt ?? null;
      const resolvedTitle = payload?.title || fallbackTitle || 'Imported Playlist';
      const trackCount = mapped.length;
      const hasPodcastTracks = mapped.some(isPodcastTrack);
      const hasMusicTracks = mapped.some(track => !isPodcastTrack(track));
      const fallbackKind = hasPodcastTracks && !hasMusicTracks ? 'podcast' : 'music';
      const resolvedContentKind =
        rawMeta?.contentKind === 'podcast' || rawMeta?.contentKind === 'music'
          ? rawMeta.contentKind
          : fallbackKind;
      const targetScreen = resolvedContentKind === 'podcast' ? 'podcast' : 'playlist';
      const headingId = targetScreen === 'podcast' ? 'podcast-title' : 'playlist-title';
      const meta = {
        ...EMPTY_IMPORT_META,
        ...rawMeta,
        contentKind: resolvedContentKind,
      };

      try {
        setSkipPlaylistFocusManagement(true);

        const previousTracks = Array.isArray(tracksRef.current) ? tracksRef.current : [];
        const samePlaylist =
          previousTracks.length > 0 &&
          importMeta?.provider &&
          meta?.provider &&
          importMeta?.playlistId &&
          meta?.playlistId &&
          importMeta.provider === meta.provider &&
          importMeta.playlistId === meta.playlistId;

        const nextNotesMap = ensureNotesEntries(notesByTrack, mapped);
        const nextTagsMap = ensureTagsEntries(tagsByTrack, mapped);

        dispatch(
          playlistActions.setTracksWithNotes(
            mapped,
            nextNotesMap,
            nextTagsMap,
            samePlaylist ? previousTracks : [],
            importedTimestamp ?? null,
          ),
        );
        markTrackFocusContext('initial-import');
        setImportMeta(meta);
        setPlaylistTitle(resolvedTitle);
        setImportedAt(importedTimestamp);
        if (updateLastImportUrl && typeof sourceUrl === 'string') {
          setLastImportUrl(sourceUrl);
        }
        setScreen(targetScreen);

        const message =
          typeof announceMessage === 'string'
            ? announceMessage
            : targetScreen === 'podcast'
              ? `Podcast imported. ${trackCount} ${trackCount === 1 ? 'episode' : 'episodes'}.`
              : `Playlist imported. ${trackCount} ${trackCount === 1 ? 'track' : 'tracks'}.`;
        announce(message);

        const releaseFocusGate = () => {
          debugFocus('app:init-import:gate-release', {});
          setSkipPlaylistFocusManagement(false);
        };

        const focusButtonForTrack = (trackId, metaInfo = {}) => {
          if (!trackId) return false;
          const node = document.getElementById('add-note-btn-' + trackId);
          if (node && typeof node.focus === 'function') {
            debugFocus('app:init-import:focus-track', {
              requestedTrackId: trackId,
              resolvedTargetId: node.id,
              ...metaInfo,
            });
            focusElement(node);
            return true;
          }
          debugFocus('app:init-import:target-missing', {
            requestedTrackId: trackId,
            ...metaInfo,
          });
          return false;
        };

        const focusFirstVisibleWithRetry = (attempt = 0) => {
          const MAX_RETRIES = 5;
          const targetId = firstVisibleTrackIdRef.current;
          debugFocus('app:init-import:retry', {
            attempt,
            reportedTrackId: targetId,
          });

          if (focusButtonForTrack(targetId, { attempt, source: 'first-visible' })) {
            initialFocusAppliedRef.current = true;
            releaseFocusGate();
            return;
          }

          if (attempt < MAX_RETRIES) {
            requestAnimationFrame(() => focusFirstVisibleWithRetry(attempt + 1));
            return;
          }

          const firstAddNoteBtn = /** @type {HTMLButtonElement | null} */ (
            document.querySelector('button[id^="add-note-btn-"]')
          );
          if (firstAddNoteBtn && typeof firstAddNoteBtn.focus === 'function') {
            debugFocus('app:init-import:fallback-first-rendered', {
              reportedTrackId: targetId,
              resolvedTargetId: firstAddNoteBtn.id,
            });
            focusElement(firstAddNoteBtn);
            initialFocusAppliedRef.current = true;
          } else {
            debugFocus('app:init-import:fallback-heading', {
              reportedTrackId: targetId,
            });
            focusById(headingId);
          }
          releaseFocusGate();
        };

        requestAnimationFrame(() => {
          try {
            if (focusBehavior === 'heading') {
              debugFocus('app:init-import:heading-request', {});
              focusById(headingId);
              releaseFocusGate();
              return;
            }
            if (focusBehavior === 'first-track' && !initialFocusAppliedRef.current && trackCount > 0) {
              focusFirstVisibleWithRetry(0);
              return;
            }
            debugFocus('app:init-import:default-heading', {});
            focusById(headingId);
            releaseFocusGate();
          } catch (err) {
            releaseFocusGate();
            throw err;
          }
        });
      } catch (err) {
        setSkipPlaylistFocusManagement(false);
        throw err;
      }
      if (recents) {
        const importedAtMs =
          recents.importedAt != null
            ? normalizeTimestamp(recents.importedAt)
            : normalizeTimestamp(importedTimestamp);
        pushRecentPlaylist(meta, {
          title: resolvedTitle,
          sourceUrl: sourceUrl ?? meta?.sourceUrl ?? '',
          total: typeof recents.total === 'number' ? recents.total : trackCount,
          coverUrl: recents.coverUrl,
          importedAt: importedAtMs ?? undefined,
          lastUsedAt: recents.lastUsedAt,
          pinned: recents.pinned,
          lastRefreshedAt: recents.lastRefreshedAt,
        });
      }

      setBackgroundSync({
        status: meta?.hasMore ? 'pending' : 'complete',
        loaded: mapped.length,
        total:
          typeof meta?.total === 'number'
            ? meta.total
            : typeof payload?.total === 'number'
              ? payload.total
              : meta?.hasMore
                ? null
                : mapped.length,
        lastError: null,
        snapshotId: meta?.snapshotId ?? null,
      });

      const cacheSource = sourceUrl ?? meta?.sourceUrl ?? '';
      rememberResultInCache(payload, { sourceUrl: cacheSource });

      return { trackCount, title: resolvedTitle };
    },
    [
      announce,
      cancelBackgroundPagination,
      dispatch,
      firstVisibleTrackIdRef,
      importMeta,
      initialFocusAppliedRef,
      markTrackFocusContext,
      notesByTrack,
      pushRecentPlaylist,
      rememberResultInCache,
      setImportedAt,
      setImportMeta,
      setLastImportUrl,
      setPlaylistTitle,
      setScreen,
      setSkipPlaylistFocusManagement,
      tagsByTrack,
      tracksRef,
    ],
  );
  /**
   * @param {string} sourceUrl
   * @param {{
   *   announceMessage?: string,
   *   focusBehavior?: 'first-track' | 'heading' | 'default-heading',
   *   recents?: {
   *     coverUrl?: string | null,
   *     pinned?: boolean,
   *     lastUsedAt?: number | null
   *   } | null
   * }} [options]
  */
  const hydrateFromCache = useCallback(
    (sourceUrl, options = {}) => {
      const resolvedSource = normalizeSourceKey(sourceUrl ?? '');
      const payload = resolvedSource ? getCachedResult(resolvedSource) : null;
      if (!payload) {
        return null;
      }
      const total = computePayloadTotal(payload);
      const {
        recents: recentsOverrides,
        announceMessage: announceOverride,
        focusBehavior: focusOverride,
        viewSource = 'manual',
      } = options || {};
      const shouldSkipRecents = recentsOverrides === null;
      const mergedRecents = shouldSkipRecents
        ? null
        : {
            importedAt: payload?.importedAt ?? null,
            total,
            coverUrl: payload?.coverUrl ?? recentsOverrides?.coverUrl ?? null,
            lastUsedAt: recentsOverrides?.lastUsedAt ?? Date.now(),
            pinned: recentsOverrides?.pinned,
            lastRefreshedAt: recentsOverrides?.lastRefreshedAt ?? null,
          };

      applyImportResult(payload, {
        sourceUrl: resolvedSource || sourceUrl || '',
        announceMessage: announceOverride ?? REFRESHING_FROM_CACHE_ANNOUNCEMENT,
        ...(focusOverride ? { focusBehavior: focusOverride } : {}),
        recents: mergedRecents,
      });

      const resolvedCount =
        typeof total === 'number'
          ? total
          : Array.isArray(payload?.tracks)
            ? payload.tracks.length
            : null;
      const cachedImportedAt = normalizeTimestamp(
        payload?.importedAt ?? recentsOverrides?.importedAt ?? null,
      );
      const cachedRefreshedAt = normalizeTimestamp(recentsOverrides?.lastRefreshedAt ?? null);
      setCachedViewInfo({
        trackCount: resolvedCount,
        importedAt: cachedImportedAt ?? null,
        lastRefreshedAt: cachedRefreshedAt ?? null,
        source: viewSource === 'recent' ? 'recent' : viewSource === 'import' ? 'import' : 'manual',
      });

      return { data: payload };
    },
    [applyImportResult, getCachedResult],
  );
  const handleImportSubmit = useCallback(
    async (event) => {
      event?.preventDefault?.();
      setImportError(null);
      cancelBackgroundPagination({ resetHistory: true });
      const trimmedUrl = importUrl.trim();

      if (!trimmedUrl) {
        const msg = 'Paste a playlist URL to import.';
        setImportError({ message: msg, type: 'error' });
        announce('Import failed. URL missing.');
        focusImportInput();
        console.log('[import error]', { code: 'URL_MISSING', raw: null });
        return;
      }

      if (!providerChip) {
        const msg = msgFromCode(CODES.ERR_UNSUPPORTED_URL);
        setImportError({ message: msg, type: 'error' });
        announce('Import failed. Unsupported URL.');
        focusImportInput();
        console.log('[import error]', { code: CODES.ERR_UNSUPPORTED_URL, raw: null });
        return;
      }

      announce('Import started.');
      const cachedEntry = hydrateFromCache(trimmedUrl);
      const hydratedFromCache = Boolean(cachedEntry);
      if (hydratedFromCache) {
        setIsRefreshingCachedData(true);
      }
      try {
        const result = await importInitial(trimmedUrl, {
          providerHint: providerChip,
          sourceUrl: trimmedUrl,
        });

        if (result?.stale) return;

        if (!result.ok) {
          const code = result.code ?? CODES.ERR_UNKNOWN;
          let msg = msgFromCode(code);
          console.log('[import error]', { code, raw: result.error });
          
          const type = code === CODES.ERR_RATE_LIMITED ? 'rateLimit' : 'error';
          if (type === 'rateLimit') {
            msg = formatRateLimitMessage(result.retryAt);
          }
          setImportError({ message: msg, type });
          announce('Import failed. ' + msg);
          focusImportInput();
          return;
        }

        applyImportResult(result.data, {
          sourceUrl: trimmedUrl,
          recents: {
            importedAt: result.data?.importedAt ?? null,
            total:
              typeof result.data?.total === 'number'
                ? result.data.total
                : Array.isArray(result.data?.tracks)
                  ? result.data.tracks.length
                  : null,
            coverUrl: result.data?.coverUrl ?? null,
            lastRefreshedAt: Date.now(),
          },
        });
        setCachedViewInfo(null);
      } catch (err) {
        if (err?.name === 'AbortError') {
          setImportError({ message: 'Import canceled.', type: 'cancel' });
          announce('Import canceled.');
          return;
        }
        const code = extractErrorCode(err);
        let msg = msgFromCode(code);
        console.log('[import error]', { code, raw: err });
        
        const type = code === CODES.ERR_RATE_LIMITED ? 'rateLimit' : 'error';
        if (type === 'rateLimit') {
          msg = formatRateLimitMessage(err?.retryAt);
        }
        setImportError({ message: msg, type });
        announce('Import failed. ' + msg);
        focusImportInput();
      } finally {
        if (hydratedFromCache) {
          setIsRefreshingCachedData(false);
        }
      }
    },
    [
      announce,
      applyImportResult,
      cancelBackgroundPagination,
      hydrateFromCache,
      focusImportInput,
      importInitial,
      importUrl,
      setIsRefreshingCachedData,
      msgFromCode,
      providerChip,
    ],
  );
  useEffect(() => {
    if (hasPrimedUpstreamRef.current) return;
    const trimmedUrl = typeof importUrl === 'string' ? importUrl.trim() : '';
    if (!trimmedUrl) return;
    if (providerChip !== 'spotify') return;
    if (typeof primeUpstreamServices !== 'function') return;
    hasPrimedUpstreamRef.current = true;
    Promise.resolve(primeUpstreamServices()).catch(() => {
      // Best-effort warmup; failures are intentionally ignored.
    });
  }, [importUrl, providerChip, primeUpstreamServices]);
  const handleSelectRecent = useCallback(
    async (recent) => {
      if (!recent || !recent.id) {
        return { ok: false, error: 'Unknown playlist' };
      }
      const isAnyBusy = importStatus !== ImportFlowStatus.IDLE;
      if (isAnyBusy) {
        const msg = 'Finish the current import before loading another playlist.';
        const errObj = { message: msg, type: 'error' };
        updateRecentCardState(recent.id, { error: errObj, loading: false });
        announce(msg);
        return { ok: false, error: msg };
      }

      const trimmedUrl = typeof recent.sourceUrl === 'string' ? recent.sourceUrl.trim() : '';
      if (!trimmedUrl) {
        const msg = "Can't load - link changed.";
        const errObj = { message: msg, type: 'error' };
        updateRecentCardState(recent.id, { error: errObj, loading: false });
        announce(msg);
        return { ok: false, error: msg };
      }

      cancelBackgroundPagination({ resetHistory: true });
      setImportUrl(trimmedUrl);
      setImportError(null);
      updateRecentCardState(recent.id, { loading: true, error: null });
      announce(`Loading playlist ${recent.title ? `"${recent.title}"` : ''} from your saved copy.`);
      const cachedEntry = hydrateFromCache(trimmedUrl, {
        focusBehavior: 'heading',
        announceMessage: REFRESHING_FROM_CACHE_ANNOUNCEMENT,
        recents: {
          coverUrl: recent.coverUrl ?? null,
          pinned: Boolean(recent.pinned),
          lastUsedAt: Date.now(),
          importedAt: recent.importedAt ?? null,
          total: typeof recent.total === 'number' ? recent.total : null,
          lastRefreshedAt: recent.lastRefreshedAt ?? null,
        },
        viewSource: 'recent',
      });

      if (cachedEntry) {
        updateRecentCardState(recent.id, null);
        setIsRefreshingCachedData(true);
        try {
          await syncAnnotations();
        } catch (_err) {
          announce("Couldn't sync latest notes (check connection)");
        } finally {
          setIsRefreshingCachedData(false);
        }
        return { ok: true };
      }

      // Cache miss: fall back to live import
      setIsRefreshingCachedData(true);
      announce('Saved copy unavailable. Fetching latest playlist data.');
      try {
        const result = await importInitial(trimmedUrl, {
          providerHint: recent.provider,
          sourceUrl: trimmedUrl,
        });

        if (result?.stale) {
          updateRecentCardState(recent.id, {});
          return { ok: false, stale: true };
        }

        if (!result.ok) {
          const code = result.code ?? CODES.ERR_UNKNOWN;
          let msg = msgFromCode(code);
          console.log('[recent import error]', { code, raw: result.error });
          
          const type = code === CODES.ERR_RATE_LIMITED ? 'rateLimit' : 'error';
          if (type === 'rateLimit') {
            msg = formatRateLimitMessage(result.retryAt);
          }
          const errObj = { message: msg, type };
          updateRecentCardState(recent.id, { loading: false, error: errObj });
          setImportError(errObj);
          announce(msg);
          return { ok: false, error: msg };
        }

        applyImportResult(result.data, {
          sourceUrl: trimmedUrl,
          focusBehavior: 'heading',
          recents: {
            importedAt: result.data?.importedAt ?? null,
            total:
              typeof result.data?.total === 'number'
                ? result.data.total
                : Array.isArray(result.data?.tracks)
                  ? result.data.tracks.length
                  : null,
            coverUrl: result.data?.coverUrl ?? recent.coverUrl ?? null,
            lastUsedAt: Date.now(),
            lastRefreshedAt: Date.now(),
          },
        });
        setCachedViewInfo(null);
        updateRecentCardState(recent.id, null);
        return { ok: true };
      } catch (err) {
        if (err?.name === 'AbortError') {
          const msg = 'Import canceled.';
          const errObj = { message: msg, type: 'cancel' };
          updateRecentCardState(recent.id, { loading: false, error: errObj });
          announce(msg);
          return { ok: false, error: msg };
        }
        const code = extractErrorCode(err);
        let msg = msgFromCode(code);
        console.log('[recent import error]', { code, raw: err });
        
        const type = code === CODES.ERR_RATE_LIMITED ? 'rateLimit' : 'error';
        if (type === 'rateLimit') {
          msg = formatRateLimitMessage(err?.retryAt);
        }
        const errObj = { message: msg, type };
        updateRecentCardState(recent.id, { loading: false, error: errObj });
        setImportError(errObj);
        announce(msg);
        return { ok: false, error: msg };
      } finally {
        setIsRefreshingCachedData(false);
      }
    },
    [
      announce,
      applyImportResult,
      cancelBackgroundPagination,
      hydrateFromCache,
      importInitial,
      importStatus,
      msgFromCode,
      setImportError,
      setCachedViewInfo,
      setIsRefreshingCachedData,
      setImportUrl,
      syncAnnotations,
      updateRecentCardState,
    ],
  );
  const handleReimport = useCallback(async () => {
    if (!lastImportUrl) return;
    cancelBackgroundPagination({ resetHistory: true });
    const wasActive = document.activeElement === reimportBtnRef.current;
    setImportError(null);
    const cachedEntry = hydrateFromCache(lastImportUrl, {
      focusBehavior: 'heading',
      announceMessage: REFRESHING_FROM_CACHE_ANNOUNCEMENT,
      recents: null,
    });
    const hydratedFromCache = Boolean(cachedEntry);
    if (hydratedFromCache) {
      setIsRefreshingCachedData(true);
    }
    announce('Re-importing playlist.');
    try {
      const result = await reimportPlaylist(lastImportUrl, {
        providerHint: importMeta.provider ?? null,
        existingMeta: importMeta,
        fallbackTitle: playlistTitle ?? '',
      });

      if (result?.stale) return;

        if (!result.ok) {
          const code = result.code ?? CODES.ERR_UNKNOWN;
          let msg = msgFromCode(code);
          console.log('[reimport error]', { code, raw: result.error });
          
          const type = code === CODES.ERR_RATE_LIMITED ? 'rateLimit' : 'error';
          if (type === 'rateLimit') {
            msg = formatRateLimitMessage(result.retryAt);
          }
        setImportError({ message: msg, type });
        announce(msg);
        if (wasActive) focusElement(reimportBtnRef.current);
        return;
      }

      const resolvedTotal =
        typeof result.data?.total === 'number'
          ? result.data.total
          : Array.isArray(result.data?.tracks)
            ? result.data.tracks.length
            : null;

      applyImportResult(result.data, {
        sourceUrl: lastImportUrl,
        fallbackTitle: playlistTitle ?? '',
        announceMessage: `Playlist re-imported. ${resolvedTotal ?? 0} tracks available.`,
        recents: {
          importedAt: result.data?.importedAt ?? null,
          total: resolvedTotal,
          coverUrl: result.data?.coverUrl ?? null,
          lastUsedAt: Date.now(),
          lastRefreshedAt: Date.now(),
        },
        updateLastImportUrl: false,
      });
      setCachedViewInfo(null);
      if (wasActive) focusElement(reimportBtnRef.current);
    } catch (err) {
      if (err?.name === 'AbortError') {
        setImportError({ message: 'Import canceled.', type: 'cancel' });
        announce('Import canceled.');
        return;
      }
      const code = extractErrorCode(err);
      let msg = msgFromCode(code);
      console.log('[reimport error]', { code, raw: err });
      
      const type = code === CODES.ERR_RATE_LIMITED ? 'rateLimit' : 'error';
      if (type === 'rateLimit') {
        msg = formatRateLimitMessage(err?.retryAt);
      }
      setImportError({ message: msg, type });
      announce(msg);
      if (wasActive) focusElement(reimportBtnRef.current);
    } finally {
      if (hydratedFromCache) {
        setIsRefreshingCachedData(false);
      }
    }
  }, [
    announce,
    applyImportResult,
    cancelBackgroundPagination,
    hydrateFromCache,
    importMeta,
    lastImportUrl,
    playlistTitle,
    setCachedViewInfo,
    setIsRefreshingCachedData,
    msgFromCode,
    reimportBtnRef,
    reimportPlaylist,
    setImportError,
  ]);
  const handleLoadMore = useCallback(
    async (options = {}) => {
      const mode = options?.mode === 'background' ? 'background' : 'manual';
      const isBackground = mode === 'background';
      const currentMeta = importMetaRef.current;
      const metaSnapshot = /** @type {ImportMeta | undefined} */ (
        options?.metaOverride ?? currentMeta
      );
      const sourceUrl = lastImportUrlRef.current;

      if (!metaSnapshot?.cursor || !metaSnapshot?.provider || !sourceUrl) {
        return { ok: false, reason: 'unavailable' };
      }

      const key = getPagerKey(metaSnapshot);
      if (!key) {
        return { ok: false, reason: 'unavailable' };
      }

      if (!isBackground) {
        setImportError(null);
      }

      const finalizeManualResult = (result) => {
        if (!result || result.stale || result.aborted) {
          return result;
        }
        if (result.ok) {
          if (result.added > 0) {
            const targetId = result.firstNewTrackId ?? null;
            if (targetId) {
              debugFocus('app:load-more:manual', {
                firstNewTrackId: targetId,
                added: result.added,
              });
              focusById(`track-${targetId}`);
            } else {
              requestAnimationFrame(() => {
                debugFocus('app:load-more:manual-fallback', {
                  added: result.added,
                });
                focusElement(loadMoreBtnRef.current);
              });
            }
            announce(`${result.added} more tracks loaded.`);
          } else {
            announce('No additional tracks available.');
          }
          setImportError(null);
        } else if (result.code === CODES.ERR_RATE_LIMITED) {
          const message = formatRateLimitMessage(result.retryAt);
          setImportError({ message, type: 'rateLimit' });
          announce(message);
        } else if (result.code) {
          const message = msgFromCode(result.code);
          setImportError({ message, type: 'error' });
          announce(message);
        } else {
          const fallback = msgFromCode(CODES.ERR_UNKNOWN);
          setImportError({ message: fallback, type: 'error' });
          announce(fallback);
        }
        return result;
      };

      const resolveRetryAfterMs = (error) => {
        if (!error || typeof error !== 'object') return null;
        const directMs = Number(error.retryAfterMs);
        if (Number.isFinite(directMs) && directMs > 0) return directMs;
        const retrySeconds = Number(error.retryAfterSeconds ?? error.retryAfter);
        if (Number.isFinite(retrySeconds) && retrySeconds > 0) return retrySeconds * 1000;
        return null;
      };

      const scheduleResume = (resumeAtMs) => {
        if (!resumeAtMs) return;
        const normalized = Math.max(resumeAtMs, Date.now() + 1000);
        pagerCooldownRef.current.until = normalized;
        if (pagerResumeTimerRef.current) {
          clearTimeout(pagerResumeTimerRef.current);
        }
        const delay = Math.max(0, normalized - Date.now());
        pagerResumeTimerRef.current = setTimeout(() => {
          pagerResumeTimerRef.current = null;
          pagerCooldownRef.current.until = 0;
          startBackgroundPaginationRef.current();
        }, delay);
      };
      const now = Date.now();
      const cooldownUntil = pagerCooldownRef.current.until ?? 0;
      if (cooldownUntil > now) {
        const cooldownMessage = formatRateLimitMessage(cooldownUntil);
        setBackgroundSync((prev) => ({
          ...prev,
          status: 'cooldown',
          lastError: cooldownMessage,
        }));
        if (!isBackground) {
          setImportError({ message: cooldownMessage, type: 'rateLimit' });
          announce(cooldownMessage);
        }
        return { ok: false, code: CODES.ERR_RATE_LIMITED, retryAt: cooldownUntil };
      }

      if (pagerLastSuccessRef.current.has(key)) {
        return { ok: true, done: !metaSnapshot?.hasMore, added: 0, skipped: true };
      }

      const existingFlight = pagerFlightsRef.current.get(key);
      if (existingFlight) {
        if (isBackground) {
          backgroundPagerRef.current = { key, requestId: existingFlight.requestId };
          return existingFlight.promise;
        }
        announce('Loading more tracks.');
        return existingFlight.promise.then((res) => finalizeManualResult(res));
      }

      const controller = new AbortController();
      const requestId = ++pagerRequestIdRef.current;

      if (isBackground) {
        setBackgroundSync((prev) => ({
          ...prev,
          status: 'loading',
          lastError: null,
        }));
      } else {
        announce('Loading more tracks.');
      }

      const flightPromise = (async () => {
        try {
          const currentTracks = Array.isArray(tracksRef.current) ? tracksRef.current : [];
          const existingIds = currentTracks.map((t) => t.id);
          const result = /** @type {ImportResult} */ (
            await loadMoreTracks({
              providerHint: metaSnapshot.provider ?? null,
              existingMeta: metaSnapshot,
              startIndex: currentTracks.length,
              existingIds,
              signal: controller.signal,
            })
          );

          if (result?.stale) {
            return { ok: false, stale: true };
          }

          if (!result.ok) {
            const code = result.code ?? CODES.ERR_UNKNOWN;
            const msg = msgFromCode(code);
            console.log('[load-more error]', { code, raw: result.error });
            if (code === CODES.ERR_RATE_LIMITED) {
              const retryMs = resolveRetryAfterMs(result.error);
              if (retryMs) {
                const resumeAt = Date.now() + retryMs;
                scheduleResume(resumeAt);
                const cooldownMessage = formatRateLimitMessage(resumeAt);
                setBackgroundSync((prev) => ({
                  ...prev,
                  status: 'cooldown',
                  lastError: cooldownMessage,
                }));
                return { ok: false, code, retryAt: resumeAt };
              }
              if (isBackground) {
                setBackgroundSync((prev) => ({
                  ...prev,
                  status: 'error',
                  lastError: msg,
                }));
              } else {
                setImportError({ message: msg, type: 'rateLimit' });
                announce(msg);
              }
              return { ok: false, code };
            }

            const errorMessage = msgFromCode(code);
            if (isBackground) {
              setBackgroundSync((prev) => ({
                ...prev,
                status: 'error',
                lastError: errorMessage,
              }));
            } else {
              setImportError({ message: errorMessage, type: 'error' });
              announce(errorMessage);
            }
            return { ok: false, code };
          }

          const additions = Array.isArray(result.data?.tracks) ? result.data.tracks : [];
          const meta = /** @type {ImportMeta} */ ({
            ...EMPTY_IMPORT_META,
            ...(result.data?.meta ?? {}),
          });
          const hasMore = Boolean(meta.hasMore);

          if (!additions.length) {
            setImportMeta((prev) => ({
              ...prev,
              ...meta,
            }));
            pagerLastSuccessRef.current.set(key, true);
            if (isBackground) {
              setBackgroundSync((prev) => ({
                ...prev,
                status: hasMore ? 'pending' : 'complete',
                lastError: null,
                snapshotId: meta?.snapshotId ?? prev.snapshotId ?? null,
              }));
            }
            return { ok: true, done: !hasMore, added: 0, firstNewTrackId: null };
          }

          const nextNotesMap = ensureNotesEntries(notesByTrack, additions);
          const nextTagsMap = ensureTagsEntries(tagsByTrack, additions);
          const baseTracks = Array.isArray(tracks) ? tracks : [];
          const loadMoreStamp = new Date().toISOString();

          const allTracks = [...baseTracks, ...additions];
          dispatch(
            playlistActions.setTracksWithNotes(
              allTracks,
              nextNotesMap,
              nextTagsMap,
              baseTracks,
              loadMoreStamp,
            ),
          );
          markTrackFocusContext(isBackground ? 'background-load-more' : 'manual-load-more');
          setImportMeta((prev) => ({
            ...prev,
            ...meta,
          }));
          setImportedAt(loadMoreStamp);
          pagerLastSuccessRef.current.set(key, true);

          const previousMeta = importMetaRef.current ?? EMPTY_IMPORT_META;
          const mergedMeta = {
            ...EMPTY_IMPORT_META,
            ...previousMeta,
            ...meta,
          };
          const payloadTotal =
            typeof result.data?.total === 'number'
              ? result.data.total
              : typeof mergedMeta.total === 'number'
                ? mergedMeta.total
                : null;
          const resolvedTotal = payloadTotal ?? allTracks.length;
          mergedMeta.total = resolvedTotal;
          const cacheSource =
            (sourceUrl && sourceUrl.trim()) ||
            mergedMeta.sourceUrl ||
            metaSnapshot?.sourceUrl ||
            '';
          const existingCached = cacheSource ? getCachedResult(cacheSource) : null;
          const cachePayload = {
            title: result.data?.title ?? playlistTitle ?? 'Imported Playlist',
            importedAt: loadMoreStamp,
            coverUrl: result.data?.coverUrl ?? existingCached?.coverUrl ?? null,
            total: resolvedTotal,
            tracks: allTracks,
            meta: mergedMeta,
          };
          rememberResultInCache(cachePayload, { sourceUrl: cacheSource });

          const firstNewId = additions[0]?.id ?? null;

          if (isBackground) {
            setBackgroundSync((prev) => ({
              ...prev,
              status: hasMore ? 'pending' : 'complete',
              lastError: null,
              snapshotId: meta?.snapshotId ?? prev.snapshotId ?? null,
            }));
            debugFocus('app:load-more:auto', {
              added: additions.length,
              activeAfter: document.activeElement?.id ?? null,
            });
            if (!hasMore) {
              announce('All tracks loaded; order complete.');
            }
          }

          return {
            ok: true,
            done: !hasMore,
            added: additions.length,
            firstNewTrackId: firstNewId,
          };
        } catch (err) {
          if (err?.name === 'AbortError') {
            if (isBackground) {
              setBackgroundSync((prev) => ({
                ...prev,
                status: 'pending',
              }));
            }
            return { ok: false, aborted: true };
          }
          const code = extractErrorCode(err);
          const msg = msgFromCode(code);
          console.log('[load-more error]', { code, raw: err });
          if (isBackground) {
            setBackgroundSync((prev) => ({
              ...prev,
              status: 'error',
              lastError: msg,
            }));
          }
          return { ok: false, code };
        } finally {
          pagerFlightsRef.current.delete(key);
          if (
            backgroundPagerRef.current &&
            backgroundPagerRef.current.key === key &&
            backgroundPagerRef.current.requestId === requestId
          ) {
            backgroundPagerRef.current = null;
          }
        }
      })();

      pagerFlightsRef.current.set(key, { promise: flightPromise, controller, mode, requestId });
      return isBackground ? flightPromise : flightPromise.then((res) => finalizeManualResult(res));
    },
    [
      announce,
      dispatch,
      getPagerKey,
      loadMoreBtnRef,
      loadMoreTracks,
      markTrackFocusContext,
      msgFromCode,
      notesByTrack,
      playlistTitle,
      getCachedResult,
      rememberResultInCache,
      setImportError,
      setImportMeta,
      setImportedAt,
      startBackgroundPaginationRef,
      tagsByTrack,
      tracks,
      tracksRef,
      lastImportUrlRef,
    ],
  );
  const startBackgroundPagination = useCallback(
    (metaOverride) => {
      if (importStatus !== ImportFlowStatus.IDLE) return;

      const meta = metaOverride ?? importMetaRef.current;
      if (!meta) return;

      const hasMore = Boolean(meta?.hasMore && meta?.cursor);
      const sourceUrl = lastImportUrlRef.current;
      if (!hasMore || !sourceUrl) {
        setBackgroundSync((prev) => ({
          ...prev,
          status: 'complete',
          lastError: null,
        }));
        return;
      }

      const key = getPagerKey(meta);
      if (!key) return;

      if (pagerLastSuccessRef.current.has(key)) {
        return;
      }

      const now = Date.now();
      const cooldownUntil = pagerCooldownRef.current.until ?? 0;
      if (cooldownUntil > now) {
        setBackgroundSync((prev) => ({
          ...prev,
          status: 'cooldown',
        }));
        if (!pagerResumeTimerRef.current) {
          const delay = Math.max(0, cooldownUntil - now);
          pagerResumeTimerRef.current = setTimeout(() => {
            pagerResumeTimerRef.current = null;
            pagerCooldownRef.current.until = 0;
            startBackgroundPaginationRef.current();
          }, delay);
        }
        return;
      }

      const existingFlight = pagerFlightsRef.current.get(key);
      if (existingFlight) {
        backgroundPagerRef.current = { key, requestId: existingFlight.requestId };
        return;
      }

      handleLoadMore({ mode: 'background', metaOverride: meta });
    },
    [getPagerKey, handleLoadMore, importStatus, lastImportUrlRef],
  );

  useEffect(() => {
    startBackgroundPaginationRef.current = startBackgroundPagination;
    return () => {
      startBackgroundPaginationRef.current = () => {};
    };
  }, [startBackgroundPagination]);

  useEffect(() => {
    const allowsBackgroundPaging = screen === 'playlist' || screen === 'podcast';
    if (!allowsBackgroundPaging) return;
    if (!importMeta?.hasMore || !importMeta?.cursor) return;
    if (!lastImportUrl) return;
    if (importStatus !== ImportFlowStatus.IDLE) return;
    startBackgroundPagination();
  }, [screen, importMeta?.hasMore, importMeta?.cursor, importStatus, lastImportUrl, startBackgroundPagination]);

  useEffect(() => {
    const loadedCount = Array.isArray(tracks) ? tracks.length : 0;
    setBackgroundSync((prev) => {
      if (!prev) return DEFAULT_BACKGROUND_SYNC;
      const inferredTotal =
        typeof importMeta.total === 'number'
          ? importMeta.total
          : importMeta.hasMore
            ? prev.total
            : loadedCount;
      return {
        ...prev,
        loaded: loadedCount,
        total: inferredTotal,
      };
    });
  }, [tracks, importMeta]);
  const isInitialImportBusy = importStatus === ImportFlowStatus.IMPORTING;
  const isReimportBusy = importStatus === ImportFlowStatus.REIMPORTING;
  const isLoadMoreBusy = importStatus === ImportFlowStatus.LOADING_MORE;
  const isAnyImportBusy = importStatus !== ImportFlowStatus.IDLE;
  const showInitialSpinner = isInitialImportBusy && importLoading;
  const showReimportSpinner = isReimportBusy && importLoading;
  const showLoadMoreSpinner = isLoadMoreBusy && importLoading;

  return {
    importUrl,
    setImportUrl,
    importError,
    setImportError,
    providerChip,
    importMeta,
    setImportMeta,
    isInitialImportBusy,
    isReimportBusy,
    isLoadMoreBusy,
    isAnyImportBusy,
    showInitialSpinner,
    showReimportSpinner,
    showLoadMoreSpinner,
    handleImport: handleImportSubmit,
    handleSelectRecent,
    handleReimport,
    handleLoadMore,
    cancelBackgroundPagination,
    startBackgroundPagination,
    backgroundSync,
    resetImportFlow,
    importStatus,
    primeUpstreamServices,
    isRefreshingCachedData,
    cachedViewInfo,
  };
}
/**
 * @typedef {{ trackCount: number|null, importedAt: number|null, lastRefreshedAt: number|null, source: 'import' | 'recent' | 'manual' }} CachedViewInfo
 */
