/**
 * Track Processing Utilities
 * Pure functions for processing and enriching track objects
 *
 * These utilities handle timestamp normalization and track enrichment,
 * attaching notes/tags from maps while preserving metadata from previous
 * track states. All functions are pure (no side effects).
 *
 * @module utils/trackProcessing
 */

import { hasOwn, normalizeNotesList, normalizeTagList } from './notesTagsData.js'

// ===== SECTION 1: Timestamp Utilities =====

/**
 * Normalizes various timestamp formats to Unix milliseconds (integer)
 *
 * Accepts numbers (milliseconds), Date objects, or ISO strings,
 * and converts them to integer milliseconds. Returns null for invalid input.
 * Useful for normalizing timestamps from APIs, user input, or localStorage.
 *
 * @param {number | Date | string | null | undefined} value - Timestamp value
 * @returns {number | null} Unix milliseconds (integer) or null if invalid
 *
 * @example
 * normalizeTimestamp(1699999999999) // => 1699999999999
 * normalizeTimestamp(new Date('2024-01-01')) // => 1704067200000
 * normalizeTimestamp('2024-01-01T00:00:00Z') // => 1704067200000
 * normalizeTimestamp(null) // => null
 * normalizeTimestamp('invalid') // => null
 */
export function normalizeTimestamp(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? Math.trunc(ms) : null
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : Math.trunc(parsed)
  }
  return null
}

// ===== SECTION 2: Track Enrichment =====

/**
 * Attaches notes and tags to tracks from separate maps
 *
 * Enriches track objects with:
 * - Notes array from notesMap (or track.notes fallback)
 * - Tags array from tagsMap (or track.tags fallback)
 * - importedAt timestamp (preserved from previousTracks or normalized from options)
 * - originalIndex (sequential, preserved from previousTracks or auto-assigned)
 *
 * Uses previousTracks Map to preserve metadata across reimports/refreshes.
 * Tracks are matched by id; mismatches get fresh metadata.
 *
 * This function is critical for maintaining data integrity during:
 * - Initial playlist imports
 * - Playlist reimports (refreshing data from source)
 * - Pagination (loading more tracks)
 * - Data restoration from backups
 *
 * @param {Array<object>} trackList - New tracks to enrich
 * @param {Record<string, import('./notesTagsData.js').NoteEntry[]>} notesMap - Map of trackId to notes array
 * @param {Record<string, string[]>} tagsMap - Map of trackId to tags array
 * @param {Array<object>} [previousTracks=[]] - Previous track state for metadata preservation
 * @param {object} [options={}] - Enrichment options
 * @param {number | Date | string | null} [options.importStamp] - Default timestamp for new tracks
 * @param {number} [options.originalIndexSeed] - Starting index for new tracks (auto-calculated if omitted)
 * @returns {Array<object>} Enriched tracks with notes, tags, importedAt, originalIndex
 *
 * @example
 * // Initial import (no previous tracks)
 * const tracks = [
 *   { id: 'track-1', title: 'Song 1', artist: 'Artist A' },
 *   { id: 'track-2', title: 'Song 2', artist: 'Artist B' }
 * ]
 * const notes = { 'track-1': ['Great track!', 'Love the melody'] }
 * const tags = { 'track-1': ['rock', 'classic'], 'track-2': ['pop'] }
 * const enriched = attachNotesToTracks(tracks, notes, tags, [], {
 *   importStamp: Date.now()
 * })
 * // Result:
 * // [
 * //   {
 * //     id: 'track-1',
 * //     title: 'Song 1',
 * //     artist: 'Artist A',
 * //     notes: ['Great track!', 'Love the melody'],
 * //     tags: ['classic', 'rock'],
 * //     importedAt: '2024-01-01T12:00:00.000Z',
 * //     originalIndex: 0
 * //   },
 * //   {
 * //     id: 'track-2',
 * //     title: 'Song 2',
 * //     artist: 'Artist B',
 * //     notes: [],
 * //     tags: ['pop'],
 * //     importedAt: '2024-01-01T12:00:00.000Z',
 * //     originalIndex: 1
 * //   }
 * // ]
 *
 * @example
 * // Reimport with metadata preservation
 * const previousTracks = [
 *   {
 *     id: 'track-1',
 *     title: 'Song 1',
 *     importedAt: '2024-01-01T10:00:00.000Z',
 *     originalIndex: 0
 *   }
 * ]
 * const newTracks = [
 *   { id: 'track-1', title: 'Song 1 (Remastered)' } // Title changed at source
 * ]
 * const enriched = attachNotesToTracks(newTracks, {}, {}, previousTracks, {
 *   importStamp: Date.now()
 * })
 * // Result: track-1 keeps its original importedAt (2024-01-01T10:00:00.000Z)
 * // and originalIndex (0), but gets updated title
 */
export function attachNotesToTracks(trackList, notesMap, tagsMap, previousTracks = [], options = {}) {
  if (!Array.isArray(trackList)) return [];
  const safeMap = notesMap || Object.create(null);
  const safeTags = tagsMap || Object.create(null);
  const prevList = Array.isArray(previousTracks) ? previousTracks : [];
  /** @type {Map<string, any>} */
  const prevMap = new Map();
  prevList.forEach((prevTrack) => {
    if (!prevTrack || typeof prevTrack !== 'object') return;
    const id = prevTrack.id;
    if (id == null) return;
    const key = typeof id === 'string' || typeof id === 'number' ? String(id) : null;
    if (!key) return;
    prevMap.set(key, prevTrack);
  });

  const baseStampMs = normalizeTimestamp(options.importStamp);
  const fallbackStamp =
    baseStampMs != null ? new Date(baseStampMs).toISOString() : new Date().toISOString();

  const seed = Number.isFinite(options.originalIndexSeed)
    ? Math.round(options.originalIndexSeed)
    : prevList.reduce((max, item) => {
        const value =
          typeof item?.originalIndex === 'number' && Number.isFinite(item.originalIndex)
            ? item.originalIndex
            : -1;
        return value > max ? value : max;
      }, -1) + 1;

  let nextOriginalIndex = seed;

  return trackList.map((track) => {
    if (!track || typeof track !== 'object') return track;
    const id = track.id;
    const key = typeof id === 'string' || typeof id === 'number' ? String(id) : null;
    const prev = key ? prevMap.get(key) : null;
    const mappedNotes =
      key && hasOwn(safeMap, key)
        ? normalizeNotesList(safeMap[key])
        : normalizeNotesList(track.notes);
    const mappedTags =
      key && hasOwn(safeTags, key) ? [...safeTags[key]] : normalizeTagList(track.tags);

    let importedAtIso =
      typeof prev?.importedAt === 'string' && prev.importedAt.trim() ? prev.importedAt : null;
    if (!importedAtIso) {
      const candidateStamp = normalizeTimestamp(
        track?.importedAt ?? options.importStamp ?? fallbackStamp,
      );
      if (candidateStamp != null) {
        importedAtIso = new Date(candidateStamp).toISOString();
      }
    }
    if (!importedAtIso) {
      importedAtIso = fallbackStamp;
    }

    let originalIndex =
      typeof prev?.originalIndex === 'number' && Number.isFinite(prev.originalIndex)
        ? Math.round(prev.originalIndex)
        : null;
    if (originalIndex == null) {
      const candidate = Number(track?.originalIndex);
      if (Number.isFinite(candidate)) {
        originalIndex = Math.round(candidate);
      }
    }
    if (originalIndex == null) {
      originalIndex = nextOriginalIndex;
      nextOriginalIndex += 1;
    }

    return {
      ...track,
      notes: mappedNotes,
      tags: mappedTags,
      importedAt: importedAtIso,
      originalIndex,
    };
  });
}
