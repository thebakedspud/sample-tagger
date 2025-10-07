// src/features/import/detectProvider.js
export default function detectProvider(url = '') {
  const u = url.trim().toLowerCase();

  // Spotify playlists
  if (u.includes('open.spotify.com/playlist/')) return 'spotify';

  // YouTube playlists (youtube or music.youtube)
  if (
    (u.includes('youtube.com/playlist?') || u.includes('music.youtube.com/playlist?')) &&
    u.includes('list=')
  ) {
    return 'youtube';
  }

  // SoundCloud sets (playlist-equivalent)
  if (u.includes('soundcloud.com/') && (u.includes('/sets/') || u.includes('/playlist'))) {
    return 'soundcloud';
  }

  return null;
}
