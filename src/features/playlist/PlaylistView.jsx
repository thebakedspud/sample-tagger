import { useCallback, useEffect, useMemo, useRef } from 'react'
import focusById from '../../utils/focusById.js'
import SearchFilterBar from '../filter/SearchFilterBar.jsx'
import useTrackFilter from '../filter/useTrackFilter.js'
import TrackCard from './TrackCard.jsx'

/**
 * @param {object} props
 * @param {string} props.playlistTitle
 * @param {string|null} props.importedAt
 * @param {object} props.importMeta
 * @param {Array} props.tracks
 * @param {boolean} props.isAnyImportBusy
 * @param {boolean} props.showReimportSpinner
 * @param {boolean} props.showLoadMoreSpinner
 * @param {Map<string, any>} props.pending
 * @param {(id: string) => boolean} props.isPending
 * @param {{ editingId: string|number|null, draft: string, error: string|null }} props.editingState
 * @param {(value: string) => void} props.onDraftChange
 * @param {(trackId: string|number) => void} props.onAddNote
 * @param {(trackId: string|number) => void} props.onSaveNote
 * @param {() => void} props.onCancelNote
 * @param {(trackId: string|number, noteIndex: number) => void} props.onDeleteNote
 * @param {(trackId: string|number, tag: string) => boolean} props.onAddTag
 * @param {(trackId: string|number, tag: string) => void} props.onRemoveTag
 * @param {(pendingId: string) => void} props.onUndo
 * @param {(pendingId: string) => void} props.onDismissUndo
 * @param {() => void} props.onReimport
 * @param {() => void} props.onClear
 * @param {() => void} props.onBack
 * @param {boolean} props.canReimport
 * @param {import('react').RefObject<HTMLButtonElement>} props.reimportBtnRef
 * @param {import('react').RefObject<HTMLButtonElement>} props.loadMoreBtnRef
 * @param {() => void} props.onLoadMore
 * @param {string[]} props.stockTags
 * @param {string[]} props.customTags
 * @param {(message: string) => void} props.announce
 */
export default function PlaylistView({
  playlistTitle,
  importedAt,
  importMeta,
  tracks,
  isAnyImportBusy,
  showReimportSpinner,
  showLoadMoreSpinner,
  pending,
  isPending,
  editingState,
  onDraftChange,
  onAddNote,
  onSaveNote,
  onCancelNote,
  onDeleteNote,
  onAddTag,
  onRemoveTag,
  onUndo,
  onDismissUndo,
  onReimport,
  onClear,
  onBack,
  canReimport,
  reimportBtnRef,
  loadMoreBtnRef,
  onLoadMore,
  stockTags,
  customTags,
  announce,
}) {
  const MOCK_PREFIX = 'MOCK DATA ACTIVE - '
  const hasMockPrefix = typeof playlistTitle === 'string' && playlistTitle.startsWith(MOCK_PREFIX)
  const cleanTitle = hasMockPrefix ? playlistTitle.slice(MOCK_PREFIX.length) : playlistTitle
  const showLoadMore = Boolean(importMeta?.hasMore && importMeta?.cursor)

  const searchInputRef = useRef(null)
  const availableTags = useMemo(() => {
    const bucket = new Set()
    if (Array.isArray(stockTags)) {
      stockTags.forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) bucket.add(tag)
      })
    }
    if (Array.isArray(customTags)) {
      customTags.forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) bucket.add(tag)
      })
    }
    return Array.from(bucket).sort((a, b) => a.localeCompare(b))
  }, [stockTags, customTags])

  const {
    query,
    setQuery,
    scope,
    setScope,
    sort,
    setSort,
    selectedTags,
    toggleTag,
    hasNotesOnly,
    setHasNotesOnly,
    filteredTracks,
    totalCount,
    filteredCount,
    hasActiveFilters,
    clearFilters,
    summaryText,
    emptyMessage,
  } = useTrackFilter({
    tracks,
    provider: importMeta?.provider ?? null,
    playlistId: importMeta?.playlistId ?? null,
    snapshotId: importMeta?.snapshotId ?? null,
    announce,
  })

  useEffect(() => {
    if (!Array.isArray(tracks) || tracks.length === 0) return
    if (filteredTracks.length === 0) {
      searchInputRef.current?.focus()
      return
    }
    const active = document.activeElement
    if (!active || typeof active.closest !== 'function') return
    const container = active.closest('[data-track-id]')
    if (!container) return
    const activeId = container.getAttribute('data-track-id')
    if (!activeId) return
    const stillVisible = filteredTracks.some((track) => String(track.id) === activeId)
    if (!stillVisible) {
      const firstId = filteredTracks[0]?.id
      if (firstId != null) {
        focusById(`track-${firstId}`)
      }
    }
  }, [filteredTracks, tracks])

  const handleFilterTag = useCallback(
    (tag) => {
      if (!tag) return
      toggleTag(tag)
      searchInputRef.current?.focus()
    },
    [toggleTag],
  )

  const showFilteringBanner = showLoadMore && hasActiveFilters

  return (
    <section aria-labelledby="playlist-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 id="playlist-title" aria-label={cleanTitle} style={{ marginTop: 0, marginBottom: 0 }}>
            {hasMockPrefix && <span aria-hidden="true">{MOCK_PREFIX}</span>}
            {cleanTitle}
          </h1>
          {importedAt && (
            <span className="chip">
              {totalCount} tracks - imported {new Date(importedAt).toLocaleDateString()}{' '}
              {new Date(importedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canReimport && (
            <button
              type="button"
              ref={reimportBtnRef}
              className="btn"
              onClick={onReimport}
              aria-label="Re-import this playlist"
              disabled={isAnyImportBusy}
              aria-busy={showReimportSpinner ? 'true' : 'false'}
            >
              {showReimportSpinner ? 'Re-importing...' : 'Re-import'}
            </button>
          )}
          <button type="button" className="btn" onClick={onClear} aria-label="Clear all data">
            Clear
          </button>
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      <SearchFilterBar
        query={query}
        onQueryChange={setQuery}
        scope={scope}
        onScopeChange={setScope}
        sort={sort}
        onSortChange={setSort}
        hasNotesOnly={hasNotesOnly}
        onHasNotesToggle={setHasNotesOnly}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        availableTags={availableTags}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        summaryText={summaryText}
        filteredCount={filteredCount}
        totalCount={totalCount}
        searchInputRef={searchInputRef}
      />

      {showFilteringBanner && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--surface)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          Filtering {filteredCount} of {tracks.length} loaded. Load more to widen search.
        </div>
      )}

      {filteredTracks.length === 0 ? (
        <div
          role="status"
          style={{
            padding: 24,
            border: '1px dashed var(--border)',
            borderRadius: 8,
            textAlign: 'center',
            color: 'var(--muted)',
            marginBottom: 16,
          }}
        >
          {emptyMessage || 'No matches. Try clearing filters.'}
        </div>
      ) : (
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {filteredTracks.map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              index={index}
              pending={pending}
              isPending={isPending}
              editingState={editingState}
              onDraftChange={onDraftChange}
              onAddNote={onAddNote}
              onSaveNote={onSaveNote}
              onCancelNote={onCancelNote}
              onDeleteNote={onDeleteNote}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              stockTags={stockTags}
              customTags={customTags}
              onUndo={onUndo}
              onDismissUndo={onDismissUndo}
              onFilterTag={handleFilterTag}
            />
          ))}
        </ul>
      )}

      {showLoadMore && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            ref={loadMoreBtnRef}
            className="btn"
            onClick={onLoadMore}
            disabled={isAnyImportBusy}
            aria-busy={showLoadMoreSpinner ? 'true' : 'false'}
          >
            {showLoadMoreSpinner ? 'Loading more...' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  )
}
