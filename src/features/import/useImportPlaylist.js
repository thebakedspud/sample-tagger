// src/features/import/useImportPlaylist.js
// Provides a single entry point for importing playlists from any provider.

// @ts-check
import { useRef, useState } from 'react';
import detectProvider from './detectProvider.js';
import * as spotifyAdapter from './adapters/spotifyAdapter.js';
import * as youtubeAdapter from './adapters/youtubeAdapter.js';
import * as soundcloudAdapter from './adapters/soundcloudAdapter.js';
import { normalizeTrack } from './normalizeTrack.js';
import { CODES, createAdapterError, extractErrorCode } from './adapters/types.js';
import { mockPlaylists } from '../../data/mockPlaylists.js';
import { isDev } from '../../utils/isDev.js';

const ADAPTER_REGISTRY = Object.freeze({
  spotify: spotifyAdapter,
  youtube: youtubeAdapter,
  soundcloud: soundcloudAdapter,
});

const DEFAULT_ERROR_CODE = CODES.ERR_UNKNOWN;
const MOCK_TITLE_PREFIX = 'MOCK DATA (fallback) - ';
const EMPTY_PAGE_INFO = Object.freeze(
  /** @type {{ cursor: null, hasMore: boolean }} */ ({
    cursor: null,
    hasMore: false,
  })
);

/**
 * Resolve an import function from the adapter registry.
 * Supports both default function export and named { importPlaylist }.
 * @param {import('./adapters/types.js').PlaylistProvider | null | undefined} provider
 * @returns {((options: any) => Promise<any>) | null}
 */
function getImportFn(provider) {
  // @ts-ignore - provider is validated earlier
  const mod = ADAPTER_REGISTRY[provider];
  if (!mod) return null;
  if (typeof mod === 'function') return mod;
  if (typeof mod.importPlaylist === 'function') return mod.importPlaylist.bind(mod);
  return null;
}

/**
 * Get provider-specific mock payload.
 * @param {'spotify'|'youtube'|'soundcloud'} provider
 */
function getMock(provider) {
  // @ts-ignore
  return mockPlaylists?.[provider] || null;
}

/** @param {any} pageInfo @returns {{ cursor: string | null, hasMore: boolean }} */
export function normalizePageInfo(pageInfo) {
  if (!pageInfo || typeof pageInfo !== 'object') {
    return { ...EMPTY_PAGE_INFO };
  }
  const rawCursor = pageInfo.cursor;
  const cursor =
    typeof rawCursor === 'string' && rawCursor.trim().length > 0
      ? rawCursor.trim()
      : null;
  const hasMore = Boolean(pageInfo.hasMore && cursor);
  return {
    cursor,
    hasMore,
  };
}

/**
 * Merge a new page of tracks, skipping duplicate ids.
 * @param {import('./adapters/types.js').NormalizedTrack[]} prev
 * @param {import('./adapters/types.js').NormalizedTrack[]} next
 * @param {string | null | undefined} provider
 * @returns {import('./adapters/types.js').NormalizedTrack[]}
 */
function mergeUniqueTracks(prev, next, provider) {
  if (!Array.isArray(next) || next.length === 0) return prev;

  const seen = new Set(
    prev.map(t => {
      const id = String(t?.id ?? '');
      const prov = String(t?.provider ?? '');
      return `${prov}:${id}`;
    })
  );

  /** @type {import('./adapters/types.js').NormalizedTrack[]} */
  const additions = [];

  next.forEach(t => {
    const id = String(t?.id ?? '');
    const prov = String(t?.provider ?? provider ?? '');
    const key = `${prov}:${id}`;
    if (!id || seen.has(key)) return;
    seen.add(key);
    additions.push(t);
  });

  return additions.length ? [...prev, ...additions] : prev;
}

/**
 * Coerce any adapter payload (or mock) into a normalized adapter result.
 * Adds a small debug envelope when returning fallbacks.
 * @param {'spotify'|'youtube'|'soundcloud'} provider
 * @param {string} url
 * @param {any} payload
 * @param {{ isFallback?: boolean, lastErrorCode?: import('./adapters/types.js').AdapterErrorCode }} [meta]
 */
function coerceResult(provider, url, payload, meta = {}) {
  /** @type {any[]} */
  const rawTracks = Array.isArray(payload?.tracks) ? payload.tracks : [];

  // NOTE: normalizeTrack signature is (raw, index, provider)
  const tracks = rawTracks.map(
    (/** @type {any} */ t, /** @type {number} */ i) => normalizeTrack(t, i, provider)
  );

  const title = payload?.title ? String(payload.title) : `${provider} playlist`;
  const playlistId = payload?.playlistId || payload?.id || `${provider}-playlist`;

  const pageInfo = normalizePageInfo(payload?.pageInfo);
  const coverUrlCandidate =
    typeof payload?.coverUrl === 'string' && payload.coverUrl.trim()
      ? payload.coverUrl.trim()
      : Array.isArray(payload?.images) && payload.images[0]?.url
        ? String(payload.images[0].url)
        : null;

  /** @type {any} */
  const result = {
    provider,
    playlistId: String(playlistId),
    title: meta.isFallback ? `${MOCK_TITLE_PREFIX}${title}` : title,
    snapshotId: payload?.snapshotId || undefined,
    sourceUrl: payload?.sourceUrl || url,
    total: typeof payload?.total === 'number' ? payload.total : undefined,
    tracks,
    pageInfo,
  };

  if (coverUrlCandidate) {
    result.coverUrl = coverUrlCandidate;
  }

  if (meta.isFallback || meta.lastErrorCode) {
    result.debug = {
      ...(meta.isFallback ? { isMock: true } : {}),
      ...(meta.lastErrorCode ? { lastErrorCode: meta.lastErrorCode } : {}),
    };
  }

  return result;
}

/** @param {import('./adapters/types.js').NormalizedTrack[]} list @param {number | null} total */
function computeProgress(list, total) {
  if (typeof total === 'number' && total > 0) {
    return { imported: list.length, total };
  }
  return null;
}

/**
 * Playlist import hook exposing helper methods plus UI-friendly state.
 * @returns {{
 *   importPlaylist: (url: string, options?: {
 *     cursor?: string,
 *     signal?: AbortSignal,
 *     context?: Record<string, any>,
 *     fetchClient?: ReturnType<typeof import('../../utils/fetchClient.js').makeFetchClient>
 *   }) => Promise<any>,
 *   importNext: (options?: any) => Promise<any>,
 *   reset: () => void,
 *   tracks: import('./adapters/types.js').NormalizedTrack[],
 *   pageInfo: { cursor: string | null, hasMore: boolean },
 *   loading: boolean,
 *   importBusyKind: string | null,
 *   errorCode: import('./adapters/types.js').AdapterErrorCode | null,
 *   total: number | null,
 *   progress: { imported: number, total: number } | null
 * }}
 */
export default function useImportPlaylist() {
  const [tracks, setTracks] = useState(
    /** @type {import('./adapters/types.js').NormalizedTrack[]} */ ([])
  );
  const [pageInfo, setPageInfo] = useState(
    /** @type {{ cursor: string | null, hasMore: boolean }} */ ({ ...EMPTY_PAGE_INFO })
  );
  const [total, setTotal] = useState(
    /** @type {number | null} */ (null)
  );
  const [loading, setLoading] = useState(false);
  const [importBusyKind, setImportBusyKind] = useState(
    /** @type {string | null} */ (null)
  );
  const [errorCode, setErrorCode] = useState(
    /** @type {import('./adapters/types.js').AdapterErrorCode | null} */ (null)
  );
  const controllerRef = useRef(
    /** @type {AbortController | null} */ (null)
  );
  const requestIdRef = useRef(0);
  const lastRequestRef = useRef(
    /** @type {{
      provider: import('./adapters/types.js').PlaylistProvider | null,
      url: string | null,
      cursor: string | null
    }} */ ({
      provider: null,
      url: null,
      cursor: null,
    })
  );

  /**
   * Abort any in-flight request and create a new controller.
   * @returns {{ ctrl: AbortController, reqId: number }}
   */
  function beginRequest(kind = 'import') {
    if (controllerRef.current) controllerRef.current.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    const reqId = requestIdRef.current + 1;
    requestIdRef.current = reqId;
    setImportBusyKind(kind);
    setLoading(true);
    return { ctrl, reqId };
  }

  /** @param {AbortController} ctrl @param {AbortSignal | undefined} upstream @returns {AbortSignal} */
  function linkAbortSignals(ctrl, upstream) {
    if (!upstream) return ctrl.signal;
    if (upstream.aborted) {
      ctrl.abort();
    } else {
      const abort = () => ctrl.abort();
      upstream.addEventListener('abort', abort, { once: true });
    }
    return ctrl.signal;
  }

  /** @param {AbortController} ctrl @param {number} reqId */
  function isStale(ctrl, reqId) {
    return ctrl.signal.aborted || reqId !== requestIdRef.current;
  }

  /** @param {AbortController} ctrl @param {number} reqId */
  function finalizeRequest(ctrl, reqId) {
    if (!isStale(ctrl, reqId)) {
      setLoading(false);
      setImportBusyKind(null);
    }
  }

  /**
   * Apply an adapter result to local state with dev-friendly telemetry.
   * @param {'spotify'|'youtube'|'soundcloud'} provider
   * @param {string} url
   * @param {any} result
   */
  function commitResult(provider, url, result) {
    let nextTracksSnapshot = Array.isArray(result?.tracks) ? result.tracks : [];

    setTracks(prev => {
      const next = mergeUniqueTracks(prev, result?.tracks ?? [], provider);
      nextTracksSnapshot = next;
      return next;
    });

    const normalized = normalizePageInfo(result?.pageInfo);
    setPageInfo(normalized);

    lastRequestRef.current = {
      provider: result?.provider ?? provider,
      url,
      cursor: normalized.cursor,
    };

    setTotal(prev => {
      const nextTotalValue =
        typeof result?.total === 'number' && Number.isFinite(result.total)
          ? result.total
          : prev;
      const resolvedTotal = typeof nextTotalValue === 'number' ? nextTotalValue : null;

      if (isDev()) {
        const progress = computeProgress(nextTracksSnapshot, resolvedTotal);
        console.debug('[import]', {
          provider: result?.provider ?? provider,
          imported: nextTracksSnapshot.length,
          total: progress?.total ?? null,
          hasMore: normalized.hasMore,
          cursor: normalized.cursor,
        });
      }

      return resolvedTotal;
    });
  }

  /**
   * Import a playlist by URL, optionally resuming via cursor.
   * Adapters are async and abort-aware; this function may throw:
   *  - DOMException('AbortError') if cancelled
   *  - Error(code) where code maps to KNOWN_ADAPTER_ERRORS
   * @param {string} rawUrl
   * @param {{
   *   cursor?: string,
   *   signal?: AbortSignal,
   *   context?: Record<string, any>,
   *   fetchClient?: ReturnType<typeof import('../../utils/fetchClient.js').makeFetchClient>
   * }} [options]
   */
  async function importPlaylist(rawUrl, options = {}) {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    const { signal: upstreamSignal, cursor, context, fetchClient } = options;
    const resolvedFetchClient =
      fetchClient ?? (context && typeof context === 'object' ? context.fetchClient : undefined);

    const busyKind = context?.importBusyKind ?? 'import';
    const { ctrl, reqId } = beginRequest(busyKind);
    const signal = linkAbortSignals(ctrl, upstreamSignal);
    setErrorCode(null);

    try {
      if (!url) {
        if (!isStale(ctrl, reqId)) setErrorCode(CODES.ERR_UNSUPPORTED_URL);
        throw createAdapterError(CODES.ERR_UNSUPPORTED_URL, { reason: 'empty_url' });
      }

      const provider = detectProvider(url);
      if (!provider) {
        if (!isStale(ctrl, reqId)) setErrorCode(CODES.ERR_UNSUPPORTED_URL);
        throw createAdapterError(CODES.ERR_UNSUPPORTED_URL, {
          urlPreview: url.slice(0, 120),
        });
      }

      const importFn = getImportFn(provider);
      const invokeOptions = {
        url,
        cursor: cursor ?? undefined,
        signal,
        context: context ?? {},
        ...(resolvedFetchClient ? { fetchClient: resolvedFetchClient } : {}),
      };

      if (!importFn) {
        const fallback = getMock(/** @type any */ (provider));
        if (!fallback) {
          if (!isStale(ctrl, reqId)) setErrorCode(DEFAULT_ERROR_CODE);
          throw createAdapterError(DEFAULT_ERROR_CODE, {
            provider,
            reason: 'missing_adapter',
            urlPreview: url.slice(0, 120),
          });
        }
        const result = coerceResult(provider, url, fallback, { isFallback: true });
        if (!isStale(ctrl, reqId)) {
          commitResult(provider, url, result);
          setErrorCode(DEFAULT_ERROR_CODE);
        }
        return result;
      }

      try {
        const payload = await importFn(invokeOptions);

        if (!payload) {
          const fallback = getMock(provider);
          if (fallback) {
            const result = coerceResult(provider, url, fallback, {
              isFallback: true,
              lastErrorCode: DEFAULT_ERROR_CODE,
            });
            if (!isStale(ctrl, reqId)) {
              commitResult(provider, url, result);
              setErrorCode(DEFAULT_ERROR_CODE);
            }
            return result;
          }
          if (!isStale(ctrl, reqId)) setErrorCode(DEFAULT_ERROR_CODE);
          throw createAdapterError(DEFAULT_ERROR_CODE, {
            provider,
            reason: 'empty_payload',
            urlPreview: url.slice(0, 120),
          });
        }

        const result = coerceResult(provider, url, payload);
        if (!isStale(ctrl, reqId)) {
          commitResult(provider, url, result);
          setErrorCode(null);
        }
        return result;
      } catch (err) {
        const anyErr = /** @type {any} */ (err);

        if (anyErr?.name === 'AbortError') throw err;

        const code = extractErrorCode(anyErr);
        const fallback = getMock(provider);

        if (fallback) {
          console.warn('[import fallback]', { provider, code, err: anyErr });
          const result = coerceResult(provider, url, fallback, {
            isFallback: true,
            lastErrorCode: code,
          });
          if (!isStale(ctrl, reqId)) {
            commitResult(provider, url, result);
            setErrorCode(code);
          }
          return result;
        }

        if (!isStale(ctrl, reqId)) setErrorCode(code);
        throw createAdapterError(code, { provider, url, cursor }, /** @type {Error} */ (anyErr));
      }
    } finally {
      finalizeRequest(ctrl, reqId);
    }
  }

  /**
   * Fetch the next page using the supplied cursor/provider/url trio.
   * @param {{
   *   cursor?: string,
   *   provider?: import('./adapters/types.js').PlaylistProvider,
   *   url?: string,
   *   signal?: AbortSignal,
   *   context?: Record<string, any>,
   *   fetchClient?: ReturnType<typeof import('../../utils/fetchClient.js').makeFetchClient>
   * }} [options]
   */
  async function importNext(options = {}) {
    const provider =
      options.provider ?? lastRequestRef.current.provider ?? null;
    const url = options.url ?? lastRequestRef.current.url ?? null;
    const normalizedOptionCursor =
      typeof options.cursor === 'string' && options.cursor.trim().length > 0
        ? options.cursor.trim()
        : null;
    const normalizedPageCursor =
      typeof pageInfo.cursor === 'string' && pageInfo.cursor.trim().length > 0
        ? pageInfo.cursor
        : null;
    const normalizedLastCursor =
      typeof lastRequestRef.current.cursor === 'string' &&
      lastRequestRef.current.cursor.trim().length > 0
        ? lastRequestRef.current.cursor
        : null;
    const effectiveCursor =
      normalizedOptionCursor ??
      normalizedPageCursor ??
      normalizedLastCursor ??
      null;

    if (!provider || !url || !effectiveCursor) return null;
    if (loading || !pageInfo.hasMore) return null;

    const resolvedFetchClient =
      options.fetchClient ??
      (options.context && typeof options.context === 'object'
        ? options.context.fetchClient
        : undefined);

    const busyKind = options.context?.importBusyKind ?? 'load-more';
    const { ctrl, reqId } = beginRequest(busyKind);
    const signal = linkAbortSignals(ctrl, options.signal);
    setErrorCode(null);

    try {
      const importFn = getImportFn(provider);

      if (!importFn) {
        const fallback = getMock(provider);
        if (!fallback) {
          if (!isStale(ctrl, reqId)) setErrorCode(DEFAULT_ERROR_CODE);
          throw createAdapterError(DEFAULT_ERROR_CODE, {
            provider,
            reason: 'missing_adapter',
            urlPreview: url.slice(0, 120),
          });
        }
        const result = coerceResult(provider, url, fallback, {
          isFallback: true,
          lastErrorCode: DEFAULT_ERROR_CODE,
        });
        if (!isStale(ctrl, reqId)) {
          commitResult(provider, url, result);
          setErrorCode(DEFAULT_ERROR_CODE);
        }
        return result;
      }

      const invokeOptions = {
        url,
        cursor: effectiveCursor,
        signal,
        context: options.context ?? {},
        ...(resolvedFetchClient ? { fetchClient: resolvedFetchClient } : {}),
      };

      const payload = await importFn(invokeOptions);

      if (!payload) {
        const fallback = getMock(provider);
        if (fallback) {
          const result = coerceResult(provider, url, fallback, {
            isFallback: true,
            lastErrorCode: DEFAULT_ERROR_CODE,
          });
          if (!isStale(ctrl, reqId)) {
            commitResult(provider, url, result);
            setErrorCode(DEFAULT_ERROR_CODE);
          }
          return result;
        }
        if (!isStale(ctrl, reqId)) setErrorCode(DEFAULT_ERROR_CODE);
        throw createAdapterError(DEFAULT_ERROR_CODE, {
          provider,
          reason: 'empty_payload',
          urlPreview: url.slice(0, 120),
        });
      }

      const result = coerceResult(provider, url, payload);
      if (!isStale(ctrl, reqId)) {
        commitResult(provider, url, result);
        setErrorCode(null);
      }
      return result;
    } catch (err) {
      const anyErr = /** @type {any} */ (err);
      if (anyErr?.name === 'AbortError') throw err;

      const code = extractErrorCode(anyErr);
      const fallback = getMock(provider);

      if (fallback) {
        console.warn('[import fallback]', { provider, code, err: anyErr });
        const result = coerceResult(provider, url, fallback, {
          isFallback: true,
          lastErrorCode: code,
        });
        if (!isStale(ctrl, reqId)) {
          commitResult(provider, url, result);
          setErrorCode(code);
        }
        return result;
      }

      if (!isStale(ctrl, reqId)) setErrorCode(code);
      throw createAdapterError(code, { provider, url, cursor: effectiveCursor }, /** @type {Error} */ (anyErr));
    } finally {
      finalizeRequest(ctrl, reqId);
    }
  }

  function reset() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestIdRef.current += 1;
    lastRequestRef.current = { provider: null, url: null, cursor: null };
    setTracks([]);
    setPageInfo({ ...EMPTY_PAGE_INFO });
    setLoading(false);
    setImportBusyKind(null);
    setErrorCode(null);
    setTotal(null);
  }

  return {
    importPlaylist,
    importNext,
    reset,
    tracks,
    pageInfo,
    loading,
    importBusyKind,
    errorCode,
    total,
    progress: computeProgress(tracks, total),
  };
}
