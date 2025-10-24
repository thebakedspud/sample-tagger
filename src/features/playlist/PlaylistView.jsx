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
}) {
  const MOCK_PREFIX = 'MOCK DATA ACTIVE - '
  const hasMockPrefix = typeof playlistTitle === 'string' && playlistTitle.startsWith(MOCK_PREFIX)
  const cleanTitle = hasMockPrefix ? playlistTitle.slice(MOCK_PREFIX.length) : playlistTitle
  const showLoadMore = Boolean(importMeta?.hasMore && importMeta?.cursor)

  return (
    <section aria-labelledby="playlist-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 id="playlist-title" aria-label={cleanTitle} style={{ marginTop: 0, marginBottom: 0 }}>
            {hasMockPrefix && <span aria-hidden="true">{MOCK_PREFIX}</span>}
            {cleanTitle}
          </h2>
          {importedAt && (
            <span className="chip">
              {tracks.length} tracks - imported {new Date(importedAt).toLocaleDateString()}{' '}
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

      <ul style={{ padding: 0, listStyle: 'none' }}>
        {tracks.map((track, index) => (
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
          />
        ))}
      </ul>

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
