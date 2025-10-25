// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  importPlaylist as importSpotify,
  __resetSpotifyTokenMemoForTests,
} from '../adapters/spotifyAdapter.js';
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
      __resetSpotifyTokenMemoForTests();
    });

    it('uses provided fetch client and returns normalized payload', async () => {
      const tokenPayload = { access_token: 'token-123', expires_in: 3600 };
      const metaPayload = {
        name: 'Synthwave Decade',
        snapshot_id: 'snapshot-1',
        images: [{ url: 'https://images.spotify.com/meta.jpg' }],
        external_urls: { spotify: SPOTIFY_URL },
      };
      const tracksPayload = {
        items: [
          {
            track: {
              id: 'track-1',
              name: 'Night Drive',
              duration_ms: 123456,
              external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
              album: { images: [{ url: 'https://images.spotify.com/track-1.jpg' }] },
              artists: [{ name: 'Synth Master' }],
            },
          },
        ],
        next: null,
        total: 1,
      };

      const fetchClient = {
        getJson: vi
          .fn()
          .mockResolvedValueOnce(tokenPayload)
          .mockResolvedValueOnce(metaPayload)
          .mockResolvedValueOnce(tracksPayload),
      };

      const result = await importSpotify({ url: SPOTIFY_URL, fetchClient });

      expect(fetchClient.getJson).toHaveBeenCalledTimes(3);
      expect(fetchClient.getJson).toHaveBeenNthCalledWith(
        1,
        '/api/spotify/token',
        expect.objectContaining({ method: 'GET' })
      );
      expect(fetchClient.getJson).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M?'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        })
      );
      expect(fetchClient.getJson).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          'https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks?'
        ),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        })
      );

      expect(result.provider).toBe('spotify');
      expect(result.playlistId).toBe('37i9dQZF1DXcBWIGoYBM5M');
      expect(result.title).toBe('Synthwave Decade');
      expect(result.snapshotId).toBe('snapshot-1');
      expect(result.sourceUrl).toBe('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
      expect(Array.isArray(result.tracks)).toBe(true);
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0]).toMatchObject({
        id: 'track-1',
        title: 'Night Drive',
        artist: 'Synth Master',
        sourceUrl: 'https://open.spotify.com/track/track-1',
        providerTrackId: 'track-1',
      });
      expect(result.pageInfo).toEqual({ hasMore: false, cursor: null });
      expect(result.debug?.source).toBe('spotify:web');
      expect(result.debug?.tokenRefreshed).toBe(false);
      expect(typeof result.debug?.tokenMs).toBe('number');
      expect(typeof result.debug?.metaMs).toBe('number');
      expect(typeof result.debug?.tracksMs).toBe('number');
      expect(result.total).toBe(1);
    });

    it('maps HTTP_429 responses from the tracks endpoint to ERR_RATE_LIMITED', async () => {
      const tokenPayload = { access_token: 'token-789', expires_in: 3600 };
      const metaPayload = { name: 'Test', snapshot_id: 'snap' };
      const rateErr = new Error('HTTP_429');
      rateErr.code = 'HTTP_429';
      rateErr.details = { status: 429 };

      const fetchClient = {
        getJson: vi
          .fn()
          .mockResolvedValueOnce(tokenPayload)
          .mockResolvedValueOnce(metaPayload)
          .mockImplementationOnce(async () => {
            throw rateErr;
          }),
      };

      await expect(importSpotify({ url: SPOTIFY_URL, fetchClient })).rejects.toMatchObject({
        code: CODES.ERR_RATE_LIMITED,
        details: expect.objectContaining({ status: 429 }),
      });
      expect(fetchClient.getJson).toHaveBeenCalledTimes(3);
    });

    it('refreshes the access token once when a request returns 401', async () => {
      const tokenPayload1 = { access_token: 'token-old', expires_in: 60 };
      const tokenPayload2 = { access_token: 'token-new', expires_in: 3600 };
      const metaPayload = {
        name: 'Retry Playlist',
        snapshot_id: 'snapshot-new',
      };
      const tracksPayload = {
        items: [
          {
            track: {
              id: 'track-42',
              name: 'Retry Track',
              duration_ms: 111,
              external_urls: { spotify: 'https://open.spotify.com/track/track-42' },
              album: { images: [] },
              artists: [{ name: 'Retry Artist' }],
            },
          },
        ],
        next: null,
        total: 1,
      };

      const unauthorizedErr = new Error('HTTP_401');
      unauthorizedErr.code = 'HTTP_401';
      unauthorizedErr.details = { status: 401 };

      const fetchClient = {
        getJson: vi
          .fn()
          .mockResolvedValueOnce(tokenPayload1) // initial token
          .mockRejectedValueOnce(unauthorizedErr) // meta fails
          .mockResolvedValueOnce(tracksPayload) // tracks (first attempt) still invoked
          .mockResolvedValueOnce(tokenPayload2) // refreshed token
          .mockResolvedValueOnce(metaPayload) // meta success
          .mockResolvedValueOnce(tracksPayload), // tracks success
      };

      const result = await importSpotify({ url: SPOTIFY_URL, fetchClient });

      expect(fetchClient.getJson).toHaveBeenCalledTimes(6);
      expect(fetchClient.getJson.mock.calls[0][0]).toBe('/api/spotify/token');
      expect(fetchClient.getJson.mock.calls[3][0]).toBe('/api/spotify/token');
      expect(result.debug?.tokenRefreshed).toBe(true);
      expect(result.total).toBe(1);
    });

    it('reuses a cached token across pagination requests', async () => {
      const tokenPayload = { access_token: 'token-shared', expires_in: 3600 };
      const metaPayload = { name: 'Paged Playlist', snapshot_id: 'snap' };
      const firstTracksPayload = {
        items: [],
        next: 'https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks?offset=100',
        total: 12,
      };
      const secondTracksPayload = {
        items: [],
        next: null,
        total: 12,
      };

      const fetchClient = {
        getJson: vi
          .fn()
          .mockResolvedValueOnce(tokenPayload)
          .mockResolvedValueOnce(metaPayload)
          .mockResolvedValueOnce(firstTracksPayload)
          .mockResolvedValueOnce(metaPayload)
          .mockResolvedValueOnce(secondTracksPayload),
      };

      const first = await importSpotify({ url: SPOTIFY_URL, fetchClient });
      expect(first.pageInfo?.hasMore).toBe(true);
      expect(first.total).toBe(12);

      const second = await importSpotify({
        url: SPOTIFY_URL,
        cursor: first.pageInfo?.cursor ?? undefined,
        fetchClient,
      });

      expect(fetchClient.getJson).toHaveBeenCalledTimes(5);
      expect(fetchClient.getJson.mock.calls[0][0]).toBe('/api/spotify/token');
      expect(second.pageInfo?.hasMore).toBe(false);
      expect(second.total).toBe(12);
      expect(second.debug?.tokenRefreshed).toBe(false);
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
