// Hook: importPlaylist(url) -> { provider, title, tracks[] }
import detectProvider from './detectProvider.js';
import { mockPlaylists } from '../../data/mockPlaylists.js';

export default function useImportPlaylist() {
  const DEBUG = false; // flip on if you want minimal console diagnostics

  async function importPlaylist(rawUrl) {
    const url = String(rawUrl ?? '').trim();

    // 1) Detect provider
    const provider = detectProvider(url);
    if (!provider) {
      const err = new Error('UNSUPPORTED_OR_INVALID_URL');
      err.code = 'UNSUPPORTED_OR_INVALID_URL';
      err.details = { urlPreview: url.slice(0, 120) };
      throw err;
    }

    // 2) Resolve provider mock
    const data = mockPlaylists?.[provider];
    if (!data) {
      const err = new Error('NO_MOCK_DATA_FOR_PROVIDER');
      err.code = 'NO_MOCK_DATA_FOR_PROVIDER';
      err.details = { provider };
      throw err;
    }

    // 3) Guard & normalize tracks
    const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (!Array.isArray(data.tracks)) {
       
      console.warn('[useImportPlaylist] tracks not array for provider:', provider);
    }

    const tracks = rawTracks.map((t = {}, i) => {
      const safeTitle = (t.title ?? '').toString().trim();
      const safeArtist = (t.artist ?? '').toString().trim();

      // preserve any extra fields but enforce core shape; ensure stable id wins
      return {
        ...t,
        id: t.id ?? `${provider}-${i + 1}`,
        title: safeTitle || `Untitled Track ${i + 1}`,
        artist: safeArtist || 'Unknown Artist',
      };
    });

    // 4) Stamp title so it's obvious we're in mock mode
    const stampedTitle = `MOCK DATA ACTIVE · ${data.title ?? `${provider} playlist`}`;

    if (DEBUG) {
       
      console.debug('[importPlaylist]', { provider, title: stampedTitle, count: tracks.length });
    }

    return { provider, title: stampedTitle, tracks };
  }

  return { importPlaylist };
}
