// src/features/playlist/actions.js

import { normalizeTag } from '../tags/tagUtils.js'
import { validateTag } from './helpers.js'
/** @typedef {import('../../utils/notesTagsData.js').NoteEntry} NoteEntry */
/** @typedef {import('../../utils/notesTagsData.js').NotesByTrack} NotesByTrack */

/**
 * Action creators with built-in validation.
 * Throw errors for invalid actions to catch bugs early.
 */

export const playlistActions = {
  // ===== Editing =====
  
  /**
   * Start editing a note for a track
   * @param {string} trackId
   * @returns {Object}
   */
  startNoteEdit(trackId) {
    if (!trackId) throw new Error('trackId required')
    return { type: 'NOTE_EDIT_START', payload: { trackId } }
  },

  /**
   * Update the draft text while editing
   * @param {string} draft
   * @returns {Object}
   */
  changeDraft(draft) {
    return { type: 'NOTE_DRAFT_CHANGE', payload: { draft } }
  },

  /**
   * Set error state for editing
   * @param {string} error
   * @returns {Object}
   */
  setEditingError(error) {
    return { type: 'NOTE_EDITING_ERROR', payload: { error } }
  },

  /**
   * Cancel note editing
   * @returns {Object}
   */
  cancelNoteEdit() {
    return { type: 'NOTE_EDIT_CANCEL' }
  },

  // ===== Notes =====

  /**
   * Save note optimistically (before API call)
   * @param {string} trackId
   * @param {string} note
   * @param {{ timestampMs?: number | null }} [extra]
   * @returns {Object}
   */
  saveNoteOptimistic(trackId, note, extra = {}) {
    const trimmed = note?.trim()
    if (!trimmed) {
      throw new Error('Note cannot be empty')
    }
    const payload = { trackId, note: trimmed }
    if (extra && typeof extra === 'object' && 'timestampMs' in extra) {
      payload.timestampMs = extra.timestampMs
    }
    return { type: 'NOTE_SAVE_OPTIMISTIC', payload }
  },

  /**
   * Rollback note save on API failure
   * @param {string} trackId
   * @param {import('../../utils/notesTagsData.js').NoteEntry[]} previousNotes
   * @returns {Object}
   */
  rollbackNoteSave(trackId, previousNotes) {
    return { type: 'NOTE_SAVE_ROLLBACK', payload: { trackId, previousNotes } }
  },

  /**
   * Rollback note save with error message (atomic update)
   * @param {string} trackId
   * @param {import('../../utils/notesTagsData.js').NoteEntry[]} previousNotes
   * @param {string} error
   * @returns {Object}
   */
  rollbackNoteSaveWithError(trackId, previousNotes, error) {
    return { type: 'NOTE_SAVE_ROLLBACK_WITH_ERROR', payload: { trackId, previousNotes, error } }
  },

  /**
   * Delete a note by index
   * @param {string} trackId
   * @param {number} noteIndex
   * @returns {Object}
   */
  deleteNote(trackId, noteIndex) {
    return { type: 'NOTE_DELETE', payload: { trackId, noteIndex } }
  },

  /**
   * Restore a deleted note (for undo)
   * @param {string} trackId
   * @param {NoteEntry} note
   * @param {number} index
   * @returns {Object}
   */
  restoreNote(trackId, note, index) {
    return { type: 'NOTE_RESTORE', payload: { trackId, note, index } }
  },

  // ===== Tags =====

  /**
   * Add a tag to a track (validates before dispatching)
   * @param {string} trackId
   * @param {string} tag
   * @param {string[]} existingTags - Current tags for the track
   * @returns {Object}
   */
  addTag(trackId, tag, existingTags = []) {
    const validation = validateTag(tag, existingTags)
    if (!validation.valid) {
      throw new Error(validation.error)
    }
    return { type: 'TAG_ADD', payload: { trackId, tag: validation.normalized } }
  },

  /**
   * Remove a tag from a track
   * @param {string} trackId
   * @param {string} tag
   * @returns {Object}
   */
  removeTag(trackId, tag) {
    const normalized = normalizeTag(tag)
    return { type: 'TAG_REMOVE', payload: { trackId, tag: normalized } }
  },

  // ===== Bulk Operations =====

  /**
   * Update tracks array (ensures notes/tags entries)
   * @param {Array} tracks
   * @returns {Object}
   */
  updateTracks(tracks) {
    return { type: 'TRACKS_UPDATE', payload: { tracks } }
  },

  /**
   * Set tracks with associated notes and tags
   * @param {Array} tracks
   * @param {NotesByTrack} notesByTrack
   * @param {Record<string, string[]>} tagsByTrack
   * @param {Array} baselineTracks - For comparison during merge
   * @param {string|null} importStamp - Timestamp for import
   * @returns {Object}
   */
  setTracksWithNotes(tracks, notesByTrack, tagsByTrack, baselineTracks = [], importStamp = null) {
    return {
      type: 'TRACKS_SET_WITH_NOTES',
      payload: { tracks, notesByTrack, tagsByTrack, baselineTracks, importStamp }
    }
  },

  /**
   * Merge remote data from API
   * @param {NotesByTrack} remoteNotes
   * @param {Record<string, string[]>} remoteTags
   * @returns {Object}
   */
  mergeRemoteData(remoteNotes, remoteTags) {
    return { type: 'REMOTE_DATA_MERGE', payload: { remoteNotes, remoteTags } }
  },

  /**
   * Reset all state to initial
   * @returns {Object}
   */
  resetState() {
    return { type: 'STATE_RESET' }
  }
}
