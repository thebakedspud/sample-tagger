// src/features/import/adapters/youtubeAdapter.js
// Mocked YouTube adapter with paginated responses.

// @ts-check

import { mockPlaylists } from '../../../data/mockPlaylists.js';
import { createPagedMockAdapter } from './mockAdapterUtils.js';

const adapter = createPagedMockAdapter({
  provider: 'youtube',
  title: mockPlaylists.youtube?.title || 'Mock YouTube Playlist',
  tracks: mockPlaylists.youtube?.tracks || [],
});

export const importPlaylist = adapter.importPlaylist;

export default adapter;
