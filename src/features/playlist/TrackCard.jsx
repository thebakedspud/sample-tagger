import { useEffect, useMemo, useRef, useState } from 'react'
import NoteList from './NoteList.jsx'
import TagChip from '../tags/TagChip.jsx'
import TagInput from '../tags/TagInput.jsx'

/**
 * @param {object} props
 * @param {{ id: string|number, title: string, artist: string, notes: string[], tags?: string[] }} props.track
 * @param {number} props.index
 * @param {Map<string, any>} props.pending
 * @param {(id: string) => boolean} props.isPending
 * @param {{ editingId: string|number|null, draft: string, error: string|null }} props.editingState
 * @param {(value: string) => void} props.onDraftChange
 * @param {(trackId: string|number) => void} props.onAddNote
 * @param {(trackId: string|number) => void} props.onSaveNote
 * @param {() => void} props.onCancelNote
 * @param {(trackId: string|number, noteIndex: number) => void} props.onDeleteNote
 * @param {(trackId: string|number, tag: string) => boolean} props.onAddTag
 * @param {(trackId: string|number, tag: string) => void} props.onRemoveTag
 * @param {string[]} props.stockTags
 * @param {string[]} props.customTags
 * @param {(pendingId: string) => void} props.onUndo
 * @param {(pendingId: string) => void} props.onDismissUndo
 */
export default function TrackCard({
  track,
  index,
  pending,
  isPending,
  editingState,
  onDraftChange,
  onAddNote,
  onSaveNote,
  onCancelNote,
  onDeleteNote,
  onAddTag,
  onRemoveTag,
  stockTags = [],
  customTags = [],
  onUndo,
  onDismissUndo,
}) {
  const noteArr = Array.isArray(track.notes) ? track.notes : []
  const tags = useMemo(
    () => (Array.isArray(track.tags) ? track.tags : []),
    [track.tags],
  )
  const { editingId, draft, error } = editingState
  const isEditing = editingId === track.id

  const placeholders = []
  for (const [pid, meta] of pending.entries()) {
    if (meta.trackId === track.id) {
      placeholders.push({
        pid,
        index: meta.index,
        restoreFocusId: meta.restoreFocusId,
        fallbackFocusId: meta.fallbackFocusId,
      })
    }
  }
  placeholders.sort((a, b) => a.index - b.index)

  const noteBadge =
    noteArr.length > 0 ? (
      <span style={{ marginLeft: 8, color: 'var(--muted)', fontWeight: 400 }}>
        - {noteArr.length} note{noteArr.length > 1 ? 's' : ''}
      </span>
    ) : null

  const fallbackInitial =
    typeof track.title === 'string' && track.title.trim()
      ? track.title.trim()[0].toUpperCase()
      : '#'

  const [addingTag, setAddingTag] = useState(false)
  const [pendingFocus, setPendingFocus] = useState(null)
  const addTagBtnRef = useRef(null)
  const tagInputRef = useRef(null)
  const chipRefs = useRef(new Map())

  useEffect(() => {
    const map = chipRefs.current
    if (!map) return
    Array.from(map.keys()).forEach((key) => {
      if (!tags.includes(key)) {
        map.delete(key)
      }
    })
    if (!pendingFocus) return
    if (typeof pendingFocus === 'string') {
      const node = map.get(pendingFocus)
      if (node) {
        node.focus()
        setPendingFocus(null)
        return
      }
    } else if (pendingFocus && typeof pendingFocus === 'object') {
      const targetIndex = Math.min(
        Math.max(pendingFocus.index ?? 0, 0),
        Math.max(tags.length - 1, 0),
      )
      if (tags.length > 0) {
        const fallbackTag = tags[targetIndex]
        const node = fallbackTag ? map.get(fallbackTag) : null
        if (node) {
          node.focus()
          setPendingFocus(null)
          return
        }
      }
      addTagBtnRef.current?.focus()
      setPendingFocus(null)
    }
  }, [tags, pendingFocus])

  const registerChipRef = (tag) => (node) => {
    const map = chipRefs.current
    if (!map) return
    if (node) {
      map.set(tag, node)
    } else {
      map.delete(tag)
    }
  }

  const focusChipByIndex = (targetIndex) => {
    const tag = tags[targetIndex]
    if (!tag) {
      if (addingTag) {
        tagInputRef.current?.focus()
      } else {
        addTagBtnRef.current?.focus()
      }
      return
    }
    const node = chipRefs.current.get(tag)
    if (node) node.focus()
  }

  const startAddTag = () => {
    setAddingTag(true)
    setPendingFocus(null)
    requestAnimationFrame(() => tagInputRef.current?.focus())
  }

  const cancelAddTag = () => {
    setAddingTag(false)
    setPendingFocus(null)
    requestAnimationFrame(() => addTagBtnRef.current?.focus())
  }

  const submitTag = (value) => {
    if (!onAddTag) return false
    const added = onAddTag(track.id, value)
    if (added) {
      setAddingTag(false)
      setPendingFocus(value)
    }
    return added
  }

  const removeTag = (value, index) => {
    if (!onRemoveTag) return
    onRemoveTag(track.id, value)
    setPendingFocus({ index })
  }

  const handleChipKeyDown = (event, chipIndex) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (chipIndex < tags.length - 1) {
        focusChipByIndex(chipIndex + 1)
      } else if (addingTag) {
        tagInputRef.current?.focus()
      } else {
        addTagBtnRef.current?.focus()
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (chipIndex > 0) {
        focusChipByIndex(chipIndex - 1)
      } else {
        addTagBtnRef.current?.focus()
      }
    }
  }

  const handleAddButtonKeyDown = (event) => {
    if (event.key === 'ArrowLeft' && tags.length > 0) {
      event.preventDefault()
      focusChipByIndex(tags.length - 1)
    }
  }

  const handleFilterTag = (value) => {
    console.log('filter', value)
  }

  return (
    <li
      id={`track-${track.id}`}
      tabIndex={-1}
      style={{
        border: '1px solid var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div className="track-thumb" aria-hidden="true">
            {track.thumbnailUrl ? (
              <img
                src={track.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                width={40}
                height={40}
              />
            ) : (
              <span className="track-thumb__fallback">{fallbackInitial}</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3
              id={`t-${track.id}`}
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                alignItems: 'center',
              }}
            >
              <span className="sr-only">Track {index + 1}</span>
              <span aria-hidden="true">{index + 1}.</span>
              <span id={`title-${track.id}`} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {track.title}
              </span>
              <span className="sr-only">by {track.artist}</span>
              <span aria-hidden="true">- {track.artist}</span>
              {noteBadge}
            </h3>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            id={`add-note-btn-${track.id}`}
            className="btn"
            aria-label="Add note"
            aria-describedby={`title-${track.id}`}
            onClick={() => onAddNote(track.id)}
          >
            Add note
          </button>
        </div>
      </div>

      <div
        className="tag-row"
        role="group"
        aria-label={`Tags for ${track.title}`}
      >
        {tags.map((tag, tagIndex) => (
          <TagChip
            key={tag}
            ref={registerChipRef(tag)}
            tag={tag}
            onFilter={handleFilterTag}
            onRemove={() => removeTag(tag, tagIndex)}
            onKeyDown={(event) => handleChipKeyDown(event, tagIndex)}
          />
        ))}

        {addingTag ? (
          <TagInput
            ref={tagInputRef}
            stockTags={stockTags}
            customTags={customTags}
            existingTags={tags}
            onAdd={submitTag}
            onCancel={cancelAddTag}
            autoFocus
          />
        ) : (
          <button
            type="button"
            ref={addTagBtnRef}
            className="tag-chip tag-chip--add"
            onClick={startAddTag}
            onKeyDown={handleAddButtonKeyDown}
          >
            + Add tag
          </button>
        )}
      </div>

      <NoteList
        trackId={track.id}
        trackTitle={track.title}
        notes={noteArr}
        placeholders={placeholders}
        isPending={isPending}
        onDeleteNote={(noteIndex) => onDeleteNote(track.id, noteIndex)}
        onUndo={onUndo}
        onDismissUndo={onDismissUndo}
      />

      {isEditing && (
        <section id={`note-${track.id}`} aria-labelledby={`t-${track.id}`} style={{ marginTop: 10 }}>
          <label className="sr-only" htmlFor={`note-input-${track.id}`}>
            Note text
          </label>
          <textarea
            id={`note-input-${track.id}`}
            rows={3}
            value={draft}
            aria-describedby={error ? `note-error-${track.id}` : undefined}
            onChange={(event) => onDraftChange(event.target.value)}
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${error ? '#d9534f' : 'var(--border)'}`,
              background: 'var(--card)',
              color: 'var(--fg)',
            }}
          />
          {error && (
            <div id={`note-error-${track.id}`} className="error-text">
              {error}
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary" onClick={() => onSaveNote(track.id)}>
              Save note
            </button>
            <button type="button" className="btn" onClick={onCancelNote}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </li>
  )
}
