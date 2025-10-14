import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importPlaylist as importSpotify } from '../adapters/spotifyAdapter.js';
import { importPlaylist as importYouTube } from '../adapters/youtubeAdapter.js';
import { importPlaylist as importSoundCloud } from '../adapters/soundcloudAdapter.js';
import { CODES } from '../adapters/types.js';

const SPOTIFY_URL = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';

describe('adapter contracts', () => {
  describe('spotify importPlaylist', () => {
    const originalDevFlag = import.meta.env.DEV;

    beforeEach(() => {
      import.meta.env.DEV = false;
    });

    afterEach(() => {
      import.meta.env.DEV = originalDevFlag;
      vi.restoreAllMocks();
    });

    it('uses provided fetch client and returns normalized payload', async () => {
      const fetchClient = {
        getJson: vi.fn(async (url) => {
          expect(url).toContain('https://open.spotify.com/oembed?url=');
          return {
            title: 'Synthwave Decade',
            thumbnail_url: 'https://images.spotify.com/mock.jpg',
          };
        }),
      };

      const result = await importSpotify({ url: SPOTIFY_URL, fetchClient });

      expect(fetchClient.getJson).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('spotify');
      expect(result.playlistId).toBe('37i9dQZF1DXcBWIGoYBM5M');
      expect(result.title).toBe('Synthwave Decade');
      expect(result.sourceUrl).toBe(SPOTIFY_URL);
      expect(Array.isArray(result.tracks)).toBe(true);
      expect(result.tracks.length).toBeGreaterThan(0);
      expect(result.pageInfo).toEqual({ hasMore: false, cursor: null });
      expect(result.debug?.source).toBe('oembed+mockTracks');
      expect(result.debug?.oembed?.thumbnail_url).toBe('https://images.spotify.com/mock.jpg');
    });

    it('maps HTTP_429 responses to ERR_RATE_LIMITED', async () => {
      const fetchClient = {
        getJson: vi.fn(async () => {
          const err = new Error('HTTP_429');
          err.code = 'HTTP_429';
          throw err;
        }),
      };

      await expect(importSpotify({ url: SPOTIFY_URL, fetchClient })).rejects.toMatchObject({
        code: CODES.ERR_RATE_LIMITED,
        details: expect.objectContaining({ status: 429 }),
      });
      expect(fetchClient.getJson).toHaveBeenCalledTimes(1);
    });
  });

  describe('mock adapters', () => {
    it('youtube adapter returns paginated data and advances cursor', async () => {
      const url = 'https://www.youtube.com/playlist?list=PL123';

      const first = await importYouTube({ url });
      expect(first.provider).toBe('youtube');
      expect(first.pageInfo?.hasMore).toBe(true);
      expect(first.pageInfo?.cursor).toBe('page:1');
      expect(first.tracks).toHaveLength(10);

      const second = await importYouTube({ url, cursor: first.pageInfo?.cursor });
      expect(second.pageInfo?.cursor).toBe('page:2');
      expect(second.tracks[0]?.id).not.toBe(first.tracks[0]?.id);
    });

    it('soundcloud adapter mirrors pagination behaviour', async () => {
      const url = 'https://soundcloud.com/user/sets/mix';

      const first = await importSoundCloud({ url });
      expect(first.provider).toBe('soundcloud');
      expect(first.pageInfo?.hasMore).toBe(true);
      expect(first.pageInfo?.cursor).toBe('page:1');
    });
  });
});
