// src/features/import/useImportPlaylist.js
// Provides a single entry point for importing playlists from any provider.

// @ts-check
import { useState } from 'react';
import detectProvider from './detectProvider.js';
import * as spotifyAdapter from './adapters/spotifyAdapter.js';
import * as youtubeAdapter from './adapters/youtubeAdapter.js';
import * as soundcloudAdapter from './adapters/soundcloudAdapter.js';
import { normalizeTrack } from './normalizeTrack.js';
import { CODES, createAdapterError, extractErrorCode } from './adapters/types.js';
import { mockPlaylists } from '../../data/mockPlaylists.js';

const ADAPTER_REGISTRY = Object.freeze({
  spotify: spotifyAdapter,
  youtube: youtubeAdapter,
  soundcloud: soundcloudAdapter,
});

const DEFAULT_ERROR_CODE = CODES.ERR_UNKNOWN;
const MOCK_TITLE_PREFIX = 'MOCK DATA (fallback) - ';

/**
 * Resolve an import function from the adapter registry.
 * Supports both default function export and named { importPlaylist }.
 * @param {unknown} provider
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

  // Ensure pageInfo is normalized and cursor is consistently a string when present
  const pageInfo =
    payload?.pageInfo && typeof payload.pageInfo === 'object'
      ? {
          cursor:
            payload.pageInfo.cursor != null
              ? String(payload.pageInfo.cursor)
              : undefined,
          hasMore: Boolean(payload.pageInfo.hasMore),
        }
      : undefined;

  /** @type {any} */
  const result = {
    provider,
    playlistId: String(playlistId),
    title: meta.isFallback ? `${MOCK_TITLE_PREFIX}${title}` : title,
    snapshotId: payload?.snapshotId || undefined,
    sourceUrl: payload?.sourceUrl || url,
    tracks,
    pageInfo,
  };

  if (meta.isFallback || meta.lastErrorCode) {
    result.debug = {
      ...(meta.isFallback ? { isMock: true } : {}),
      ...(meta.lastErrorCode ? { lastErrorCode: meta.lastErrorCode } : {}),
    };
  }

  return result;
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
 *   pageInfo: import('./adapters/types.js').PageInfo | null,
 *   loading: boolean,
 *   importBusyKind: string | null,
 *   errorCode: import('./adapters/types.js').AdapterErrorCode | null
 * }}
 */
export default function useImportPlaylist() {
  const [tracks, setTracks] = useState([]);
  const [pageInfo, setPageInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importBusyKind, setImportBusyKind] = useState(null);
  const [errorCode, setErrorCode] = useState(null);

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
    const { cursor, signal, context, fetchClient } = options;
    const resolvedFetchClient =
      fetchClient ?? (context && typeof context === 'object' ? context.fetchClient : undefined);

    const busyKind = context?.importBusyKind ?? 'initial';
    setImportBusyKind(busyKind);
    setLoading(true);
    setErrorCode(null);

    try {
      if (!url) {
        setErrorCode(CODES.ERR_UNSUPPORTED_URL);
        throw createAdapterError(CODES.ERR_UNSUPPORTED_URL, { reason: 'empty_url' });
      }

      const provider = detectProvider(url);
      if (!provider) {
        setErrorCode(CODES.ERR_UNSUPPORTED_URL);
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

      // If caller submits a new URL while a previous request is still in flight.
      if (signal?.aborted) {
        // Propagate a true cancel; caller can ignore gracefully.
        throw new DOMException('Aborted', 'AbortError');
      }

      if (!importFn) {
        const fallback = getMock(/** @type any */ (provider));
        if (!fallback) {
          setErrorCode(DEFAULT_ERROR_CODE);
          throw createAdapterError(DEFAULT_ERROR_CODE, {
            provider,
            reason: 'missing_adapter',
            urlPreview: url.slice(0, 120),
          });
        }
        const result = coerceResult(provider, url, fallback, { isFallback: true });
        setTracks(result.tracks);
        setPageInfo(result.pageInfo ?? null);
        setErrorCode(DEFAULT_ERROR_CODE);
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
            setTracks(result.tracks);
            setPageInfo(result.pageInfo ?? null);
            setErrorCode(DEFAULT_ERROR_CODE);
            return result;
          }
          setErrorCode(DEFAULT_ERROR_CODE);
          throw createAdapterError(DEFAULT_ERROR_CODE, {
            provider,
            reason: 'empty_payload',
            urlPreview: url.slice(0, 120),
          });
        }

        const result = coerceResult(provider, url, payload);
        setTracks(result.tracks);
        setPageInfo(result.pageInfo ?? null);
        setErrorCode(null);
        return result;
      } catch (err) {
        const anyErr = /** @type {any} */ (err);

        // True cancel: do not map to a fallback or treat as error.
        if (anyErr?.name === 'AbortError') throw err;

        const code = extractErrorCode(anyErr);
        const fallback = getMock(provider);

        if (fallback) {
          console.warn('[import fallback]', { provider, code, err: anyErr });
          const result = coerceResult(provider, url, fallback, {
            isFallback: true,
            lastErrorCode: code,
          });
          setTracks(result.tracks);
          setPageInfo(result.pageInfo ?? null);
          setErrorCode(code);
          return result;
        }

        setErrorCode(code);
        throw createAdapterError(code, { provider, url, cursor }, /** @type {Error} */ (anyErr));
      }
    } finally {
      setLoading(false);
      setImportBusyKind(null);
    }
  }

  async function importNext() {
    throw createAdapterError(CODES.ERR_UNKNOWN, { reason: 'pagination_not_implemented' });
  }

  function reset() {
    setTracks([]);
    setPageInfo(null);
    setLoading(false);
    setImportBusyKind(null);
    setErrorCode(null);
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
  };
}
