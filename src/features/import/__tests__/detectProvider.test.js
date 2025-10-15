import { describe, it, expect } from 'vitest';
import detectProvider from '../detectProvider.js';

describe('detectProvider', () => {
  it('returns spotify for canonical playlist URLs', () => {
    expect(detectProvider(' https://open.spotify.com/playlist/abc123 ')).toBe('spotify');
    expect(detectProvider('HTTPS://OPEN.SPOTIFY.COM/PLAYLIST/XYZ')).toBe('spotify');
  });

  it('returns youtube for playlist URLs that include list param', () => {
    expect(detectProvider('https://www.youtube.com/playlist?list=PL123')).toBe('youtube');
    expect(detectProvider('https://music.youtube.com/playlist?list=OLAK5uy')).toBe('youtube');
  });

  it('returns soundcloud for playlist-equivalent URLs', () => {
    expect(detectProvider('https://soundcloud.com/user/sets/my-playlist')).toBe('soundcloud');
    expect(detectProvider('https://soundcloud.com/user/playlist/my-mix')).toBe('soundcloud');
  });

  it('guards against non-string inputs', () => {
    expect(detectProvider(null)).toBeNull();
    expect(detectProvider(undefined)).toBeNull();
    expect(detectProvider(42)).toBeNull();
  });

  it('rejects unsupported URLs such as tracks', () => {
    expect(detectProvider('https://open.spotify.com/track/abc')).toBeNull();
    expect(detectProvider('https://example.com/not-a-playlist')).toBeNull();
  });
});
