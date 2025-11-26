import PlaylistView from '../playlist/PlaylistView.jsx'

/**
 * Lightweight wrapper so Podcast-specific tweaks can evolve independently
 * while reusing the proven PlaylistView implementation.
 */
export default function PodcastView(props) {
  return <PlaylistView {...props} viewMode="podcast" />
}
