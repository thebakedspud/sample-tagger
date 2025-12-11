import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useState } from 'react'

vi.setConfig({ testTimeout: 15000 })

// ============================================================================
// Mock Modules (must be declared before imports)
// ============================================================================

vi.mock('../utils/storage.js', () => {
  const createPersistedState = () => ({
    version: 6,
    theme: 'dark',
    playlistTitle: 'Test Playlist',
    importedAt: new Date().toISOString(),
    lastImportUrl: 'https://open.spotify.com/playlist/test',
    tracks: [
      {
        id: 't1',
        title: 'Track One',
        artist: 'Artist A',
        notes: [],
        tags: []
      },
      {
        id: 't2',
        title: 'Track Two',
        artist: 'Artist B',
        notes: [],
        tags: []
      },
    ],
    importMeta: {
      provider: 'spotify',
      playlistId: 'test-playlist',
      snapshotId: 'snap-1',
      cursor: null,
      hasMore: false,
      sourceUrl: 'https://open.spotify.com/playlist/test',
    },
    notesByTrack: {},
    tagsByTrack: {},
    recentPlaylists: [],
    uiPrefs: { font: 'default', discovered: { timestamp: false } },
  })
  return {
    loadAppState: vi.fn(() => createPersistedState()),
    saveAppState: vi.fn(),
    clearAppState: vi.fn(),
    getPendingMigrationSnapshot: vi.fn(() => null),
    clearPendingMigrationSnapshot: vi.fn(),
    writeAutoBackupSnapshot: vi.fn(),
    stashPendingMigrationSnapshot: vi.fn(),
    loadRecent: vi.fn(() => []),
    saveRecent: vi.fn(),
    upsertRecent: vi.fn((list = [], item) => [...list, item]),
    getFontPreference: vi.fn(() => 'default'),
    setFontPreference: vi.fn(() => 'default'),
    hasDiscoveredFeature: vi.fn(() => false),
    markFeatureDiscovered: vi.fn(),
  }
})

vi.mock('../lib/deviceState.js', () => ({
  getDeviceId: () => 'device-123',
  setDeviceId: () => {},
  getAnonId: () => 'anon-1',
  setAnonId: () => {},
  hasDeviceContext: () => false,
  saveRecoveryCode: () => {},
  getStoredRecoveryCode: () => null,
  hasAcknowledgedRecovery: () => false,
  markRecoveryAcknowledged: () => {},
  getRecoveryAcknowledgement: () => null,
  ensureRecoveryCsrfToken: () => 'csrf-token',
  clearRecoveryAcknowledgement: () => {},
  clearDeviceContext: () => {},
  subscribeDeviceContextStale: () => () => {},
}))

vi.mock('../features/import/usePlaylistImportFlow.js', () => {
  const noop = vi.fn()
  const successfulResult = Promise.resolve({ ok: true, data: { tracks: [], meta: {} } })
  return {
    default: () => ({
      status: 'idle',
      loading: false,
      importInitial: vi.fn(() => successfulResult),
      reimport: vi.fn(() => successfulResult),
      loadMore: vi.fn(() => successfulResult),
      resetFlow: noop,
    }),
    ImportFlowStatus: {
      IDLE: 'idle',
      IMPORTING: 'importing',
      REIMPORTING: 'reimporting',
      LOADING_MORE: 'loading_more',
    },
  }
})

vi.mock('../features/import/detectProvider', () => ({
  default: () => null,
}))

vi.mock('../lib/apiClient.js', () => ({
  apiFetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve({ success: true }),
    }),
  ),
}))

vi.mock('../features/undo/useInlineUndo.js', () => ({
  default: () => ({
    pending: new Map(),
    schedule: vi.fn(),
    undo: vi.fn(),
    expire: vi.fn(),
    isPending: vi.fn(() => false),
    clear: vi.fn(),
  }),
}))

vi.mock('../components/ThemeToggle.jsx', () => ({ default: () => null }))
vi.mock('../components/RecoveryModal.jsx', () => ({ default: () => null }))
vi.mock('../components/RestoreDialog.jsx', () => ({ default: () => null }))
vi.mock('../features/recent/RecentPlaylists.jsx', () => ({ default: () => null }))
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }))

vi.mock('../features/a11y/useAnnounce.js', () => ({
  default: function useMockAnnounce() {
    const [message, setMessage] = useState('')
    const announce = useCallback((text) => setMessage(text), [])
    const clear = useCallback(() => setMessage(''), [])
    const flush = useCallback((text) => setMessage(text), [])
    return { message, announce, clear, flush }
  },
}))

// Import App and mocked modules after all mocks are defined
import App from '../App.jsx'
import { apiFetch } from '../lib/apiClient.js'

// ============================================================================
// Test Suite: App Notes Handlers
// ============================================================================

describe('App Notes Handlers - Integration Tests', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // Phase 1: First Integration Test (onAddNote → onSaveNote)
  // ==========================================================================

  it('Integration: adds and saves note (onAddNote → onSaveNote)', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Wait for app to load and navigate to playlist view
    await waitFor(() => {
      expect(screen.getByText('Track One')).toBeInTheDocument()
    })

    // Find and click "Add Note" button for first track
    const addNoteBtn = screen.getAllByRole('button', { name: /add note/i })[0]
    await user.click(addNoteBtn)

    // Wait for note input to appear
    const noteInput = await screen.findByLabelText(/note text/i)
    expect(noteInput).toBeInTheDocument()

    // Type note content
    await user.type(noteInput, 'This is my test note')

    // Find and click Save button
    const saveBtn = screen.getByRole('button', { name: /save note/i })
    await user.click(saveBtn)

    // Verify success announcement
    await waitFor(() => {
      const statusRegions = screen.getAllByRole('status')
      const announcements = statusRegions
        .map((node) => node.textContent || '')
        .join(' ')
      expect(announcements).toMatch(/note added/i)
    })

    // Verify note appears in UI
    expect(
      await screen.findByText((content) => content.includes('This is my test note'))
    ).toBeInTheDocument()

    // Verify API was called correctly
    // Note: the call includes a noteId (random UUID) so we check the call more flexibly
    await waitFor(() => {
      const notesCalls = apiFetch.mock.calls.filter(
        ([url, opts]) => url === '/api/db/notes' && opts?.method === 'POST'
      )
      expect(notesCalls.length).toBeGreaterThan(0)
      const lastCall = notesCalls[notesCalls.length - 1]
      const body = JSON.parse(lastCall[1].body)
      expect(body.trackId).toBe('t1')
      expect(body.body).toBe('This is my test note')
      expect(body.noteId).toBeDefined()
    })
  })

  it('extracts inline timestamps on save', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Track One')).toBeInTheDocument()
    })

    const addNoteBtn = screen.getAllByRole('button', { name: /add note/i })[0]
    await user.click(addNoteBtn)

    const noteInput = await screen.findByLabelText(/note text/i)
    await user.type(noteInput, ':45 snare pops')

    const saveBtn = screen.getByRole('button', { name: /save note/i })
    await user.click(saveBtn)

    // Note: the call includes a noteId (random UUID) so we check the call more flexibly
    await waitFor(() => {
      const notesCalls = apiFetch.mock.calls.filter(
        ([url, opts]) => url === '/api/db/notes' && opts?.method === 'POST'
      )
      expect(notesCalls.length).toBeGreaterThan(0)
      const lastCall = notesCalls[notesCalls.length - 1]
      const body = JSON.parse(lastCall[1].body)
      expect(body.trackId).toBe('t1')
      expect(body.body).toBe('snare pops')
      expect(body.timestampMs).toBe(45_000)
      expect(body.noteId).toBeDefined()
    })

    expect(await screen.findByText(/\[0:45]/)).toBeInTheDocument()
  })
})
