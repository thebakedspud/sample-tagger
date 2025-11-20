// src/features/import/adapters/types.js
// Central place for documenting adapter contracts so tests and adapters can import them

// @ts-check

/**
 * Known playlist providers the app supports.
 * @typedef {'spotify' | 'youtube' | 'soundcloud'} PlaylistProvider
 */

/**
 * Minimal normalized track shape returned by adapters.
 * Extend as providers expose richer metadata.
 * @typedef {Object} NormalizedTrack
 * @property {string | number} id
 * @property {string} title
 * @property {string} artist
 * @property {string} [sourceUrl]
 * @property {string} [providerTrackId]
 * @property {PlaylistProvider} [provider]
 * @property {'music' | 'podcast'} [kind]
 * @property {string} [showId]
 * @property {string} [showName]
 * @property {string} [publisher]
 * @property {string} [description]
 * @property {number} [durationMs]
 * @property {string} [thumbnailUrl]
 * @property {any[]} [notes]
 * @property {string} [album]
 * @property {string} [dateAdded]
 * @property {string} [importedAt]
 * @property {number} [originalIndex]
 */

/**
 * Pagination metadata returned with a playlist page.
 * @typedef {Object} PageInfo
 * @property {string|null} cursor
 * @property {boolean} hasMore
 */

/**
 * Adapter options accepted by every provider importer.
 * @typedef {Object} AdapterOptions
 * @property {string} url
 * @property {string} [cursor]
 * @property {any} [signal]
 * @property {Record<string, any>} [context]
 * @property {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} [fetchClient]
 */

/**
 * Common success payload returned by adapters.
 * @typedef {Object} PlaylistAdapterResult
 * @property {PlaylistProvider} provider
 * @property {string} playlistId
 * @property {string} title
 * @property {string} [snapshotId]
 * @property {string} sourceUrl
 * @property {number} [total]
 * @property {NormalizedTrack[]} tracks
 * @property {PageInfo} [pageInfo]
 */

/**
 * Signature all adapters must implement.
 * @typedef {(options: AdapterOptions) => Promise<PlaylistAdapterResult>} PlaylistAdapter
 */

/**
 * Error codes adapters should surface so the UI can branch correctly.
 * @typedef {'ERR_UNSUPPORTED_URL' | 'ERR_NOT_FOUND' | 'ERR_PRIVATE_PLAYLIST' | 'ERR_RATE_LIMITED' | 'ERR_TOKEN_EXPIRED' | 'ERR_NETWORK' | 'ERR_INVALID_RESPONSE' | 'ERR_ABORTED' | 'ERR_UNKNOWN' | 'ERR_EPISODE_UNAVAILABLE' | 'ERR_SHOW_EMPTY' | 'ERR_PODCAST_CONTENT'} AdapterErrorCode
 */

export const KNOWN_PROVIDERS = Object.freeze(['spotify', 'youtube', 'soundcloud']);

export const KNOWN_ADAPTER_ERRORS = Object.freeze([
  'ERR_UNSUPPORTED_URL',
  'ERR_NOT_FOUND',
  'ERR_PRIVATE_PLAYLIST',
  'ERR_RATE_LIMITED',
  'ERR_TOKEN_EXPIRED',
  'ERR_NETWORK',
  'ERR_INVALID_RESPONSE',
  'ERR_ABORTED',
  'ERR_EPISODE_UNAVAILABLE',
  'ERR_SHOW_EMPTY',
  'ERR_PODCAST_CONTENT',
  'ERR_UNKNOWN',
]);

/**
 * @param {unknown} p
 * @returns {p is PlaylistProvider}
 */
export const isKnownProvider = (p) =>
  KNOWN_PROVIDERS.includes(/** @type {any} */ (p));

/**
 * @param {unknown} c
 * @returns {c is AdapterErrorCode}
 */
export const isKnownAdapterError = (c) =>
  KNOWN_ADAPTER_ERRORS.includes(/** @type {any} */ (c));

/* -------------------------------------------------------------------------- */
/*  Runtime helpers for consistent error handling                             */
/* -------------------------------------------------------------------------- */

/** @type {Readonly<Record<AdapterErrorCode, AdapterErrorCode>>} */
export const CODES = Object.freeze({
  ERR_UNSUPPORTED_URL: 'ERR_UNSUPPORTED_URL',
  ERR_NOT_FOUND: 'ERR_NOT_FOUND',
  ERR_PRIVATE_PLAYLIST: 'ERR_PRIVATE_PLAYLIST',
  ERR_RATE_LIMITED: 'ERR_RATE_LIMITED',
  ERR_TOKEN_EXPIRED: 'ERR_TOKEN_EXPIRED',
  ERR_NETWORK: 'ERR_NETWORK',
  ERR_INVALID_RESPONSE: 'ERR_INVALID_RESPONSE',
  ERR_ABORTED: 'ERR_ABORTED',
  ERR_EPISODE_UNAVAILABLE: 'ERR_EPISODE_UNAVAILABLE',
  ERR_SHOW_EMPTY: 'ERR_SHOW_EMPTY',
  ERR_PODCAST_CONTENT: 'ERR_PODCAST_CONTENT',
  ERR_UNKNOWN: 'ERR_UNKNOWN',
});

/**
 * Create a standardized Error with code/details/cause.
 * @param {AdapterErrorCode} code
 * @param {Record<string, any>} [details]
 * @param {unknown} [cause]
 */
export function createAdapterError(code, details = {}, cause) {
  const err = new Error(code);
  const anyErr = /** @type {any} */ (err);
  anyErr.code = CODES[code] || code || CODES.ERR_UNKNOWN;
  anyErr.details = details;
  if (cause) anyErr.cause = cause;
  return err;
}

/**
 * Extract a known AdapterErrorCode or fall back to ERR_UNKNOWN.
 * @param {unknown} e
 * @returns {AdapterErrorCode}
 */
export function extractErrorCode(e) {
  const anyErr = /** @type {any} */ (e);

  /** @param {unknown} v */
  const toKnown = (v) =>
    typeof v === 'string' && Object.values(CODES).includes(/** @type {any} */ (v))
      ? /** @type {AdapterErrorCode} */ (v)
      : null;

  const code =
    toKnown(anyErr?.code) ||
    toKnown(anyErr?.cause?.code) ||
    toKnown(anyErr?.message) ||
    toKnown(anyErr?.cause?.message);

  return code ?? CODES.ERR_UNKNOWN;
}

/**
 * Type guard for known adapter error objects.
 * @param {unknown} e
 * @returns {boolean}
 */
export function isKnownAdapterErrorObject(e) {
  return extractErrorCode(e) !== CODES.ERR_UNKNOWN;
}

/* -------------------------------------------------------------------------- */
/*  Playlist import flow types                                                */
/* -------------------------------------------------------------------------- */

/**
 * Normalized playlist metadata produced by the import flow.
 * Mirrors buildMeta() in the hook.
 * @typedef {Object} ImportMeta
 * @property {PlaylistProvider | null} provider
 * @property {string | null} playlistId
 * @property {string | null} snapshotId
 * @property {string | null} cursor
 * @property {boolean} hasMore
 * @property {string} sourceUrl
 * @property {any | null} [debug]
 * @property {number | null} total
 */

/**
 * Options for the initial playlist import.
 * @typedef {Object} ImportInitialOptions
 * @property {string=} providerHint   e.g. "spotify"; used if adapter didn't set res.provider.
 * @property {string=} sourceUrl      Canonicalized URL to store in meta.sourceUrl.
 */

/**
 * Options for re-importing an existing playlist (refresh metadata/tracks).
 * @typedef {Object} ReimportOptions
 * @property {string=} providerHint
 * @property {{provider?: string, playlistId?: string|null, snapshotId?: string|null, sourceUrl?: string, cursor?: string|null, hasMore?: boolean, debug?: any, total?: number|null}=} existingMeta
 * @property {string=} fallbackTitle
 */

/**
 * Options for loading more tracks (pagination).
 * @typedef {Object} LoadMoreOptions
 * @property {string=} providerHint
 * @property {{provider?: string, playlistId?: string|null, snapshotId?: string|null, sourceUrl?: string, cursor?: string|null, hasMore?: boolean, debug?: any, total?: number|null}=} existingMeta
 * @property {number=} startIndex           Starting index for fallback IDs of the next page (1-based internally).
 * @property {Iterable<string>=} existingIds Set/array of IDs to skip when appending (client-side dedupe).
 * @property {string=} sourceUrl            Canonical URL for the currently imported playlist.
 * @property {AbortSignal=} signal           Optional abort signal for cancelling the request.
 */

/**
 * Unified result shape returned by all playlist import flow functions.
 * @typedef {Object} ImportResult
 * @property {boolean} ok
 * @property {{tracks: NormalizedTrack[], meta: ImportMeta, title?: string, importedAt?: string, coverUrl?: string|null, total?: number}=} [data]
 * @property {AdapterErrorCode=} code
 * @property {any=} error
 * @property {true=} [stale]
 */
