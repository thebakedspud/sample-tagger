// src/features/playlist/__tests__/playlistReducer.test.js

import { describe, it, expect } from 'vitest'
import { playlistReducer, initialPlaylistState } from '../playlistReducer.js'
import { playlistActions } from '../actions.js'

describe('playlistReducer', () => {
  describe('initial state', () => {
    it('has correct initial structure', () => {
      expect(initialPlaylistState).toEqual({
        tracks: [],
        notesByTrack: {},
        tagsByTrack: {},
        editingState: {
          trackId: null,
          draft: '',
          error: null
        },
        _derived: {
          hasLocalNotes: false,
          allCustomTags: []
        }
      })
    })
  })

  describe('NOTE_EDIT_START', () => {
    it('sets editing trackId and clears draft/error', () => {
      const state = initialPlaylistState
      const action = playlistActions.startNoteEdit('t1')
      const next = playlistReducer(state, action)

      expect(next.editingState).toEqual({
        trackId: 't1',
        draft: '',
        error: null
      })
    })

    it('overwrites previous editing state', () => {
      const state = {
        ...initialPlaylistState,
        editingState: {
          trackId: 't1',
          draft: 'old draft',
          error: 'old error'
        }
      }
      const action = playlistActions.startNoteEdit('t2')
      const next = playlistReducer(state, action)

      expect(next.editingState).toEqual({
        trackId: 't2',
        draft: '',
        error: null
      })
    })
  })

  describe('NOTE_DRAFT_CHANGE', () => {
    it('updates draft text while preserving trackId', () => {
      const state = {
        ...initialPlaylistState,
        editingState: { trackId: 't1', draft: '', error: null }
      }
      const action = playlistActions.changeDraft('new draft')
      const next = playlistReducer(state, action)

      expect(next.editingState).toEqual({
        trackId: 't1',
        draft: 'new draft',
        error: null
      })
    })

    it('clears previous draft', () => {
      const state = {
        ...initialPlaylistState,
        editingState: { trackId: 't1', draft: 'old', error: null }
      }
      const action = playlistActions.changeDraft('')
      const next = playlistReducer(state, action)

      expect(next.editingState.draft).toBe('')
    })
  })

  describe('NOTE_EDITING_ERROR', () => {
    it('sets error while preserving trackId and draft', () => {
      const state = {
        ...initialPlaylistState,
        editingState: { trackId: 't1', draft: 'draft', error: null }
      }
      const action = playlistActions.setEditingError('Validation failed')
      const next = playlistReducer(state, action)

      expect(next.editingState).toEqual({
        trackId: 't1',
        draft: 'draft',
        error: 'Validation failed'
      })
    })
  })

  describe('NOTE_EDIT_CANCEL', () => {
    it('clears all editing state', () => {
      const state = {
        ...initialPlaylistState,
        editingState: { trackId: 't1', draft: 'draft', error: 'error' }
      }
      const action = playlistActions.cancelNoteEdit()
      const next = playlistReducer(state, action)

      expect(next.editingState).toEqual({
        trackId: null,
        draft: '',
        error: null
      })
    })
  })

  describe('NOTE_SAVE_OPTIMISTIC', () => {
    it('adds note to notesByTrack and updates track', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: [] }],
        notesByTrack: { t1: [] }
      }

      const action = playlistActions.saveNoteOptimistic('t1', 'test note')
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['test note'])
      expect(next.tracks[0].notes).toEqual(['test note'])
    })

    it('appends to existing notes', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['note1'] }],
        notesByTrack: { t1: ['note1'] }
      }

      const action = playlistActions.saveNoteOptimistic('t1', 'note2')
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['note1', 'note2'])
      expect(next.tracks[0].notes).toEqual(['note1', 'note2'])
    })

    it('clears editing state after save', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [] }],
        notesByTrack: { t1: [] },
        editingState: { trackId: 't1', draft: 'test', error: null }
      }

      const action = playlistActions.saveNoteOptimistic('t1', 'test')
      const next = playlistReducer(state, action)

      expect(next.editingState).toEqual({
        trackId: null,
        draft: '',
        error: null
      })
    })

    it('updates derived hasLocalNotes to true', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [] }],
        notesByTrack: { t1: [] }
      }

      const action = playlistActions.saveNoteOptimistic('t1', 'note')
      const next = playlistReducer(state, action)

      expect(next._derived.hasLocalNotes).toBe(true)
    })
  })

  describe('NOTE_SAVE_ROLLBACK', () => {
    it('restores previous notes on API failure', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['failed note'] }],
        notesByTrack: { t1: ['failed note'] }
      }

      const action = playlistActions.rollbackNoteSave('t1', ['original'])
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['original'])
      expect(next.tracks[0].notes).toEqual(['original'])
    })

    it('can rollback to empty notes', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['bad note'] }],
        notesByTrack: { t1: ['bad note'] }
      }

      const action = playlistActions.rollbackNoteSave('t1', [])
      const next = playlistReducer(state, action)

      // updateNotesMap removes entry when empty
      expect(next.notesByTrack.t1).toBeUndefined()
      expect(next.tracks[0].notes).toEqual([])
      expect(next._derived.hasLocalNotes).toBe(false)
    })
  })

  describe('NOTE_SAVE_ROLLBACK_WITH_ERROR', () => {
    it('restores previous notes and sets error (atomic update)', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['failed note'] }],
        notesByTrack: { t1: ['failed note'] },
        editingState: { trackId: null, draft: '', error: null }
      }

      const action = playlistActions.rollbackNoteSaveWithError('t1', ['original note'], 'API error')
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['original note'])
      expect(next.tracks[0].notes).toEqual(['original note'])
      expect(next.editingState.error).toBe('API error')
    })

    it('can rollback to empty notes with error', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['bad note'] }],
        notesByTrack: { t1: ['bad note'] },
        editingState: { trackId: 't1', draft: 'some draft', error: null }
      }

      const action = playlistActions.rollbackNoteSaveWithError('t1', [], 'Failed to save')
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toBeUndefined()
      expect(next.tracks[0].notes).toEqual([])
      expect(next.editingState.error).toBe('Failed to save')
      // Preserves other editing state
      expect(next.editingState.trackId).toBe('t1')
      expect(next.editingState.draft).toBe('some draft')
    })
  })

  describe('NOTE_DELETE', () => {
    it('removes note by index', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['note1', 'note2', 'note3'] }],
        notesByTrack: { t1: ['note1', 'note2', 'note3'] }
      }

      const action = playlistActions.deleteNote('t1', 1)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['note1', 'note3'])
      expect(next.tracks[0].notes).toEqual(['note1', 'note3'])
    })

    it('removes last note', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['only note'] }],
        notesByTrack: { t1: ['only note'] }
      }

      const action = playlistActions.deleteNote('t1', 0)
      const next = playlistReducer(state, action)

      // updateNotesMap removes entry when empty
      expect(next.notesByTrack.t1).toBeUndefined()
      expect(next._derived.hasLocalNotes).toBe(false)
    })
  })

  describe('NOTE_RESTORE', () => {
    it('restores note at specified index', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['note1', 'note3'] }],
        notesByTrack: { t1: ['note1', 'note3'] }
      }

      const action = playlistActions.restoreNote('t1', 'note2', 1)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['note1', 'note2', 'note3'])
      expect(next.tracks[0].notes).toEqual(['note1', 'note2', 'note3'])
    })

    it('restores at beginning', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['note2'] }],
        notesByTrack: { t1: ['note2'] }
      }

      const action = playlistActions.restoreNote('t1', 'note1', 0)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['note1', 'note2'])
    })

    it('restores at end', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['note1'] }],
        notesByTrack: { t1: ['note1'] }
      }

      const action = playlistActions.restoreNote('t1', 'note2', 1)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['note1', 'note2'])
    })
  })

  describe('TAG_ADD', () => {
    it('adds normalized tag and updates track', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', tags: [] }],
        tagsByTrack: { t1: [] }
      }

      const action = playlistActions.addTag('t1', 'rock', [])
      const next = playlistReducer(state, action)

      expect(next.tagsByTrack.t1).toEqual(['rock'])
      expect(next.tracks[0].tags).toEqual(['rock'])
    })

    it('appends to existing tags', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', tags: ['rock'] }],
        tagsByTrack: { t1: ['rock'] }
      }

      const action = playlistActions.addTag('t1', 'indie', ['rock'])
      const next = playlistReducer(state, action)

      expect(next.tagsByTrack.t1).toEqual(['rock', 'indie'])
    })

    it('updates derived allCustomTags', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', tags: [] }],
        tagsByTrack: { t1: [] }
      }

      const action = playlistActions.addTag('t1', 'rock', [])
      const next = playlistReducer(state, action)

      expect(next._derived.allCustomTags).toEqual(['rock'])
      expect(next._derived.hasLocalNotes).toBe(true)
    })

    it('updates allCustomTags across multiple tracks', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', tags: ['rock'] }, { id: 't2', tags: [] }],
        tagsByTrack: { t1: ['rock'], t2: [] }
      }

      const action = playlistActions.addTag('t2', 'jazz', [])
      const next = playlistReducer(state, action)

      expect(next._derived.allCustomTags).toEqual(['jazz', 'rock'])
    })
  })

  describe('TAG_REMOVE', () => {
    it('removes tag from tagsByTrack and updates track', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', tags: ['rock', 'indie'] }],
        tagsByTrack: { t1: ['rock', 'indie'] }
      }

      const action = playlistActions.removeTag('t1', 'rock')
      const next = playlistReducer(state, action)

      expect(next.tagsByTrack.t1).toEqual(['indie'])
      expect(next.tracks[0].tags).toEqual(['indie'])
    })

    it('removes last tag', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', tags: ['rock'] }],
        tagsByTrack: { t1: ['rock'] }
      }

      const action = playlistActions.removeTag('t1', 'rock')
      const next = playlistReducer(state, action)

      // updateTagsMap removes entry when empty
      expect(next.tagsByTrack.t1).toBeUndefined()
      expect(next._derived.allCustomTags).toEqual([])
      expect(next._derived.hasLocalNotes).toBe(false)
    })

    it('updates allCustomTags when removing shared tag', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [
          { id: 't1', tags: ['rock'] },
          { id: 't2', tags: ['rock', 'jazz'] }
        ],
        tagsByTrack: { t1: ['rock'], t2: ['rock', 'jazz'] }
      }

      const action = playlistActions.removeTag('t1', 'rock')
      const next = playlistReducer(state, action)

      // 'rock' still exists on t2
      expect(next._derived.allCustomTags).toEqual(['jazz', 'rock'])
    })
  })

  describe('TRACKS_UPDATE', () => {
    it('updates tracks and ensures entries in notes/tags maps', () => {
      const state = {
        ...initialPlaylistState,
        notesByTrack: { t1: ['note'] },
        tagsByTrack: { t1: ['tag'] }
      }

      const newTracks = [
        { id: 't1', title: 'Track 1' },
        { id: 't2', title: 'Track 2' }
      ]

      const action = playlistActions.updateTracks(newTracks)
      const next = playlistReducer(state, action)

      expect(next.tracks).toEqual(newTracks)
      // Existing entries preserved
      expect(next.notesByTrack.t1).toEqual(['note'])
      expect(next.tagsByTrack.t1).toEqual(['tag'])
      // New entries ensured (empty arrays)
      expect(next.notesByTrack.t2).toEqual([])
      expect(next.tagsByTrack.t2).toEqual([])
    })

    it('preserves existing notes/tags when updating tracks', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: ['old'], tags: ['old'] }],
        notesByTrack: { t1: ['old'] },
        tagsByTrack: { t1: ['old'] }
      }

      const newTracks = [{ id: 't1', title: 'Updated Track 1' }]
      const action = playlistActions.updateTracks(newTracks)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toEqual(['old'])
      expect(next.tagsByTrack.t1).toEqual(['old'])
    })
  })

  describe('TRACKS_SET_WITH_NOTES', () => {
    it('sets tracks with notes and tags attached', () => {
      const state = initialPlaylistState

      const tracks = [{ id: 't1', title: 'Track 1' }]
      const notesByTrack = { t1: ['note'] }
      const tagsByTrack = { t1: ['tag'] }

      const action = playlistActions.setTracksWithNotes(
        tracks,
        notesByTrack,
        tagsByTrack,
        [],
        null
      )
      const next = playlistReducer(state, action)

      expect(next.tracks[0].notes).toEqual(['note'])
      expect(next.tracks[0].tags).toEqual(['tag'])
      expect(next.notesByTrack).toEqual(notesByTrack)
      expect(next.tagsByTrack).toEqual(tagsByTrack)
    })

    it('updates derived state after setting tracks', () => {
      const state = initialPlaylistState

      const tracks = [{ id: 't1' }]
      const notesByTrack = { t1: ['note'] }
      const tagsByTrack = { t1: ['rock', 'jazz'] }

      const action = playlistActions.setTracksWithNotes(
        tracks,
        notesByTrack,
        tagsByTrack
      )
      const next = playlistReducer(state, action)

      expect(next._derived.hasLocalNotes).toBe(true)
      expect(next._derived.allCustomTags).toEqual(['jazz', 'rock'])
    })
  })

  describe('REMOTE_DATA_MERGE', () => {
    it('merges remote notes only when local is empty', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1' }, { id: 't2' }],
        notesByTrack: { t1: ['local note'] }
      }

      const remoteNotes = {
        t1: ['remote note'],
        t2: ['remote note 2']
      }

      const action = playlistActions.mergeRemoteData(remoteNotes, {})
      const next = playlistReducer(state, action)

      // Local note preserved
      expect(next.notesByTrack.t1).toEqual(['local note'])
      // Remote note added for t2 (no local)
      expect(next.notesByTrack.t2).toEqual(['remote note 2'])
    })

    it('remote tags always replace local tags', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1' }],
        tagsByTrack: { t1: ['local-tag'] }
      }

      const remoteTags = { t1: ['remote-tag'] }

      const action = playlistActions.mergeRemoteData({}, remoteTags)
      const next = playlistReducer(state, action)

      // Remote tags win (canonical source)
      expect(next.tagsByTrack.t1).toEqual(['remote-tag'])
    })

    it('updates tracks with merged notes and tags', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: {},
        tagsByTrack: {}
      }

      const remoteNotes = { t1: ['note'] }
      const remoteTags = { t1: ['tag'] }

      const action = playlistActions.mergeRemoteData(remoteNotes, remoteTags)
      const next = playlistReducer(state, action)

      expect(next.tracks[0].notes).toEqual(['note'])
      expect(next.tracks[0].tags).toEqual(['tag'])
    })

    it('updates derived state after merge', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1' }]
      }

      const remoteNotes = { t1: ['note'] }
      const remoteTags = { t1: ['rock'] }

      const action = playlistActions.mergeRemoteData(remoteNotes, remoteTags)
      const next = playlistReducer(state, action)

      expect(next._derived.hasLocalNotes).toBe(true)
      expect(next._derived.allCustomTags).toEqual(['rock'])
    })
  })

  describe('STATE_RESET', () => {
    it('resets to initial state', () => {
      const state = {
        tracks: [{ id: 't1', notes: ['note'], tags: ['tag'] }],
        notesByTrack: { t1: ['note'] },
        tagsByTrack: { t1: ['tag'] },
        editingState: { trackId: 't1', draft: 'draft', error: 'error' },
        _derived: { hasLocalNotes: true, allCustomTags: ['tag'] }
      }

      const action = playlistActions.resetState()
      const next = playlistReducer(state, action)

      expect(next).toEqual(initialPlaylistState)
    })
  })

  describe('unknown action', () => {
    it('returns state unchanged for unknown action type', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1' }]
      }

      const action = { type: 'UNKNOWN_ACTION', payload: {} }
      const next = playlistReducer(state, action)

      expect(next).toEqual(state) // Structural equality
    })
  })

  describe('immutability', () => {
    it('does not mutate original state on NOTE_SAVE_OPTIMISTIC', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [] }],
        notesByTrack: { t1: [] }
      }

      const originalTracks = state.tracks
      const originalNotesMap = state.notesByTrack

      const action = playlistActions.saveNoteOptimistic('t1', 'note')
      const next = playlistReducer(state, action)

      expect(next.tracks).not.toBe(originalTracks)
      expect(next.notesByTrack).not.toBe(originalNotesMap)
      expect(state.notesByTrack.t1).toEqual([]) // Original unchanged
    })

    it('does not mutate original state on TAG_ADD', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', tags: [] }],
        tagsByTrack: { t1: [] }
      }

      const originalTracks = state.tracks
      const originalTagsMap = state.tagsByTrack

      const action = playlistActions.addTag('t1', 'rock', [])
      const next = playlistReducer(state, action)

      expect(next.tracks).not.toBe(originalTracks)
      expect(next.tagsByTrack).not.toBe(originalTagsMap)
      expect(state.tagsByTrack.t1).toEqual([]) // Original unchanged
    })
  })
})

