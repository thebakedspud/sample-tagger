// src/features/import/useImportPlaylist.js
import detectProvider from './detectProvider';
import { mockPlaylists } from '../../data/mockPlaylists.js';

export default function useImportPlaylist() {
  async function importPlaylist(url) {
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

    // Make it OBVIOUS the new hook is active:
    const stampedTitle = `MOCK DATA ACTIVE · ${data.title}`;

    return {
      provider,
      title: stampedTitle,
      tracks: data.tracks, // should have ids like sp-1 / yt-1 / sc-1
    };
  }

  return { importPlaylist };
}
