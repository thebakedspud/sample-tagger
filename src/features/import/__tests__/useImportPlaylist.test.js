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

  it('returns adapter payload when fetch client succeeds', async () => {
    const fetchClient = {
      getJson: vi.fn(async () => ({
        title: 'Synthwave Decade',
        thumbnail_url: 'https://images.spotify.com/mock.jpg',
      })),
    };

    const { importPlaylist } = useImportPlaylist();
    const result = await importPlaylist(SPOTIFY_URL, { fetchClient });

    expect(fetchClient.getJson).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('spotify');
    expect(result.title).toBe('Synthwave Decade');
    expect(result.tracks.length).toBeGreaterThan(0);
  });

  it('falls back to mock data when adapter throws a known error', async () => {
    const fetchClient = {
      getJson: vi.fn(async () => {
        const err = new Error('HTTP_429');
        err.code = 'HTTP_429';
        throw err;
      }),
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { importPlaylist } = useImportPlaylist();
    const result = await importPlaylist(SPOTIFY_URL, { fetchClient });

    expect(warnSpy).toHaveBeenCalledWith(
      '[import fallback]',
      expect.objectContaining({ provider: 'spotify', code: CODES.ERR_RATE_LIMITED })
    );
    expect(result.title.startsWith('MOCK DATA (fallback) - ')).toBe(true);
    expect(result.debug?.isMock).toBe(true);
    expect(result.debug?.lastErrorCode).toBe(CODES.ERR_RATE_LIMITED);
  });

  it('throws ERR_UNSUPPORTED_URL for invalid providers', async () => {
    const { importPlaylist } = useImportPlaylist();

    await expect(importPlaylist('https://example.com/anything')).rejects.toMatchObject({
      message: CODES.ERR_UNSUPPORTED_URL,
      code: CODES.ERR_UNSUPPORTED_URL,
    });
  });
});
