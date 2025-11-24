// src/features/filter/filterTracks.js
// Pure utilities for indexing, filtering, and sorting track lists.

import { getNoteBody } from '../../utils/notesTagsData.js'

const COLLATOR = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
  usage: 'sort',
});

export const SEARCH_SCOPE = Object.freeze({
  BOTH: 'both',
  TRACK: 'track',
  NOTES: 'notes',
});

export const SORT_KEY = Object.freeze({
  DATE: 'date',
  TITLE: 'title',
});

export const SORT_DIRECTION = Object.freeze({
  ASC: 'asc',
  DESC: 'desc',
});

export const DEFAULT_SORT = Object.freeze({
  key: SORT_KEY.DATE,
  direction: SORT_DIRECTION.ASC,
});

const SCOPE_LABELS = {
  [SEARCH_SCOPE.BOTH]: 'Both',
  [SEARCH_SCOPE.TRACK]: 'Track',
  [SEARCH_SCOPE.NOTES]: 'Notes',
};

/**
 * Normalize text for search by lower-casing and stripping diacritics.
 * @param {string} value
 */
function toSearchable(value = '') {
  if (!value) return '';
  try {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

/**
 * @param {any} track
 * @returns {{ id: string, trackText: string, notesText: string }}
 */
export function buildIndexEntry(track) {
  const id = track?.id != null ? String(track.id) : '';
  const trackText = [
    track?.title || '',
    track?.artist || '',
    track?.album || '',
  ]
    .filter(Boolean)
    .join(' ');
  const notesText = Array.isArray(track?.notes)
    ? track.notes
        .map((note) => getNoteBody(note))
        .filter(Boolean)
        .join(' ')
    : '';
  return {
    id,
    trackText: toSearchable(trackText),
    notesText: toSearchable(notesText),
  };
}

/**
 * @param {Array<any>} tracks
 * @returns {Map<string, ReturnType<typeof buildIndexEntry>>}
 */
export function buildIndexMap(tracks) {
  const map = new Map();
  if (!Array.isArray(tracks)) return map;
  tracks.forEach((track) => {
    if (!track || typeof track !== 'object') return;
    const entry = buildIndexEntry(track);
    if (entry.id) {
      map.set(entry.id, entry);
    }
  });
  return map;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function hasQuery(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {any} track
 * @returns {number}
 */
function resolveOriginalIndex(track) {
  const value = Number(track?.originalIndex);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * @param {any} track
 * @returns {number}
 */
function resolveDateValue(track) {
  const primary = Date.parse(track?.dateAdded ?? '');
  if (!Number.isNaN(primary)) return primary;
  const fallback = Date.parse(track?.importedAt ?? '');
  if (!Number.isNaN(fallback)) return fallback;
  return -Infinity;
}

/**
 * @param {Array<any>} tracks
 * @param {Map<string, ReturnType<typeof buildIndexEntry>>} indexMap
 * @param {{
 *   query?: string,
 *   scope?: string,
 *   selectedTags?: string[],
 *   hasNotesOnly?: boolean
 * }} options
 */
export function filterTracks(tracks, indexMap, options = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const query = typeof options.query === 'string' ? options.query.trim() : '';
  const scope = options.scope || SEARCH_SCOPE.BOTH;
  const normalizedQuery = toSearchable(query);
  const hasSearch = hasQuery(query);
  const selectedTags = Array.isArray(options.selectedTags)
    ? options.selectedTags.filter(Boolean)
    : [];
  const hasNotesOnly = Boolean(options.hasNotesOnly);

  return tracks.filter((track) => {
    if (!track || typeof track !== 'object') return false;

    if (hasNotesOnly) {
      const notesLength = Array.isArray(track.notes) ? track.notes.length : 0;
      if (notesLength === 0) return false;
    }

    if (selectedTags.length > 0) {
      const trackTags = Array.isArray(track.tags) ? track.tags : [];
      const matchesAll = selectedTags.every((tag) => trackTags.includes(tag));
      if (!matchesAll) return false;
    }

    if (!hasSearch) {
      return true;
    }

    const entry = indexMap.get(String(track.id)) ?? buildIndexEntry(track);
    if (scope === SEARCH_SCOPE.NOTES) {
      return entry.notesText.includes(normalizedQuery);
    }
    if (scope === SEARCH_SCOPE.TRACK) {
      return entry.trackText.includes(normalizedQuery);
    }
    return (
      entry.trackText.includes(normalizedQuery) ||
      entry.notesText.includes(normalizedQuery)
    );
  });
}

/**
 * @param {Array<any>} tracks
 * @param {{ key: string, direction: string }} sort
 */
export function sortTracks(tracks, sort = DEFAULT_SORT) {
  if (!Array.isArray(tracks) || tracks.length <= 1) {
    return Array.isArray(tracks) ? [...tracks] : [];
  }
  const key = sort?.key || SORT_KEY.DATE;
  const direction = sort?.direction === SORT_DIRECTION.ASC ? 1 : -1;

  const comparator =
    key === SORT_KEY.TITLE
      ? (a, b) => COLLATOR.compare(a?.title || '', b?.title || '')
      : (a, b) => resolveDateValue(a) - resolveDateValue(b);

  return [...tracks].sort((a, b) => {
    const base = comparator(a, b);
    if (base !== 0) {
      return base * direction;
    }
    return resolveOriginalIndex(a) - resolveOriginalIndex(b);
  });
}

/**
 * @param {{ key: string, direction: string }} sort
 */
export function describeSort(sort = DEFAULT_SORT) {
  const key = sort?.key || SORT_KEY.DATE;
  const dir = sort?.direction === SORT_DIRECTION.ASC ? SORT_DIRECTION.ASC : SORT_DIRECTION.DESC;
  if (key === SORT_KEY.TITLE) {
    return dir === SORT_DIRECTION.ASC ? 'Title A to Z' : 'Title Z to A';
  }
  return dir === SORT_DIRECTION.ASC
    ? 'Date added, oldest first'
    : 'Date added, newest first';
}

/**
 * @param {string} scope
 */
export function describeScope(scope) {
  return SCOPE_LABELS[scope] || SCOPE_LABELS[SEARCH_SCOPE.BOTH];
}
