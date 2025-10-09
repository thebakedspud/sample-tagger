// src/features/import/adapters/spotifyAdapter.js
import { mockPlaylists } from '../../../data/mockPlaylists.js';

export async function importPlaylist(url) {
  // For now, this still returns mock data
  return mockPlaylists.spotify;
}

export async function refreshToken() {
  return { ok: true };
}
