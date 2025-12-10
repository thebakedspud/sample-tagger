import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TrackCard from '../TrackCard.jsx'

const defaultTrack = {
  id: 'track-1',
  title: 'Track One',
  artist: 'Artist A',
  notes: [],
  tags: [],
}

function renderTrackCard(overrides = {}) {
  const props = {
    track: { ...defaultTrack, ...overrides.track },
    index: 0,
    placeholders: [],
    isPending: () => false,
    isEditing: overrides.isEditing ?? false,
    editingDraft: overrides.editingDraft ?? '',
    editingError: overrides.editingError ?? null,
    onDraftChange: vi.fn(),
    onAddNote: vi.fn(),
    onSaveNote: vi.fn(),
    onCancelNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    stockTags: [],
    customTags: [],
    onUndo: vi.fn(),
    onDismissUndo: vi.fn(),
    hasDiscoveredTimestamp: true,
  }

  return render(<TrackCard {...props} />)
}

describe('TrackCard Timestamp Affordance', () => {
  const originalRaf = window.requestAnimationFrame
  const originalCancelRaf = window.cancelAnimationFrame

  beforeEach(() => {
    // @ts-expect-error - setTimeout returns Timeout in Node
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0)
    window.cancelAnimationFrame = (id) => clearTimeout(id)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRaf
    window.cancelAnimationFrame = originalCancelRaf
  })

  it('renders visual indicator when valid timestamp is present', () => {
    renderTrackCard({
      isEditing: true,
      editingDraft: 'Check this at 1:23',
    })

    // Visual badge
    expect(screen.getByText('[1:23]')).toBeInTheDocument()
    
    // SR announcement
    const srStatus = screen.getByRole('status')
    expect(srStatus).toHaveTextContent('Timestamp detected: 1:23')
    expect(srStatus).toHaveClass('sr-only')
  })

  it('renders visual indicator for range timestamps', () => {
    renderTrackCard({
      isEditing: true,
      editingDraft: 'From 1:00-1:30',
    })

    expect(screen.getByText('[1:00–1:30]')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Timestamp detected: 1:00–1:30')
  })

  it('hides indicator and shows error border when submission error exists', () => {
    renderTrackCard({
      isEditing: true,
      editingDraft: 'Check 1:23',
      editingError: 'Failed to save',
    })

    // Badge should not be present
    expect(screen.queryByText('[1:23]')).not.toBeInTheDocument()
    
    // SR status should not be present
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // Error should be visible
    expect(screen.getByText('Failed to save')).toBeInTheDocument()
  })

  it('hides indicator when timestamp is invalid', () => {
    renderTrackCard({
      isEditing: true,
      editingDraft: 'Check 99:99',
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/\[.*\]/)).not.toBeInTheDocument()
  })
})
