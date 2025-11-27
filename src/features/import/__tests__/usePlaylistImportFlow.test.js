import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import usePlaylistImportFlow, { ImportFlowStatus } from '../usePlaylistImportFlow.js'

/** @typedef {import('../adapters/types.js').ImportResult} ImportResult */
/**
 * @typedef {Object} TestImportFlowApi
 * @property {typeof ImportFlowStatus[keyof typeof ImportFlowStatus]} status
 * @property {(url: string, options?: any) => Promise<ImportResult>} importInitial
 * @property {(url: string, options?: any) => Promise<ImportResult>} reimport
 * @property {(options?: any) => Promise<ImportResult>} loadMore
 * @property {() => void} resetFlow
 * @property {boolean} loading
 * @property {string | null | undefined} errorCode
 */

const importPlaylistMock = vi.fn()
const importNextMock = vi.fn()
const resetMock = vi.fn()
const primeProvidersMock = vi.fn(async () => {})
const loadingState = { value: false }

vi.mock('../useImportPlaylist.js', () => ({
  default: () => ({
    importPlaylist: importPlaylistMock,
    importNext: importNextMock,
    reset: resetMock,
    loading: loadingState.value,
    primeProviders: primeProvidersMock,
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
    primeProvidersMock.mockReset()
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

  it('preserves podcast metadata returned by adapters', async () => {
    importPlaylistMock.mockResolvedValueOnce({
      provider: 'spotify',
      tracks: [
        {
          id: 'episode-1',
          title: 'Episode One',
          artist: 'Host',
          kind: 'podcast',
          showId: 'show-1',
          showName: 'Great Show',
          publisher: 'PodCo',
          description: 'Deep dive on topic.',
        },
      ],
      pageInfo: { cursor: null, hasMore: false },
    })

    const { result } = renderHook(() => usePlaylistImportFlow())
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    /** @type {ImportResult | undefined} */
    let outcome
    await act(async () => {
      outcome = await flow.importInitial('https://example.com/show')
    })

    if (!outcome || !outcome.data) throw new Error('expected import data')
    expect(outcome.ok).toBe(true)
    expect(outcome.data.tracks[0]).toEqual(
      expect.objectContaining({
        kind: 'podcast',
        showId: 'show-1',
        showName: 'Great Show',
        publisher: 'PodCo',
        description: 'Deep dive on topic.',
      }),
    )
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

  it('returns unknown error when reimport is called without a url', async () => {
    const { result } = renderHook(() => usePlaylistImportFlow())
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    const outcome = await flow.reimport('', {})
    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('ERR_UNKNOWN')
  })

  it('handles reimport responses that resolve out of order', async () => {
    const first = createDeferred()
    const second = createDeferred()

    importPlaylistMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const { result } = renderHook(() => usePlaylistImportFlow())
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    let firstPromise
    act(() => {
      firstPromise = flow.reimport('https://example.com/a')
    })

    let secondPromise
    act(() => {
      secondPromise = flow.reimport('https://example.com/a')
    })

    second.resolve({
      provider: 'spotify',
      tracks: [],
      pageInfo: { cursor: null, hasMore: false },
    })

    if (!secondPromise) throw new Error('expected second promise')
    await act(async () => {
      const confirmed = /** @type {Promise<ImportResult>} */ (secondPromise)
      const response = await confirmed
      expect(response.ok).toBe(true)
    })

    first.resolve({
      provider: 'spotify',
      tracks: [],
      pageInfo: { cursor: null, hasMore: false },
    })

    if (!firstPromise) throw new Error('expected first promise')
    const staleResponse = await /** @type {Promise<ImportResult>} */ (firstPromise)
    expect(staleResponse).toEqual({ ok: false, stale: true })
  })

  it('returns terminal metadata when loadMore signals completion', async () => {
    importNextMock.mockResolvedValueOnce(undefined)
    const existingMeta = {
      provider: 'spotify',
      playlistId: 'playlist-123',
      snapshotId: 'snap-1',
      sourceUrl: 'https://example.com/a',
      cursor: 'cursor-1',
      hasMore: true,
      total: 10,
    }

    const { result } = renderHook(() => usePlaylistImportFlow())
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    /** @type {ImportResult | undefined} */
    let outcome
    await act(async () => {
      outcome = await flow.loadMore({ existingMeta })
    })
    if (!outcome) throw new Error('expected load more outcome')
    expect(outcome.ok).toBe(true)
    expect(outcome.data?.tracks).toEqual([])
    expect(outcome.data?.meta).toEqual({
      provider: 'spotify',
      playlistId: 'playlist-123',
      snapshotId: 'snap-1',
      cursor: null,
      hasMore: false,
      sourceUrl: 'https://example.com/a',
      debug: null,
      total: 10,
    })
  })

  it('rethrows abort errors from loadMore and sets error codes on other failures', async () => {
    const abortError = new DOMException('aborted', 'AbortError')
    importNextMock.mockRejectedValueOnce(abortError)

    const { result } = renderHook(() => usePlaylistImportFlow())
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    await act(async () => {
      await expect(
        flow.loadMore({ signal: AbortSignal.abort('cancel') }),
      ).rejects.toThrow('aborted')
    })

    const failure = Object.assign(new Error('boom'), { code: 'ERR_RATE_LIMITED' })
    importNextMock.mockRejectedValueOnce(failure)

    /** @type {ImportResult | undefined} */
    let outcome
    await act(async () => {
      outcome = await flow.loadMore()
    })
    if (!outcome) throw new Error('expected load more failure outcome')
    expect(outcome.ok).toBe(false)
    expect(outcome.code).toBe('ERR_RATE_LIMITED')
    expect(result.current.errorCode).toBe('ERR_RATE_LIMITED')
  })

  it('resets status and errorCode when resetFlow is invoked', async () => {
    importPlaylistMock.mockRejectedValueOnce(new Error('fail'))
    const { result } = renderHook(() => usePlaylistImportFlow())
    const flow = /** @type {TestImportFlowApi} */ (result.current)

    await act(async () => {
      await flow.importInitial('https://example.com/a')
    })
    expect(result.current.errorCode).toBe('ERR_UNKNOWN')
    act(() => {
      flow.resetFlow()
    })
    expect(result.current.status).toBe(ImportFlowStatus.IDLE)
    expect(result.current.errorCode).toBeNull()
  })

  it('exposes loading state passthrough from adapter hook', () => {
    loadingState.value = true
    const { result } = renderHook(() => usePlaylistImportFlow())
    expect(result.current.loading).toBe(true)
  })

  it('primes upstream services through primeUpstreamServices', async () => {
    const { result } = renderHook(() => usePlaylistImportFlow())
    await act(async () => {
      await result.current.primeUpstreamServices()
    })
    expect(primeProvidersMock).toHaveBeenCalledTimes(1)
  })
})
