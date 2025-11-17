import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NoteList from '../NoteList.jsx'
import { makeNote } from '../../../test-utils/noteHelpers.js'

const noop = () => {}
const baseProps = {
  trackId: 'track-1',
  trackTitle: 'Track One',
  placeholders: [],
  isPending: () => false,
  onDeleteNote: vi.fn(),
  onUndo: noop,
  onDismissUndo: noop,
}

describe('NoteList', () => {
  it('renders createdAt label when present', () => {
    const note = makeNote('Fresh note', {
      createdAt: Date.parse('2025-11-15T10:57:00Z'),
      timestampMs: 92000,
    })
    render(<NoteList {...baseProps} notes={[note]} />)

    expect(screen.getByText('- Fresh note')).toBeInTheDocument()
    expect(screen.getByText(/\[1:32\]/)).toBeInTheDocument()
    const label = screen.getByLabelText(/Note created at/i)
    expect(label.textContent).toContain('2025')
  })

  it('does not render createdAt label when missing', () => {
    const note = makeNote('No timestamp', { createdAt: 0 })
    delete note.createdAt
    render(<NoteList {...baseProps} notes={[note]} />)

    expect(screen.getByText('- No timestamp')).toBeInTheDocument()
    expect(screen.queryByText(/\[/)).toBeNull()
    expect(screen.queryByLabelText(/Note created at/i)).toBeNull()
  })
})
