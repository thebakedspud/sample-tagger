import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecentPlaylists } from '../useRecentPlaylists.js'

const saveRecentMock = vi.hoisted(() => vi.fn())
const upsertRecentMock = vi.hoisted(() => vi.fn((list, candidate) => {
  if (!candidate) return list
  const id = `${candidate.provider}:${candidate.playlistId}`
  const normalized = { id, ...candidate }
  const filtered = list.filter((item) => item.id !== id)
  return [normalized, ...filtered]
}))

vi.mock('../../utils/storage.js', () => ({
  saveRecent: saveRecentMock,
  upsertRecent: upsertRecentMock,
}))

const cacheState = vi.hoisted(() => ({
  cachedPlaylists: new Map(),
  isHydrating: false,
}))

const usePersistentPlaylistCacheMock = vi.hoisted(() => vi.fn(() => cacheState))

vi.mock('../../import/usePersistentPlaylistCache.js', () => ({
  __esModule: true,
  default: usePersistentPlaylistCacheMock,
}))

describe('useRecentPlaylists', () => {
  beforeEach(() => {
    saveRecentMock.mockReset()
    upsertRecentMock.mockClear()
    cacheState.cachedPlaylists = new Map()
    cacheState.isHydrating = false
  })

  it('enriches recents with cached metadata once hydrated', async () => {
    const cachedPayload = {
      title: 'Cached Mix',
      tracks: [{ id: '1' }, { id: '2' }],
      coverUrl: 'https://cdn.example.com/cover.jpg',
      importedAt: '2025-01-01T00:00:00.000Z',
    }
    cacheState.cachedPlaylists = new Map([
      [
        'https://example.com/playlist',
        { key: 'https://example.com/playlist', storedAt: Date.now(), data: cachedPayload },
      ],
    ])

    const initial = [
      {
        id: 'spotify:abc',
        provider: 'spotify',
        playlistId: 'abc',
        title: 'Old Title',
        sourceUrl: 'https://example.com/playlist',
        total: 1,
      },
    ]

    const { result } = renderHook(() => useRecentPlaylists(initial))

    await waitFor(() => {
      expect(result.current.recentPlaylists[0].title).toBe('Cached Mix')
      expect(result.current.recentPlaylists[0].total).toBe(2)
      expect(result.current.recentPlaylists[0].coverUrl).toBe('https://cdn.example.com/cover.jpg')
    })
  })

  it('does not alter recents while cache is hydrating', async () => {
    cacheState.cachedPlaylists = new Map([
      [
        'https://example.com/playlist',
        { key: 'https://example.com/playlist', storedAt: Date.now(), data: { title: 'Cached' } },
      ],
    ])
    cacheState.isHydrating = true

    const initial = [
      {
        id: 'spotify:abc',
        provider: 'spotify',
        playlistId: 'abc',
        title: 'Original',
        sourceUrl: 'https://example.com/playlist',
        total: 1,
      },
    ]

    const { result } = renderHook(() => useRecentPlaylists(initial))

    await act(async () => {})

    expect(result.current.recentPlaylists[0].title).toBe('Original')
    expect(saveRecentMock).not.toHaveBeenCalled()
  })
})
