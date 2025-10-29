// src/features/filter/useTrackFilter.js
// React hook wiring filtering, sorting, persistence, and announcements.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SEARCH_SCOPE,
  SORT_KEY,
  SORT_DIRECTION,
  DEFAULT_SORT,
  buildIndexMap,
  filterTracks,
  sortTracks,
  describeScope,
  describeSort,
} from './filterTracks.js';

const STORAGE_PREFIX = 'sta:v5:filters';

const DEFAULT_FILTER_STATE = {
  query: '',
  scope: SEARCH_SCOPE.BOTH,
  selectedTags: [],
  hasNotesOnly: false,
};

function buildStorageKey(provider, playlistId, snapshotId) {
  if (!provider || !playlistId) return null;
  const parts = [STORAGE_PREFIX, provider, playlistId];
  if (snapshotId) {
    parts.push(snapshotId);
  }
  return parts.join(':');
}

function safeLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

function normalizeScope(value) {
  if (value === SEARCH_SCOPE.TRACK || value === SEARCH_SCOPE.NOTES) {
    return value;
  }
  return SEARCH_SCOPE.BOTH;
}

function normalizeSort(sort) {
  const key = sort?.key === SORT_KEY.TITLE ? SORT_KEY.TITLE : SORT_KEY.DATE;
  const direction =
    sort?.direction === SORT_DIRECTION.ASC ? SORT_DIRECTION.ASC : SORT_DIRECTION.DESC;
  return { key, direction };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  tags.forEach((tag) => {
    if (typeof tag !== 'string') return;
    const trimmed = tag.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  });
  return out;
}

function loadStoredState(key) {
  const storage = safeLocalStorage();
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      scope: normalizeScope(parsed.scope),
      sort: normalizeSort(parsed.sort),
      selectedTags: normalizeTags(parsed.selectedTags),
      hasNotesOnly: Boolean(parsed.hasNotesOnly),
    };
  } catch {
    return null;
  }
}

function persistState(key, state) {
  const storage = safeLocalStorage();
  if (!storage || !key) return;
  try {
    storage.setItem(
      key,
      JSON.stringify({
        ...state,
        lastUsedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore quota errors
  }
}

function clearStoredState(key) {
  const storage = safeLocalStorage();
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

function computeEmptyMessage(tracks, filteredCount, scope) {
  const total = Array.isArray(tracks) ? tracks.length : 0;
  if (total === 0) return '';
  if (filteredCount > 0) return '';
  if (
    scope === SEARCH_SCOPE.NOTES &&
    !tracks.some(
      (track) => Array.isArray(track?.notes) && track.notes.length > 0,
    )
  ) {
    return 'No notes yet - switch scope or add notes.';
  }
  return 'No matches. Try clearing filters.';
}

/**
 * @param {{
 *   tracks: any[],
 *   provider?: string | null,
 *   playlistId?: string | null,
 *   snapshotId?: string | null,
 *   announce?: (message: string) => void,
 * }} params
 */
export default function useTrackFilter({
  tracks,
  provider,
  playlistId,
  snapshotId,
  announce,
}) {
  const storageKey = useMemo(
    () => buildStorageKey(provider, playlistId, snapshotId),
    [provider, playlistId, snapshotId],
  );

  const stored = useMemo(() => loadStoredState(storageKey), [storageKey]);

  const [query, setQuery] = useState(stored?.query ?? DEFAULT_FILTER_STATE.query);
  const [scope, setScope] = useState(stored?.scope ?? DEFAULT_FILTER_STATE.scope);
  const [sort, setSortState] = useState(
    stored?.sort ? normalizeSort(stored.sort) : normalizeSort(DEFAULT_SORT),
  );
  const [selectedTags, setSelectedTags] = useState(
    stored?.selectedTags ?? DEFAULT_FILTER_STATE.selectedTags,
  );
  const [hasNotesOnly, setHasNotesOnly] = useState(
    stored?.hasNotesOnly ?? DEFAULT_FILTER_STATE.hasNotesOnly,
  );

  // Rehydrate when playlist context changes.
  useEffect(() => {
    if (!storageKey) {
      setQuery(DEFAULT_FILTER_STATE.query);
      setScope(DEFAULT_FILTER_STATE.scope);
      setSortState(normalizeSort(DEFAULT_SORT));
      setSelectedTags([]);
      setHasNotesOnly(DEFAULT_FILTER_STATE.hasNotesOnly);
      return;
    }
    const next = loadStoredState(storageKey);
    if (!next) {
      setQuery(DEFAULT_FILTER_STATE.query);
      setScope(DEFAULT_FILTER_STATE.scope);
      setSortState(normalizeSort(DEFAULT_SORT));
      setSelectedTags([]);
      setHasNotesOnly(DEFAULT_FILTER_STATE.hasNotesOnly);
      return;
    }
    setQuery(next.query);
    setScope(next.scope);
    setSortState(next.sort);
    setSelectedTags(next.selectedTags);
    setHasNotesOnly(next.hasNotesOnly);
  }, [storageKey]);

  const [debouncedQuery, setDebouncedQuery] = useState(() => query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const indexMap = useMemo(() => buildIndexMap(tracks), [tracks]);

  const filtered = useMemo(() => {
    const results = filterTracks(tracks, indexMap, {
      query: debouncedQuery,
      scope,
      selectedTags,
      hasNotesOnly,
    });
    return sortTracks(results, sort);
  }, [tracks, indexMap, debouncedQuery, scope, selectedTags, hasNotesOnly, sort]);

  const totalCount = Array.isArray(tracks) ? tracks.length : 0;
  const filteredCount = filtered.length;
  const liveSummary = useMemo(() => {
    const sortLabel = describeSort(sort);
    const scopeLabel = describeScope(scope);
    return `Showing ${filteredCount} of ${totalCount} tracks (sorted by ${sortLabel}; scope: ${scopeLabel}).`;
  }, [filteredCount, totalCount, sort, scope]);

  const announceReadyRef = useRef(false);
  useEffect(() => {
    if (!announce) return;
    if (totalCount === 0) return;
    if (!announceReadyRef.current) {
      announceReadyRef.current = true;
      return;
    }
    const handle = setTimeout(() => announce(liveSummary), 250);
    return () => clearTimeout(handle);
  }, [announce, liveSummary, totalCount]);

  useEffect(() => {
    if (!storageKey) return;
    persistState(storageKey, {
      query,
      scope,
      sort,
      selectedTags,
      hasNotesOnly,
    });
  }, [storageKey, query, scope, sort, selectedTags, hasNotesOnly]);

  const updateSort = useCallback((nextSort) => {
    setSortState(normalizeSort(nextSort));
  }, []);

  const toggleTag = useCallback((tag) => {
    if (typeof tag !== 'string') return;
    setSelectedTags((prev) => {
      const normalized = tag.trim();
      if (!normalized) return prev;
      if (prev.includes(normalized)) {
        return prev.filter((value) => value !== normalized);
      }
      return [...prev, normalized];
    });
  }, []);

  const clearFilters = useCallback(() => {
    setQuery(DEFAULT_FILTER_STATE.query);
    setScope(DEFAULT_FILTER_STATE.scope);
    setSortState(normalizeSort(DEFAULT_SORT));
    setSelectedTags([]);
    setHasNotesOnly(DEFAULT_FILTER_STATE.hasNotesOnly);
    if (storageKey) {
      clearStoredState(storageKey);
    }
  }, [storageKey]);

  const hasActiveFilters =
    (query && query.trim().length > 0) ||
    scope !== DEFAULT_FILTER_STATE.scope ||
    sort.key !== DEFAULT_SORT.key ||
    sort.direction !== DEFAULT_SORT.direction ||
    hasNotesOnly ||
    selectedTags.length > 0;

  const emptyMessage = computeEmptyMessage(tracks, filteredCount, scope);

  return {
    query,
    setQuery,
    debouncedQuery,
    scope,
    setScope: (value) => setScope(normalizeScope(value)),
    sort,
    setSort: updateSort,
    selectedTags,
    setSelectedTags,
    toggleTag,
    hasNotesOnly,
    setHasNotesOnly,
    filteredTracks: filtered,
    totalCount,
    filteredCount,
    hasActiveFilters,
    clearFilters,
    liveSummary,
    summaryText: `Showing ${filteredCount} of ${totalCount} tracks`,
    emptyMessage,
  };
}
