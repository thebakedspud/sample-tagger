// src/utils/__tests__/notesTagsData.test.js

import { describe, it, expect } from 'vitest'
import {
  normalizeNotesList,
  normalizeTagList,
  mergeRemoteNotes,
  mergeRemoteTags,
  groupRemoteNotes,
} from '../notesTagsData.js'

describe('notesTagsData utilities', () => {
  describe('normalizeNotesList', () => {
    it('handles mixed input types and preserves ids and timestamps', () => {
      const input = [
        '  simple note  ',
        {
          id: 'n-1',
          body: 'With createdAt string',
          createdAt: '2024-01-01T00:00:00Z',
          timestampMs: '30000',
          timestampEndMs: '45000',
        },
        {
          body: 'Missing createdAt falls back',
        },
        null,
        { body: '   ' },
      ]

      const result = normalizeNotesList(input)
      expect(result).toHaveLength(3)

      const withId = result.find((n) => n.id === 'n-1')
      expect(withId).toBeDefined()
      expect(withId.timestampMs).toBe(30000)
      expect(withId.timestampEndMs).toBe(45000)
    })
  })

  describe('mergeRemoteNotes', () => {
    it('sorts remote-only notes by createdAt when no local notes exist', () => {
      const local = {}
      const remote = {
        t1: [
          { body: 'Third', createdAt: 3000 },
          { body: 'First', createdAt: 1000 },
          { body: 'Second', createdAt: 2000 },
        ],
      }

      const merged = mergeRemoteNotes(local, remote)
      expect(merged.t1.map((n) => n.body)).toEqual(['First', 'Second', 'Third'])
    })

    it('handles createdAt ties by keeping all notes', () => {
      const local = {
        t1: [{ body: 'Base', createdAt: 1000 }],
      }
      const remote = {
        t1: [
          { body: 'Tie A', createdAt: 1000, timestampMs: 30000 },
          { body: 'Tie B', createdAt: 1000, timestampMs: 40000 },
        ],
      }

      const merged = mergeRemoteNotes(local, remote)
      expect(merged.t1).toHaveLength(3)
      const bodies = merged.t1.map((n) => n.body)
      expect(bodies).toContain('Tie A')
      expect(bodies).toContain('Tie B')
    })
  })

  describe('normalizeTagList and mergeRemoteTags', () => {
    it('normalizes casing, deduplicates, and sorts tags', () => {
      const raw = ['Rock', 'rock', ' ROCK ', 'metal', 'Metal']
      const normalized = normalizeTagList(raw)
      expect(normalized).toEqual(['metal', 'rock'])
    })

    it('merges remote tags into existing tags with normalization', () => {
      const local = { t1: ['rock'] }
      const remote = { t1: ['Rock', 'metal', 'Metal'] }

      const merged = mergeRemoteTags(local, remote)
      expect(merged.t1).toEqual(['metal', 'rock'])
    })
  })

  describe('groupRemoteNotes', () => {
    it('handles rows with and without tags and multiple tracks', () => {
      const rows = [
        { trackId: 't1', body: 'Note 1', tags: ['Rock'], createdAt: 1000 },
        { trackId: 't1', body: 'Note 2', tags: null, createdAt: 2000 },
        { trackId: 't2', body: 'Other track note', tags: ['metal'], createdAt: 1500 },
        { track_id: 't2', body: 'Legacy id field', tags: [], created_at: 1600 },
      ]

      const { notes, tags } = groupRemoteNotes(rows)

      expect(notes.t1.map((n) => n.body)).toEqual(['Note 1', 'Note 2'])
      expect(tags.t1).toEqual(['rock'])

      expect(notes.t2.map((n) => n.body)).toEqual(['Other track note', 'Legacy id field'])
      expect(tags.t2).toEqual(['metal'])
    })
  })
})

