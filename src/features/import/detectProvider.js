import { extractPlaylistId } from './adapters/spotifyAdapter.js';

// Detects which platform a playlist URL belongs to.
// Returns 'spotify' | 'youtube' | 'soundcloud' | null.
export default function detectProvider(input = '') {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (extractPlaylistId(trimmed)) return 'spotify';

  const lower = trimmed.toLowerCase();

  // YouTube playlists (youtube or music.youtube; require list=)
  if (
    (lower.includes('youtube.com/playlist') || lower.includes('music.youtube.com/playlist')) &&
    lower.includes('list=')
  ) {
    return 'youtube';
  }

  // SoundCloud sets (playlist-equivalent)
  if (
    lower.includes('soundcloud.com/') &&
    (lower.includes('/sets/') || lower.includes('/playlist'))
  ) {
    return 'soundcloud';
  }

  return null;
}
