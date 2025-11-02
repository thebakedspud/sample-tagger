import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import usePlaylistImportFlow, { ImportFlowStatus } from '../usePlaylistImportFlow.js'

/** @typedef {import('../adapters/types.js').ImportResult} ImportResult */
/**
 * @typedef {Object} TestImportFlowApi
 * @property {typeof ImportFlowStatus[keyof typeof ImportFlowStatus]} status
 * @property {(url: string, options?: any) => Promise<ImportResult>} importInitial
 * @property {(options?: any) => Promise<ImportResult>} reimport
 * @property {(options?: any) => Promise<ImportResult>} loadMore
 * @property {() => void} resetFlow
 * @property {boolean} loading
 * @property {string | null | undefined} errorCode
 */

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
  /** @type {(value: any) => void} */
  let resolve
  /** @type {(reason?: any) => void} */
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  if (!resolve || !reject) {
    throw new Error('Deferred helpers not initialized')
  }
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
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    /** @type {Promise<ImportResult> | undefined} */
    let firstPromise
    act(() => {
      firstPromise = flow.importInitial('https://example.com/a', {
        providerHint: 'spotify',
      })
    })

    /** @type {Promise<ImportResult> | undefined} */
    let secondPromise
    act(() => {
      secondPromise = flow.importInitial('https://example.com/b', {
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

    if (!secondPromise) throw new Error('expected second promise')
    const confirmedSecondPromise =
      /** @type {Promise<ImportResult>} */ (secondPromise)

    /** @type {ImportResult | undefined} */
    let secondResult
    await act(async () => {
      secondResult = await confirmedSecondPromise
    })

    if (!secondResult) throw new Error('expected second import result')
    expect(secondResult.ok).toBe(true)
    if (!secondResult.data) throw new Error('expected second result data')
    expect(secondResult.data.tracks).toHaveLength(1)
    expect(result.current.status).toBe(ImportFlowStatus.IDLE)

    const firstPayload = {
      provider: 'spotify',
      tracks: [{ id: 'track-1', title: 'First', artist: 'A' }],
      pageInfo: { cursor: null, hasMore: false },
    }
    first.resolve(firstPayload)

    if (!firstPromise) throw new Error('expected first promise')
    const confirmedFirstPromise =
      /** @type {Promise<ImportResult>} */ (firstPromise)

    /** @type {ImportResult | undefined} */
    let firstResult
    await act(async () => {
      firstResult = await confirmedFirstPromise
    })

    if (!firstResult) throw new Error('expected first import result')
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
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    /** @type {ImportResult | undefined} */
    let response
    await act(async () => {
      response = await flow.loadMore({
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

    if (!response) throw new Error('expected loadMore response')
    expect(importNextMock).toHaveBeenCalledTimes(1)
    expect(response.ok).toBe(true)
    if (!response.data) throw new Error('expected response data')
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
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    /** @type {ImportResult | undefined} */
    let outcome
    await act(async () => {
      outcome = await flow.importInitial('https://example.com/a', {
        providerHint: 'spotify',
      })
    })

    if (!outcome) throw new Error('expected import outcome')
    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('ERR_NOT_FOUND')
  })
})
