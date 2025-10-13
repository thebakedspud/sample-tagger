// src/features/import/adapters/youtubeAdapter.js
// Mocked YouTube adapter with paginated responses and unified error handling.

// @ts-check

import { mockPlaylists } from '../../../data/mockPlaylists.js';
import { createPagedMockAdapter } from './mockAdapterUtils.js';
import { CODES, createAdapterError } from './types.js';

const adapter = createPagedMockAdapter({
  provider: 'youtube',
  title: mockPlaylists.youtube?.title || 'Mock YouTube Playlist',
  tracks: mockPlaylists.youtube?.tracks || [],
});

/**
 * Simulated importPlaylist function that wraps the mock adapter with standardized errors.
 * @param {import('./types.js').AdapterOptions} options
 * @returns {Promise<import('./types.js').PlaylistAdapterResult>}
 */
export async function importPlaylist(options) {
  try {
    return await adapter.importPlaylist(options);
  } catch (e) {
    const err = /** @type {any} */ (e);

    if (err?.name === 'AbortError') {
      throw createAdapterError(CODES.ERR_ABORTED, { provider: 'youtube' }, err);
    }
    if (err?.status === 429) {
      throw createAdapterError(CODES.ERR_RATE_LIMITED, { provider: 'youtube' }, err);
    }
    if (err?.status === 403 || err?.status === 401) {
      throw createAdapterError(CODES.ERR_PRIVATE_PLAYLIST, { provider: 'youtube' }, err);
    }
    throw createAdapterError(CODES.ERR_UNKNOWN, { provider: 'youtube' }, err);
  }
}

export default { importPlaylist };
