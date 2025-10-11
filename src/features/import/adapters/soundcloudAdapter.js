// src/features/import/adapters/soundcloudAdapter.js
// Mocked SoundCloud adapter with paginated responses.

// @ts-check

import { mockPlaylists } from '../../../data/mockPlaylists.js';
import { createPagedMockAdapter } from './mockAdapterUtils.js';

const adapter = createPagedMockAdapter({
  provider: 'soundcloud',
  title: mockPlaylists.soundcloud?.title || 'Mock SoundCloud Playlist',
  tracks: mockPlaylists.soundcloud?.tracks || [],
});

export const importPlaylist = adapter.importPlaylist;

export default adapter;
