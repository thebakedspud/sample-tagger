// src/features/filter/SearchFilterBar.jsx
// UI for search, scope selection, sort menu, tag filters, and clear action.

import { memo, useMemo, useCallback, useRef } from 'react';
import { focusElement } from '../../utils/focusById.js';
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
function SearchFilterBar({
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

  const scopeRefs = useRef(new Map());
  const requestScopeFocus = useCallback((value) => {
    const node = scopeRefs.current.get(value);
    if (node) {
      focusElement(node);
    }
  }, []);

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
        const searchInput = searchInputRef?.current;
        if (searchInput) {
          focusElement(searchInput);
        }
      }
    },
    [query, onQueryChange, searchInputRef],
  );

  const handleScopeChange = useCallback(
    (event) => {
      const nextValue = event.currentTarget.getAttribute('data-scope');
      if (!nextValue) return;
      onScopeChange(nextValue);
      requestScopeFocus(nextValue);
    },
    [onScopeChange, requestScopeFocus],
  );

  const handleScopeKeyDown = useCallback(
    (event) => {
      const activeValue = event.currentTarget.getAttribute('data-scope') || scope;
      const currentIndex = SCOPE_OPTIONS.findIndex((option) => option.value === activeValue);
      if (currentIndex === -1) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = SCOPE_OPTIONS[(currentIndex + 1) % SCOPE_OPTIONS.length];
        onScopeChange(next.value);
        requestScopeFocus(next.value);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next =
          (currentIndex - 1 + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length;
        const option = SCOPE_OPTIONS[next];
        onScopeChange(option.value);
        requestScopeFocus(option.value);
      } else if (event.key === 'Home') {
        event.preventDefault();
        const first = SCOPE_OPTIONS[0];
        onScopeChange(first.value);
        requestScopeFocus(first.value);
      } else if (event.key === 'End') {
        event.preventDefault();
        const last = SCOPE_OPTIONS[SCOPE_OPTIONS.length - 1];
        onScopeChange(last.value);
        requestScopeFocus(last.value);
      }
    },
    [onScopeChange, requestScopeFocus, scope],
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

  const handleTagKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onToggleTag(event.currentTarget.value);
      }
    },
    [onToggleTag],
  );

  const sortLabel = useMemo(() => describeSort(sort), [sort]);

  return (
    <section
      aria-label="Track filters"
      data-filter-bar="true"
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
          const searchInput = searchInputRef?.current;
          if (searchInput) {
            focusElement(searchInput);
          }
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

      <div>
        <span id="search-scope-label" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
          Search in:
        </span>
        <div
          role="radiogroup"
          aria-labelledby="search-scope-label"
          style={{ display: 'flex', gap: 4 }}
        >
          {SCOPE_OPTIONS.map(({ value, label }) => {
            const isActive = scope === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                value={value}
                aria-checked={isActive ? 'true' : 'false'}
                tabIndex={isActive ? 0 : -1}
                onClick={handleScopeChange}
                onKeyDown={handleScopeKeyDown}
                data-scope={value}
                ref={(node) => {
                  if (node) {
                    scopeRefs.current.set(value, node);
                  } else {
                    scopeRefs.current.delete(value);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 14px',
                  borderRadius: 999,
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--accent-muted)' : 'transparent',
                  color: 'var(--fg)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

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
                    onKeyDown={handleTagKeyDown}
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

export default memo(SearchFilterBar);
