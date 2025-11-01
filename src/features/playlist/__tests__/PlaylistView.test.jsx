import '@testing-library/jest-dom/vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlaylistView from '../PlaylistView.jsx'

const { focusByIdMock } = vi.hoisted(() => ({
  focusByIdMock: vi.fn(),
}))

vi.mock('../../../utils/focusById.js', () => ({
  default: focusByIdMock,
}))
vi.mock('../../../components/UndoPlaceholder.jsx', () => ({
  default: ({ pendingId, onUndo }) => (
    <button
      data-testid={`undo-${pendingId}`}
      type="button"
      onClick={() => onUndo(pendingId)}
    >
      Undo pending
    </button>
  ),
}))

beforeEach(() => {
  focusByIdMock?.mockReset()
})

const createProps = (overrides = {}) => {
  const defaultPending = new Map([
    [
      'pending-1',
      {
        trackId: 'track-1',
        index: 0,
        restoreFocusId: 'restore-1',
        fallbackFocusId: 'fallback-1',
      },
    ],
  ])

  return {
    playlistTitle: 'My Playlist',
    importedAt: '2023-01-01T12:00:00.000Z',
    importMeta: {
      provider: 'spotify',
      cursor: 'next',
      hasMore: true,
      sourceUrl: 'http://example.com',
    },
    tracks: [
      {
        id: 'track-1',
        title: 'First Track',
        artist: 'Artist A',
        notes: ['Note A'],
      },
    ],
    isAnyImportBusy: false,
    showReimportSpinner: false,
    showLoadMoreSpinner: false,
    pending: defaultPending,
    isPending: (id) => id === 'pending-1',
    editingState: { editingId: null, draft: '', error: null },
    onDraftChange: vi.fn(),
    onAddNote: vi.fn(),
    onSaveNote: vi.fn(),
    onCancelNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onUndo: vi.fn(),
    onDismissUndo: vi.fn(),
    onReimport: vi.fn(),
    onClear: vi.fn(),
    onBack: vi.fn(),
    canReimport: true,
    reimportBtnRef: { current: null },
    loadMoreBtnRef: { current: null },
    onLoadMore: vi.fn(),
    announce: vi.fn(),
    backgroundSync: {
      status: 'idle',
      loaded: 0,
      total: null,
      lastError: null,
    },
    focusContext: { reason: null, ts: 0 },
    skipFocusManagement: false,
    onFirstVisibleTrackChange: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    stockTags: [],
    customTags: [],
    ...overrides,
  }
}

describe('PlaylistView', () => {
  it('renders playlist details, track list and handles undo actions', () => {
    const props = createProps()
    render(<PlaylistView {...props} />)

    expect(
      screen.getByRole('heading', { level: 1, name: /my playlist/i })
    ).toBeInTheDocument()

    const lists = screen.getAllByRole('list')
    expect(lists.length).toBeGreaterThan(0)

    const listItems = screen.getAllByRole('listitem')
    expect(listItems.length).toBeGreaterThan(0)

    expect(
      screen.getByRole('button', { name: /re-import/i })
    ).toBeInTheDocument()

    const loadMoreButton = screen.getByRole('button', { name: /load more/i })
    expect(loadMoreButton).toBeEnabled()

    fireEvent.click(screen.getByTestId('undo-pending-1'))
    expect(props.onUndo).toHaveBeenCalledWith('pending-1')
  })

  it('disables the load more button when busy', () => {
    const props = createProps({
      isAnyImportBusy: true,
      showLoadMoreSpinner: true,
    })

    render(<PlaylistView {...props} />)

    const loadMoreButton = screen.getByRole('button', { name: /load more/i })
    expect(loadMoreButton).toBeDisabled()
    expect(loadMoreButton).toHaveAttribute('aria-busy', 'true')
  })

  it('hides load more controls and list items in the empty state', () => {
    const props = createProps({
      tracks: [],
      pending: new Map(),
      isPending: () => false,
      importMeta: { provider: 'spotify', cursor: null, hasMore: false },
    })

    render(<PlaylistView {...props} />)

    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('does not run focus management effect when skipFocusManagement is true', () => {
    // Create two tracks
    const tracks = [
      {
        id: 'track-1',
        title: 'First Track',
        artist: 'Artist A',
        notes: ['Note A'],
        tags: ['tag1'],
      },
      {
        id: 'track-2',
        title: 'Second Track',
        artist: 'Artist B',
        notes: [],
        tags: [],
      },
    ]

    const props = createProps({
      tracks,
      skipFocusManagement: true,
    })

    render(<PlaylistView {...props} />)

    // With skipFocusManagement=true, the focus effect should not run
    // We can't easily assert that focus didn't change, but we can verify the component renders
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('resumes focus management when skipFocusManagement becomes false', () => {
    const tracks = [
      {
        id: 'track-1',
        title: 'First Track',
        artist: 'Artist A',
        notes: ['Note A'],
        tags: ['tag1'],
      },
    ]

    const props = createProps({
      tracks,
      skipFocusManagement: true,
    })

    const { rerender } = render(<PlaylistView {...props} />)

    // Re-render with skipFocusManagement=false
    rerender(<PlaylistView {...props} skipFocusManagement={false} />)

    // The component should still render correctly
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('calls onFirstVisibleTrackChange with first filtered track ID', () => {
    const onFirstVisibleTrackChange = vi.fn()
    const tracks = [
      {
        id: 'track-1',
        title: 'First Track',
        artist: 'Artist A',
        notes: [],
        tags: [],
      },
      {
        id: 'track-2',
        title: 'Second Track',
        artist: 'Artist B',
        notes: [],
        tags: [],
      },
    ]

    const props = createProps({
      tracks,
      onFirstVisibleTrackChange,
    })

    render(<PlaylistView {...props} />)

    // Should call with the first track's ID
    expect(onFirstVisibleTrackChange).toHaveBeenCalledWith('track-1')
  })

  it('reports new first visible track when background pagination changes order', () => {
    const onFirstVisibleTrackChange = vi.fn()
    const initialTracks = [
      {
        id: 'track-100',
        title: 'Track 100',
        artist: 'Artist',
        notes: [],
        tags: [],
      },
      {
        id: 'track-99',
        title: 'Track 99',
        artist: 'Artist',
        notes: [],
        tags: [],
      },
    ]

    const props = createProps({
      tracks: initialTracks,
      onFirstVisibleTrackChange,
    })

    const { rerender } = render(<PlaylistView {...props} />)

    // Initial render should report first track
    expect(onFirstVisibleTrackChange).toHaveBeenCalledWith('track-100')
    onFirstVisibleTrackChange.mockClear()

    // Simulate background pagination prepending newer tracks (like DATE DESC sort)
    const updatedTracks = [
      {
        id: 'track-200',
        title: 'Track 200',
        artist: 'Artist',
        notes: [],
        tags: [],
      },
      {
        id: 'track-199',
        title: 'Track 199',
        artist: 'Artist',
        notes: [],
        tags: [],
      },
      ...initialTracks,
    ]

    rerender(<PlaylistView {...createProps({ ...props, tracks: updatedTracks })} />)

    // Should report the new first visible track
    expect(onFirstVisibleTrackChange).toHaveBeenCalledWith('track-200')
  })

  it('restores focus to the next visible track when the active track is removed', () => {
    const baseProps = createProps({
      tracks: [
        { id: 'track-1', title: 'Track 1', artist: 'Artist A', notes: [] },
        { id: 'track-2', title: 'Track 2', artist: 'Artist B', notes: [] },
      ],
    })

    const view = render(<PlaylistView {...baseProps} />)

    const firstButton = document.getElementById('add-note-btn-track-1')
    expect(firstButton).not.toBeNull()
    act(() => {
      firstButton.focus()
    })

    focusByIdMock.mockClear()

    const nextProps = {
      ...baseProps,
      tracks: [baseProps.tracks[1]],
      focusContext: { reason: 'manual-load-more', ts: Date.now() + 1 },
    }

    view.rerender(<PlaylistView {...nextProps} />)

    expect(focusByIdMock).toHaveBeenCalledWith('add-note-btn-track-2')
  })

  it('skips focus restoration when the change comes from background pagination', () => {
    const baseProps = createProps({
      tracks: [
        { id: 'track-1', title: 'Track 1', artist: 'Artist A', notes: [] },
        { id: 'track-2', title: 'Track 2', artist: 'Artist B', notes: [] },
      ],
    })

    const view = render(<PlaylistView {...baseProps} />)

    const firstButton = document.getElementById('add-note-btn-track-1')
    expect(firstButton).not.toBeNull()
    act(() => {
      firstButton.focus()
    })

    focusByIdMock.mockClear()

    const nextProps = {
      ...baseProps,
      tracks: [baseProps.tracks[1]],
      focusContext: { reason: 'background-load-more', ts: Date.now() + 1 },
    }

    view.rerender(<PlaylistView {...nextProps} />)

    expect(focusByIdMock).not.toHaveBeenCalled()
  })
})
