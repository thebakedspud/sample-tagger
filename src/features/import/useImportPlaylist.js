// src/features/import/useImportPlaylist.js
import detectProvider from './detectProvider.js';
import { mockPlaylists } from '../../data/mockPlaylists.js';

export default function useImportPlaylist() {
  async function importPlaylist(rawUrl) {
    const url = String(rawUrl || '').trim(); // NEW: normalize input

    const provider = detectProvider(url);
    if (!provider) {
      const err = new Error('UNSUPPORTED_OR_INVALID_URL');
      err.code = 'UNSUPPORTED_OR_INVALID_URL';
      throw err;
    }

    const data = mockPlaylists[provider];
    if (!data) {
      const err = new Error('NO_MOCK_DATA_FOR_PROVIDER');
      err.code = 'NO_MOCK_DATA_FOR_PROVIDER';
      throw err;
    }

    // Soft guard: ensure tracks is an array
    const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (!Array.isArray(data.tracks)) {
      console.warn('[useImportPlaylist] tracks not array for provider:', provider);
    }

    // Normalize track fields so downstream is safe
    const tracks = rawTracks.map((t, i) => ({
      id: t?.id ?? `${provider}-${i + 1}`,
      title: t?.title ?? 'Untitled',
      artist: t?.artist ?? '',
    }));

    const stampedTitle = `MOCK DATA ACTIVE · ${data.title}`; // keep or remove later

    return {
      provider,
      title: stampedTitle,
      tracks,
    };
  }

  return { importPlaylist };
}
