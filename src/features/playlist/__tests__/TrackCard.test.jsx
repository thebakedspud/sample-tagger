import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TrackCard from '../TrackCard.jsx'
import { makeNote } from '../../../test-utils/noteHelpers.js'

const defaultTrack = {
  id: 'track-1',
  title: 'Track One',
  artist: 'Artist A',
  notes: [makeNote('first note')],
  tags: ['rock', 'jazz'],
}

function renderTrackCard(overrides = {}) {
  const props = {
    track: { ...defaultTrack, ...overrides.track },
    index: 0,
    placeholders: overrides.placeholders ?? [],
    isPending: overrides.isPending ?? (() => false),
    isEditing: overrides.isEditing ?? false,
    editingDraft: overrides.editingDraft ?? '',
    editingError: overrides.editingError ?? null,
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
    // @ts-expect-error - setTimeout returns Timeout in Node, number in browser
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0)
    // clearTimeout accepts Timeout in Node, number in browser
    window.cancelAnimationFrame = (id) => clearTimeout(id)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRaf
    window.cancelAnimationFrame = originalCancelRaf
  })

  it('removes tag without triggering filter when chip clicked', async () => {
    const onRemoveTag = vi.fn()
    const onFilterTag = vi.fn()
    const { user } = renderTrackCard({ onRemoveTag, onFilterTag })

    const chip = screen.getByRole('button', { name: /remove tag rock/i })
    await user.click(chip)

    expect(onRemoveTag).toHaveBeenCalledWith('track-1', 'rock')
    expect(onFilterTag).not.toHaveBeenCalled()
  })

  it('calls onCancelNote when cancel button pressed during editing', async () => {
    const onCancelNote = vi.fn()
    const { user } = renderTrackCard({
      onCancelNote,
      isEditing: true,
      editingDraft: 'draft text',
      editingError: null,
    })

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(onCancelNote).toHaveBeenCalled()
  })

  it('routes undo action through onUndo when placeholder button clicked', async () => {
    const onUndo = vi.fn()
    const pendingId = 'pending-1'
    const placeholders = [
      {
        pid: pendingId,
        index: 0,
        restoreFocusId: 'restore-1',
        fallbackFocusId: 'fallback-1',
      },
    ]
    const isPending = (id) => id === pendingId
    const { user } = renderTrackCard({ onUndo, placeholders, isPending })

    const undoButton = await screen.findByRole('button', { name: 'Undo' })
    await user.click(undoButton)

    expect(onUndo).toHaveBeenCalledWith(pendingId)
  })

  it('supports keyboard navigation between tag chips and add button', async () => {
    renderTrackCard({
      track: { ...defaultTrack, tags: ['rock', 'jazz'] },
    })

    const firstChip = screen.getByRole('button', { name: /remove tag rock/i })
    const addButton = screen.getByRole('button', { name: /\+ add tag/i })

    const secondChip = screen.getByRole('button', { name: /remove tag jazz/i })

    firstChip.focus()
    fireEvent.keyDown(firstChip, { key: 'ArrowRight' })
    await waitFor(() => expect(secondChip).toHaveFocus())

    fireEvent.keyDown(secondChip, { key: 'ArrowRight' })
    await waitFor(() => expect(addButton).toHaveFocus())

    fireEvent.keyDown(addButton, { key: 'ArrowLeft' })
    await waitFor(() => expect(secondChip).toHaveFocus())
  })

  it('omits date label when track has an invalid added date', () => {
    renderTrackCard({
      track: { ...defaultTrack, dateAdded: 'not-a-date' },
    })

    expect(screen.queryByText(/Added/i)).not.toBeInTheDocument()
  })

  it('shows inline error feedback when adding a tag fails', async () => {
    const errorMessage = 'Tags must be 24 characters or fewer.'
    const onAddTag = vi.fn().mockReturnValue({ success: false, error: errorMessage })
    const { user } = renderTrackCard({ onAddTag })

    await user.click(screen.getByRole('button', { name: /\+ add tag/i }))
    const input = screen.getByPlaceholderText(/add tag/i)
    await user.type(input, 'a brand new tag{Enter}')

    expect(onAddTag).toHaveBeenCalledWith('track-1', 'a brand new tag')
    expect(screen.getByText(errorMessage)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
})
