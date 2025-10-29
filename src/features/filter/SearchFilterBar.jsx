// src/features/filter/SearchFilterBar.jsx
// UI for search, scope selection, sort menu, tag filters, and clear action.

import { useMemo, useCallback } from 'react';
import {
  SEARCH_SCOPE,
  SORT_KEY,
  SORT_DIRECTION,
  describeSort,
} from './filterTracks.js';

const SCOPE_OPTIONS = [
  { value: SEARCH_SCOPE.BOTH, label: 'Both' },
  { value: SEARCH_SCOPE.TRACK, label: 'Track' },
  { value: SEARCH_SCOPE.NOTES, label: 'Notes' },
];

const SORT_OPTIONS = [
  {
    value: `${SORT_KEY.DATE}:${SORT_DIRECTION.DESC}`,
    label: 'Date added - newest first',
  },
  {
    value: `${SORT_KEY.DATE}:${SORT_DIRECTION.ASC}`,
    label: 'Date added - oldest first',
  },
  {
    value: `${SORT_KEY.TITLE}:${SORT_DIRECTION.ASC}`,
    label: 'Title - A to Z',
  },
  {
    value: `${SORT_KEY.TITLE}:${SORT_DIRECTION.DESC}`,
    label: 'Title - Z to A',
  },
];

/**
 * @param {object} props
 * @param {string} props.query
 * @param {(value: string) => void} props.onQueryChange
 * @param {string} props.scope
 * @param {(value: string) => void} props.onScopeChange
 * @param {{ key: string, direction: string }} props.sort
 * @param {(value: { key: string, direction: string }) => void} props.onSortChange
 * @param {boolean} props.hasNotesOnly
 * @param {(value: boolean) => void} props.onHasNotesToggle
 * @param {string[]} props.selectedTags
 * @param {(tag: string) => void} props.onToggleTag
 * @param {string[]} props.availableTags
 * @param {boolean} props.hasActiveFilters
 * @param {() => void} props.onClearFilters
 * @param {string} props.summaryText
 * @param {number} props.filteredCount
 * @param {number} props.totalCount
 * @param {import('react').RefObject<HTMLInputElement>} props.searchInputRef
 */
export default function SearchFilterBar({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  sort,
  onSortChange,
  hasNotesOnly,
  onHasNotesToggle,
  selectedTags = [],
  onToggleTag,
  availableTags = [],
  hasActiveFilters,
  onClearFilters,
  summaryText,
  filteredCount,
  totalCount,
  searchInputRef,
}) {
  const sortValue = useMemo(
    () => `${sort?.key || SORT_KEY.DATE}:${sort?.direction || SORT_DIRECTION.DESC}`,
    [sort],
  );

  const handleSortChange = useCallback(
    (event) => {
      const value = event.target.value;
      const [key, direction] = value.split(':');
      onSortChange({
        key: key === SORT_KEY.TITLE ? SORT_KEY.TITLE : SORT_KEY.DATE,
        direction: direction === SORT_DIRECTION.ASC ? SORT_DIRECTION.ASC : SORT_DIRECTION.DESC,
      });
    },
    [onSortChange],
  );

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape' && query) {
        event.preventDefault();
        onQueryChange('');
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef?.current?.focus();
      }
    },
    [query, onQueryChange, searchInputRef],
  );

  const handleScopeChange = useCallback(
    (event) => {
      onScopeChange(event.target.value);
    },
    [onScopeChange],
  );

  const handleToggleNoteFilter = useCallback(
    (event) => {
      onHasNotesToggle(event.target.checked);
    },
    [onHasNotesToggle],
  );

  const handleTagChange = useCallback(
    (event) => {
      onToggleTag(event.target.value);
    },
    [onToggleTag],
  );

  const sortLabel = useMemo(() => describeSort(sort), [sort]);

  return (
    <section
      aria-label="Track filters"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          searchInputRef?.current?.focus();
        }
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="filter-search" style={{ fontWeight: 600 }}>
          Search tracks, artists, notes
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            id="filter-search"
            ref={searchInputRef}
            type="search"
            value={query}
            placeholder="Search tracks, artists, notes..."
            aria-label="Search tracks, artists, notes"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{
              flex: '1 1 auto',
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--fg)',
            }}
          />
          {query ? (
            <button
              type="button"
              className="btn"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <fieldset
        style={{
          border: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <legend style={{ fontWeight: 600 }}>Search in:</legend>
        <div style={{ display: 'flex', gap: 4 }}>
          {SCOPE_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 999,
                border: scope === value ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: scope === value ? 'var(--accent-muted)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="search-scope"
                value={value}
                checked={scope === value}
                onChange={handleScopeChange}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Sort</span>
          <select
            value={sortValue}
            onChange={handleSortChange}
            aria-label={`Sort tracks (${sortLabel})`}
            style={{
              minWidth: 200,
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--fg)',
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={hasNotesOnly}
            onChange={handleToggleNoteFilter}
          />
          <span>Has notes</span>
        </label>

        {availableTags.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Filter by tags</summary>
            <div
              style={{
                marginTop: 8,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 6,
              }}
            >
              {availableTags.map((tag) => (
                <label key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    value={tag}
                    checked={selectedTags.includes(tag)}
                    onChange={handleTagChange}
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          </details>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div aria-live="polite" aria-atomic="true">
          <strong>{summaryText}</strong>
          <span style={{ marginLeft: 8, color: 'var(--muted)' }}>
            (sorted by {sortLabel})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--muted)' }}>
            Showing {filteredCount} of {totalCount}
          </span>
          <button
            type="button"
            className="btn"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </button>
        </div>
      </div>
    </section>
  );
}
