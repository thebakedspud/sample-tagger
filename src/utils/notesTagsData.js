/**
 * Notes and Tags Data Utilities
 * Pure functions for manipulating notes/tags data structures
 *
 * These utilities provide immutable operations for notes and tags maps,
 * including normalization, cloning, initialization, maintenance, and syncing.
 * All functions are pure (no side effects) and can be used independently.
 *
 * @module utils/notesTagsData
 */

import { normalizeTag } from '../features/tags/tagUtils.js'
import { MAX_TAG_LENGTH, MAX_TAGS_PER_TRACK, TAG_ALLOWED_RE } from '../features/tags/validation.js'

// ===== SECTION 1: Foundation Utilities =====

/**
 * Safe hasOwnProperty check
 * Avoids prototype chain pollution by using Object.prototype.hasOwnProperty directly
 *
 * @param {object} map - Object to check
 * @param {string} key - Key to check for
 * @returns {boolean} True if object has own property with given key
 */
export function hasOwn(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/**
 * Safe accessor for track notes array
 * Returns empty array if notes property is missing or invalid
 *
 * @param {object} t - Track object
 * @returns {string[]} Notes array (empty if missing or invalid)
 */
export function getNotes(t) {
  return Array.isArray(t?.notes) ? t.notes : [];
}

// ===== SECTION 2: Notes Normalization =====

/**
 * Validates and cleans notes array
 * Filters out non-string values and empty/whitespace-only notes
 *
 * @param {any} value - Raw notes value (expected to be array)
 * @returns {string[]} Cleaned notes array with trimmed strings
 */
export function normalizeNotesList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const out = [];
  value.forEach((note) => {
    if (typeof note !== 'string') return;
    const trimmed = note.trim();
    if (!trimmed) return;
    out.push(trimmed);
  });
  return out;
}

/**
 * Deep clones notes map with normalization
 * Creates new object with null prototype and validates all entries
 * Skips tracks with empty notes arrays
 *
 * @param {Record<string, string[]>} source - Source notes map
 * @returns {Record<string, string[]>} Cloned and normalized map
 */
export function cloneNotesMap(source) {
  const out = Object.create(null);
  if (!source || typeof source !== 'object') return out;
  Object.entries(source).forEach(([key, raw]) => {
    const id = typeof key === 'string' ? key : String(key);
    if (!id) return;
    const cleaned = normalizeNotesList(raw);
    if (cleaned.length > 0) {
      out[id] = cleaned;
    }
  });
  return out;
}

// ===== SECTION 3: Tags Normalization =====

/**
 * Validates, normalizes, and deduplicates tags
 *
 * Applies the following transformations:
 * - Normalizes each tag (lowercase, trim)
 * - Filters out invalid characters (must match TAG_ALLOWED_RE)
 * - Enforces max length (MAX_TAG_LENGTH)
 * - Deduplicates tags
 * - Limits to MAX_TAGS_PER_TRACK
 * - Sorts alphabetically
 *
 * @param {any} value - Raw tags value (expected to be array)
 * @returns {string[]} Cleaned, sorted, deduplicated tags array (max 32 tags)
 */
export function normalizeTagList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  value.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized || normalized.length > MAX_TAG_LENGTH) return;
    if (!TAG_ALLOWED_RE.test(normalized)) return;
    if (seen.has(normalized)) return;
    if (out.length >= MAX_TAGS_PER_TRACK) return;
    seen.add(normalized);
    out.push(normalized);
  });
  out.sort();
  return out;
}

/**
 * Deep clones tags map with normalization
 * Creates new object with null prototype and validates all entries
 * Skips tracks with empty tags arrays
 *
 * @param {Record<string, string[]>} source - Source tags map
 * @returns {Record<string, string[]>} Cloned and normalized map
 */
export function cloneTagsMap(source) {
  const out = Object.create(null);
  if (!source || typeof source !== 'object') return out;
  Object.entries(source).forEach(([key, raw]) => {
    const id = typeof key === 'string' ? key : String(key);
    if (!id) return;
    const cleaned = normalizeTagList(raw);
    if (cleaned.length > 0) {
      out[id] = cleaned;
    }
  });
  return out;
}

// ===== SECTION 4: Map Initialization =====

/**
 * Bootstraps notes map from persisted state
 * Merges notes from state.notesByTrack and state.tracks arrays
 * Used during app initialization to reconstruct notes map from localStorage
 *
 * @param {object} state - Persisted state object (from localStorage)
 * @returns {Record<string, string[]>} Initial notes map with all notes from state
 */
export function createInitialNotesMap(state) {
  const fromState = cloneNotesMap(state?.notesByTrack);
  if (Array.isArray(state?.tracks)) {
    state.tracks.forEach((track) => {
      if (!track || typeof track !== 'object') return;
      const id = track.id;
      if (!id || hasOwn(fromState, id)) return;
      const cleaned = normalizeNotesList(track.notes);
      if (cleaned.length > 0) {
        fromState[id] = cleaned;
      }
    });
  }
  return fromState;
}

/**
 * Bootstraps tags map from persisted state
 * Merges tags from state.tagsByTrack and state.tracks arrays
 * Used during app initialization to reconstruct tags map from localStorage
 *
 * @param {object} state - Persisted state object (from localStorage)
 * @returns {Record<string, string[]>} Initial tags map with all tags from state
 */
export function createInitialTagsMap(state) {
  const fromState = cloneTagsMap(state?.tagsByTrack);
  if (Array.isArray(state?.tracks)) {
    state.tracks.forEach((track) => {
      if (!track || typeof track !== 'object') return;
      const id = track.id;
      if (!id || hasOwn(fromState, id)) return;
      const cleaned = normalizeTagList(track.tags);
      if (cleaned.length > 0) {
        fromState[id] = cleaned;
      }
    });
  }
  return fromState;
}

// ===== SECTION 5: Map Maintenance =====

/**
 * Ensures all tracks have entries in notes map
 * Adds empty arrays for tracks missing from the map
 * Used to maintain referential consistency between tracks and notes
 *
 * @param {Record<string, string[]>} baseMap - Base notes map
 * @param {object[]} tracks - Track list
 * @returns {Record<string, string[]>} Updated notes map with entries for all tracks
 */
export function ensureNotesEntries(baseMap, tracks) {
  const next = cloneNotesMap(baseMap);
  if (!Array.isArray(tracks)) return next;
  tracks.forEach((track) => {
    if (!track || typeof track !== 'object') return;
    const id = track.id;
    if (!id || hasOwn(next, id)) return;
    next[id] = [];
  });
  return next;
}

/**
 * Ensures all tracks have entries in tags map
 * Adds empty arrays for tracks missing from the map
 * Used to maintain referential consistency between tracks and tags
 *
 * @param {Record<string, string[]>} baseMap - Base tags map
 * @param {object[]} tracks - Track list
 * @returns {Record<string, string[]>} Updated tags map with entries for all tracks
 */
export function ensureTagsEntries(baseMap, tracks) {
  const next = cloneTagsMap(baseMap);
  if (!Array.isArray(tracks)) return next;
  tracks.forEach((track) => {
    if (!track || typeof track !== 'object') return;
    const id = track.id;
    if (!id || hasOwn(next, id)) return;
    next[id] = [];
  });
  return next;
}

// ===== SECTION 6: Remote Data Merging =====

/**
 * Parses API response rows into notes/tags maps
 * Handles both trackId and track_id field names from API responses
 * Groups multiple notes for the same track into arrays
 *
 * @param {object[]} rows - API response rows (from /api/db/notes GET)
 * @returns {{ notes: Record<string, string[]>, tags: Record<string, string[]> }} Parsed notes and tags maps
 *
 * @example
 * const rows = [
 *   { trackId: '123', body: 'Great track!', tags: ['rock', 'classic'] },
 *   { trackId: '123', body: 'Love the solo', tags: null }
 * ]
 * const { notes, tags } = groupRemoteNotes(rows)
 * // notes = { '123': ['Great track!', 'Love the solo'] }
 * // tags = { '123': ['rock', 'classic'] }
 */
export function groupRemoteNotes(rows) {
  const noteMap = Object.create(null);
  const tagMap = Object.create(null);
  if (!Array.isArray(rows)) return { notes: noteMap, tags: tagMap };
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const trackId =
      typeof row.trackId === 'string' ? row.trackId : row.track_id;
    if (!trackId) return;
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    if (body) {
      if (!Array.isArray(noteMap[trackId])) noteMap[trackId] = [];
      noteMap[trackId].push(body);
    }
    if ('tags' in row) {
      const cleaned = normalizeTagList(row.tags);
      tagMap[trackId] = cleaned;
    }
  });
  return { notes: noteMap, tags: tagMap };
}

/**
 * Merges remote notes with local notes map
 * Remote notes only replace local notes if local entry is empty or missing
 * Preserves existing local notes to avoid data loss
 *
 * @param {Record<string, string[]>} localMap - Local notes map
 * @param {Record<string, string[]>} remoteMap - Remote notes map from API
 * @returns {Record<string, string[]>} Merged notes map (local takes precedence if non-empty)
 */
export function mergeRemoteNotes(localMap, remoteMap) {
  const merged = cloneNotesMap(localMap);
  Object.entries(remoteMap).forEach(([trackId, remoteNotes]) => {
    if (!Array.isArray(remoteNotes) || remoteNotes.length === 0) return;
    if (!hasOwn(merged, trackId) || merged[trackId].length === 0) {
      merged[trackId] = [...remoteNotes];
    }
  });
  return merged;
}

/**
 * Merges remote tags with local tags map
 * Remote tags always replace local tags (remote is canonical source)
 *
 * @param {Record<string, string[]>} localMap - Local tags map
 * @param {Record<string, string[]>} remoteMap - Remote tags map from API
 * @returns {Record<string, string[]>} Merged tags map (remote always wins)
 */
export function mergeRemoteTags(localMap, remoteMap) {
  const merged = cloneTagsMap(localMap);
  Object.entries(remoteMap).forEach(([trackId, remoteTags]) => {
    merged[trackId] = Array.isArray(remoteTags) ? [...remoteTags] : [];
  });
  return merged;
}

// ===== SECTION 7: Map Updates =====

/**
 * Immutably updates notes map for a specific track
 * Creates new map with updated/deleted entry for the track
 * Removes entry entirely if notes array becomes empty
 *
 * @param {Record<string, string[]>} baseMap - Base notes map
 * @param {string} trackId - Track ID to update
 * @param {string[]} nextNotes - New notes array for the track
 * @returns {Record<string, string[]>} Updated notes map (new object)
 */
export function updateNotesMap(baseMap, trackId, nextNotes) {
  const map = cloneNotesMap(baseMap);
  if (!trackId) return map;
  if (Array.isArray(nextNotes) && nextNotes.length > 0) {
    map[trackId] = [...nextNotes];
  } else if (hasOwn(map, trackId)) {
    delete map[trackId];
  }
  return map;
}

/**
 * Immutably updates tags map for a specific track
 * Creates new map with updated/deleted entry for the track
 * Removes entry entirely if tags array becomes empty
 *
 * @param {Record<string, string[]>} baseMap - Base tags map
 * @param {string} trackId - Track ID to update
 * @param {string[]} nextTags - New tags array for the track
 * @returns {Record<string, string[]>} Updated tags map (new object)
 */
export function updateTagsMap(baseMap, trackId, nextTags) {
  const map = cloneTagsMap(baseMap);
  if (!trackId) return map;
  if (Array.isArray(nextTags) && nextTags.length > 0) {
    map[trackId] = [...nextTags];
  } else if (hasOwn(map, trackId)) {
    delete map[trackId];
  }
  return map;
}
