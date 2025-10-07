// Detects which platform a playlist URL belongs to.
// Returns 'spotify' | 'youtube' | 'soundcloud' | null.
export default function detectProvider(input = '') {
  if (!input || typeof input !== 'string') return null;

  // Normalize
  const u = input.trim().toLowerCase();

  // Spotify playlists (accept both canonical and shortened variants)
  if (u.includes('open.spotify.com/playlist/')) return 'spotify';

  // YouTube playlists (youtube or music.youtube; require list=)
  if (
    (u.includes('youtube.com/playlist') || u.includes('music.youtube.com/playlist')) &&
    u.includes('list=')
  ) {
    return 'youtube';
  }

  // SoundCloud sets (playlist-equivalent)
  if (
    u.includes('soundcloud.com/') &&
    (u.includes('/sets/') || u.includes('/playlist'))
  ) {
    return 'soundcloud';
  }

  return null;
}
