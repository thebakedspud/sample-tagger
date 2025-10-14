import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import useImportPlaylist from '../useImportPlaylist.js';
import { CODES } from '../adapters/types.js';

const SPOTIFY_URL = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
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
    expect(result.current.pageInfo?.cursor).toBeUndefined();
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
});
