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
 * @property {number} [durationMs]
 * @property {string} [thumbnailUrl]
 * @property {any[]} [notes]
 */

/**
 * Pagination metadata returned with a playlist page.
 * @typedef {Object} PageInfo
 * @property {string} [cursor]
 * @property {boolean} [hasMore]
 */

/**
 * Adapter options accepted by every provider importer.
 * @typedef {Object} AdapterOptions
 * @property {string} url
 * @property {string} [cursor]
 * @property {any} [signal]
 * @property {Record<string, any>} [context]
 */

/**
 * Common success payload returned by adapters.
 * @typedef {Object} PlaylistAdapterResult
 * @property {PlaylistProvider} provider
 * @property {string} playlistId
 * @property {string} title
 * @property {string} [snapshotId]
 * @property {string} sourceUrl
 * @property {NormalizedTrack[]} tracks
 * @property {PageInfo} [pageInfo]
 */

/**
 * Signature all adapters must implement.
 * @typedef {(options: AdapterOptions) => Promise<PlaylistAdapterResult>} PlaylistAdapter
 */

/**
 * Error codes adapters should surface so the UI can branch correctly.
 * @typedef {'ERR_UNSUPPORTED_URL' | 'ERR_NOT_FOUND' | 'ERR_PRIVATE_PLAYLIST' | 'ERR_RATE_LIMITED' | 'ERR_TOKEN_EXPIRED' | 'ERR_NETWORK' | 'ERR_INVALID_RESPONSE' | 'ERR_ABORTED' | 'ERR_UNKNOWN'} AdapterErrorCode
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
  const code = anyErr && (anyErr.code || anyErr.message);
  return Object.values(CODES).includes(/** @type {any} */ (code))
    ? /** @type {AdapterErrorCode} */ (code)
    : /** @type {AdapterErrorCode} */ (CODES.ERR_UNKNOWN);
}

/**
 * Type guard for known adapter error objects.
 * @param {unknown} e
 * @returns {boolean}
 */
export function isKnownAdapterErrorObject(e) {
  return extractErrorCode(e) !== CODES.ERR_UNKNOWN;
}
