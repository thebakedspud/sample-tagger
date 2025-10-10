// src/features/import/useImportPlaylist.js
// Provides a single entry point for importing playlists from any provider.

// @ts-check

import detectProvider from './detectProvider.js';
import * as spotifyAdapter from './adapters/spotifyAdapter.js';
import * as youtubeAdapter from './adapters/youtubeAdapter.js';
import * as soundcloudAdapter from './adapters/soundcloudAdapter.js';
import { normalizeTrack } from './normalizeTrack.js';
import { isKnownAdapterError } from './adapters/types.js';
import { mockPlaylists } from '../../data/mockPlaylists.js';

const ADAPTER_REGISTRY = Object.freeze({
  spotify: spotifyAdapter,
  youtube: youtubeAdapter,
  soundcloud: soundcloudAdapter,
});

const DEFAULT_ERROR_CODE = 'ERR_UNKNOWN';
const MOCK_TITLE_PREFIX = 'MOCK DATA (fallback) - ';

/**
 * Create a standardized Error with code/details/cause.
 * @param {string} code
 * @param {Record<string, any>} [details]
 * @param {Error} [cause]
 */
function createAdapterError(code, details = {}, cause) {
  const err = new Error(code);
  // @ts-ignore augmenting Error instance by convention
  err.code = code;
  // @ts-ignore add contextual information for UI/tests
  if (details) err.details = details;
  // @ts-ignore surface upstream cause when available
  if (cause) err.cause = cause;
  return err;
}

/**
 * Resolve an import function from the adapter registry.
 * Supports both default function export and named { importPlaylist }.
 * @param {unknown} provider
 * @returns {((options: any) => Promise<any>) | null}
 */
function getImportFn(provider) {
  // @ts-ignore provider validated earlier
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
  return mockPlaylists?.[provider] || null;
}

/**
 * Extract a normalized error code from an unknown error.
 * @param {unknown} err
 * @returns {string}
 */
function extractErrorCode(err) {
  // @ts-ignore code may be attached on custom errors
  const raw = err?.code ?? err?.cause?.code;
  if (typeof raw === 'string' && isKnownAdapterError(raw)) return raw;
  return DEFAULT_ERROR_CODE;
}

/**
 * Coerce any adapter payload (or mock) into a normalized adapter result.
 * Adds a small debug envelope when returning fallbacks.
 * @param {'spotify'|'youtube'|'soundcloud'} provider
 * @param {string} url
 * @param {any} payload
 * @param {{ isFallback?: boolean, lastErrorCode?: string }} [meta]
 */
function coerceResult(provider, url, payload, meta = {}) {
  const rawTracks = Array.isArray(payload?.tracks) ? payload.tracks : [];

  // NOTE: normalizeTrack signature is (raw, index, provider)
  const tracks = rawTracks.map((/** @type {import('./adapters/types.js').NormalizedTrack} */ t, /** @type {number} */ i) => normalizeTrack(t, i, provider));

  const title = payload?.title ? String(payload.title) : `${provider} playlist`;
  const playlistId = payload?.playlistId || payload?.id || `${provider}-playlist`;

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

export default function useImportPlaylist() {
  /**
   * Import a playlist by URL, optionally resuming via cursor.
   * Adapters are async and abort-aware; this function may throw:
   *  - DOMException('AbortError') if cancelled
   *  - Error(code) where code ? KNOWN_ADAPTER_ERRORS
   * @param {string} rawUrl
   * @param {{ cursor?: string, signal?: AbortSignal, context?: Record<string, any> }} [options]
   */
  async function importPlaylist(rawUrl, options = {}) {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    const { cursor, signal, context } = options;

    if (!url) {
      throw createAdapterError('ERR_UNSUPPORTED_URL', { reason: 'empty_url' });
    }

    const provider = detectProvider(url);
    if (!provider) {
      throw createAdapterError('ERR_UNSUPPORTED_URL', {
        urlPreview: url.slice(0, 120),
      });
    }

    const importFn = getImportFn(provider);

    const invokeOptions = {
      url,
      cursor: cursor ?? undefined,
      signal,
      context: context ?? {},
    };

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (!importFn) {
      const fallback = getMock(provider);
      if (!fallback) {
        throw createAdapterError(DEFAULT_ERROR_CODE, {
          provider,
          reason: 'missing_adapter',
          urlPreview: url.slice(0, 120),
        });
      }
      return coerceResult(provider, url, fallback, { isFallback: true });
    }

    try {
      const payload = await importFn(invokeOptions);

      if (!payload) {
        const fallback = getMock(provider);
        if (fallback) {
          return coerceResult(provider, url, fallback, {
            isFallback: true,
            lastErrorCode: DEFAULT_ERROR_CODE,
          });
        }
        throw createAdapterError(DEFAULT_ERROR_CODE, {
          provider,
          reason: 'empty_payload',
          urlPreview: url.slice(0, 120),
        });
      }

      return coerceResult(provider, url, payload);
    } catch (err) {
      // @ts-ignore treat actual aborts as first-class cancels
      if (err?.name === 'AbortError') throw err;

      const code = extractErrorCode(err);
      const fallback = getMock(provider);

      if (fallback) {
        return coerceResult(provider, url, fallback, {
          isFallback: true,
          lastErrorCode: code,
        });
      }

      throw createAdapterError(code, { provider, url, cursor }, /** @type {Error} */ (err));
    }
  }

  return { importPlaylist };
}
