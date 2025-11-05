// src/features/playlist/__tests__/PlaylistProvider.test.jsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PlaylistStateProvider } from '../PlaylistProvider.jsx'
import { usePlaylistState, usePlaylistDispatch, usePlaylistSync } from '../usePlaylistContext.js'
import { initialPlaylistState } from '../playlistReducer.js'

// Mock dependencies
vi.mock('../../../lib/apiClient.js', () => ({
  apiFetch: vi.fn()
}))

vi.mock('../../../utils/notesTagsData.js', async (importOriginal) => {
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

describe('PlaylistProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Set up default mock implementations
    const mockResponse = { ok: false, json: vi.fn().mockResolvedValue({ error: 'Server error' }) }
    apiFetch.mockResolvedValue(mockResponse)
    
    groupRemoteNotes.mockReturnValue({ notes: {}, tags: {} })
    
    const mockScheduler = { schedule: vi.fn().mockResolvedValue(undefined), clear: vi.fn() }
    createTagSyncScheduler.mockReturnValue(mockScheduler)
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
    it('fetches notes/tags when anonId is available', async () => {
      const mockNotes = [{ trackId: 't1', body: 'note1', tags: ['tag1'] }]
      const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ notes: mockNotes }) }
      apiFetch.mockResolvedValue(mockResponse)
      groupRemoteNotes.mockReturnValue({ notes: { t1: ['note1'] }, tags: { t1: ['tag1'] } })

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

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith('/api/db/notes')
      })
    })

    it('does not fetch when anonId is null', async () => {
      function TestChild() {
        return <div>Test</div>
      }

      render(
        <PlaylistStateProvider 
          initialState={initialPlaylistState} 
          anonContext={{ deviceId: 'device-1', anonId: null }}
        >
          <TestChild />
        </PlaylistStateProvider>
      )

      // Wait a bit to ensure no fetch happens
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(apiFetch).not.toHaveBeenCalled()
    })

    it('merges remote data into state', async () => {
      const mockNotes = [
        { trackId: 't1', body: 'remote note', tags: ['remote-tag'] }
      ]
      const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ notes: mockNotes }) }
      apiFetch.mockResolvedValue(mockResponse)
      groupRemoteNotes.mockReturnValue({ 
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
        return <div data-testid="notes">{state.notesByTrack.t1?.join(',') || 'empty'}</div>
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
      apiFetch.mockRejectedValue(new Error('Network error'))

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

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('[notes sync] error', expect.any(Error))
      })

      consoleError.mockRestore()
    })

    it('handles non-OK response gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockResponse = { ok: false, json: vi.fn().mockResolvedValue({ error: 'Server error' }) }
      apiFetch.mockResolvedValue(mockResponse)

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

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('[notes sync] failed', expect.any(Object))
      })

      consoleError.mockRestore()
    })
  })

  describe('Tag Sync Scheduler', () => {
    it('creates scheduler when deviceId is available', () => {
      const mockScheduler = { schedule: vi.fn(), clear: vi.fn() }
      createTagSyncScheduler.mockReturnValue(mockScheduler)

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

      expect(createTagSyncScheduler).toHaveBeenCalledWith(expect.any(Function), 350)
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

      expect(createTagSyncScheduler).not.toHaveBeenCalled()
    })

    it('syncTrackTags calls scheduler.schedule when scheduler exists', async () => {
      const mockScheduler = { 
        schedule: vi.fn().mockResolvedValue(undefined), 
        clear: vi.fn() 
      }
      createTagSyncScheduler.mockReturnValue(mockScheduler)

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
      const mockResponse = { ok: true }
      apiFetch.mockResolvedValue(mockResponse)
      
      // No scheduler when deviceId is null
      createTagSyncScheduler.mockReturnValue(null)

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
        expect(apiFetch).toHaveBeenCalledWith('/api/db/notes', {
          method: 'POST',
          body: JSON.stringify({ trackId: 't1', tags: ['tag1'] })
        })
      }, { timeout: 2000 })
    })

    it('clears scheduler on unmount', () => {
      const mockScheduler = { schedule: vi.fn(), clear: vi.fn() }
      createTagSyncScheduler.mockReturnValue(mockScheduler)

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
      const mockResponse = { ok: false }
      apiFetch.mockResolvedValue(mockResponse)
      
      // No scheduler, so syncTrackTags will call sendTagUpdate directly
      createTagSyncScheduler.mockReturnValue(null)

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
      apiFetch.mockRejectedValue(networkError)
      
      // No scheduler, so syncTrackTags will call sendTagUpdate directly
      createTagSyncScheduler.mockReturnValue(null)

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
      const mockResponse = { ok: false }
      apiFetch.mockResolvedValue(mockResponse)
      
      // No scheduler, so syncTrackTags will call sendTagUpdate directly
      createTagSyncScheduler.mockReturnValue(null)

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

