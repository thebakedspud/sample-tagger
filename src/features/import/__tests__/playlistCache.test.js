import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPersistedPlaylistCache,
  persistPlaylistCacheEntries,
  clearPlaylistCacheStorage,
  sortAndTrimEntries,
  PLAYLIST_CACHE_MAX_ENTRIES,
} from '../playlistCache.js'

const makeEntry = (key, storedAt) => ({
  key,
  storedAt,
  data: {
    tracks: [{ id: `${key}-track`, title: 'Song', artist: 'Artist' }],
    meta: { provider: 'spotify', playlistId: key },
  },
})

describe('playlistCache storage helpers', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearPlaylistCacheStorage()
  })

  it('sorts and trims entries to the configured max', () => {
    const entries = Array.from({ length: PLAYLIST_CACHE_MAX_ENTRIES + 2 }, (_, idx) =>
      makeEntry(`key-${idx}`, idx),
    )
    const trimmed = sortAndTrimEntries(entries)
    expect(trimmed).toHaveLength(PLAYLIST_CACHE_MAX_ENTRIES)
    // newest entry should be first (highest storedAt)
    expect(trimmed[0].storedAt).toBe(entries.length - 1)
    expect(trimmed[trimmed.length - 1].storedAt).toBe(
      entries.length - PLAYLIST_CACHE_MAX_ENTRIES,
    )
  })

  it('persists and loads cache entries', () => {
    const entries = sortAndTrimEntries([makeEntry('alpha', 20), makeEntry('beta', 10)])
    persistPlaylistCacheEntries(entries)
    const loaded = loadPersistedPlaylistCache()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].key).toBe('alpha')
    expect(loaded[1].key).toBe('beta')
    expect(loaded[0].data.meta.playlistId).toBe('alpha')
  })
})
