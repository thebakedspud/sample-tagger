import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import focusById from '../../utils/focusById.js'
import SearchFilterBar from '../filter/SearchFilterBar.jsx'
import useTrackFilter from '../filter/useTrackFilter.js'
import { SORT_KEY } from '../filter/filterTracks.js'
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
 * @param {BackgroundSyncState} [props.backgroundSync]
 * @param {{ reason: string|null, ts: number }} [props.focusContext]
 * @param {boolean} [props.skipFocusManagement] - When true, the filter-aware focus management
 *   effect will not run. This is a one-shot guard used during initial imports to prevent
 *   PlaylistView from interfering with App's focus handoff. Consumers are responsible for
 *   managing their own focus when this flag is set, and must reset it to false after focus
 *   completes to restore normal filter-based focus management behavior.
 * @param {(trackId: string | null) => void} [props.onFirstVisibleTrackChange] - Callback invoked
 *   whenever the first visible track changes (due to sorting, filtering, or data updates).
 *   Receives the ID of the first track in the filtered/sorted list, or null if no tracks are
 *   visible. This enables App to focus the correct track even when adapter order differs from
 *   display order (e.g., oldest-to-newest import with newest-first sort).
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
  backgroundSync = DEFAULT_BACKGROUND_SYNC,
  focusContext,
  skipFocusManagement = false,
  onFirstVisibleTrackChange,
}) {
  const MOCK_PREFIX = 'MOCK DATA ACTIVE - '
  const hasMockPrefix = typeof playlistTitle === 'string' && playlistTitle.startsWith(MOCK_PREFIX)
  const cleanTitle = hasMockPrefix ? playlistTitle.slice(MOCK_PREFIX.length) : playlistTitle
  const showLoadMore = Boolean(importMeta?.hasMore && importMeta?.cursor)

  const searchInputRef = useRef(null)
  const lastFocusContextTsRef = useRef(null)
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
    canRestoreFilters,
    restoreFilters,
    dismissRestoreFilters,
  } = useTrackFilter({
    tracks,
    provider: importMeta?.provider ?? null,
    playlistId: importMeta?.playlistId ?? null,
    snapshotId: importMeta?.snapshotId ?? null,
    announce,
  })

  // Notify App of the first visible track ID for focus management.
  // This runs on every filteredTracks change to keep App's focus target in sync with the
  // actual display order (which may differ from import order due to sorting).
  useLayoutEffect(() => {
    if (onFirstVisibleTrackChange) {
      const firstId = filteredTracks[0]?.id ?? null
      onFirstVisibleTrackChange(firstId)
    }
  }, [filteredTracks, onFirstVisibleTrackChange])

  // Filter-aware focus management: restore focus when current track is hidden by filters.
  // IMPORTANT: This effect must not run when skipFocusManagement is true. During initial
  // imports, App sets this flag to prevent PlaylistView from interfering with its own
  // focus handoff. App is responsible for resetting the flag after focus completes.
  useEffect(() => {
    const contextTs = focusContext?.ts ?? null
    const contextReason = focusContext?.reason ?? null

    if (contextTs == null) {
      lastFocusContextTsRef.current = null
    } else if (contextTs !== lastFocusContextTsRef.current) {
      lastFocusContextTsRef.current = contextTs
      if (contextReason === 'background-load-more') {
        return
      }
    }

    if (skipFocusManagement) return // Exit early - App is handling focus

    if (!Array.isArray(tracks) || tracks.length === 0) return
    if (filteredTracks.length === 0) {
      searchInputRef.current?.focus()
      return
    }
    const active = document.activeElement
    if (active === document.body) {
      const firstId = filteredTracks[0]?.id
      if (firstId != null) {
        focusById(`add-note-btn-${firstId}`)
      }
      return
    }
    if (!active || typeof active.closest !== 'function') return
    const container = active.closest('[data-track-id]')
    if (!container) return
    const activeId = container.getAttribute('data-track-id')
    if (!activeId) return
    const stillVisible = filteredTracks.some((track) => String(track.id) === activeId)
    if (!stillVisible) {
      const firstId = filteredTracks[0]?.id
      if (firstId != null) {
        // Focus the Add note button instead of the container for consistency
        focusById(`add-note-btn-${firstId}`)
      }
    }
  }, [skipFocusManagement, filteredTracks, tracks, focusContext])

  const handleFilterTag = useCallback(
    (tag) => {
      if (!tag) return
      toggleTag(tag)
      searchInputRef.current?.focus()
    },
    [toggleTag],
  )

  const showFilteringBanner = showLoadMore && hasActiveFilters
  const isDateSort = sort?.key === SORT_KEY.DATE
  const loadingStatus = backgroundSync?.status ?? 'idle'
  const showBackgroundBanner =
    isDateSort && loadingStatus === 'loading' && showLoadMore
  const loadedLabel =
    typeof backgroundSync?.loaded === 'number'
      ? backgroundSync.loaded.toLocaleString()
      : ''
  const totalLabel =
    typeof backgroundSync?.total === 'number'
      ? backgroundSync.total.toLocaleString()
      : null
  const showBackgroundError =
    loadingStatus === 'error' && typeof backgroundSync?.lastError === 'string'

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

      {canRestoreFilters && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--surface)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span>Filters from your previous import are available.</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={restoreFilters}>
              Restore filters
            </button>
            <button type="button" className="btn" onClick={dismissRestoreFilters}>
              Dismiss
            </button>
          </span>
        </div>
      )}

      {showBackgroundBanner && (
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
          Loading more to complete “recently added” order…{' '}
          {totalLabel
            ? `(loaded ${loadedLabel} of ${totalLabel})`
            : `(loaded ${loadedLabel})`}
        </div>
      )}

      {showBackgroundError && (
        <div
          role="status"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--surface)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            color: 'var(--warning, #ffa726)',
          }}
        >
          Background sync paused: {backgroundSync.lastError}
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
