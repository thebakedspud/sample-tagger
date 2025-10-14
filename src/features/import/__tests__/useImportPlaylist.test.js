import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import useImportPlaylist from '../useImportPlaylist.js';
import { CODES } from '../adapters/types.js';
import * as youtubeAdapter from '../adapters/youtubeAdapter.js';

const SPOTIFY_URL = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
const YOUTUBE_URL = 'https://www.youtube.com/playlist?list=PL123';
const ORIGINAL_DEV_FLAG = import.meta.env.DEV;

describe('useImportPlaylist', () => {
  beforeEach(() => {
    import.meta.env.DEV = false;
  });

  afterEach(() => {
    import.meta.env.DEV = ORIGINAL_DEV_FLAG;
    vi.restoreAllMocks();
  });

  it('exposes playlist data and clears loading on success', async () => {
    const fetchClient = {
      getJson: vi.fn(async () => ({
        title: 'Synthwave Decade',
        thumbnail_url: 'https://images.spotify.com/mock.jpg',
      })),
    };

    const { result } = renderHook(() => useImportPlaylist());
    let response;
    await act(async () => {
      response = await result.current.importPlaylist(SPOTIFY_URL, { fetchClient });
    });

    expect(fetchClient.getJson).toHaveBeenCalledTimes(1);
    expect(response.provider).toBe('spotify');
    expect(result.current.loading).toBe(false);
    expect(result.current.importBusyKind).toBe(null);
    expect(result.current.errorCode).toBe(null);
    expect(result.current.tracks.length).toBeGreaterThan(0);
    expect(result.current.pageInfo?.hasMore).toBe(false);
    expect(result.current.pageInfo?.cursor).toBeNull();
  });

  it('maps 429 errors to ERR_RATE_LIMITED, returns fallback data, and resets loading', async () => {
    const fetchClient = {
      getJson: vi.fn(async () => {
        const err = new Error('HTTP_429');
        err.code = 'HTTP_429';
        throw err;
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
      getJson: vi.fn(async () => ({
        title: 'Recovered Playlist',
        thumbnail_url: 'https://images.spotify.com/mock.jpg',
      })),
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
