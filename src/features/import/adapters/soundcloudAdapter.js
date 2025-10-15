// src/features/import/adapters/soundcloudAdapter.js
// Mocked SoundCloud adapter with paginated responses and unified error handling.

// @ts-check

import { mockPlaylists } from '../../../data/mockPlaylists.js';
import { createPagedMockAdapter } from './mockAdapterUtils.js';
import { CODES, createAdapterError } from './types.js';

const adapter = createPagedMockAdapter({
  provider: 'soundcloud',
  title: mockPlaylists.soundcloud?.title || 'Mock SoundCloud Playlist',
  tracks: mockPlaylists.soundcloud?.tracks || [],
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
      throw createAdapterError(CODES.ERR_ABORTED, { provider: 'soundcloud' }, err);
    }
    if (err?.status === 429) {
      throw createAdapterError(CODES.ERR_RATE_LIMITED, { provider: 'soundcloud' }, err);
    }
    if (err?.status === 403 || err?.status === 401) {
      throw createAdapterError(CODES.ERR_PRIVATE_PLAYLIST, { provider: 'soundcloud' }, err);
    }
    throw createAdapterError(CODES.ERR_UNKNOWN, { provider: 'soundcloud' }, err);
  }
}

export default { importPlaylist };
