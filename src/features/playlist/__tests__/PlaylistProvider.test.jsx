// src/features/playlist/__tests__/PlaylistProvider.test.jsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PlaylistStateProvider } from '../PlaylistProvider.jsx'
import { usePlaylistState, usePlaylistDispatch, usePlaylistSync } from '../usePlaylistContext.js'
import { initialPlaylistState } from '../playlistReducer.js'
import { noteBodies } from '../../../test-utils/noteHelpers.js'

// Mock dependencies
vi.mock('../../../lib/apiClient.js', () => ({
  apiFetch: vi.fn()
}))

vi.mock('../../../lib/deviceState.js', () => ({
  notifyDeviceContextStale: vi.fn()
}))

vi.mock('../../../utils/notesTagsData.js', async (importOriginal) => {
  /** @type {any} */
  const actual = await importOriginal()
  return {
    ...actual,
    groupRemoteNotes: vi.fn()
  }
})

vi.mock('../../tags/tagSyncQueue.js', () => ({
  createTagSyncScheduler: vi.fn()
}))

// Import mocked modules after mocking
import { apiFetch } from '../../../lib/apiClient.js'
import { groupRemoteNotes } from '../../../utils/notesTagsData.js'
import { createTagSyncScheduler } from '../../tags/tagSyncQueue.js'
import { notifyDeviceContextStale } from '../../../lib/deviceState.js'

const mockedApiFetch = vi.mocked(apiFetch)
const mockedGroupRemoteNotes = vi.mocked(groupRemoteNotes)
const mockedCreateTagSyncScheduler = vi.mocked(createTagSyncScheduler)
const mockedNotifyDeviceContextStale = vi.mocked(notifyDeviceContextStale)

const makeResolvedResponse = (overrides = {}) => ({
  ok: true,
  json: vi.fn().mockResolvedValue({}),
  ...overrides,
})

const getTagQueueKey = (deviceId) => `sta:pending-tag-sync:${deviceId}`

describe('PlaylistProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
    
    // Set up default mock implementations
    const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Server error' })
    }))
    mockedApiFetch.mockResolvedValue(mockResponse)
    
    mockedGroupRemoteNotes.mockReturnValue({ notes: {}, tags: {} })
    
    const mockScheduler = { schedule: vi.fn().mockResolvedValue(undefined), clear: vi.fn() }
    mockedCreateTagSyncScheduler.mockReturnValue(mockScheduler)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Rendering & Context Provision', () => {
    it('provides state context to children', () => {
      function TestChild() {
        const state = usePlaylistState()
        return <div data-testid="state">{JSON.stringify(state.tracks)}</div>
      }

      render(
        <PlaylistStateProvider initialState={initialPlaylistState} anonContext={{ deviceId: null, anonId: null }}>
          <TestChild />
        </PlaylistStateProvider>
      )

      expect(screen.getByTestId('state')).toHaveTextContent('[]')
    })

    it('provides dispatch context to children', () => {
      function TestChild() {
        const dispatch = usePlaylistDispatch()
        return <div data-testid="dispatch">{typeof dispatch}</div>
      }

      render(
        <PlaylistStateProvider initialState={initialPlaylistState} anonContext={{ deviceId: null, anonId: null }}>
          <TestChild />
        </PlaylistStateProvider>
      )

      expect(screen.getByTestId('dispatch')).toHaveTextContent('function')
    })

    it('provides sync context to children', () => {
      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        return <div data-testid="sync">{typeof syncTrackTags}</div>
      }

      render(
        <PlaylistStateProvider initialState={initialPlaylistState} anonContext={{ deviceId: null, anonId: null }}>
          <TestChild />
        </PlaylistStateProvider>
      )

      expect(screen.getByTestId('sync')).toHaveTextContent('function')
    })

    it('initializes with provided initialState', () => {
      const customState = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Test Track', notes: [], tags: [] }]
      }

      function TestChild() {
        const state = usePlaylistState()
        return <div data-testid="tracks">{state.tracks.length}</div>
      }

      render(
        <PlaylistStateProvider initialState={customState} anonContext={{ deviceId: null, anonId: null }}>
          <TestChild />
        </PlaylistStateProvider>
      )

      expect(screen.getByTestId('tracks')).toHaveTextContent('1')
    })
  })

  describe('Remote Sync Effect', () => {
    it('fetches notes/tags when deviceId is available and local data exists', async () => {
      const mockNotes = [{ trackId: 't1', body: 'note1', tags: ['tag1'] }]
      const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: true,
        json: vi.fn().mockResolvedValue({ notes: mockNotes })
      }))
      mockedApiFetch.mockResolvedValue(mockResponse)
      mockedGroupRemoteNotes.mockReturnValue({ notes: { t1: ['note1'] }, tags: { t1: ['tag1'] } })
      const stateWithLocalData = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
      }

      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={stateWithLocalData} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith(
          '/api/db/notes',
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
      })
    })

    it('does not fetch when deviceId is null', async () => {
      const stateWithLocalData = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
      }

      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={stateWithLocalData} 
          anonContext={{ deviceId: null, anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      // Wait a bit to ensure no fetch happens
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(mockedApiFetch).not.toHaveBeenCalled()
    })

    it('clears the sync timeout after a successful fetch', async () => {
      const stateWithLocalData = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
      }
      const onStatusChange = vi.fn()
      const mockResponse = makeResolvedResponse({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ notes: [] }),
      })
      mockedApiFetch.mockResolvedValue(mockResponse)

      const originalSetTimeout = globalThis.setTimeout
      const originalClearTimeout = globalThis.clearTimeout
      const timeoutHandle = 9999
      let capturedTimeoutCallback = null

      const setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation((callback, delay, ...args) => {
          if (typeof delay === 'number' && delay >= 30000) {
            capturedTimeoutCallback = () => callback(...args)
            return timeoutHandle
          }
          return originalSetTimeout(callback, delay, ...args)
        })

      const clearTimeoutSpy = vi
        .spyOn(globalThis, 'clearTimeout')
        .mockImplementation((handle) => {
          if (handle === timeoutHandle) {
            return
          }
          return originalClearTimeout(handle)
        })

      function TestChild() {
        return <div>Test</div>
      }

      try {
        render(
          <PlaylistStateProvider
            initialState={stateWithLocalData}
            anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
            onInitialSyncStatusChange={onStatusChange}
          >
            <TestChild />
          </PlaylistStateProvider>,
        )

        await waitFor(() =>
          expect(onStatusChange).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'complete', lastError: null }),
          ),
        )

        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30000)
        expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandle)
        expect(capturedTimeoutCallback).toBeInstanceOf(Function)
      } finally {
        setTimeoutSpy.mockRestore()
        clearTimeoutSpy.mockRestore()
      }
    })

    it('runs fetch even when there are no local tracks (needed for recovery restore)', async () => {
      const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: true,
        json: vi.fn().mockResolvedValue({ notes: [] })
      }))
      mockedApiFetch.mockResolvedValue(mockResponse)
      mockedGroupRemoteNotes.mockReturnValue({ notes: {}, tags: {} })

      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      // Wait for the deferred sync to run
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Sync should run even with no local tracks - needed for recovery restore
      expect(mockedApiFetch).toHaveBeenCalledWith('/api/db/notes', expect.any(Object))
    })

    it('merges remote data into state', async () => {
      const mockNotes = [
        { trackId: 't1', body: 'remote note', tags: ['remote-tag'] }
      ]
      const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: true,
        json: vi.fn().mockResolvedValue({ notes: mockNotes })
      }))
      mockedApiFetch.mockResolvedValue(mockResponse)
      mockedGroupRemoteNotes.mockReturnValue({ 
        notes: { t1: ['remote note'] }, 
        tags: { t1: ['remote-tag'] } 
      })

      const customState = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] }
      }

      function TestChild() {
        const state = usePlaylistState()
        const bodies = noteBodies(state.notesByTrack.t1)
        return <div data-testid="notes">{bodies.length > 0 ? bodies.join(',') : 'empty'}</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={customState} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('notes')).toHaveTextContent('remote note')
      })
    })

    it('handles fetch errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockedApiFetch.mockRejectedValue(new Error('Network error'))
      const stateWithLocalData = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
      }

      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={stateWithLocalData} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('[notes sync] error', expect.any(Error))
      })

      consoleError.mockRestore()
    })

    it('handles non-OK response gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: 'Server error' })
      }))
      mockedApiFetch.mockResolvedValue(mockResponse)
      const stateWithLocalData = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
      }

      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={stateWithLocalData} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('[notes sync] failed', expect.any(Object))
      })

      consoleError.mockRestore()
    })

    it('notifies device context stale errors for auth failures', async () => {
      const authResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'unauthorized' })
      }))
      mockedApiFetch.mockResolvedValue(authResponse)
      const stateWithLocalData = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
      }

      render(
        <PlaylistStateProvider 
          initialState={stateWithLocalData} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <div>Test</div>
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(mockedNotifyDeviceContextStale).toHaveBeenCalledWith({
          source: 'notes-sync',
          status: 401
        })
      })
    })

    it('aborts in-flight sync when deviceId changes', async () => {
      const stateWithLocalData = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [], tags: [] }],
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
      }

      const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' })
      let abortTriggered = false

      mockedApiFetch.mockImplementationOnce((_url, init = {}) => {
        const { signal } = init
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            abortTriggered = true
            reject(abortError)
          })
        })
      })

      const { rerender } = render(
        <PlaylistStateProvider 
          initialState={stateWithLocalData} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <div>Test</div>
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledTimes(1)
      })

      rerender(
        <PlaylistStateProvider 
          initialState={stateWithLocalData} 
          anonContext={{ deviceId: 'device-2', anonId: 'anon-1' }}
        >
          <div>Test</div>
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(abortTriggered).toBe(true)
      })

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Persistent Tag Queue', () => {
    it('persists tag updates until sync succeeds', async () => {
      const storageKey = getTagQueueKey('device-1')
      mockedCreateTagSyncScheduler.mockReturnValue(null)

      const postResponse = /** @type {Response} */ (/** @type {unknown} */ (makeResolvedResponse()))
      mockedApiFetch.mockResolvedValue(postResponse)

      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        return (
          <button onClick={() => syncTrackTags('t1', ['tag1'])}>
            Sync
          </button>
        )
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      const button = screen.getByText('Sync')
      button.click()

      const rawQueue = window.localStorage.getItem(storageKey)
      expect(rawQueue).toContain('"trackId":"t1"')

      await waitFor(() => {
        expect(window.localStorage.getItem(storageKey)).toBeNull()
      })
    })

    it('retains pending entries when sync fails', async () => {
      const storageKey = getTagQueueKey('device-1')
      mockedCreateTagSyncScheduler.mockReturnValue(null)
      mockedApiFetch.mockRejectedValue(new Error('offline'))

      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        const handleSync = () => {
          syncTrackTags('t1', ['offline']).catch(() => {})
        }
        return <button onClick={handleSync}>Sync</button>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      const button = screen.getByText('Sync')
      button.click()

      await waitFor(() => {
        expect(window.localStorage.getItem(storageKey)).toContain('"trackId":"t1"')
      })
    })

    it('flushes persisted queue on mount', async () => {
      const storageKey = getTagQueueKey('device-1')
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([{ trackId: 't1', tags: ['pending'], updatedAt: Date.now() }]),
      )

      mockedApiFetch.mockImplementation((url, init = {}) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            /** @type {Response} */ (/** @type {unknown} */ (makeResolvedResponse())),
          )
        }
        return Promise.resolve(
          /** @type {Response} */ (/** @type {unknown} */ ({
            ok: true,
            json: vi.fn().mockResolvedValue({ notes: [] }),
          })),
        )
      })

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <div>Test</div>
        </PlaylistStateProvider>
      )

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith(
          '/api/db/notes',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ trackId: 't1', tags: ['pending'] }),
          }),
        )
      })

      await waitFor(() => {
        expect(window.localStorage.getItem(storageKey)).toBeNull()
      })
    })
  })

  describe('Tag Sync Scheduler', () => {
    it('creates scheduler when deviceId is available', () => {
      const mockScheduler = { schedule: vi.fn(), clear: vi.fn() }
      mockedCreateTagSyncScheduler.mockReturnValue(mockScheduler)

      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      expect(mockedCreateTagSyncScheduler).toHaveBeenCalledWith(expect.any(Function), 350)
    })

    it('does not create scheduler when deviceId is null', () => {
      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: null, anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      expect(mockedCreateTagSyncScheduler).not.toHaveBeenCalled()
    })

    it('syncTrackTags calls scheduler.schedule when scheduler exists', async () => {
      const mockScheduler = { 
        schedule: vi.fn().mockResolvedValue(undefined), 
        clear: vi.fn() 
      }
      mockedCreateTagSyncScheduler.mockReturnValue(mockScheduler)

      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        return (
          <button onClick={() => syncTrackTags('t1', ['tag1'])}>
            Sync
          </button>
        )
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      const button = screen.getByText('Sync')
      button.click()

      await waitFor(() => {
        expect(mockScheduler.schedule).toHaveBeenCalledWith('t1', ['tag1'])
      })
    })

    it('syncTrackTags falls back to sendTagUpdate when no scheduler', async () => {
      const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: true
      }))
      mockedApiFetch.mockResolvedValue(mockResponse)
      
      // No scheduler when deviceId is null
      mockedCreateTagSyncScheduler.mockReturnValue(null)

      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        return (
          <button onClick={() => syncTrackTags('t1', ['tag1'])}>
            Sync
          </button>
        )
      }

      const { rerender } = render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: null, anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )
      
      // Now update to have deviceId (but still no scheduler)
      rerender(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      const button = screen.getByText('Sync')
      button.click()

      await waitFor(() => {
        expect(mockedApiFetch).toHaveBeenCalledWith('/api/db/notes', {
          method: 'POST',
          body: JSON.stringify({ trackId: 't1', tags: ['tag1'] })
        })
      }, { timeout: 2000 })
    })

    it('clears scheduler on unmount', () => {
      const mockScheduler = { schedule: vi.fn(), clear: vi.fn() }
      mockedCreateTagSyncScheduler.mockReturnValue(mockScheduler)

      function TestChild() {
        return <div>Test</div>
      }

      const { unmount } = render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      unmount()

      expect(mockScheduler.clear).toHaveBeenCalled()
    })
  })

  describe('Error Propagation', () => {
    it('sendTagUpdate throws on non-OK response', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: false
      }))
      mockedApiFetch.mockResolvedValue(mockResponse)
      
      // No scheduler, so syncTrackTags will call sendTagUpdate directly
      mockedCreateTagSyncScheduler.mockReturnValue(null)

      let thrownError = null

      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        const handleSync = async () => {
          try {
            await syncTrackTags('t1', ['tag1'])
          } catch (err) {
            thrownError = err
          }
        }
        return <button onClick={handleSync}>Sync</button>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      const button = screen.getByText('Sync')
      button.click()

      await waitFor(() => {
        expect(thrownError).not.toBeNull()
        expect(thrownError.message).toContain('Failed to sync tags')
      })

      consoleError.mockRestore()
    })

    it('sendTagUpdate rethrows caught errors', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const networkError = new Error('Network failure')
      mockedApiFetch.mockRejectedValue(networkError)
      
      // No scheduler, so syncTrackTags will call sendTagUpdate directly
      mockedCreateTagSyncScheduler.mockReturnValue(null)

      let thrownError = null

      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        const handleSync = async () => {
          try {
            await syncTrackTags('t1', ['tag1'])
          } catch (err) {
            thrownError = err
          }
        }
        return <button onClick={handleSync}>Sync</button>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      const button = screen.getByText('Sync')
      button.click()

      await waitFor(() => {
        expect(thrownError).not.toBeNull()
        expect(thrownError.message).toContain('Network failure')
      })

      consoleError.mockRestore()
    })

    it('errors propagate to caller catch handlers', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockResponse = /** @type {Response} */ (/** @type {unknown} */ ({
        ok: false
      }))
      mockedApiFetch.mockResolvedValue(mockResponse)
      
      // No scheduler, so syncTrackTags will call sendTagUpdate directly
      mockedCreateTagSyncScheduler.mockReturnValue(null)

      let caughtError = null

      function TestChild() {
        const { syncTrackTags } = usePlaylistSync()
        const handleSync = async () => {
          try {
            await syncTrackTags('t1', ['tag1'])
          } catch (err) {
            caughtError = err
          }
        }
        return <button onClick={handleSync}>Sync</button>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      const button = screen.getByText('Sync')
      button.click()

      await waitFor(() => {
        expect(caughtError).not.toBeNull()
        expect(caughtError.message).toContain('Failed to sync tags')
      })

      consoleError.mockRestore()
    })
  })

  describe('Context Value Memoization', () => {
    it('syncValue is stable across re-renders', () => {
      const syncValues = []

      function TestChild() {
        const syncValue = usePlaylistSync()
        syncValues.push(syncValue)
        return <div>Test</div>
      }

      const { rerender } = render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      // Force re-render with same props
      rerender(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: 'anon-1' }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      // Expect same object reference (memoized)
      expect(syncValues.length).toBeGreaterThan(1)
      expect(syncValues[0]).toBe(syncValues[1])
    })
  })
})
