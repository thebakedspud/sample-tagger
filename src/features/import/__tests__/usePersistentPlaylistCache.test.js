import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mockLoad = vi.hoisted(() => vi.fn())
const mockPersist = vi.hoisted(() => vi.fn())
const mockSortAndTrim = vi.hoisted(() => vi.fn((entries) => entries))

vi.mock('../playlistCache.js', () => ({
  loadPersistedPlaylistCache: mockLoad,
  persistPlaylistCacheEntries: mockPersist,
  sortAndTrimEntries: mockSortAndTrim,
  PLAYLIST_CACHE_MAX_ENTRIES: 5,
}))

// Import after mocks
import usePersistentPlaylistCache from '../usePersistentPlaylistCache.js'

describe('usePersistentPlaylistCache', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mockLoad.mockReset()
    mockPersist.mockReset()
    mockSortAndTrim.mockReset()
    mockLoad.mockReturnValue([])
    mockSortAndTrim.mockImplementation((entries) => entries)
  })

  it('hydrates persisted entries on mount', async () => {
    const payload = {
      tracks: [{ id: 't1', title: 'Cached', artist: 'Artist' }],
      meta: { provider: 'spotify', playlistId: 'p1', cursor: null },
    }
    mockLoad.mockReturnValue([
      { key: 'cached-key', storedAt: 123, data: payload },
    ])

    const { result } = renderHook(() => usePersistentPlaylistCache())

    await waitFor(() => expect(result.current.isHydrating).toBe(false))

    const fromCache = result.current.getCachedResult('cached-key')
    expect(fromCache).toEqual(payload)
    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  it('remembers new entries and persists them', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2025-01-01T00:00:00Z').getTime())
    const { result } = renderHook(() => usePersistentPlaylistCache())
    await waitFor(() => expect(result.current.isHydrating).toBe(false))

    const payload = {
      tracks: [{ id: 't2', title: 'Live', artist: 'Artist' }],
      meta: { provider: 'spotify', playlistId: 'p2', cursor: null },
    }

    await act(async () => {
      result.current.rememberCachedResult(' foo ', payload)
    })

    expect(mockSortAndTrim).toHaveBeenCalled()
    expect(mockPersist).toHaveBeenCalled()
    const [persistArg] = mockPersist.mock.calls.at(-1)
    expect(persistArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'foo', data: payload }),
      ]),
    )
    nowSpy.mockRestore()
  })

  it('forgets entries and writes the updated cache', async () => {
    mockLoad.mockReturnValue([{ key: 'foo', storedAt: 1, data: { meta: {} } }])
    const { result } = renderHook(() => usePersistentPlaylistCache())
    await waitFor(() => expect(result.current.isHydrating).toBe(false))

    await act(async () => {
      result.current.forgetCachedResult('foo')
    })

    expect(mockPersist).toHaveBeenCalledWith([])
  })
})
