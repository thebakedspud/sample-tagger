// src/features/import/useImportPlaylist.js
import detectProvider from './detectProvider.js';
import * as spotify from './adapters/spotifyAdapter.js';
import * as youtube from './adapters/youtubeAdapter.js';
import * as soundcloud from './adapters/soundcloudAdapter.js';
import { normalizeTrack } from './normalizeTrack.js';

// NEW: direct fallback import
import { mockPlaylists } from '../../data/mockPlaylists.js';

const adapters = { spotify, youtube, soundcloud };

export default function useImportPlaylist() {
  const DEBUG = false;

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

    // 2) Try adapter, then FALL BACK to mock data
    let data;
    const adapter = adapters[provider];

    try {
      if (!adapter?.importPlaylist) {
        throw Object.assign(new Error('NO_ADAPTER_FOR_PROVIDER'), {
          code: 'NO_ADAPTER_FOR_PROVIDER',
          details: { provider },
        });
      }
      data = await adapter.importPlaylist(url);
    } catch (e) {
      if (DEBUG) console.warn('[importPlaylist] adapter failed, using mock fallback', { provider, e });
      data = mockPlaylists?.[provider];
    }

    if (!data) {
      const err = new Error('ADAPTER_AND_FALLBACK_EMPTY');
      err.code = 'ADAPTER_AND_FALLBACK_EMPTY';
      err.details = { provider };
      throw err;
    }

    // 3) Normalize tracks
    const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];
    if (!Array.isArray(data.tracks)) {
      if (DEBUG) console.warn('[useImportPlaylist] tracks not array for provider:', provider);
    }
    const tracks = rawTracks.map((t, i) => normalizeTrack(t, i, provider));

    // 4) Stamp title so it's obvious we’re in mock mode
    const stampedTitle = `MOCK DATA ACTIVE · ${data.title ?? `${provider} playlist`}`;

    if (DEBUG) {
      console.debug('[importPlaylist]', { provider, title: stampedTitle, count: tracks.length });
    }

    return { provider, title: stampedTitle, tracks };
  }

  return { importPlaylist };
}
