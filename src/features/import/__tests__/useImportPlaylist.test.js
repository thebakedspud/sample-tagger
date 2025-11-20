// @ts-nocheck
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import useImportPlaylist from '../useImportPlaylist.js';
import { CODES } from '../adapters/types.js';
import * as youtubeAdapter from '../adapters/youtubeAdapter.js';
import * as spotifyAdapter from '../adapters/spotifyAdapter.js';

const { __resetSpotifyTokenMemoForTests } = spotifyAdapter;

const SPOTIFY_URL = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
const SPOTIFY_SHOW_URL = 'https://open.spotify.com/show/2rYZ0msCH4KcKPZJGG6xY3';
const SPOTIFY_EPISODE_URL = 'https://open.spotify.com/episode/2o3sE8uLsDFOiF23Y8QbXn';
const YOUTUBE_URL = 'https://www.youtube.com/playlist?list=PL123';
const ORIGINAL_DEV_FLAG = import.meta.env.DEV;
const ORIGINAL_PODCAST_FLAG = import.meta.env.VITE_ENABLE_PODCASTS;

describe('useImportPlaylist', () => {
  beforeEach(() => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_ENABLE_PODCASTS = 'true';
    __resetSpotifyTokenMemoForTests();
  });

  afterEach(() => {
    import.meta.env.DEV = ORIGINAL_DEV_FLAG;
    import.meta.env.VITE_ENABLE_PODCASTS = ORIGINAL_PODCAST_FLAG;
    vi.restoreAllMocks();
    __resetSpotifyTokenMemoForTests();
  });

  function makeSpotifySuccessClient() {
    const fetchClient = {
      getJson: vi
        .fn()
        .mockResolvedValueOnce({ access_token: 'token-123', expires_in: 3600 })
        .mockResolvedValueOnce({
          name: 'Synthwave Decade',
          snapshot_id: 'snapshot-1',
          images: [{ url: 'https://images.spotify.com/meta.jpg' }],
          external_urls: { spotify: SPOTIFY_URL },
        })
        .mockResolvedValueOnce({
          items: [
            {
              track: {
                id: 'track-1',
                name: 'Night Drive',
                artists: [{ name: 'Synth Master' }],
                external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
                duration_ms: 123456,
                album: { images: [{ url: 'https://images.spotify.com/track-1.jpg' }] },
              },
            },
          ],
          next: null,
          total: 1,
        }),
    };
    return fetchClient;
  }

  function makeSpotifyPagedClient() {
    const fetchClient = {
      getJson: vi
        .fn()
        .mockResolvedValueOnce({ access_token: 'token-paged', expires_in: 3600 })
        .mockResolvedValueOnce({
          name: 'Paged Playlist',
          snapshot_id: 'snap-1',
        })
        .mockResolvedValueOnce({
          items: [
            {
              track: {
                id: 'track-1',
                name: 'Track One',
                artists: [{ name: 'Artist A' }],
                external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
              },
            },
            {
              track: {
                id: 'track-2',
                name: 'Track Two',
                artists: [{ name: 'Artist B' }],
                external_urls: { spotify: 'https://open.spotify.com/track/track-2' },
              },
            },
          ],
          next: 'https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks?offset=2',
          total: 342,
        })
        .mockResolvedValueOnce({
          name: 'Paged Playlist',
          snapshot_id: 'snap-1',
        })
        .mockResolvedValueOnce({
          items: [
            {
              track: {
                id: 'track-3',
                name: 'Track Three',
                artists: [{ name: 'Artist C' }],
                external_urls: { spotify: 'https://open.spotify.com/track/track-3' },
              },
            },
            {
              track: {
                id: 'track-4',
                name: 'Track Four',
                artists: [{ name: 'Artist D' }],
                external_urls: { spotify: 'https://open.spotify.com/track/track-4' },
              },
            },
          ],
          next: null,
          total: 360,
        }),
    };
    return fetchClient;
  }

  function makeSpotifyShowClient({ total = 12, next = null }) {
    const showMeta = {
      id: 'show-1',
      name: 'Cool Show',
      publisher: 'PodCo',
    };
    const episodesPayload = {
      items: [
        {
          id: 'episode-1',
          name: 'Episode One',
          duration_ms: 111,
          external_urls: { spotify: 'https://open.spotify.com/episode/episode-1' },
          show: showMeta,
        },
        {
          id: 'episode-2',
          name: 'Episode Two',
          duration_ms: 222,
          external_urls: { spotify: 'https://open.spotify.com/episode/episode-2' },
          show: showMeta,
        },
      ],
      next,
      total,
    };
    const fetchClient = {
      getJson: vi
        .fn()
        .mockResolvedValueOnce({ access_token: 'token-show', expires_in: 3600 })
        .mockResolvedValueOnce(showMeta)
        .mockResolvedValueOnce(episodesPayload),
    };
    return { fetchClient, showMeta, episodesPayload };
  }

  function makeSpotifyEpisodeClient() {
    const episode = {
      id: 'episode-single',
      name: 'Solo Episode',
      duration_ms: 999,
      external_urls: { spotify: 'https://open.spotify.com/episode/episode-single' },
      images: [{ url: 'https://images.spotify.com/ep-single.jpg', width: 300 }],
      show: { id: 'show-solo', name: 'Solo Show', publisher: 'Pub' },
    };
    const fetchClient = {
      getJson: vi.fn().mockResolvedValueOnce({ access_token: 'token-episode', expires_in: 3600 }).mockResolvedValueOnce(episode),
    };
    return { fetchClient, episode };
  }

  it('exposes playlist data and clears loading on success', async () => {
    const fetchClient = makeSpotifySuccessClient();

    const { result } = renderHook(() => useImportPlaylist());
    let response;
    await act(async () => {
      response = await result.current.importPlaylist(SPOTIFY_URL, { fetchClient });
    });

    expect(fetchClient.getJson).toHaveBeenCalledTimes(3);
    expect(response.provider).toBe('spotify');
    expect(result.current.loading).toBe(false);
    expect(result.current.importBusyKind).toBe(null);
    expect(result.current.errorCode).toBe(null);
    expect(result.current.tracks.length).toBe(1);
    expect(result.current.pageInfo?.hasMore).toBe(false);
    expect(result.current.pageInfo?.cursor).toBeNull();
    expect(result.current.total).toBe(1);
    expect(result.current.progress).toEqual({ imported: 1, total: 1 });
  });

  it('maps 429 errors to ERR_RATE_LIMITED, returns fallback data, and resets loading', async () => {
    const rateErr = new Error('HTTP_429');
    rateErr.code = 'HTTP_429';
    rateErr.details = { status: 429 };

    const fetchClient = {
      getJson: vi.fn(async (url) => {
        if (url === '/api/spotify/token') {
          return { access_token: 'token-abc', expires_in: 3600 };
        }
        if (url.includes('/tracks')) {
          throw rateErr;
        }
        if (url.includes('/playlists/')) {
          return { name: 'Synthwave Decade' };
        }
        return {};
      }),
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useImportPlaylist());
    let response;
    await act(async () => {
      response = await result.current.importPlaylist(SPOTIFY_URL, { fetchClient });
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[import fallback]',
      expect.objectContaining({ provider: 'spotify', code: CODES.ERR_RATE_LIMITED })
    );
    expect(response.title.startsWith('MOCK DATA (fallback) - ')).toBe(true);
    expect(result.current.tracks.length).toBeGreaterThan(0);
    expect(result.current.errorCode).toBe(CODES.ERR_RATE_LIMITED);
    expect(result.current.loading).toBe(false);
    expect(result.current.importBusyKind).toBe(null);
    expect(result.current.total).toBeNull();
    expect(result.current.progress).toBeNull();
  });

  it('imports a show as podcast episodes and exposes pod-specific metadata', async () => {
    const { fetchClient, showMeta } = makeSpotifyShowClient({ total: 2, next: null });

    const { result } = renderHook(() => useImportPlaylist());
    await act(async () => {
      await result.current.importPlaylist(SPOTIFY_SHOW_URL, { fetchClient });
    });

    expect(fetchClient.getJson).toHaveBeenCalledTimes(3);
    expect(result.current.tracks).toHaveLength(2);
    expect(result.current.tracks[0]).toMatchObject({
      id: 'episode-1',
      kind: 'podcast',
      showName: showMeta.name,
      showId: showMeta.id,
    });
    expect(result.current.pageInfo.hasMore).toBe(false);
    expect(result.current.total).toBe(2);
  });

  it('imports a single episode as a one-item playlist', async () => {
    const { fetchClient, episode } = makeSpotifyEpisodeClient();

    const { result } = renderHook(() => useImportPlaylist());
    await act(async () => {
      await result.current.importPlaylist(SPOTIFY_EPISODE_URL, { fetchClient });
    });

    expect(result.current.tracks).toHaveLength(1);
    expect(result.current.tracks[0]).toMatchObject({
      id: episode.id,
      kind: 'podcast',
      title: episode.name,
      showName: episode.show.name,
    });
    expect(result.current.pageInfo.hasMore).toBe(false);
  });

  it('errors on podcast region restrictions', async () => {
    const restrictedErr = new Error('HTTP_403');
    restrictedErr.code = 'HTTP_403';
    restrictedErr.details = { status: 403 };
    const fetchClient = {
      getJson: vi
        .fn()
        .mockResolvedValueOnce({ access_token: 'token-geo', expires_in: 3600 })
        .mockRejectedValueOnce(restrictedErr),
    };

    const { result } = renderHook(() => useImportPlaylist());
    let response;
    await act(async () => {
      response = await result.current.importPlaylist(SPOTIFY_EPISODE_URL, { fetchClient });
    });
    expect(result.current.errorCode).toBe(CODES.ERR_EPISODE_UNAVAILABLE);
    expect(response?.debug?.lastErrorCode).toBe(CODES.ERR_EPISODE_UNAVAILABLE);
  });

  it('errors on empty show payloads', async () => {
    const showMeta = { id: 'show-empty', name: 'Empty Show' };
    const fetchClient = {
      getJson: vi
        .fn()
        .mockResolvedValueOnce({ access_token: 'token-empty', expires_in: 3600 })
        .mockResolvedValueOnce(showMeta)
        .mockResolvedValueOnce({ items: [], next: null, total: 0 }),
    };

    const { result } = renderHook(() => useImportPlaylist());
    let response;
    await act(async () => {
      response = await result.current.importPlaylist(SPOTIFY_SHOW_URL, { fetchClient });
    });
    expect(result.current.errorCode).toBe(CODES.ERR_SHOW_EMPTY);
    expect(response?.debug?.lastErrorCode).toBe(CODES.ERR_SHOW_EMPTY);
  });

  it('tracks progress across paginated imports', async () => {
    const fetchClient = makeSpotifyPagedClient();

    const { result } = renderHook(() => useImportPlaylist());

    await act(async () => {
      await result.current.importPlaylist(SPOTIFY_URL, { fetchClient });
    });

    expect(fetchClient.getJson).toHaveBeenCalledTimes(3);
    expect(result.current.total).toBe(342);
    expect(result.current.progress).toEqual({ imported: 2, total: 342 });
    expect(result.current.pageInfo.hasMore).toBe(true);

    await act(async () => {
      await result.current.importNext({ fetchClient });
    });

    expect(fetchClient.getJson).toHaveBeenCalledTimes(5);
    expect(result.current.tracks.length).toBe(4);
    expect(result.current.total).toBe(360);
    expect(result.current.progress).toEqual({ imported: 4, total: 360 });
    expect(result.current.pageInfo.hasMore).toBe(false);
  });
  it('throws ERR_UNSUPPORTED_URL for invalid providers', async () => {
    const { result } = renderHook(() => useImportPlaylist());

    await act(async () => {
      await expect(
        result.current.importPlaylist('https://example.com/anything')
      ).rejects.toMatchObject({
        message: CODES.ERR_UNSUPPORTED_URL,
        code: CODES.ERR_UNSUPPORTED_URL,
      });
    });

    expect(result.current.errorCode).toBe(CODES.ERR_UNSUPPORTED_URL);
    expect(result.current.loading).toBe(false);
    expect(result.current.importBusyKind).toBe(null);
  });

  it('deduplicates tracks from later pages while preserving order', async () => {
    vi.spyOn(youtubeAdapter, 'importPlaylist').mockImplementation(async (opts = {}) => {
      if (!opts.cursor) {
        return {
          provider: 'youtube',
          playlistId: 'dup-test',
          title: 'First page',
          tracks: [
            { id: 'dup-1', title: 'One', artist: 'Artist A', provider: 'youtube' },
            { id: 'dup-2', title: 'Two', artist: 'Artist B', provider: 'youtube' },
          ],
          pageInfo: { cursor: 'page:1', hasMore: true },
        };
      }
      return {
        provider: 'youtube',
        playlistId: 'dup-test',
        title: 'Second page',
        tracks: [
          { id: 'dup-2', title: 'Two (duplicate)', artist: 'Artist B2', provider: 'youtube' },
          { id: 'dup-3', title: 'Three', artist: 'Artist C', provider: 'youtube' },
        ],
        pageInfo: { cursor: null, hasMore: false },
      };
    });

    const { result } = renderHook(() => useImportPlaylist());

    await act(async () => {
      await result.current.importPlaylist(YOUTUBE_URL);
    });

    expect(result.current.tracks.map(t => t.id)).toEqual(['dup-1', 'dup-2']);

    await act(async () => {
      await result.current.importNext();
    });

    expect(result.current.tracks.map(t => t.id)).toEqual(['dup-1', 'dup-2', 'dup-3']);
    expect(result.current.pageInfo.hasMore).toBe(false);
  });

  it('clears errorCode after a successful run following an error', async () => {
    const fetchClient429 = {
      getJson: vi.fn(async () => {
        const err = new Error('HTTP_429');
        err.code = 'HTTP_429';
        throw err;
      }),
    };
    const fetchClientOk = {
      getJson: vi
        .fn()
        .mockResolvedValueOnce({ access_token: 'token-recover', expires_in: 3600 })
        .mockResolvedValueOnce({
          name: 'Recovered Playlist',
          snapshot_id: 'snapshot-recover',
          images: [{ url: 'https://images.spotify.com/recover.jpg' }],
        })
        .mockResolvedValueOnce({
          items: [
            {
              track: {
                id: 'recover-track',
                name: 'Recovery Song',
                artists: [{ name: 'Hopeful Artist' }],
                external_urls: { spotify: 'https://open.spotify.com/track/recover' },
                duration_ms: 220000,
                album: { images: [{ url: 'https://images.spotify.com/recover-track.jpg' }] },
              },
            },
          ],
          next: null,
        }),
    };

    const { result } = renderHook(() => useImportPlaylist());

    await act(async () => {
      await result.current.importPlaylist(SPOTIFY_URL, { fetchClient: fetchClient429 });
    });

    expect(result.current.errorCode).toBe(CODES.ERR_RATE_LIMITED);

    await act(async () => {
      await result.current.importPlaylist(SPOTIFY_URL, { fetchClient: fetchClientOk });
    });

    expect(result.current.errorCode).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  describe('adapter integration: pagination', () => {
    it('appends tracks across pages and disables hasMore after final page', async () => {
      const { result } = renderHook(() => useImportPlaylist());

      await act(async () => {
        await result.current.importPlaylist(YOUTUBE_URL);
      });

      expect(result.current.tracks.length).toBe(10);
      expect(result.current.pageInfo.hasMore).toBe(true);
      const firstCursor = result.current.pageInfo.cursor;
      expect(firstCursor).toBeDefined();

      await act(async () => {
        await result.current.importNext();
      });

      expect(result.current.tracks.length).toBeGreaterThan(10);
      expect(result.current.loading).toBe(false);
      expect(result.current.importBusyKind).toBe(null);
      const seenAfterSecond = new Set(result.current.tracks.map(t => t.id));
      expect(seenAfterSecond.size).toBe(result.current.tracks.length);

      let guard = 0;
      while (result.current.pageInfo.hasMore && guard < 10) {
        const nextCursor = result.current.pageInfo.cursor;
        expect(nextCursor).toBeDefined();
        await act(async () => {
          await result.current.importNext();
        });
        guard += 1;
      }

      expect(result.current.pageInfo.hasMore).toBe(false);
      expect(result.current.tracks.length).toBe(75);
      const finalSeen = new Set(result.current.tracks.map(t => t.id));
      expect(finalSeen.size).toBe(75);
      expect(result.current.loading).toBe(false);
      expect(result.current.importBusyKind).toBe(null);
    });
  });
});
  it('primes adapters exposing a prime() method', async () => {
    const primeSpy = vi.spyOn(spotifyAdapter, 'prime').mockResolvedValue();

    const { result } = renderHook(() => useImportPlaylist());

    await act(async () => {
      await result.current.primeProviders();
    });

    expect(primeSpy).toHaveBeenCalledTimes(1);
    primeSpy.mockRestore();
  });
