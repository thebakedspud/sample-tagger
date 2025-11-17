import { describe, it, expect } from 'vitest';
import { __private } from '../spotifyAdapter.js';

const { selectAlbumThumb } = __private;

describe('selectAlbumThumb', () => {
  it('prefers the smallest image that meets the target width', () => {
    const url = selectAlbumThumb(
      [
        { url: 'https://cdn.test/cover-640.jpg', width: 640 },
        { url: 'https://cdn.test/cover-320.jpg', width: 320 },
        { url: 'https://cdn.test/cover-64.jpg', width: 64 },
      ],
      null,
    );
    expect(url).toBe('https://cdn.test/cover-320.jpg');
  });

  it('falls back to the largest available image when all candidates are smaller than the target', () => {
    const url = selectAlbumThumb(
      [
        { url: 'https://cdn.test/cover-40.jpg', width: 40 },
        { url: 'https://cdn.test/cover-60.jpg', width: 60 },
      ],
      null,
    );
    expect(url).toBe('https://cdn.test/cover-60.jpg');
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
