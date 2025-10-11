// src/features/import/adapters/spotifyAdapter.js
// Mocked Spotify adapter that simulates paginated responses.

// @ts-check

import { mockPlaylists } from '../../../data/mockPlaylists.js';
import { createPagedMockAdapter } from './mockAdapterUtils.js';

const adapter = createPagedMockAdapter({
  provider: 'spotify',
  title: mockPlaylists.spotify?.title || 'Mock Spotify Playlist',
  tracks: mockPlaylists.spotify?.tracks || [],
});

export const importPlaylist = adapter.importPlaylist;

export default adapter;
