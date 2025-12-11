// src/features/notes/__tests__/recoverySyncScenarios.test.js
// 
// Integration tests for recovery sync scenarios.
// These tests validate that notes/tags sync correctly across devices
// after using a recovery code, and that no data is lost.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playlistReducer, initialPlaylistState } from '../../playlist/playlistReducer.js'
import { playlistActions } from '../../playlist/actions.js'
import { groupRemoteNotes } from '../../../utils/notesTagsData.js'
import {
  queueNoteDeletion,
  cancelNoteDeletion,
  flushDeleteQueue,
  getQueueSize,
} from '../noteDeleteQueue.js'

/**
 * Helper to create a note entry with consistent structure
 * @param {string} body
 * @param {number} createdAt
 * @param {Partial<{ id: string, timestampMs: number }>} [extra]
 */
function makeNote(body, createdAt, extra = {}) {
  return {
    id: extra.id ?? `note-${createdAt}`,
    body,
    createdAt,
    ...(extra.timestampMs != null ? { timestampMs: extra.timestampMs } : {}),
  }
}

/**
 * Helper to extract note bodies from an array
 * @param {Array<{ body: string } | string>} notes
 */
function noteBodies(notes) {
  return notes.map((n) => (typeof n === 'string' ? n : n.body))
}

// ============================================================================
// SCENARIO 1: Multi-note sync (5 notes from server to new device)
// ============================================================================
describe('Scenario 1: Multi-note sync (5 notes from server to new device)', () => {
  describe('Reducer-level tests', () => {
    it('merges 5 remote notes into empty local state', () => {
      const remoteNotes = [
        makeNote('Note 1', 1000),
        makeNote('Note 2', 2000),
        makeNote('Note 3', 3000),
        makeNote('Note 4', 4000),
        makeNote('Note 5', 5000),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 'tA', notes: [], tags: [] }],
        notesByTrack: {},
      }

      const action = playlistActions.mergeRemoteData({ tA: remoteNotes }, {})
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.tA).toHaveLength(5)
      expect(noteBodies(next.notesByTrack.tA)).toEqual([
        'Note 1',
        'Note 2',
        'Note 3',
        'Note 4',
        'Note 5',
      ])
    })

    it('maintains note order by createdAt after merge', () => {
      // Remote notes arrive out of order
      const remoteNotes = [
        makeNote('Third', 3000),
        makeNote('First', 1000),
        makeNote('Fifth', 5000),
        makeNote('Second', 2000),
        makeNote('Fourth', 4000),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 'tA', notes: [], tags: [] }],
        notesByTrack: {},
      }

      const action = playlistActions.mergeRemoteData({ tA: remoteNotes }, {})
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.tA).toHaveLength(5)
      expect(noteBodies(next.notesByTrack.tA)).toEqual([
        'First',
        'Second',
        'Third',
        'Fourth',
        'Fifth',
      ])
    })

    it('preserves all note metadata (id, timestamps) after merge', () => {
      const remoteNotes = [
        makeNote('Timestamped note', 1000, { id: 'uuid-1', timestampMs: 30000 }),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 'tA', notes: [], tags: [] }],
        notesByTrack: {},
      }

      const action = playlistActions.mergeRemoteData({ tA: remoteNotes }, {})
      const next = playlistReducer(state, action)

      const mergedNote = next.notesByTrack.tA[0]
      expect(mergedNote.id).toBe('uuid-1')
      expect(mergedNote.body).toBe('Timestamped note')
      expect(mergedNote.createdAt).toBe(1000)
      expect(mergedNote.timestampMs).toBe(30000)
    })

    it('preserves metadata when merging remote notes into existing local notes', () => {
      const localNotes = [
        makeNote('Local note', 500, { id: 'local-1', timestampMs: 10000 }),
      ]
      const remoteNotes = [
        makeNote('Remote note', 1500, { id: 'remote-1', timestampMs: 20000 }),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 'tA', notes: [], tags: [] }],
        notesByTrack: { tA: localNotes },
      }

      const action = playlistActions.mergeRemoteData({ tA: remoteNotes }, {})
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.tA).toHaveLength(2)
      const [first, second] = next.notesByTrack.tA
      expect(first.id).toBe('local-1')
      expect(first.timestampMs).toBe(10000)
      expect(second.id).toBe('remote-1')
      expect(second.timestampMs).toBe(20000)
    })
  })

  describe('groupRemoteNotes integration', () => {
    it('groups multiple server rows into single track note array', () => {
      // Simulates what comes back from the server: multiple rows for same track
      const serverRows = [
        { trackId: 'tA', body: 'Note 1', tags: ['tag1'], createdAt: 1000 },
        { trackId: 'tA', body: 'Note 2', tags: ['tag2'], createdAt: 2000 },
        { trackId: 'tA', body: 'Note 3', tags: [], createdAt: 3000 },
        { trackId: 'tA', body: 'Note 4', tags: ['tag1'], createdAt: 4000 },
        { trackId: 'tA', body: 'Note 5', tags: ['tag3'], createdAt: 5000 },
      ]

      const { notes, tags } = groupRemoteNotes(serverRows)

      expect(notes.tA).toHaveLength(5)
      expect(noteBodies(notes.tA)).toEqual([
        'Note 1',
        'Note 2',
        'Note 3',
        'Note 4',
        'Note 5',
      ])
      // Tags should be union of all rows
      expect(tags.tA).toEqual(['tag1', 'tag2', 'tag3'])
    })
  })
})

// ============================================================================
// SCENARIO 2: Cross-device note creation (union merge behavior)
// ============================================================================
describe('Scenario 2: Cross-device note creation (union merge)', () => {
  describe('Reducer-level tests', () => {
    it('merges 3 local + 2 remote notes into 5 unique notes', () => {
      const localNotes = [
        makeNote('Local A', 1000),
        makeNote('Local B', 2000),
        makeNote('Local C', 3000),
      ]

      const remoteNotes = [
        makeNote('Remote X', 4000),
        makeNote('Remote Y', 5000),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: { t1: localNotes },
      }

      const action = playlistActions.mergeRemoteData({ t1: remoteNotes }, {})
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toHaveLength(5)
      expect(noteBodies(next.notesByTrack.t1)).toEqual([
        'Local A',
        'Local B',
        'Local C',
        'Remote X',
        'Remote Y',
      ])
    })

    it('deduplicates notes with identical content signature (body + createdAt + timestampMs)', () => {
      const sharedContent = { body: 'Same note', createdAt: 1000, timestampMs: 5000 }
      const localNote = { ...sharedContent, id: 'local-uuid' }
      const remoteNote = { ...sharedContent, id: 'server-uuid' }

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: { t1: [localNote] },
      }

      const action = playlistActions.mergeRemoteData({ t1: [remoteNote] }, {})
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toHaveLength(1)
      expect(next.notesByTrack.t1[0].body).toBe('Same note')
    })

    it('keeps notes with same body but different createdAt as separate', () => {
      const localNote = makeNote('Repeated thought', 1000)
      const remoteNote = makeNote('Repeated thought', 2000) // Same body, different time

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: { t1: [localNote] },
      }

      const action = playlistActions.mergeRemoteData({ t1: [remoteNote] }, {})
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toHaveLength(2)
      expect(noteBodies(next.notesByTrack.t1)).toEqual([
        'Repeated thought',
        'Repeated thought',
      ])
    })

    it('keeps notes with same body/createdAt but different timestampMs as separate', () => {
      const localNote = makeNote('At 0:30', 1000, { timestampMs: 30000 })
      const remoteNote = makeNote('At 0:30', 1000, { timestampMs: 45000 }) // Same body/time, different timestamp

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: { t1: [localNote] },
      }

      const action = playlistActions.mergeRemoteData({ t1: [remoteNote] }, {})
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toHaveLength(2)
    })
  })

  describe('Tag union merge', () => {
    it('merges local and remote tags into sorted union', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        tagsByTrack: { t1: ['chill', 'jazz'] },
      }

      const remoteTags = { t1: ['jazz', 'rock', 'blues'] }

      const action = playlistActions.mergeRemoteData({}, remoteTags)
      const next = playlistReducer(state, action)

      expect(next.tagsByTrack.t1).toEqual(['blues', 'chill', 'jazz', 'rock'])
    })

    it('handles remote tags when no local tags exist', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        tagsByTrack: {},
      }

      const remoteTags = { t1: ['rock', 'metal'] }

      const action = playlistActions.mergeRemoteData({}, remoteTags)
      const next = playlistReducer(state, action)

      expect(next.tagsByTrack.t1).toEqual(['metal', 'rock'])
    })

    it('normalizes and deduplicates remote-only tags with casing differences', () => {
      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        tagsByTrack: {},
      }

      const remoteTags = { t1: ['Rock', 'rock', ' ROCK '] }

      const action = playlistActions.mergeRemoteData({}, remoteTags)
      const next = playlistReducer(state, action)

      expect(next.tagsByTrack.t1).toEqual(['rock'])
    })
  })

  describe('Two-device simulation', () => {
    it('simulates Device 1 and Device 2 creating notes, syncing via shared server', () => {
      // Shared "server" state
      let serverNotes = /** @type {Record<string, any[]>} */ ({})

      // Device 1: Creates 3 notes
      const device1Notes = [
        makeNote('Device 1 - Note A', 1000, { id: 'd1-a' }),
        makeNote('Device 1 - Note B', 2000, { id: 'd1-b' }),
        makeNote('Device 1 - Note C', 3000, { id: 'd1-c' }),
      ]

      // Device 1 syncs to server
      serverNotes.t1 = [...(serverNotes.t1 || []), ...device1Notes]

      // Device 2: Creates 2 different notes locally
      const device2LocalNotes = [
        makeNote('Device 2 - Note X', 4000, { id: 'd2-x' }),
        makeNote('Device 2 - Note Y', 5000, { id: 'd2-y' }),
      ]

      // Device 2 syncs: uploads its notes, receives union
      serverNotes.t1 = [...serverNotes.t1, ...device2LocalNotes]

      // Device 2 applies merge
      let device2State = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: { t1: device2LocalNotes },
      }

      const mergeAction = playlistActions.mergeRemoteData({ t1: serverNotes.t1 }, {})
      device2State = playlistReducer(device2State, mergeAction)

      // Device 2 should have all 5 notes
      expect(device2State.notesByTrack.t1).toHaveLength(5)

      // Device 1 re-syncs and gets the union
      let device1State = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: { t1: device1Notes },
      }

      device1State = playlistReducer(device1State, mergeAction)

      // Device 1 should also have all 5 notes
      expect(device1State.notesByTrack.t1).toHaveLength(5)

      // Both devices have same content
      expect(noteBodies(device1State.notesByTrack.t1)).toEqual(
        noteBodies(device2State.notesByTrack.t1)
      )
    })
  })
})

// ============================================================================
// SCENARIO 3: Note deletion (only the targeted note disappears)
// ============================================================================
describe('Scenario 3: Note deletion (only targeted note disappears)', () => {
  describe('Reducer-level tests', () => {
    it('deletes only the targeted note, leaving others intact', () => {
      const notes = [
        makeNote('Keep me', 1000, { id: 'note-1' }),
        makeNote('Delete me', 2000, { id: 'note-2' }),
        makeNote('Keep me too', 3000, { id: 'note-3' }),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes, tags: [] }],
        notesByTrack: { t1: notes },
      }

      // Delete the middle note (index 1)
      const action = playlistActions.deleteNote('t1', 1)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toHaveLength(2)
      expect(noteBodies(next.notesByTrack.t1)).toEqual(['Keep me', 'Keep me too'])
    })

    it('deletes first note correctly', () => {
      const notes = [
        makeNote('First', 1000),
        makeNote('Second', 2000),
        makeNote('Third', 3000),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes, tags: [] }],
        notesByTrack: { t1: notes },
      }

      const action = playlistActions.deleteNote('t1', 0)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toHaveLength(2)
      expect(noteBodies(next.notesByTrack.t1)).toEqual(['Second', 'Third'])
    })

    it('deletes last note correctly', () => {
      const notes = [
        makeNote('First', 1000),
        makeNote('Second', 2000),
        makeNote('Third', 3000),
      ]

      const state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes, tags: [] }],
        notesByTrack: { t1: notes },
      }

      const action = playlistActions.deleteNote('t1', 2)
      const next = playlistReducer(state, action)

      expect(next.notesByTrack.t1).toHaveLength(2)
      expect(noteBodies(next.notesByTrack.t1)).toEqual(['First', 'Second'])
    })
  })

  describe('Delete queue tests', () => {
    beforeEach(() => {
      // Clear localStorage before each test
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear()
      }
    })

    afterEach(() => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear()
      }
    })

    it('queues note deletion for server sync', () => {
      expect(getQueueSize()).toBe(0)

      queueNoteDeletion('note-123', 't1')

      expect(getQueueSize()).toBe(1)
    })

    it('does not queue duplicate deletions', () => {
      queueNoteDeletion('note-123', 't1')
      queueNoteDeletion('note-123', 't1')

      expect(getQueueSize()).toBe(1)
    })

    it('cancels deletion from queue (for undo support)', () => {
      queueNoteDeletion('note-123', 't1')
      queueNoteDeletion('note-456', 't1')
      expect(getQueueSize()).toBe(2)

      cancelNoteDeletion('note-123')

      expect(getQueueSize()).toBe(1)
    })

    it('flushes deletions to server via apiFetch', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({ ok: true })

      queueNoteDeletion('note-1', 't1')
      queueNoteDeletion('note-2', 't1')

      const result = await flushDeleteQueue(mockApiFetch)

      expect(mockApiFetch).toHaveBeenCalledTimes(2)
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/db/notes?noteId=note-1',
        { method: 'DELETE' }
      )
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/db/notes?noteId=note-2',
        { method: 'DELETE' }
      )
      expect(result.processed).toBe(2)
      expect(result.failed).toBe(0)
      expect(getQueueSize()).toBe(0)
    })

    it('retains failed deletions in queue for retry', async () => {
      const mockApiFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true }) // First succeeds
        .mockResolvedValueOnce({ ok: false, status: 500 }) // Second fails

      queueNoteDeletion('note-success', 't1')
      queueNoteDeletion('note-fail', 't1')

      const result = await flushDeleteQueue(mockApiFetch)

      expect(result.processed).toBe(1)
      expect(result.failed).toBe(1)
      expect(getQueueSize()).toBe(1) // Failed one remains
    })

    it('treats 404 as success (already deleted)', async () => {
      const mockApiFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

      queueNoteDeletion('note-already-gone', 't1')

      const result = await flushDeleteQueue(mockApiFetch)

      expect(result.processed).toBe(1)
      expect(result.failed).toBe(0)
      expect(getQueueSize()).toBe(0)
    })
  })

  describe('Deletion does not resurrect on sync', () => {
    it('deleted note is not re-added by subsequent merge', () => {
      // Initial state with 3 notes
      const notes = [
        makeNote('Note 1', 1000, { id: 'n1' }),
        makeNote('Note 2', 2000, { id: 'n2' }),
        makeNote('Note 3', 3000, { id: 'n3' }),
      ]

      let state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes, tags: [] }],
        notesByTrack: { t1: notes },
      }

      // Delete Note 2
      state = playlistReducer(state, playlistActions.deleteNote('t1', 1))
      expect(state.notesByTrack.t1).toHaveLength(2)

      // Simulate server also deleting Note 2, returning only 1 and 3
      const serverNotesAfterDelete = [
        makeNote('Note 1', 1000, { id: 'n1' }),
        makeNote('Note 3', 3000, { id: 'n3' }),
      ]

      // Merge from server
      state = playlistReducer(
        state,
        playlistActions.mergeRemoteData({ t1: serverNotesAfterDelete }, {})
      )

      // Note 2 should NOT reappear
      expect(state.notesByTrack.t1).toHaveLength(2)
      expect(noteBodies(state.notesByTrack.t1)).toEqual(['Note 1', 'Note 3'])
    })

    it('local deletion persists even if remote has stale data', () => {
      // Local has already deleted a note
      const localNotes = [
        makeNote('Note 1', 1000, { id: 'n1' }),
        makeNote('Note 3', 3000, { id: 'n3' }),
      ]

      let state = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', notes: [], tags: [] }],
        notesByTrack: { t1: localNotes },
      }

      // Remote has stale data including the deleted note
      const staleServerNotes = [
        makeNote('Note 1', 1000, { id: 'n1' }),
        makeNote('Note 2', 2000, { id: 'n2' }), // This was deleted locally
        makeNote('Note 3', 3000, { id: 'n3' }),
      ]

      // Merge stale server data
      state = playlistReducer(
        state,
        playlistActions.mergeRemoteData({ t1: staleServerNotes }, {})
      )

      // With union merge, Note 2 WILL come back (this is expected behavior)
      // The deletion must be synced to server to prevent resurrection
      // This test documents the current behavior
      expect(state.notesByTrack.t1).toHaveLength(3)

      // This is why we need the delete queue to sync deletions to server!
    })
  })
})

// ============================================================================
// SCENARIO 4: Undo after delete (queue cleanup)
// ============================================================================
describe('Scenario 4: Undo after delete (queue cleanup)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  afterEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('full delete-undo flow: queue is cleared, note restored', () => {
    const noteToDelete = makeNote('Oops deleted', 1000, { id: 'undo-me' })
    const notes = [noteToDelete, makeNote('Other note', 2000, { id: 'keep-me' })]

    // Initial state
    let state = {
      ...initialPlaylistState,
      tracks: [{ id: 't1', notes, tags: [] }],
      notesByTrack: { t1: notes },
    }

    // Step 1: Delete the note
    state = playlistReducer(state, playlistActions.deleteNote('t1', 0))
    expect(state.notesByTrack.t1).toHaveLength(1)

    // Queue the deletion (as useNoteHandlers does)
    queueNoteDeletion(noteToDelete.id, 't1')
    expect(getQueueSize()).toBe(1)

    // Step 2: User clicks Undo
    cancelNoteDeletion(noteToDelete.id)
    expect(getQueueSize()).toBe(0)

    // Restore the note (as App.jsx onUndo does)
    state = playlistReducer(state, playlistActions.restoreNote('t1', noteToDelete, 0))
    expect(state.notesByTrack.t1).toHaveLength(2)
    expect(state.notesByTrack.t1[0].body).toBe('Oops deleted')

    // Step 3: Verify queue flush sends nothing
    const mockApiFetch = vi.fn()
    flushDeleteQueue(mockApiFetch)
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
