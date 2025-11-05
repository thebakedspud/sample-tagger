// src/features/playlist/__tests__/helpers.test.js

import { describe, it, expect } from 'vitest'
import {
  computeHasLocalNotes,
  computeAllCustomTags,
  validateTag,
  createNoteSnapshot,
  createTagSnapshot,
  attachNotesToTrack
} from '../helpers.js'

describe('playlist helpers', () => {
  describe('computeHasLocalNotes', () => {
    it('returns false when no notes or tags exist', () => {
      expect(computeHasLocalNotes({}, {})).toBe(false)
    })

    it('returns false when maps have empty arrays', () => {
      const notes = { t1: [] }
      const tags = { t1: [] }
      expect(computeHasLocalNotes(notes, tags)).toBe(false)
    })

    it('returns true when notes exist', () => {
      const notes = { t1: ['note'] }
      expect(computeHasLocalNotes(notes, {})).toBe(true)
    })

    it('returns true when tags exist', () => {
      const tags = { t1: ['tag'] }
      expect(computeHasLocalNotes({}, tags)).toBe(true)
    })

    it('returns true when both notes and tags exist', () => {
      const notes = { t1: ['note'] }
      const tags = { t2: ['tag'] }
      expect(computeHasLocalNotes(notes, tags)).toBe(true)
    })

    it('handles null/undefined inputs gracefully', () => {
      expect(computeHasLocalNotes(null, null)).toBe(false)
      expect(computeHasLocalNotes(undefined, undefined)).toBe(false)
    })
  })

  describe('computeAllCustomTags', () => {
    it('returns empty array when no tags exist', () => {
      expect(computeAllCustomTags({})).toEqual([])
    })

    it('extracts unique tags from multiple tracks', () => {
      /** @type {any} */
      const tags = {
        t1: ['rock', 'indie'],
        t2: ['rock', 'pop'],
        t3: ['indie']
      }
      const result = computeAllCustomTags(tags)
      expect(result).toEqual(['indie', 'pop', 'rock']) // sorted
    })

    it('handles duplicate tags across tracks', () => {
      const tags = {
        t1: ['rock'],
        t2: ['rock'],
        t3: ['rock']
      }
      expect(computeAllCustomTags(tags)).toEqual(['rock'])
    })

    it('returns sorted tags alphabetically', () => {
      const tags = {
        t1: ['zebra', 'alpha', 'beta']
      }
      expect(computeAllCustomTags(tags)).toEqual(['alpha', 'beta', 'zebra'])
    })

    it('handles null/undefined inputs gracefully', () => {
      expect(computeAllCustomTags(null)).toEqual([])
      expect(computeAllCustomTags(undefined)).toEqual([])
    })

    it('skips non-array values', () => {
      const tags = {
        t1: ['valid'],
        t2: null,
        t3: 'invalid',
        t4: ['also-valid']
      }
      // @ts-expect-error intentionally passing non-array values to verify guard rails
      expect(computeAllCustomTags(tags)).toEqual(['also-valid', 'valid'])
    })
  })

  describe('validateTag', () => {
    it('rejects empty tags', () => {
      const result = validateTag('')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('rejects whitespace-only tags', () => {
      const result = validateTag('   ')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('rejects tags exceeding max length', () => {
      const longTag = 'a'.repeat(51)
      const result = validateTag(longTag, [], 32, 50)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('50 characters')
    })

    it('rejects tags with invalid characters', () => {
      const result = validateTag('tag@invalid!')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('letters, numbers, spaces')
    })

    it('rejects duplicate tags (case-insensitive)', () => {
      const result = validateTag('Rock', ['rock'])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('already applied')
    })

    it('rejects when max tags limit reached', () => {
      const existingTags = Array(32).fill('tag')
      const result = validateTag('new-tag', existingTags, 32)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Maximum of 32 tags')
    })

    it('returns normalized tag on success', () => {
      const result = validateTag(' Test-Tag ')
      expect(result.valid).toBe(true)
      expect(result.normalized).toBe('test-tag')
    })

    it('accepts tags with valid characters (letters, numbers, spaces, hyphen, underscore)', () => {
      const validTags = [
        'rock',
        'Rock Music',
        'rock-music',
        'rock_music',
        'rock123',
        '2024-hits'
      ]

      validTags.forEach(tag => {
        const result = validateTag(tag)
        expect(result.valid).toBe(true)
        expect(result.normalized).toBeDefined()
      })
    })

    it('uses default values when optional params not provided', () => {
      // Should use MAX_TAGS_PER_TRACK and MAX_TAG_LENGTH from validation.js
      const result = validateTag('valid-tag')
      expect(result.valid).toBe(true)
    })
  })

  describe('createNoteSnapshot', () => {
    it('creates snapshot with existing notes', () => {
      const notesByTrack = {
        t1: ['note1', 'note2']
      }
      const snapshot = createNoteSnapshot(notesByTrack, 't1')
      
      expect(snapshot).toEqual({
        trackId: 't1',
        previousNotes: ['note1', 'note2']
      })
    })

    it('creates snapshot with empty array when no notes exist', () => {
      const snapshot = createNoteSnapshot({}, 't1')
      
      expect(snapshot).toEqual({
        trackId: 't1',
        previousNotes: []
      })
    })

    it('creates new array (not reference) for immutability', () => {
      const notesByTrack = {
        t1: ['note1']
      }
      const snapshot = createNoteSnapshot(notesByTrack, 't1')
      
      // Mutate snapshot
      snapshot.previousNotes.push('note2')
      
      // Original should be unchanged
      expect(notesByTrack.t1).toEqual(['note1'])
    })

    it('handles non-array values gracefully', () => {
      const notesByTrack = {
        t1: 'invalid'
      }
      // @ts-expect-error intentionally passing a non-array to validate guard rails
      const snapshot = createNoteSnapshot(notesByTrack, 't1')
      
      expect(snapshot.previousNotes).toEqual([])
    })
  })

  describe('createTagSnapshot', () => {
    it('creates snapshot with existing tags', () => {
      const tagsByTrack = {
        t1: ['rock', 'indie']
      }
      const snapshot = createTagSnapshot(tagsByTrack, 't1')
      
      expect(snapshot).toEqual({
        trackId: 't1',
        previousTags: ['rock', 'indie']
      })
    })

    it('creates snapshot with empty array when no tags exist', () => {
      const snapshot = createTagSnapshot({}, 't1')
      
      expect(snapshot).toEqual({
        trackId: 't1',
        previousTags: []
      })
    })

    it('creates new array (not reference) for immutability', () => {
      const tagsByTrack = {
        t1: ['rock']
      }
      const snapshot = createTagSnapshot(tagsByTrack, 't1')
      
      // Mutate snapshot
      snapshot.previousTags.push('indie')
      
      // Original should be unchanged
      expect(tagsByTrack.t1).toEqual(['rock'])
    })
  })

  describe('attachNotesToTrack', () => {
    it('attaches notes and tags to track object', () => {
      const track = { id: 't1', title: 'Track 1' }
      const notesByTrack = { t1: ['note1'] }
      const tagsByTrack = { t1: ['rock'] }
      
      const result = attachNotesToTrack(track, notesByTrack, tagsByTrack)
      
      expect(result).toEqual({
        id: 't1',
        title: 'Track 1',
        notes: ['note1'],
        tags: ['rock']
      })
    })

    it('attaches empty arrays when no notes/tags exist', () => {
      const track = { id: 't1', title: 'Track 1' }
      
      const result = attachNotesToTrack(track, {}, {})
      
      expect(result).toEqual({
        id: 't1',
        title: 'Track 1',
        notes: [],
        tags: []
      })
    })

    it('creates new object (immutability)', () => {
      const track = { id: 't1', title: 'Track 1' }
      const notesByTrack = { t1: ['note1'] }
      const tagsByTrack = { t1: ['rock'] }
      
      const result = attachNotesToTrack(track, notesByTrack, tagsByTrack)
      
      expect(result).not.toBe(track)
      expect(result.notes).toBe(notesByTrack.t1) // References same array
      expect(result.tags).toBe(tagsByTrack.t1) // References same array
    })

    it('preserves all original track properties', () => {
      const track = {
        id: 't1',
        title: 'Track 1',
        artist: 'Artist',
        durationMs: 180000,
        custom: 'property'
      }
      
      const result = attachNotesToTrack(track, {}, {})
      
      expect(result.id).toBe('t1')
      expect(result.title).toBe('Track 1')
      expect(result.artist).toBe('Artist')
      expect(result.durationMs).toBe(180000)
      expect(result.custom).toBe('property')
    })
  })
})
