import { describe, it, expect } from 'vitest';
import { __private } from '../spotifyAdapter.js';

const { selectAlbumThumb } = __private;

describe('selectAlbumThumb', () => {
  it('prefers the image closest to the target width to limit download size', () => {
    const url = selectAlbumThumb(
      [
        { url: 'https://cdn.test/cover-640.jpg', width: 640 },
        { url: 'https://cdn.test/cover-320.jpg', width: 320 },
        { url: 'https://cdn.test/cover-64.jpg', width: 64 },
      ],
      null,
    );
    expect(url).toBe('https://cdn.test/cover-64.jpg');
  });

  it('still favors slightly bigger art when sub-ideal sizes are unavailable', () => {
    const url = selectAlbumThumb(
      [
        { url: 'https://cdn.test/cover-640.jpg', width: 640 },
        { url: 'https://cdn.test/cover-320.jpg', width: 320 },
      ],
      null,
    );
    expect(url).toBe('https://cdn.test/cover-320.jpg');
  });

  it('falls back to the largest available image when all candidates are smaller than the minimum display width', () => {
    const url = selectAlbumThumb(
      [
        { url: 'https://cdn.test/cover-30.jpg', width: 30 },
        { url: 'https://cdn.test/cover-20.jpg', width: 20 },
      ],
      null,
    );
    expect(url).toBe('https://cdn.test/cover-30.jpg');
  });

  it('uses the smallest entry when Spotify omits width metadata', () => {
    const url = selectAlbumThumb(
      [
        { url: 'https://cdn.test/cover-640.jpg' },
        { url: 'https://cdn.test/cover-300.jpg' },
        { url: 'https://cdn.test/cover-64.jpg' },
      ],
      null,
    );
    expect(url).toBe('https://cdn.test/cover-64.jpg');
  });

  it('returns the provided fallback when no album images exist', () => {
    const url = selectAlbumThumb(undefined, 'https://cdn.test/fallback.jpg');
    expect(url).toBe('https://cdn.test/fallback.jpg');
  });
});
