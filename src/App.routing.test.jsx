import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const announceMock = vi.hoisted(() => vi.fn())

const bootstrapStateRef = vi.hoisted(() => ({
  value: null,
}))

const saveAppStateMock = vi.hoisted(() => vi.fn())
const clearAppStateMock = vi.hoisted(() => vi.fn())
const clearPendingMigrationSnapshotMock = vi.hoisted(() => vi.fn())
const writeAutoBackupSnapshotMock = vi.hoisted(() => vi.fn())
const stashPendingMigrationSnapshotMock = vi.hoisted(() => vi.fn())

vi.mock('./features/a11y/useAnnounce.js', () => ({
  __esModule: true,
  default: () => ({
    message: '',
    announce: announceMock,
    clear: vi.fn(),
    flush: vi.fn(),
  }),
}))

vi.mock('./utils/storage.js', () => ({
  saveAppState: saveAppStateMock,
  clearAppState: clearAppStateMock,
  clearPendingMigrationSnapshot: clearPendingMigrationSnapshotMock,
  writeAutoBackupSnapshot: writeAutoBackupSnapshotMock,
  stashPendingMigrationSnapshot: stashPendingMigrationSnapshotMock,
  loadAppState: vi.fn(() => null),
  loadRecent: vi.fn(() => []),
  saveRecent: vi.fn(),
  upsertRecent: vi.fn(),
}))

vi.mock('./lib/apiClient.js', () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({}),
  })),
}))

vi.mock('./utils/storageBootstrap.js', async () => {
  const actual = await vi.importActual('./utils/storageBootstrap.js')
  return {
    ...actual,
    bootstrapStorageState: vi.fn(() => bootstrapStateRef.value),
  }
})

function makeTrack(overrides = {}) {
  return {
    id: overrides.id ?? `track-${Math.random().toString(36).slice(2, 7)}`,
    title: overrides.title ?? 'Demo Track',
    artist: overrides.artist ?? 'Unknown Artist',
    kind: overrides.kind ?? 'music',
    notes: overrides.notes ?? [],
    tags: overrides.tags ?? [],
    importedAt: overrides.importedAt ?? '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildBootstrapState({ tracks, initialScreen = 'playlist', playlistTitle = 'Mocked Playlist' }) {
  const normalizedTracks = tracks.map((track, index) => ({
    ...track,
    id: track.id ?? `track-${index + 1}`,
    notes: track.notes ?? [],
    tags: track.tags ?? [],
  }))
  const notesByTrack = Object.fromEntries(
    normalizedTracks.map((track) => [track.id, track.notes ?? []]),
  )
  const tagsByTrack = Object.fromEntries(
    normalizedTracks.map((track) => [track.id, track.tags ?? []]),
  )

  return {
    persisted: {
      theme: 'dark',
      playlistTitle,
      importedAt: '2024-01-01T00:00:00.000Z',
      lastImportUrl: 'https://example.com/playlists/1',
      importMeta: {
        provider: 'spotify',
        playlistId: 'list-1',
        snapshotId: 'snap-1',
        sourceUrl: 'https://example.com/playlists/1',
        hasMore: false,
        cursor: null,
        total: normalizedTracks.length,
        contentKind: null,
      },
      tracks: normalizedTracks,
      notesByTrack,
      tagsByTrack,
      recentPlaylists: [],
    },
    pendingMigrationSnapshot: null,
    initialRecents: [],
    persistedTracks: normalizedTracks,
    initialScreen,
  }
}

describe('App routing', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    announceMock.mockClear()
    bootstrapStateRef.value = buildBootstrapState({ tracks: [] })
    vi.stubEnv('VITE_ENABLE_PODCASTS', 'true')
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

  it('auto-switches to podcast view when only podcast episodes exist', async () => {
    const podcastTrack = makeTrack({ id: 'episode-1', title: 'Episode One', kind: 'podcast' })
    bootstrapStateRef.value = buildBootstrapState({ tracks: [podcastTrack] })
    const { default: App } = await import('./App.jsx')

    render(<App />)

    const podcastTab = await screen.findByRole('button', { name: 'Podcast' })
    expect(podcastTab).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Playlist' })).toBeDisabled()
    await waitFor(() => {
      expect(announceMock).toHaveBeenCalledWith(
        expect.stringMatching(/podcast view ready/i),
      )
    })
  })

  it('lets users toggle between playlist and podcast tracks when both exist', async () => {
    const musicTrack = makeTrack({ id: 'song-1', title: 'Song One', kind: 'music' })
    const podcastTrack = makeTrack({ id: 'episode-1', title: 'Episode One', kind: 'podcast' })
    bootstrapStateRef.value = buildBootstrapState({ tracks: [musicTrack, podcastTrack] })
    const { default: App } = await import('./App.jsx')

    render(<App />)

    expect(screen.getByRole('button', { name: 'Playlist' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Song One')).toBeInTheDocument()
    expect(screen.queryByText('Episode One')).not.toBeInTheDocument()

    const podcastTab = screen.getByRole('button', { name: 'Podcast' })
    await userEvent.click(podcastTab)

    expect(podcastTab).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Episode One')).toBeInTheDocument()
    expect(screen.queryByText('Song One')).not.toBeInTheDocument()
  })

  it('announces when forced back to playlist view because no podcasts remain', async () => {
    const musicTrack = makeTrack({ id: 'song-2', title: 'Only Song', kind: 'music' })
    bootstrapStateRef.value = buildBootstrapState({
      tracks: [musicTrack],
      initialScreen: 'podcast',
    })
    const { default: App } = await import('./App.jsx')

    render(<App />)

    const playlistTab = await screen.findByRole('button', { name: 'Playlist' })
    expect(playlistTab).toHaveAttribute('aria-current', 'page')

    await waitFor(() => {
      expect(announceMock).toHaveBeenCalledWith(
        expect.stringMatching(/playlist view ready/i),
      )
    })
  })
})
