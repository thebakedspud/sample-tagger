/**
 * Recent Playlist Utilities
 * Helper functions for recent playlist tracking
 *
 * @module features/recent/recentUtils
 */

import { normalizeTimestamp } from '../../utils/trackProcessing.js'

/**
 * Creates a candidate object for recent playlist tracking
 *
 * This function creates a **partial** recent playlist object from import metadata.
 * The returned candidate is passed to `upsertRecent()` in storage.js, which performs
 * additional normalization and adds the required `id` field via `normalizeRecentItem()`.
 *
 * **Flow:**
 * 1. createRecentCandidate() - Creates partial object (provider, playlistId, title, etc.)
 * 2. upsertRecent() in storage.js - Calls normalizeRecentItem() to complete normalization
 * 3. normalizeRecentItem() in storage.js - Adds `id: makeRecentId(provider, playlistId)` and validates all fields
 *
 * Returns null if required fields (provider, playlistId, sourceUrl) are missing.
 *
 * @param {object} meta - Import metadata object
 * @param {string} [meta.provider] - Playlist provider (spotify, youtube, soundcloud)
 * @param {string} [meta.playlistId] - Provider-specific playlist ID
 * @param {string} [meta.sourceUrl] - Source URL (fallback if options.sourceUrl not provided)
 * @param {object} [options={}] - Optional metadata to include in candidate
 * @param {string} [options.title] - Display title for the playlist (defaults to 'Imported Playlist')
 * @param {string} [options.sourceUrl] - Source URL (takes precedence over meta.sourceUrl)
 * @param {number | Date | string} [options.importedAt] - Import timestamp (normalized to Unix ms)
 * @param {number | Date | string} [options.lastUsedAt] - Last used timestamp (normalized to Unix ms)
 * @param {number} [options.total] - Total track count
 * @param {string} [options.coverUrl] - Cover image URL
 * @param {boolean} [options.pinned] - Whether playlist is pinned
 * @param {number | Date | string} [options.lastRefreshedAt] - Timestamp of last manual refresh
 *
 * @returns {object | null} Partial recent playlist candidate object, or null if validation fails
 *
 * @example
 * // Basic usage with required fields
 * const candidate = createRecentCandidate(
 *   { provider: 'spotify', playlistId: 'abc123', sourceUrl: 'https://spotify.com/...' },
 *   { title: 'My Playlist', total: 42 }
 * )
 * // Returns: { provider: 'spotify', playlistId: 'abc123', title: 'My Playlist', sourceUrl: '...', total: 42 }
 * // Note: No `id` field yet - added by storage.js normalization
 *
 * @example
 * // With timestamps and cover image
 * const candidate = createRecentCandidate(
 *   { provider: 'youtube', playlistId: 'xyz789', sourceUrl: 'https://youtube.com/...' },
 *   {
 *     title: 'My Favorites',
 *     importedAt: Date.now(),
 *     coverUrl: 'https://example.com/cover.jpg'
 *   }
 * )
 * // Timestamps are normalized via normalizeTimestamp() before inclusion
 */
export function createRecentCandidate(meta, options = {}) {
  if (!meta || typeof meta !== 'object') return null
  const provider =
    typeof meta.provider === 'string' && meta.provider.trim()
      ? meta.provider.trim().toLowerCase()
      : null
  const playlistId =
    typeof meta.playlistId === 'string' && meta.playlistId.trim()
      ? meta.playlistId.trim()
      : null
  const fallbackUrl =
    typeof meta.sourceUrl === 'string' && meta.sourceUrl.trim()
      ? meta.sourceUrl.trim()
      : null
  const sourceCandidate =
    typeof options.sourceUrl === 'string' && options.sourceUrl.trim()
      ? options.sourceUrl.trim()
      : fallbackUrl
  if (!provider || !playlistId || !sourceCandidate) return null

  const next = {
    provider,
    playlistId,
    title:
      typeof options.title === 'string' && options.title.trim()
        ? options.title.trim()
        : 'Imported Playlist',
    sourceUrl: sourceCandidate,
  }

  const importedAt = normalizeTimestamp(options.importedAt)
  if (importedAt != null) next.importedAt = importedAt
  const lastUsedAt = normalizeTimestamp(options.lastUsedAt)
  if (lastUsedAt != null) next.lastUsedAt = lastUsedAt

  if (typeof options.total === 'number' && Number.isFinite(options.total) && options.total >= 0) {
    next.total = Math.round(options.total)
  }
  if (typeof options.coverUrl === 'string' && options.coverUrl.trim()) {
    next.coverUrl = options.coverUrl.trim()
  }
  if (options.pinned) {
    next.pinned = true
  }
  const lastRefreshedAt = normalizeTimestamp(options.lastRefreshedAt)
  if (lastRefreshedAt != null) {
    next.lastRefreshedAt = lastRefreshedAt
  }

  return next
}
