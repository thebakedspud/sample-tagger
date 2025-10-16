import UndoPlaceholder from '../../components/UndoPlaceholder.jsx'

/**
 * @param {object} props
 * @param {string|number} props.trackId
 * @param {string[]} props.notes
 * @param {string} props.trackTitle
 * @param {Array<{ pid: string, index: number, restoreFocusId?: string, fallbackFocusId?: string }>} props.placeholders
 * @param {(id: string) => boolean} props.isPending
 * @param {(noteIndex: number) => void} props.onDeleteNote
 * @param {(pendingId: string) => void} props.onUndo
 * @param {(pendingId: string) => void} props.onDismissUndo
 */
export default function NoteList({
  trackId,
  trackTitle,
  notes,
  placeholders,
  isPending,
  onDeleteNote,
  onUndo,
  onDismissUndo,
}) {
  const hasNotes = notes.length > 0
  const hasPlaceholders = placeholders.some(ph => isPending(ph.pid))

  if (!hasNotes && !hasPlaceholders) {
    return null
  }

  const rows = []
  const noteCount = notes.length

  for (let idx = 0; idx <= noteCount; idx++) {
    placeholders
      .filter(ph => ph.index === idx && isPending(ph.pid))
      .forEach(ph => {
        rows.push(
          <li
            key={`ph-${ph.pid}`}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
          >
            <UndoPlaceholder
              pendingId={ph.pid}
              onUndo={onUndo}
              onDismiss={onDismissUndo}
              restoreFocusId={ph.restoreFocusId}
              fallbackFocusId={ph.fallbackFocusId}
            />
          </li>
        )
      })

    if (idx < noteCount) {
      const note = notes[idx]
      rows.push(
        <li
          key={`n-${trackId}-${idx}`}
          style={{
            color: 'var(--fg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>- {note}</span>
          <button
            type="button"
            id={`del-btn-${trackId}-${idx}`}
            className="btn"
            aria-label={`Delete note ${idx + 1} for ${trackTitle}`}
            onClick={() => onDeleteNote(idx)}
          >
            Delete
          </button>
        </li>
      )
    }
  }

  return (
    <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 16 }}>
      {rows}
    </ul>
  )
}
