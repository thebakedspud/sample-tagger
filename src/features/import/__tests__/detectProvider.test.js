// @ts-nocheck
import { describe, it, expect, afterEach } from 'vitest';
import detectProvider from '../detectProvider.js';

describe('detectProvider', () => {
  const VALID_ID = '37i9dQZF1DX4WYpdgoPlCD';
  const originalFlag = import.meta.env.VITE_ENABLE_PODCASTS;

  afterEach(() => {
    import.meta.env.VITE_ENABLE_PODCASTS = originalFlag;
  });

  it('returns spotify for Spotify playlist URLs and URIs', () => {
    expect(detectProvider(` https://open.spotify.com/playlist/${VALID_ID} `)).toBe('spotify');
    expect(detectProvider(`HTTPS://OPEN.SPOTIFY.COM/PLAYLIST/${VALID_ID}`)).toBe('spotify');
    expect(
      detectProvider(`https://open.spotify.com/user/spotify/playlist/${VALID_ID}?si=abc`)
    ).toBe('spotify');
    expect(
      detectProvider(`https://open.spotify.com/embed/playlist/${VALID_ID}?utm_source=generator`)
    ).toBe('spotify');
    expect(detectProvider(`spotify:playlist:${VALID_ID}`)).toBe('spotify');
    expect(detectProvider(`Spotify:User:Someone:Playlist:${VALID_ID}`)).toBe('spotify');
    expect(detectProvider(`spotify://playlist/${VALID_ID}`)).toBe('spotify');
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

  it('detects Spotify show and episode URLs only when podcasts are enabled', () => {
    import.meta.env.VITE_ENABLE_PODCASTS = 'true';
    expect(detectProvider(`https://open.spotify.com/show/${VALID_ID}`)).toBe('spotify');
    expect(detectProvider(`https://open.spotify.com/episode/${VALID_ID}`)).toBe('spotify');
    expect(detectProvider(`https://open.spotify.com/intl-en/show/${VALID_ID}`)).toBe('spotify');
    expect(detectProvider(`https://open.spotify.com/embed/episode/${VALID_ID}`)).toBe('spotify');
    expect(detectProvider(`spotify:show:${VALID_ID}`)).toBe('spotify');
    expect(detectProvider(`spotify:episode:${VALID_ID}`)).toBe('spotify');

    import.meta.env.VITE_ENABLE_PODCASTS = '';
    expect(detectProvider(`https://open.spotify.com/show/${VALID_ID}`)).toBeNull();
  });
});
