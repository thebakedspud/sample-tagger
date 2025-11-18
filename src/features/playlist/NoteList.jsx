import UndoPlaceholder from '../../components/UndoPlaceholder.jsx'
import { getNoteBody } from '../../utils/notesTagsData.js'
import { formatNoteCreatedAt, formatTimestampMs, formatTimestampRange } from './noteTimestamps.js'

/**
 * @param {object} props
 * @param {string|number} props.trackId
 * @param {Array<import('../../utils/notesTagsData.js').NoteEntry>} props.notes
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
      const body = getNoteBody(note)
      const createdAtLabel = formatNoteCreatedAt(note?.createdAt)
      let timestampLabel = null
      if (
        typeof note?.timestampMs === 'number' &&
        typeof note?.timestampEndMs === 'number' &&
        note.timestampEndMs >= note.timestampMs
      ) {
        timestampLabel = formatTimestampRange(note.timestampMs, note.timestampEndMs)
      } else {
        timestampLabel = formatTimestampMs(note?.timestampMs)
      }
      rows.push(
        <li
          key={`n-${trackId}-${idx}`}
          style={{
            color: 'var(--fg)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {timestampLabel && (
              <span
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.81rem',
                  whiteSpace: 'nowrap',
                  border: '1px solid var(--border)',
                  padding: '0 6px',
                  borderRadius: 999,
                  fontFamily: 'monospace',
                }}
              >
                [{timestampLabel}]
              </span>
            )}
            <span style={{ whiteSpace: 'normal', minWidth: 0 }}>- {body}</span>
            {createdAtLabel && (
              <span
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.82rem',
                  whiteSpace: 'nowrap',
                  marginLeft: 'auto',
                }}
                aria-label={`Note created at ${createdAtLabel}`}
              >
                {createdAtLabel}
              </span>
            )}
          </div>
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
