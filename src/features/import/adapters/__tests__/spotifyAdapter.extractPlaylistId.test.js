import { describe, it, expect } from 'vitest';
import { extractPlaylistId } from '../spotifyAdapter.js';

const VALID_ID = '37i9dQZF1DX4WYpdgoPlCD';
const ALT_VALID_ID = '37i9dQZF1DXcBWIGoYBM5M';

describe('extractPlaylistId', () => {
  it.each([
    ['canonical https URL', `https://open.spotify.com/playlist/${VALID_ID}`],
    ['canonical with uppercase scheme', `HTTP://OPEN.SPOTIFY.COM/PLAYLIST/${VALID_ID}`],
    ['canonical with trailing slash', `https://open.spotify.com/playlist/${VALID_ID}/`],
    [
      'canonical with query + hash',
      `https://open.spotify.com/playlist/${VALID_ID}?si=abc#anchor`,
    ],
    ['locale-prefixed path', `https://open.spotify.com/intl-en/playlist/${VALID_ID}`],
    ['different locale prefix', `https://open.spotify.com/intl-de/playlist/${VALID_ID}/`],
    ['play host', `https://play.spotify.com/playlist/${VALID_ID}`],
    [
      'legacy user share',
      `https://open.spotify.com/user/spotify/playlist/${VALID_ID}?si=abc123`,
    ],
    [
      'legacy user share with hash',
      `https://open.spotify.com/user/SomeUser/playlist/${VALID_ID}#context`,
    ],
    ['embed share', `https://open.spotify.com/embed/playlist/${VALID_ID}`],
    [
      'embed share with params',
      `https://open.spotify.com/embed/playlist/${VALID_ID}?utm_source=generator&theme=0`,
    ],
    ['spotify:playlist URI', `spotify:playlist:${VALID_ID}`],
    ['spotify:user playlist URI', `spotify:user:spotify:playlist:${VALID_ID}`],
    ['spotify URI with mixed case', `Spotify:User:MyUser:Playlist:${VALID_ID}`],
    ['spotify:// deep link', `spotify://playlist/${VALID_ID}`],
    ['hostname without scheme', `open.spotify.com/playlist/${VALID_ID}`],
  ])('accepts %s', (_, input) => {
    expect(extractPlaylistId(input)).toBe(VALID_ID);
  });

  it('preserves the original case of the playlist ID', () => {
    const id = '37i9dQZF1DXbITWG1ZJKYt';
    expect(extractPlaylistId(`https://open.spotify.com/playlist/${id}`)).toBe(id);
  });

  it.each([
    ['missing playlist path', 'https://open.spotify.com/'],
    ['similar plural path', `https://open.spotify.com/playlists/${VALID_ID}`],
    ['track path', `https://open.spotify.com/track/${VALID_ID}`],
    ['album path', `https://open.spotify.com/album/${VALID_ID}`],
    ['show path', `https://open.spotify.com/show/${VALID_ID}`],
    ['episode path', `https://open.spotify.com/episode/${VALID_ID}`],
    ['unsupported host', `https://example.com/playlist/${VALID_ID}`],
    ['non playlist Spotify URI', `spotify:album:${VALID_ID}`],
    ['spotify user URI missing playlist segment', `spotify:user:someone:${VALID_ID}`],
    ['spotify URI with malformed id', 'spotify:playlist:shortid'],
    ['spotify URI with invalid chars', 'spotify:playlist:abc123-_DEFghijklmno'],
    ['legacy path missing id', 'https://open.spotify.com/user/foo/playlist/'],
    ['embed path missing id', 'https://open.spotify.com/embed/playlist/'],
    ['intl path missing id', 'https://open.spotify.com/intl-en/playlist/'],
    ['double slash path', 'https://open.spotify.com//playlist//'],
    ['mobile deep link missing id', 'spotify://playlist/short'],
    ['invalid id characters', `https://open.spotify.com/playlist/${ALT_VALID_ID.replace('M', '-')}`],
    ['id shorter than 22 chars', `https://open.spotify.com/playlist/${VALID_ID.slice(0, 10)}`],
    ['id longer than 22 chars', `https://open.spotify.com/playlist/${VALID_ID}XYZ`],
  ])('rejects %s', (_, input) => {
    expect(extractPlaylistId(input)).toBeNull();
  });

  it('rejects fuzzed non-playlist paths under open.spotify.com', () => {
    const weirdPaths = Array.from({ length: 20 }, (_, i) => `section${i}/sub${i}/item${i}`);
    weirdPaths.forEach((path) => {
      expect(extractPlaylistId(`https://open.spotify.com/${path}`)).toBeNull();
    });
  });
});
