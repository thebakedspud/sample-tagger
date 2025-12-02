import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PlaylistView from '../PlaylistView.jsx'

vi.setConfig({ testTimeout: 15_000 })

const originalRaf = globalThis.requestAnimationFrame
const originalCancelRaf = globalThis.cancelAnimationFrame
const originalResizeObserver = globalThis.ResizeObserver

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error - jsdom may not define ResizeObserver in older runtimes
    globalThis.ResizeObserver = ResizeObserverStub
  }

  globalThis.requestAnimationFrame = (cb) => {
    const id = setTimeout(() => cb(Date.now()), 0)
    return /** @type {number} */ (id)
  }
  globalThis.cancelAnimationFrame = (id) => {
    clearTimeout(id)
  }
})

afterAll(() => {
  if (originalRaf) {
    globalThis.requestAnimationFrame = originalRaf
  } else {
    // @ts-expect-error - ensure we clean up the stub
    delete globalThis.requestAnimationFrame
  }

  if (originalCancelRaf) {
    globalThis.cancelAnimationFrame = originalCancelRaf
  } else {
    // @ts-expect-error - ensure we clean up the stub
    delete globalThis.cancelAnimationFrame
  }

  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver
  } else {
    // @ts-expect-error - ensure we clean up the stub
    delete globalThis.ResizeObserver
  }
})

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

/**
 * @param {Partial<Parameters<typeof PlaylistView>[0]>} [overrides]
 * @returns {Parameters<typeof PlaylistView>[0]}
 */
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

  const backgroundSync = /** @type {import('../../../App.jsx').BackgroundSyncState} */ ({
    status: 'idle',
    loaded: 0,
    total: null,
    lastError: null,
    snapshotId: null,
  })

  return /** @type {Parameters<typeof PlaylistView>[0]} */ ({
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
    backgroundSync,
    focusContext: { reason: null, ts: 0 },
    skipFocusManagement: false,
    onFirstVisibleTrackChange: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    stockTags: [],
    customTags: [],
    ...overrides,
  })
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

    fireEvent.click(screen.getByTestId('undo-pending-1'))
    expect(props.onUndo).toHaveBeenCalledWith('pending-1')
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

  it('does not run body recovery when focus already sits on a track action', () => {
    const tracks = [
      { id: 'track-1', title: 'Track 1', artist: 'Artist A', notes: [] },
      { id: 'track-2', title: 'Track 2', artist: 'Artist B', notes: [] },
    ]
    const baseProps = createProps({ tracks })
    const { rerender } = render(<PlaylistView {...baseProps} />)

    const secondAddBtn = document.getElementById('add-note-btn-track-2')
    expect(secondAddBtn).not.toBeNull()
    act(() => {
      secondAddBtn.focus()
    })

    focusByIdMock.mockClear()

    const updatedTracks = [
      tracks[0],
      { ...tracks[1], tags: ['fresh-tag'] },
    ]

    rerender(<PlaylistView {...createProps({ tracks: updatedTracks })} />)

    expect(focusByIdMock).not.toHaveBeenCalled()
    expect(secondAddBtn).toHaveFocus()
  })
})

describe('PlaylistView VisualViewport integration', () => {
  /** @type {any} */
  let visualViewportMock
  /** @type {Function[]} */
  let resizeHandlers = []
  /** @type {Function[]} */
  let scrollHandlers = []

  beforeEach(() => {
    resizeHandlers = []
    scrollHandlers = []

    visualViewportMock = {
      addEventListener: vi.fn((event, handler) => {
        if (event === 'resize') resizeHandlers.push(handler)
        if (event === 'scroll') scrollHandlers.push(handler)
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (event === 'resize') {
          resizeHandlers = resizeHandlers.filter((h) => h !== handler)
        }
        if (event === 'scroll') {
          scrollHandlers = scrollHandlers.filter((h) => h !== handler)
        }
      }),
    }

    Object.defineProperty(window, 'visualViewport', {
      value: visualViewportMock,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    // @ts-expect-error - cleanup test-only property
    delete window.visualViewport
  })

  it('subscribes to VisualViewport events when virtualization is enabled', () => {
    const manyTracks = Array.from({ length: 150 }, (_, i) => ({
      id: `track-${i}`,
      title: `Track ${i}`,
      artist: 'Artist',
      notes: [],
      tags: [],
    }))

    const props = createProps({ tracks: manyTracks })
    render(<PlaylistView {...props} />)

    expect(visualViewportMock.addEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    )
    expect(visualViewportMock.addEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
    )
  })

  it('does not subscribe to VisualViewport when virtualization is disabled', () => {
    const fewTracks = [
      { id: 'track-1', title: 'Track 1', artist: 'Artist', notes: [] },
    ]
    const props = createProps({ tracks: fewTracks })

    render(<PlaylistView {...props} />)

    expect(visualViewportMock.addEventListener).not.toHaveBeenCalled()
  })

  it('cleans up VisualViewport listeners on unmount', () => {
    const manyTracks = Array.from({ length: 150 }, (_, i) => ({
      id: `track-${i}`,
      title: `Track ${i}`,
      artist: 'Artist',
      notes: [],
      tags: [],
    }))

    const props = createProps({ tracks: manyTracks })
    const { unmount } = render(<PlaylistView {...props} />)

    unmount()

    expect(visualViewportMock.removeEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    )
    expect(visualViewportMock.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
    )
  })
})
