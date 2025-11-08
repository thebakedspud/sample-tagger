// src/features/playlist/playlistReducer.js

import {
  updateNotesMap,
  updateTagsMap,
  ensureNotesEntries,
  ensureTagsEntries,
  mergeRemoteNotes,
  mergeRemoteTags
} from '../../utils/notesTagsData.js'
import { attachNotesToTracks } from '../../utils/trackProcessing.js'
import { computeHasLocalNotes, computeAllCustomTags } from './helpers.js'

/**
 * @typedef {Object} PlaylistState
 * @property {Array<any>} tracks
 * @property {Record<string, string[]>} notesByTrack
 * @property {Record<string, string[]>} tagsByTrack
 * @property {{ trackId: string | null, draft: string, error: string | null }} editingState
 * @property {{ hasLocalNotes: boolean, allCustomTags: string[] }} _derived
 */

/**
 * Playlist state shape with derived values co-located
 * @type {PlaylistState}
 */
export const initialPlaylistState = {
  tracks: [],
  notesByTrack: {},
  tagsByTrack: {},
  editingState: {
    trackId: null,
    draft: '',
    error: null
  },
  // Derived values (computed in reducer to avoid re-computation)
  _derived: {
    hasLocalNotes: false,
    allCustomTags: []
  }
}

/**
 * Recompute derived values after state change
 * @param {Object} state
 * @returns {Object}
 */
function recomputeDerived(state) {
  return {
    ...state,
    _derived: {
      hasLocalNotes: computeHasLocalNotes(state.notesByTrack, state.tagsByTrack),
      allCustomTags: computeAllCustomTags(state.tagsByTrack)
    }
  }
}

/**
 * Playlist reducer - handles all playlist state transitions
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
 */
export function playlistReducer(state, action) {
  switch (action.type) {
    // ===== Editing Lifecycle =====
    case 'NOTE_EDIT_START':
      return {
        ...state,
        editingState: {
          trackId: action.payload.trackId,
          draft: '',
          error: null
        }
      }

    case 'NOTE_DRAFT_CHANGE':
      return {
        ...state,
        editingState: {
          ...state.editingState,
          draft: action.payload.draft
        }
      }

    case 'NOTE_EDITING_ERROR':
      return {
        ...state,
        editingState: {
          ...state.editingState,
          error: action.payload.error
        }
      }

    case 'NOTE_EDIT_CANCEL':
      return {
        ...state,
        editingState: {
          trackId: null,
          draft: '',
          error: null
        }
      }

    // ===== Note Operations =====
    case 'NOTE_SAVE_OPTIMISTIC': {
      const { trackId, note } = action.payload
      const existing = state.notesByTrack[trackId] || []
      const updated = [...existing, note]
      const nextNotesMap = updateNotesMap(state.notesByTrack, trackId, updated)
      const nextTracks = state.tracks.map(t =>
        t.id === trackId
          ? { ...t, notes: updated }
          : t
      )

      return recomputeDerived({
        ...state,
        notesByTrack: nextNotesMap,
        tracks: nextTracks,
        editingState: { trackId: null, draft: '', error: null }
      })
    }

    case 'NOTE_SAVE_ROLLBACK': {
      const { trackId, previousNotes } = action.payload
      const nextNotesMap = updateNotesMap(state.notesByTrack, trackId, previousNotes)
      const nextTracks = state.tracks.map(t =>
        t.id === trackId
          ? { ...t, notes: previousNotes }
          : t
      )

      return recomputeDerived({
        ...state,
        notesByTrack: nextNotesMap,
        tracks: nextTracks
      })
    }

    case 'NOTE_SAVE_ROLLBACK_WITH_ERROR': {
      const { trackId, previousNotes, error } = action.payload
      const nextNotesMap = updateNotesMap(state.notesByTrack, trackId, previousNotes)
      const nextTracks = state.tracks.map(t =>
        t.id === trackId
          ? { ...t, notes: previousNotes }
          : t
      )

      return recomputeDerived({
        ...state,
        notesByTrack: nextNotesMap,
        tracks: nextTracks,
        editingState: {
          ...state.editingState,
          error
        }
      })
    }

    case 'NOTE_DELETE': {
      const { trackId, noteIndex } = action.payload
      const existing = state.notesByTrack[trackId] || []
      const updated = existing.filter((_, i) => i !== noteIndex)
      const nextNotesMap = updateNotesMap(state.notesByTrack, trackId, updated)
      const nextTracks = state.tracks.map(t =>
        t.id === trackId
          ? { ...t, notes: updated }
          : t
      )

      return recomputeDerived({
        ...state,
        notesByTrack: nextNotesMap,
        tracks: nextTracks
      })
    }

    case 'NOTE_RESTORE': {
      const { trackId, note, index } = action.payload
      const existing = state.notesByTrack[trackId] || []
      const updated = [...existing]
      updated.splice(index, 0, note)
      const nextNotesMap = updateNotesMap(state.notesByTrack, trackId, updated)
      const nextTracks = state.tracks.map(t =>
        t.id === trackId
          ? { ...t, notes: updated }
          : t
      )

      return recomputeDerived({
        ...state,
        notesByTrack: nextNotesMap,
        tracks: nextTracks
      })
    }

    // ===== Tag Operations =====
    case 'TAG_ADD': {
      const { trackId, tag } = action.payload
      const existing = state.tagsByTrack[trackId] || []
      const updated = [...existing, tag]
      const nextTagsMap = updateTagsMap(state.tagsByTrack, trackId, updated)
      const nextTracks = state.tracks.map(t =>
        t.id === trackId
          ? { ...t, tags: updated }
          : t
      )

      return recomputeDerived({
        ...state,
        tagsByTrack: nextTagsMap,
        tracks: nextTracks
      })
    }

    case 'TAG_REMOVE': {
      const { trackId, tag } = action.payload
      const existing = state.tagsByTrack[trackId] || []
      const updated = existing.filter(t => t !== tag)
      const nextTagsMap = updateTagsMap(state.tagsByTrack, trackId, updated)
      const nextTracks = state.tracks.map(t =>
        t.id === trackId
          ? { ...t, tags: updated }
          : t
      )

      return recomputeDerived({
        ...state,
        tagsByTrack: nextTagsMap,
        tracks: nextTracks
      })
    }

    // ===== Bulk Operations =====
    case 'TRACKS_UPDATE': {
      const nextNotesMap = ensureNotesEntries(state.notesByTrack, action.payload.tracks)
      const nextTagsMap = ensureTagsEntries(state.tagsByTrack, action.payload.tracks)
      const nextTracks = action.payload.tracks.map(track => {
        const notes = nextNotesMap[track.id] || []
        const tags = nextTagsMap[track.id] || []
        return { ...track, notes, tags }
      })

      return recomputeDerived({
        ...state,
        tracks: nextTracks,
        notesByTrack: nextNotesMap,
        tagsByTrack: nextTagsMap
      })
    }

    case 'TRACKS_SET_WITH_NOTES': {
      const { tracks, notesByTrack, tagsByTrack, baselineTracks, importStamp } = action.payload
      const merged = attachNotesToTracks(tracks, notesByTrack, tagsByTrack, baselineTracks, { importStamp })

      return recomputeDerived({
        ...state,
        tracks: merged,
        notesByTrack,
        tagsByTrack
      })
    }

    case 'REMOTE_DATA_MERGE': {
      const { remoteNotes, remoteTags } = action.payload
      
      // Use existing merge functions to preserve correct behavior:
      // - Notes: only merge if local is empty
      // - Tags: remote always wins (canonical source)
      const nextNotesMap = mergeRemoteNotes(state.notesByTrack, remoteNotes)
      const nextTagsMap = mergeRemoteTags(state.tagsByTrack, remoteTags)

      const nextTracks = state.tracks.map(track => {
        const notes = nextNotesMap[track.id] || []
        const tags = nextTagsMap[track.id] || []
        return { ...track, notes, tags }
      })

      return recomputeDerived({
        ...state,
        notesByTrack: nextNotesMap,
        tagsByTrack: nextTagsMap,
        tracks: nextTracks
      })
    }

    case 'STATE_RESET':
      return recomputeDerived(initialPlaylistState)

    default:
      return state
  }
}
