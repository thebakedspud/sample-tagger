import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import usePlaylistImportFlow, {
  ImportFlowStatus,
} from '../usePlaylistImportFlow.js'

const importPlaylistMock = vi.fn()
const importNextMock = vi.fn()
const resetMock = vi.fn()
const loadingState = { value: false }

vi.mock('../useImportPlaylist.js', () => ({
  default: () => ({
    importPlaylist: importPlaylistMock,
    importNext: importNextMock,
    reset: resetMock,
    loading: loadingState.value,
  }),
}))

const createDeferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('usePlaylistImportFlow', () => {
  beforeEach(() => {
    importPlaylistMock.mockReset()
    importNextMock.mockReset()
    resetMock.mockReset()
    loadingState.value = false
  })

  it('ignores stale initial responses when a newer request completes first', async () => {
    const first = createDeferred()
    const second = createDeferred()

    importPlaylistMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const { result } = renderHook(() => usePlaylistImportFlow())

    let firstPromise
    act(() => {
      firstPromise = result.current.importInitial('https://example.com/a', {
        providerHint: 'spotify',
      })
    })

    let secondPromise
    act(() => {
      secondPromise = result.current.importInitial('https://example.com/b', {
        providerHint: 'spotify',
      })
    })

    expect(result.current.status).toBe(ImportFlowStatus.IMPORTING)

    const secondPayload = {
      provider: 'spotify',
      tracks: [{ id: 'track-2', title: 'Second', artist: 'B' }],
      pageInfo: { cursor: null, hasMore: false },
    }
    second.resolve(secondPayload)

    let secondResult
    await act(async () => {
      secondResult = await secondPromise
    })

    expect(secondResult.ok).toBe(true)
    expect(secondResult.data.tracks).toHaveLength(1)
    expect(result.current.status).toBe(ImportFlowStatus.IDLE)

    const firstPayload = {
      provider: 'spotify',
      tracks: [{ id: 'track-1', title: 'First', artist: 'A' }],
      pageInfo: { cursor: null, hasMore: false },
    }
    first.resolve(firstPayload)

    let firstResult
    await act(async () => {
      firstResult = await firstPromise
    })

    expect(firstResult).toEqual({ ok: false, stale: true })
    expect(result.current.status).toBe(ImportFlowStatus.IDLE)
  })

  it('deduplicates tracks returned from loadMore and preserves metadata', async () => {
    importNextMock.mockResolvedValue({
      provider: 'spotify',
      tracks: [
        { id: 'track-1', title: 'Existing', artist: 'A' },
        { id: 'track-2', title: 'New', artist: 'B' },
      ],
      pageInfo: { cursor: 'cursor-2', hasMore: true },
      playlistId: 'playlist-123',
    })

    const { result } = renderHook(() => usePlaylistImportFlow())

    let response
    await act(async () => {
      response = await result.current.loadMore({
        providerHint: 'spotify',
        existingMeta: {
          provider: 'spotify',
          playlistId: 'playlist-123',
          snapshotId: 'snap-1',
          cursor: 'cursor-1',
          hasMore: true,
          sourceUrl: 'https://example.com/a',
        },
        existingIds: ['track-1'],
        startIndex: 1,
        sourceUrl: 'https://example.com/a',
      })
    })

    expect(importNextMock).toHaveBeenCalledTimes(1)
    expect(response.ok).toBe(true)
    expect(response.data.tracks).toEqual([
      expect.objectContaining({
        id: 'track-2',
        title: 'New',
        artist: 'B',
        notes: [],
        provider: 'spotify',
      }),
    ])
    expect(response.data.meta.cursor).toBe('cursor-2')
  })

  it('propagates adapter error codes from rejected imports', async () => {
    const error = Object.assign(new Error('boom'), {
      cause: { code: 'ERR_NOT_FOUND' },
    })
    importPlaylistMock.mockRejectedValueOnce(error)

    const { result } = renderHook(() => usePlaylistImportFlow())

    let outcome
    await act(async () => {
      outcome = await result.current.importInitial('https://example.com/a', {
        providerHint: 'spotify',
      })
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('ERR_NOT_FOUND')
  })
})
