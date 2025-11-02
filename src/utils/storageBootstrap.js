/**
 * Storage bootstrap helpers
 * Provides SSR-safe initialization helpers for persisted playlist state.
 *
 * @module utils/storageBootstrap
 */

import { loadAppState, getPendingMigrationSnapshot, loadRecent } from './storage.js'

/**
 * Safe default importMeta shape (mirrors storage v3 persisted data).
 *
 * Consumers should spread this object into new state instances before mutating.
 */
export const EMPTY_IMPORT_META = {
  provider: null,
  playlistId: null,
  snapshotId: null,
  cursor: null,
  hasMore: false,
  sourceUrl: '',
  debug: null,
  total: null,
}

/**
 * Bootstraps persisted storage state for the application.
 *
 * Runs entirely on the client and is safe to call during SSR (returns empty defaults when `window`
 * is unavailable). When storage data is present, it populates initial recents, persisted tracks,
 * and determines the initial screen to render.
 *
 * @returns {{
 *   persisted: import('./storage.js').PersistedState | null,
 *   pendingMigrationSnapshot: import('./storage.js').PersistedState | null,
 *   initialRecents: import('./storage.js').RecentPlaylist[],
 *   persistedTracks: import('./storage.js').PersistedTrack[],
 *   initialScreen: 'landing' | 'playlist'
 * }} Bootstrap state derived from local storage.
 */
export function bootstrapStorageState() {
  if (typeof window === 'undefined') {
    return {
      persisted: null,
      pendingMigrationSnapshot: null,
      initialRecents: [],
      persistedTracks: [],
      initialScreen: 'landing',
    }
  }

  const persisted = loadAppState()
  const pendingMigrationSnapshot = getPendingMigrationSnapshot()
  const persistedRecents = Array.isArray(persisted?.recentPlaylists)
    ? [...persisted.recentPlaylists]
    : null
  const loadedRecents = persistedRecents ?? loadRecent()
  const persistedTracks = Array.isArray(persisted?.tracks) ? [...persisted.tracks] : []
  const hasValidPlaylist = Boolean(persisted?.importMeta?.provider && persistedTracks.length)

  return {
    persisted,
    pendingMigrationSnapshot,
    initialRecents: Array.isArray(loadedRecents) ? [...loadedRecents] : [],
    persistedTracks,
    initialScreen: hasValidPlaylist ? 'playlist' : 'landing',
  }
}
