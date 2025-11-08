import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TrackCard from '../TrackCard.jsx'

const defaultTrack = {
  id: 'track-1',
  title: 'Track One',
  artist: 'Artist A',
  notes: ['first note'],
  tags: ['rock', 'jazz'],
}

function renderTrackCard(overrides = {}) {
  const props = {
    track: { ...defaultTrack, ...overrides.track },
    index: 0,
    pending: overrides.pending ?? new Map(),
    isPending: overrides.isPending ?? (() => false),
    editingState: overrides.editingState ?? { editingId: null, draft: '', error: null },
    onDraftChange: overrides.onDraftChange ?? vi.fn(),
    onAddNote: overrides.onAddNote ?? vi.fn(),
    onSaveNote: overrides.onSaveNote ?? vi.fn(),
    onCancelNote: overrides.onCancelNote ?? vi.fn(),
    onDeleteNote: overrides.onDeleteNote ?? vi.fn(),
    onAddTag: overrides.onAddTag ?? vi.fn().mockReturnValue(true),
    onRemoveTag: overrides.onRemoveTag ?? vi.fn(),
    onUndo: overrides.onUndo ?? vi.fn(),
    onDismissUndo: overrides.onDismissUndo ?? vi.fn(),
    stockTags: overrides.stockTags ?? [],
    customTags: overrides.customTags ?? [],
    onFilterTag: overrides.onFilterTag ?? vi.fn(),
  }

  const user = userEvent.setup()
  const view = render(<TrackCard {...props} />)
  return { user, ...props, ...view }
}

describe('TrackCard', () => {
  const originalRaf = window.requestAnimationFrame
  const originalCancelRaf = window.cancelAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0)
    window.cancelAnimationFrame = (id) => clearTimeout(id)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRaf
    window.cancelAnimationFrame = originalCancelRaf
  })

  it('invokes onRemoveTag and onFilterTag when tag chip clicked', async () => {
    const onRemoveTag = vi.fn()
    const onFilterTag = vi.fn()
    const { user } = renderTrackCard({ onRemoveTag, onFilterTag })

    const chip = screen.getByRole('button', { name: /remove tag rock/i })
    await user.click(chip)

    expect(onRemoveTag).toHaveBeenCalledWith('track-1', 'rock')
    expect(onFilterTag).toHaveBeenCalledWith('rock')
  })

  it('calls onCancelNote when cancel button pressed during editing', async () => {
    const onCancelNote = vi.fn()
    const editingState = { editingId: 'track-1', draft: 'draft text', error: null }
    const { user } = renderTrackCard({ onCancelNote, editingState })

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(onCancelNote).toHaveBeenCalled()
  })

  it('routes undo action through onUndo when placeholder button clicked', async () => {
    const onUndo = vi.fn()
    const pendingId = 'pending-1'
    const pendingMap = new Map([
      [
        pendingId,
        {
          trackId: 'track-1',
          index: 0,
          restoreFocusId: 'restore-1',
          fallbackFocusId: 'fallback-1',
        },
      ],
    ])
    const isPending = (id) => pendingMap.has(id)
    const { user } = renderTrackCard({ onUndo, pending: pendingMap, isPending })

    const undoButton = await screen.findByRole('button', { name: 'Undo' })
    await user.click(undoButton)

    expect(onUndo).toHaveBeenCalledWith(pendingId)
  })

  it('supports keyboard navigation between tag chips and add button', () => {
    renderTrackCard({
      track: { ...defaultTrack, tags: ['rock', 'jazz'] },
    })

    const firstChip = screen.getByRole('button', { name: /remove tag rock/i })
    const addButton = screen.getByRole('button', { name: /\+ add tag/i })

    const secondChip = screen.getByRole('button', { name: /remove tag jazz/i })

    firstChip.focus()
    fireEvent.keyDown(firstChip, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(secondChip)

    fireEvent.keyDown(secondChip, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(addButton)

    fireEvent.keyDown(addButton, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(secondChip)
  })

  it('omits date label when track has an invalid added date', () => {
    renderTrackCard({
      track: { ...defaultTrack, dateAdded: 'not-a-date' },
    })

    expect(screen.queryByText(/Added/i)).not.toBeInTheDocument()
  })
})
