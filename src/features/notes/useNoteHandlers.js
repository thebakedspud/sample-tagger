// src/features/notes/useNoteHandlers.js
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { focusById, focusElement } from '../../utils/focusById.js'
import { playlistActions } from '../playlist/actions.js'
import { createNoteSnapshot } from '../playlist/helpers.js'
import { markFeatureDiscovered } from '../../utils/storage.js'
import {
  usePlaylistDispatch,
  usePlaylistEditingState,
  usePlaylistNotesByTrack,
  usePlaylistTracks,
} from '../playlist/usePlaylistContext.js'
import { extractTimestamp } from '../playlist/noteTimestamps.js'
import { queueNoteDeletion } from './noteDeleteQueue.js'
/** @typedef {import('../../utils/notesTagsData.js').NoteEntry} NoteEntry */

/**
 * @typedef {object} PendingUndoMeta
 * @property {string} trackId
 * @property {NoteEntry} note
 * @property {number} index
 * @property {string} [restoreFocusId]
 * @property {string} [fallbackFocusId]
 */

/**
 * @typedef {object} UseNoteHandlersOptions
 * @property {(message: string) => void} [announce]
 * @property {(pendingId: string, meta: PendingUndoMeta) => void} [scheduleInlineUndo]
 * @property {(trackId: string, body: string, timestampMs?: number | null, noteId?: string) => Promise<void>} [syncNote]
 * @property {() => void} [onTimestampDiscovered]
 */

const noop = () => {}

/**
 * Thin glue hook that wires playlist note actions to UI helpers.
 * @param {UseNoteHandlersOptions} options
 */
export function useNoteHandlers(options = {}) {
  const { announce, scheduleInlineUndo, syncNote, onTimestampDiscovered } = /** @type {UseNoteHandlersOptions} */ (options || {})
  const dispatch = usePlaylistDispatch()
  const editingState = usePlaylistEditingState()
  const notesByTrack = usePlaylistNotesByTrack()
  const tracks = usePlaylistTracks()
  const editorInvokerRef = useRef(null)

  const announceFn = useMemo(
    () => (typeof announce === 'function' ? announce : noop),
    [announce],
  )
  const scheduleUndo = useMemo(
    () => (typeof scheduleInlineUndo === 'function' ? scheduleInlineUndo : null),
    [scheduleInlineUndo],
  )
  const syncNoteFn = useMemo(
    () => (typeof syncNote === 'function' ? syncNote : null),
    [syncNote],
  )
  const timestampDiscoveredFn = useMemo(
    () => (typeof onTimestampDiscovered === 'function' ? onTimestampDiscovered : noop),
    [onTimestampDiscovered],
  )

  const editingId = editingState?.trackId ?? null
  const draft = editingState?.draft ?? ''
  const editingError = editingState?.error ?? null

  useEffect(() => {
    if (editingId == null) return
    if (!Array.isArray(tracks)) return
    if (tracks.some((track) => track?.id === editingId)) return
    dispatch(playlistActions.cancelNoteEdit())
  }, [dispatch, editingId, tracks])

  const onDraftChange = useCallback(
    (value) => {
      dispatch(playlistActions.changeDraft(value))
    },
    [dispatch],
  )

  const onAddNote = useCallback(
    (trackId) => {
      if (!trackId) return
      dispatch(playlistActions.startNoteEdit(trackId))
      editorInvokerRef.current = document.getElementById(`add-note-btn-${trackId}`)
      setTimeout(() => {
        const targetId = `note-input-${trackId}`
        if (document.getElementById(targetId)) {
          focusById(targetId)
        }
      }, 0)
    },
    [dispatch],
  )

  const onSaveNote = useCallback(
    async (trackId) => {
      const { timestamp, cleanedBody } = extractTimestamp(draft)
      const currentDraft = cleanedBody.trim()
      if (!currentDraft) {
        announceFn('Note not saved. The note is empty.')
        dispatch(playlistActions.setEditingError('Note cannot be empty.'))
        return
      }

      const snapshot = createNoteSnapshot(notesByTrack, trackId)
      // Pre-generate note ID for offline-first sync
      const noteId = crypto.randomUUID()
      const extra = { id: noteId }
      let timestampMsForSync
      if (timestamp) {
        extra.timestampMs = timestamp.startMs
        if (timestamp.kind === 'range') {
          extra.timestampEndMs = timestamp.endMs
        }
        timestampMsForSync = timestamp.startMs
        // We mark timestamp as "discovered" once a local note has a parsed timestamp.
        // This is intentionally optimistic; even if remote sync fails, the user has already
        // seen the feature work in the UI.
        markFeatureDiscovered('timestamp')
        timestampDiscoveredFn()
      }
      dispatch(playlistActions.saveNoteOptimistic(trackId, currentDraft, extra))
      announceFn('Note added.')
      focusElement(editorInvokerRef.current)

      if (!syncNoteFn) return

      try {
        await syncNoteFn(trackId, currentDraft, timestampMsForSync, noteId)
      } catch (err) {
        console.error('[note save] error', err)
        dispatch(
          playlistActions.rollbackNoteSaveWithError(
            trackId,
            snapshot.previousNotes,
            'Failed to save note. Restored previous notes.',
          ),
        )
        announceFn('Note save failed. Restored previous note list.')
      }
    },
    [announceFn, dispatch, draft, notesByTrack, syncNoteFn, timestampDiscoveredFn],
  )

  const onCancelNote = useCallback(() => {
    dispatch(playlistActions.cancelNoteEdit())
    announceFn('Note cancelled.')
    focusElement(editorInvokerRef.current)
  }, [announceFn, dispatch])

  const onDeleteNote = useCallback(
    (trackId, noteIndex) => {
      const notes = notesByTrack?.[trackId]
      const noteToDelete = Array.isArray(notes) ? notes[noteIndex] : undefined
      if (noteToDelete == null) return

      dispatch(playlistActions.deleteNote(trackId, noteIndex))

      // Queue deletion for server sync (offline-friendly)
      if (noteToDelete.id) {
        queueNoteDeletion(noteToDelete.id, trackId)
      }

      if (scheduleUndo) {
        const pendingId = `${trackId}::${noteIndex}::${Date.now()}`
        scheduleUndo(pendingId, {
          trackId,
          note: noteToDelete,
          index: noteIndex,
          restoreFocusId: `del-btn-${trackId}-${noteIndex}`,
          fallbackFocusId: `add-note-btn-${trackId}`,
        })
      }

      announceFn('Note deleted. Press Undo to restore')
    },
    [announceFn, dispatch, notesByTrack, scheduleUndo],
  )

  return {
    editingId,
    draft,
    editingError,
    onDraftChange,
    onAddNote,
    onSaveNote,
    onCancelNote,
    onDeleteNote,
  }
}
