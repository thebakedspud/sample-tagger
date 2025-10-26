import { describe, expect, it, afterEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useState } from 'react'

vi.mock('./utils/storage.js', () => {
  const createPersistedState = () => ({
    version: 5,
    theme: 'dark',
    playlistTitle: 'Test Playlist',
    importedAt: null,
    lastImportUrl: '',
    tracks: [
      { id: 'track-1', title: 'Test Track', artist: 'Artist One', notes: [], tags: [] },
    ],
    importMeta: { provider: 'spotify' },
    notesByTrack: {},
    tagsByTrack: {},
    recentPlaylists: [],
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
  }
})

vi.mock('./lib/deviceState.js', () => ({
  getDeviceId: () => null,
  setDeviceId: () => {},
  getAnonId: () => 'anon-1',
  setAnonId: () => {},
  saveRecoveryCode: () => {},
  getStoredRecoveryCode: () => null,
  hasAcknowledgedRecovery: () => false,
  markRecoveryAcknowledged: () => {},
  clearDeviceContext: () => {},
}))

vi.mock('./features/import/usePlaylistImportFlow.js', () => {
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

vi.mock('./features/import/detectProvider', () => ({
  default: () => null,
}))

vi.mock('./lib/apiClient.js', () => ({
  apiFetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve({ anonId: 'anon-1' }),
    }),
  ),
}))

vi.mock('./features/undo/useInlineUndo.js', () => ({
  default: () => ({
    pending: new Map(),
    schedule: vi.fn(),
    undo: vi.fn(),
    expire: vi.fn(),
    isPending: vi.fn(() => false),
    clear: vi.fn(),
  }),
}))

vi.mock('./components/ThemeToggle.jsx', () => ({ default: () => null }))
vi.mock('./components/RecoveryModal.jsx', () => ({ default: () => null }))
vi.mock('./components/RestoreDialog.jsx', () => ({ default: () => null }))
vi.mock('./features/recent/RecentPlaylists.jsx', () => ({ default: () => null }))
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }))
vi.mock('./features/a11y/useAnnounce.js', () => ({
  default: function useMockAnnounce() {
    const [message, setMessage] = useState('')
    const announce = useCallback((text) => setMessage(text), [])
    const clear = useCallback(() => setMessage(''), [])
    const flush = useCallback((text) => setMessage(text), [])
    return { message, announce, clear, flush }
  },
}))

// Import App after mocks
import App from './App.jsx'

describe('App tagging announcements', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('announces when tags are added and removed', async () => {
    render(<App />)

    const addTagButton = await screen.findByRole('button', { name: /\+ add tag/i })
    fireEvent.click(addTagButton)

    const input = screen.getByPlaceholderText(/add tag/i)
    fireEvent.change(input, { target: { value: 'dr' } })

    const suggestion = await screen.findByRole('button', { name: 'drums' })
    fireEvent.click(suggestion)

    expect(screen.getByRole('status').textContent).toMatch(/Added tag "drums" to "Test Track"/i)

    const chip = await screen.findByRole('button', { name: /remove tag drums/i })
    fireEvent.click(chip)

    expect(screen.getByRole('status').textContent).toMatch(/Removed tag "drums" from "Test Track"/i)
    expect(screen.queryByRole('button', { name: /remove tag drums/i })).not.toBeInTheDocument()
  })
})
