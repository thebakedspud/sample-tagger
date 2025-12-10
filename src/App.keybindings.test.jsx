import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 15000 })

const {
  loadAppStateMock,
  saveAppStateMock,
  clearAppStateMock,
  getPendingMigrationSnapshotMock,
  clearPendingMigrationSnapshotMock,
  writeAutoBackupSnapshotMock,
  stashPendingMigrationSnapshotMock,
  loadRecentMock,
  saveRecentMock,
  upsertRecentMock,
  apiFetchMock,
  focusByIdMock,
} = vi.hoisted(() => {
  const persistedState = {
    playlistTitle: 'Mocked Playlist',
    importedAt: '2024-01-01T00:00:00.000Z',
    lastImportUrl: 'https://example.com/playlists/1',
    importMeta: {
      provider: 'spotify',
      playlistId: 'list-1',
      snapshotId: 'snap-1',
      sourceUrl: 'https://example.com/playlists/1',
      hasMore: false,
    },
    tracks: [
      {
        id: 'track-1',
        title: 'First Track',
        artist: 'Someone',
        notes: ['Existing note'],
        tags: ['chill'],
        importedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    notesByTrack: {
      'track-1': ['Existing note'],
    },
    tagsByTrack: {
      'track-1': ['chill'],
    },
    recentPlaylists: [],
  }

  const makeResolvedResponse = () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({}),
  })

  return {
    loadAppStateMock: vi.fn(() => persistedState),
    saveAppStateMock: vi.fn(),
    clearAppStateMock: vi.fn(),
    getPendingMigrationSnapshotMock: vi.fn(() => null),
    clearPendingMigrationSnapshotMock: vi.fn(),
    writeAutoBackupSnapshotMock: vi.fn(),
    stashPendingMigrationSnapshotMock: vi.fn(),
    loadRecentMock: vi.fn(() => []),
    saveRecentMock: vi.fn(),
    upsertRecentMock: vi.fn(),
    apiFetchMock: vi.fn(async () => makeResolvedResponse()),
    focusByIdMock: vi.fn(),
  }
})

vi.mock('./utils/storage.js', () => ({
  loadAppState: loadAppStateMock,
  saveAppState: saveAppStateMock,
  clearAppState: clearAppStateMock,
  getPendingMigrationSnapshot: getPendingMigrationSnapshotMock,
  clearPendingMigrationSnapshot: clearPendingMigrationSnapshotMock,
  writeAutoBackupSnapshot: writeAutoBackupSnapshotMock,
  stashPendingMigrationSnapshot: stashPendingMigrationSnapshotMock,
  loadRecent: loadRecentMock,
  saveRecent: saveRecentMock,
  upsertRecent: upsertRecentMock,
}))

vi.mock('./lib/apiClient.js', () => ({
  apiFetch: apiFetchMock,
}))

vi.mock('./utils/focusById.js', () => ({
  focusById: focusByIdMock,
  default: focusByIdMock,
}))

const dispatchKey = (options) => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...options,
  })
  window.dispatchEvent(event)
  return event
}

describe('App global keybindings', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    if (!window.matchMedia) {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    }
  })

  it('pressing Home from playlist view returns to landing and focuses the title', async () => {
    const { default: App } = await import('./App.jsx')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Mocked Playlist' })).toBeInTheDocument()

    const titleButton = await screen.findByRole('button', { name: /go to import screen/i })

    await act(async () => {
      dispatchKey({ key: 'Home' })
    })

    expect(await screen.findByRole('heading', { name: /Turn your Spotify library into/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(titleButton).toHaveFocus()
    })
  })
})
