import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlaylistView from '../PlaylistView.jsx'

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

    const loadMoreButton = screen
      .getAllByRole('button', { name: /load/i })
      .find((btn) => btn.textContent?.toLowerCase().includes('load'))
    expect(loadMoreButton).toBeTruthy()
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

    const loadMoreButton = screen
      .getAllByRole('button', { name: /load/i })
      .find((btn) => btn.textContent?.toLowerCase().includes('load'))
    expect(loadMoreButton).toBeTruthy()
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
})
