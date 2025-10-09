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
 * @property {string} url The user supplied playlist URL.
 * @property {string} [cursor] Provider specific pagination cursor.
 * @property {any} [signal] Used to cancel in-flight network work (AbortSignal or compatible).
 * @property {Record<string, any>} [context] Extra data (e.g. tokens) shared by callers.
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
 * @typedef {'ERR_UNSUPPORTED_URL' | 'ERR_NOT_FOUND' | 'ERR_PRIVATE_PLAYLIST' | 'ERR_RATE_LIMITED' | 'ERR_TOKEN_EXPIRED' | 'ERR_UNKNOWN'} AdapterErrorCode
 */

/**
 * Providers adapters must support.
 * @type {ReadonlyArray<PlaylistProvider>}
 */
export const KNOWN_PROVIDERS = Object.freeze(['spotify', 'youtube', 'soundcloud']);

/**
 * Adapter error codes the rest of the app can target.
 * @type {ReadonlyArray<AdapterErrorCode>}
 */
export const KNOWN_ADAPTER_ERRORS = Object.freeze([
  'ERR_UNSUPPORTED_URL',
  'ERR_NOT_FOUND',
  'ERR_PRIVATE_PLAYLIST',
  'ERR_RATE_LIMITED',
  'ERR_TOKEN_EXPIRED',
  'ERR_UNKNOWN',
]);

/**
 * Type guard for providers.
 * @param {unknown} p
 * @returns {p is PlaylistProvider}
 */
export const isKnownProvider = (p) => KNOWN_PROVIDERS.includes(/** @type {any} */ (p));

/**
 * Type guard for adapter error codes.
 * @param {unknown} c
 * @returns {c is AdapterErrorCode}
 */
export const isKnownAdapterError = (c) =>
  KNOWN_ADAPTER_ERRORS.includes(/** @type {any} */ (c));
