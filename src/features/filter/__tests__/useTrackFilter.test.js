import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useTrackFilter from '../useTrackFilter.js'
import { SEARCH_SCOPE, SORT_DIRECTION, SORT_KEY } from '../filterTracks.js'

const storageKeySnap1 = 'sta:v5:filters:spotify:abc:snap-1'

function setStoredState(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

describe('useTrackFilter', () => {
  const announce = vi.fn()
  const tracks = [
    { id: '1', title: 'Alpha', notes: ['note'] },
    { id: '2', title: 'Bravo', notes: [] },
  ]

  beforeEach(() => {
    window.localStorage.clear()
    announce.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates normalized state from storage and filters duplicates', () => {
    setStoredState(storageKeySnap1, {
      query: ' saved ',
      scope: 'notes',
      sort: { key: 'title', direction: 'ASC' },
      selectedTags: ['rock ', 'rock', ''],
      hasNotesOnly: true,
    })

    const { result } = renderHook(() =>
      useTrackFilter({
        tracks,
        provider: 'spotify',
        playlistId: 'abc',
        snapshotId: 'snap-1',
        announce,
      }),
    )

    expect(result.current.query).toBe(' saved ')
    expect(result.current.scope).toBe(SEARCH_SCOPE.NOTES)
    expect(result.current.sort).toEqual({ key: SORT_KEY.TITLE, direction: SORT_DIRECTION.DESC })
    expect(result.current.selectedTags).toEqual(['rock'])
    expect(result.current.hasNotesOnly).toBe(true)
  })

  it('debounces query updates over 250ms', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useTrackFilter({
        tracks,
        provider: null,
        playlistId: null,
        snapshotId: null,
        announce,
      }),
    )

    act(() => {
      result.current.setQuery('ambient')
    })
    expect(result.current.debouncedQuery).toBe('')

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current.debouncedQuery).toBe('ambient')
  })

  it('handles storage write and delete errors without throwing', () => {
    const storageProto = Object.getPrototypeOf(window.localStorage)
    const setItemSpy = vi.spyOn(storageProto, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const removeItemSpy = vi.spyOn(storageProto, 'removeItem').mockImplementation(() => {
      throw new Error('remove failed')
    })

    const { result } = renderHook(() =>
      useTrackFilter({
        tracks,
        provider: 'spotify',
        playlistId: 'abc',
        snapshotId: 'snap-1',
        announce,
      }),
    )

    expect(() => {
      act(() => {
        result.current.setQuery('test')
      })
    }).not.toThrow()

    expect(() => {
      act(() => {
        result.current.clearFilters()
      })
    }).not.toThrow()

    expect(setItemSpy).toHaveBeenCalled()
    expect(removeItemSpy).toHaveBeenCalled()

    setItemSpy.mockRestore()
    removeItemSpy.mockRestore()
  })

  it('restores filters from previous snapshot when available', async () => {
    setStoredState(storageKeySnap1, {
      query: 'restore',
      scope: SEARCH_SCOPE.NOTES,
      sort: { key: SORT_KEY.TITLE, direction: SORT_DIRECTION.ASC },
      selectedTags: ['focus'],
      hasNotesOnly: true,
    })

    const { result, rerender } = renderHook(
      (props) => useTrackFilter(props),
      {
        initialProps: {
          tracks,
          provider: 'spotify',
          playlistId: 'abc',
          snapshotId: 'snap-1',
          announce,
        },
      },
    )

    expect(result.current.query).toBe('restore')

    await act(async () => {
      rerender({
        tracks,
        provider: 'spotify',
        playlistId: 'abc',
        snapshotId: 'snap-2',
        announce,
      })
    })

    expect(result.current.canRestoreFilters).toBe(true)

    await act(async () => {
      const restored = result.current.restoreFilters()
      expect(restored).toBe(true)
    })

    expect(result.current.query).toBe('restore')
    expect(result.current.scope).toBe(SEARCH_SCOPE.NOTES)
    expect(result.current.selectedTags).toEqual(['focus'])
    expect(result.current.canRestoreFilters).toBe(false)

    act(() => {
      result.current.dismissRestoreFilters()
    })
    expect(result.current.canRestoreFilters).toBe(false)
  })
})
