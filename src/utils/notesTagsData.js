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

// @ts-check

import { normalizeTag } from '../features/tags/tagUtils.js'
import { MAX_TAG_LENGTH, MAX_TAGS_PER_TRACK, TAG_ALLOWED_RE } from '../features/tags/validation.js'

/**
 * @typedef {Object} NoteEntry
 * @property {string} body
 * @property {number} createdAt
 * @property {number | null | undefined} [timestampMs]
 * @property {number | null | undefined} [timestampEndMs]
 * @property {string | undefined} [id] - Server-assigned UUID (present after sync)
 */

/** @typedef {Record<string, NoteEntry[]>} NotesByTrack */
/** @typedef {Record<string, NoteEntry[] | string[]>} NotesInput */

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

function coerceCreatedAt(value, fallback) {
  if (isFiniteNumber(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return Math.trunc(parsed)
    }
  }
  return fallback
}

function coerceTimestampMs(value) {
  if (isFiniteNumber(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return undefined
}

/**
 * @param {any} value
 * @param {number} fallbackTs
 * @returns {NoteEntry | null}
 */
function normalizeNoteEntry(value, fallbackTs) {
  if (typeof value === 'string') {
    const body = value.trim()
    if (!body) return null
    return {
      body,
      createdAt: fallbackTs,
    }
  }
  if (value && typeof value === 'object') {
    const candidate = /** @type {Partial<NoteEntry> & Record<string, unknown>} */ (value)
    const rawBody = typeof candidate.body === 'string' ? candidate.body : ''
    const body = rawBody.trim()
    if (!body) return null
    const createdAt = coerceCreatedAt(
      /** @type {number | string | null | undefined} */ (
        candidate.createdAt ?? candidate.created_at
      ),
      fallbackTs,
    )
    const timestampMs = coerceTimestampMs(
      /** @type {number | string | null | undefined} */ (
        candidate.timestampMs ?? candidate.timestamp_ms
      ),
    )
    const timestampEndMs = coerceTimestampMs(
      /** @type {number | string | null | undefined} */ (
        candidate.timestampEndMs ?? candidate.timestamp_end_ms
      ),
    )
    /** @type {NoteEntry} */
    const entry = {
      body,
      createdAt,
    }
    if (timestampMs != null) {
      entry.timestampMs = timestampMs
      if (typeof timestampEndMs === 'number' && timestampEndMs >= timestampMs) {
        entry.timestampEndMs = timestampEndMs
      }
    }
    // Preserve server-assigned id if present
    if (typeof candidate.id === 'string' && candidate.id) {
      entry.id = candidate.id
    }
    return entry
  }
  return null
}

/**
 * Returns the textual body of a note entry (legacy strings supported)
 * @param {NoteEntry | string | undefined | null} note
 * @returns {string}
 */
export function getNoteBody(note) {
  if (typeof note === 'string') return note
  if (note && typeof note === 'object' && typeof note.body === 'string') {
    return note.body
  }
  return ''
}

/**
 * Create a shallow clone of a note entry, normalizing legacy values
 * @param {NoteEntry | string} note
 * @returns {NoteEntry | null}
 */
export function cloneNoteEntry(note) {
  const fallback = Date.now()
  const normalized = normalizeNoteEntry(note, fallback)
  if (!normalized) return null
  /** @type {NoteEntry} */
  const clone = {
    body: normalized.body,
    createdAt: normalized.createdAt,
    ...(normalized.timestampMs != null ? { timestampMs: normalized.timestampMs } : {}),
  }
  if (
    normalized.timestampMs != null &&
    typeof normalized.timestampEndMs === 'number' &&
    normalized.timestampEndMs >= normalized.timestampMs
  ) {
    clone.timestampEndMs = normalized.timestampEndMs
  }
  return clone
}

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
 * @returns {NoteEntry[]} Notes array (empty if missing or invalid)
 */
export function getNotes(t) {
  return normalizeNotesList(t?.notes);
}

// ===== SECTION 2: Notes Normalization =====

/**
 * Validates and cleans notes array
 * Filters out non-string values and empty/whitespace-only notes
 *
 * @param {any} value - Raw notes value (expected to be array)
 * @returns {NoteEntry[]} Cleaned notes array with normalized entries
 */
export function normalizeNotesList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {NoteEntry[]} */
  const out = [];
  value.forEach((note) => {
    const normalized = normalizeNoteEntry(note, Date.now());
    if (normalized) {
      out.push({
        ...(normalized.id ? { id: normalized.id } : {}),
        body: normalized.body,
        createdAt: normalized.createdAt,
        ...(normalized.timestampMs != null ? { timestampMs: normalized.timestampMs } : {}),
        ...(normalized.timestampMs != null &&
        typeof normalized.timestampEndMs === 'number' &&
        normalized.timestampEndMs >= normalized.timestampMs
          ? { timestampEndMs: normalized.timestampEndMs }
          : {}),
      });
    }
  });
  return out;
}

/**
 * Deep clones notes map with normalization
 * Creates new object with null prototype and validates all entries
 * Skips tracks with empty notes arrays
 *
 * @param {NotesInput} source - Source notes map
 * @returns {NotesByTrack} Cloned and normalized map
 */
/** @type {(source: Record<string, NoteEntry[] | string[]>) => NotesByTrack} */
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
 * @returns {NotesByTrack} Initial notes map with all notes from state
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
 * @param {NotesInput} baseMap - Base notes map
 * @param {object[]} tracks - Track list
 * @returns {NotesByTrack} Updated notes map with entries for all tracks
 */
/** @type {(baseMap: Record<string, NoteEntry[] | string[]>, tracks: object[]) => NotesByTrack} */
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
 * @returns {{ notes: NotesByTrack, tags: Record<string, string[]> }} Parsed notes and tags maps
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
      const note = normalizeNoteEntry(
        {
          id: row.id,
          body,
          createdAt: row.createdAt ?? row.created_at,
          timestampMs: row.timestampMs ?? row.timestamp_ms,
          timestampEndMs: row.timestampEndMs ?? row.timestamp_end_ms,
        },
        Date.now(),
      )
      if (note) {
        if (!Array.isArray(noteMap[trackId])) noteMap[trackId] = [];
        noteMap[trackId].push(note);
      }
    }
    if ('tags' in row) {
      const cleaned = normalizeTagList(row.tags);
      if (!Array.isArray(tagMap[trackId])) {
        tagMap[trackId] = cleaned;
      } else {
        // Union tags from multiple rows (e.g., from different devices)
        const existing = new Set(tagMap[trackId].map(t => t.toLowerCase()));
        cleaned.forEach((tag) => {
          if (!existing.has(tag.toLowerCase())) {
            existing.add(tag.toLowerCase());
            tagMap[trackId].push(tag);
          }
        });
      }
    }
  });
  // Sort tags alphabetically for consistency
  Object.keys(tagMap).forEach((trackId) => {
    tagMap[trackId].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  });
  return { notes: noteMap, tags: tagMap };
}

/**
 * Generates a content-based signature for note deduplication.
 * Uses body + createdAt + timestampMs to identify equivalent notes.
 * @param {NoteEntry} note
 * @returns {string}
 */
function getNoteSignature(note) {
  const body = note.body || ''
  const createdAt = note.createdAt || 0
  const timestampMs = note.timestampMs ?? ''
  return `${body}\0${createdAt}\0${timestampMs}`
}

/**
 * Merges remote notes with local notes map using union merge.
 * Combines both local and remote notes, deduplicating by content signature.
 * Notes are sorted by createdAt after merging.
 *
 * @param {Record<string, NoteEntry[] | string[]>} localMap - Local notes map
 * @param {Record<string, NoteEntry[] | string[]>} remoteMap - Remote notes map from API
 * @returns {NotesByTrack} Merged notes map (union of local and remote)
 */
export function mergeRemoteNotes(localMap, remoteMap) {
  const merged = cloneNotesMap(localMap);
  Object.entries(remoteMap).forEach(([trackId, remoteNotes]) => {
    const cleanedRemote = normalizeNotesList(remoteNotes);
    if (cleanedRemote.length === 0) return;
    
    if (!hasOwn(merged, trackId) || merged[trackId].length === 0) {
      // No local notes - use remote directly, sorted by createdAt
      const sorted = [...cleanedRemote].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      merged[trackId] = sorted;
    } else {
      // Union merge: combine local and remote, deduplicate by content
      const localNotes = merged[trackId];
      const seenSignatures = new Set(localNotes.map(getNoteSignature));
      const combined = [...localNotes];
      
      cleanedRemote.forEach((remoteNote) => {
        const sig = getNoteSignature(remoteNote);
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          combined.push(remoteNote);
        }
      });
      
      // Sort by createdAt (oldest first)
      combined.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      merged[trackId] = combined;
    }
  });
  return merged;
}

/**
 * Merges remote tags with local tags map using union merge.
 * Combines both local and remote tags, deduplicating by normalized tag string.
 * Tags are sorted alphabetically after merging.
 *
 * @param {Record<string, string[]>} localMap - Local tags map
 * @param {Record<string, string[]>} remoteMap - Remote tags map from API
 * @returns {Record<string, string[]>} Merged tags map (union of local and remote)
 */
export function mergeRemoteTags(localMap, remoteMap) {
  const merged = cloneTagsMap(localMap);
  Object.entries(remoteMap).forEach(([trackId, remoteTags]) => {
    const cleanedRemote = Array.isArray(remoteTags) ? remoteTags : [];
    if (!hasOwn(merged, trackId) || merged[trackId].length === 0) {
      // No local tags - normalize, deduplicate, and sort remote tags
      const seen = new Set();
      const normalized = [];
      cleanedRemote.forEach((tag) => {
        const trimmed = tag.trim().toLowerCase();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          normalized.push(trimmed);
        }
      });
      normalized.sort((a, b) => a.localeCompare(b));
      merged[trackId] = normalized;
    } else {
      // Union merge: combine local and remote, deduplicate
      const localTags = merged[trackId];
      const seen = new Set(localTags.map(t => t.toLowerCase()));
      const combined = [...localTags];
      
      cleanedRemote.forEach((tag) => {
        const normalized = tag.toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          combined.push(tag);
        }
      });
      
      // Sort alphabetically
      combined.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      merged[trackId] = combined;
    }
  });
  return merged;
}

// ===== SECTION 7: Map Updates =====

/**
 * Immutably updates notes map for a specific track
 * Creates new map with updated/deleted entry for the track
 * Removes entry entirely if notes array becomes empty
 *
 * @param {Record<string, NoteEntry[] | string[]>} baseMap - Base notes map
 * @param {string} trackId - Track ID to update
 * @param {(NoteEntry | string)[]} nextNotes - New notes array for the track
 * @returns {NotesByTrack} Updated notes map (new object)
 */
export function updateNotesMap(baseMap, trackId, nextNotes) {
  const map = cloneNotesMap(baseMap);
  if (!trackId) return map;
  const cleaned = normalizeNotesList(nextNotes);
  if (cleaned.length > 0) {
    map[trackId] = cleaned;
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
