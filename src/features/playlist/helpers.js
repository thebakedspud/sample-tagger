// src/features/playlist/helpers.js

/**
 * Pure helper functions for playlist state computations.
 * No side effects, fully synchronous, easy to test.
 */

import { normalizeTag } from '../tags/tagUtils.js'
import { MAX_TAG_LENGTH, MAX_TAGS_PER_TRACK, TAG_ALLOWED_RE } from '../tags/validation.js'

/**
 * Check if any notes or tags exist across all tracks
 * @param {Record<string, string[]>} notesByTrack
 * @param {Record<string, string[]>} tagsByTrack
 * @returns {boolean}
 */
export function computeHasLocalNotes(notesByTrack, tagsByTrack) {
  const hasNotes = Object.values(notesByTrack || {}).some(
    (notes) => Array.isArray(notes) && notes.length > 0
  )
  if (hasNotes) return true

  return Object.values(tagsByTrack || {}).some(
    (tags) => Array.isArray(tags) && tags.length > 0
  )
}

/**
 * Extract sorted unique tags from all tracks
 * @param {Record<string, string[]>} tagsByTrack
 * @returns {string[]}
 */
export function computeAllCustomTags(tagsByTrack) {
  const tagSet = new Set()
  Object.values(tagsByTrack || {}).forEach((tags) => {
    if (!Array.isArray(tags)) return
    tags.forEach((tag) => tagSet.add(tag))
  })
  return Array.from(tagSet).sort()
}

/**
 * Validate tag against constraints
 * @param {string} tag - Raw tag input
 * @param {string[]} existingTags - Current tags for the track
 * @param {number} maxTags - Maximum tags per track
 * @param {number} maxLength - Maximum tag length
 * @returns {{ valid: boolean, normalized?: string, error?: string }}
 */
export function validateTag(tag, existingTags = [], maxTags = MAX_TAGS_PER_TRACK, maxLength = MAX_TAG_LENGTH) {
  const normalized = normalizeTag(tag)

  if (!normalized) {
    return { valid: false, error: 'Tag cannot be empty.' }
  }

  if (normalized.length > maxLength) {
    return { valid: false, error: `Tags must be ${maxLength} characters or fewer.` }
  }

  if (!TAG_ALLOWED_RE.test(normalized)) {
    return { valid: false, error: 'Tags can only include letters, numbers, spaces, hyphen, or underscore.' }
  }

  if (existingTags.length >= maxTags) {
    return { valid: false, error: `Maximum of ${maxTags} tags reached for this track.` }
  }

  if (existingTags.includes(normalized)) {
    return { valid: false, error: `Tag "${normalized}" already applied.` }
  }

  return { valid: true, normalized }
}

/**
 * Create rollback snapshot for note operations
 * @param {Record<string, string[]>} notesByTrack
 * @param {string} trackId
 * @returns {{ trackId: string, previousNotes: string[] }}
 */
export function createNoteSnapshot(notesByTrack, trackId) {
  const notes = notesByTrack[trackId]
  return {
    trackId,
    previousNotes: Array.isArray(notes) ? [...notes] : []
  }
}

/**
 * Create rollback snapshot for tag operations
 * @param {Record<string, string[]>} tagsByTrack
 * @param {string} trackId
 * @returns {{ trackId: string, previousTags: string[] }}
 */
export function createTagSnapshot(tagsByTrack, trackId) {
  const tags = tagsByTrack[trackId]
  return {
    trackId,
    previousTags: Array.isArray(tags) ? [...tags] : []
  }
}

/**
 * Attach notes and tags to a track object
 * @param {Object} track
 * @param {Record<string, string[]>} notesByTrack
 * @param {Record<string, string[]>} tagsByTrack
 * @returns {Object}
 */
export function attachNotesToTrack(track, notesByTrack, tagsByTrack) {
  const notes = notesByTrack[track.id] || []
  const tags = tagsByTrack[track.id] || []
  return { ...track, notes, tags }
}

