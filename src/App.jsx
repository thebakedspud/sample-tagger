// src/App.jsx
import { useEffect, useState, useRef } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { loadAppState, saveAppState, clearAppState } from './utils/storage.js'
import { focusById } from './utils/focusById.js'
import './styles/tokens.css';
import './styles/primitives.css';
import './styles/app.css';
import useAnnounce from './features/a11y/useAnnounce.js'

// NEW: inline undo
import useInlineUndo from './features/undo/useInlineUndo.js'
import PlaylistView from './features/playlist/PlaylistView.jsx'

// Extracted helpers
import detectProvider from './features/import/detectProvider'
import usePlaylistImportFlow, { ImportFlowStatus } from './features/import/usePlaylistImportFlow.js'

// NEW: centralised error helpers/messages
import { extractErrorCode, CODES } from './features/import/adapters/types.js'
import { ERROR_MAP } from './features/import/errors.js'

// -- Derive initial state from storage (v3 structured: { importMeta, tracks, ... })
const persisted = loadAppState()
const HAS_VALID_PLAYLIST = !!(persisted?.importMeta?.provider && persisted?.tracks?.length)
const INITIAL_SCREEN = HAS_VALID_PLAYLIST ? 'playlist' : 'landing'

// Safe default importMeta shape (mirrors storage v3)
const EMPTY_IMPORT_META = {
  provider: null,
  playlistId: null,
  snapshotId: null,
  cursor: null,
  hasMore: false,
  sourceUrl: '',
  debug: null,
}

// Handy helper so we never explode on undefined notes
function getNotes(t) {
  return Array.isArray(t?.notes) ? t.notes : [];
}

export default function App() {
  // SIMPLE "ROUTING"
  const [screen, setScreen] = useState(INITIAL_SCREEN)

  const { message: announceMsg, announce } = useAnnounce({ debounceMs: 60 })

  // IMPORT state
  const [importUrl, setImportUrl] = useState('')
  const providerChip = detectProvider(importUrl || '')
  const [importError, setImportError] = useState(null)
  const importInputRef = useRef(null)
  // PLAYLIST META (local state; persisted via storage v3 importMeta)
  const [importMeta, setImportMeta] = useState(() => {
    const initialMeta = persisted?.importMeta ?? {}
    const sourceUrl = initialMeta.sourceUrl ?? (persisted?.lastImportUrl ?? '')
    return {
      ...EMPTY_IMPORT_META,
      ...initialMeta,
      sourceUrl,
      hasMore: Boolean(initialMeta.cursor || initialMeta.hasMore),
    }
  })
  const [playlistTitle, setPlaylistTitle] = useState(persisted?.playlistTitle ?? 'My Playlist')
  const [importedAt, setImportedAt] = useState(persisted?.importedAt ?? null)
  const [lastImportUrl, setLastImportUrl] = useState(
    persisted?.lastImportUrl ?? (persisted?.importMeta?.sourceUrl ?? '')
  )

  // DATA - normalize persisted tracks so notes always exist
  const [tracks, setTracks] = useState(
    (persisted?.tracks ?? []).map(t => ({ ...t, notes: getNotes(t) }))
  )

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)

  // Remember which button opened the editor
  const editorInvokerRef = useRef(null)

  const {
    pending,
    schedule: scheduleInlineUndo,
    undo: undoInline,
    expire: expireInline,
    isPending,
    clear: clearInlineUndo,
  } = useInlineUndo({
    timeoutMs: 600000,
    onUndo: (meta) => {
      if (!meta) return
      const { trackId, note, index, restoreFocusId, fallbackFocusId } = meta
      setTracks(prev =>
        prev.map(t => {
          if (t.id !== trackId) return t
          const notes = [...getNotes(t)]
          const insertAt = Math.min(Math.max(index, 0), notes.length + 1)
          if (note != null) {
            notes.splice(insertAt, 0, note)
          }
          return { ...t, notes }
        })
      )
      announce('Note restored')
      requestAnimationFrame(() => {
        if (restoreFocusId && document.getElementById(restoreFocusId)) {
          focusById(restoreFocusId)
        } else if (fallbackFocusId) {
          focusById(fallbackFocusId)
        }
      })
    },
    onExpire: (meta, _id, cause) => {
      const fallbackFocusId = meta?.fallbackFocusId
      const msg = cause === 'manual' ? 'Undo expired. Note deleted' : 'Note deleted'
      announce(msg)
      if (fallbackFocusId) {
        requestAnimationFrame(() => { focusById(fallbackFocusId) })
      }
    },
  })

  // REIMPORT focus pattern
  const reimportBtnRef = useRef(null)
  const loadMoreBtnRef = useRef(null)

  // -- PERSISTENCE: save whenever core state changes (v3 structured shape)
  useEffect(() => {
    saveAppState({
      playlistTitle,
      importedAt,
      lastImportUrl,
      tracks,
      importMeta,
    })
  }, [playlistTitle, importedAt, lastImportUrl, tracks, importMeta])

  // Safety: close editor if its track disappears or changes
  useEffect(() => {
    if (editingId == null) return
    if (!tracks.some(t => t.id === editingId)) {
      setEditingId(null); setDraft(''); setError(null)
    }
  }, [tracks, editingId])

  // 🔐 Safety: if you somehow land on the playlist screen with zero tracks, bounce to landing
  useEffect(() => {
    if (screen === 'playlist' && tracks.length === 0) {
      setScreen('landing')
    }
  }, [screen, tracks.length])

  // Ctrl/Cmd+Z undo
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        if (pending.size > 0) {
          e.preventDefault()
          undoInline()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending, undoInline])

  // ===== tiny extracted handlers =====
  function handleImportUrlChange(e) { setImportUrl(e.target.value); setImportError(null) }
  const handleDraftChange = (value) => { setDraft(value) }
  function handleBackToLanding() { setScreen('landing') }

  const {
    status: importStatus,
    loading: importLoading,
    importInitial,
    reimport: reimportPlaylist,
    loadMore: loadMoreTracks,
    resetFlow: resetImportFlow,
  } = usePlaylistImportFlow()

  const isInitialImportBusy = importStatus === ImportFlowStatus.IMPORTING
  const isReimportBusy = importStatus === ImportFlowStatus.REIMPORTING
  const isLoadMoreBusy = importStatus === ImportFlowStatus.LOADING_MORE
  const isAnyImportBusy = importStatus !== ImportFlowStatus.IDLE
  const showInitialSpinner = isInitialImportBusy && importLoading
  const showReimportSpinner = isReimportBusy && importLoading
  const showLoadMoreSpinner = isLoadMoreBusy && importLoading

  // Small helper to resolve a friendly message from a code
  function msgFromCode(code) {
    return ERROR_MAP[code] ?? ERROR_MAP[CODES.ERR_UNKNOWN] ?? 'Something went wrong. Please try again.'
  }

  // IMPORT handlers
  const handleImport = async (e) => {
    e?.preventDefault?.()
    setImportError(null)
    const trimmedUrl = importUrl.trim()

    if (!trimmedUrl) {
      const msg = 'Paste a playlist URL to import.'
      setImportError(msg)
      announce('Import failed. URL missing.')
      importInputRef.current?.focus(); importInputRef.current?.select()
      console.log('[import error]', { code: 'URL_MISSING', raw: null })
      return
    }

    if (!providerChip) {
      const msg = msgFromCode(CODES.ERR_UNSUPPORTED_URL)
      setImportError(msg)
      announce('Import failed. Unsupported URL.')
      importInputRef.current?.focus(); importInputRef.current?.select()
      console.log('[import error]', { code: CODES.ERR_UNSUPPORTED_URL, raw: null })
      return
    }

    announce('Import started.')
    try {
      const result = await importInitial(trimmedUrl, {
        providerHint: providerChip,
        sourceUrl: trimmedUrl,
      })

      if (result?.stale) return

      if (!result.ok) {
        const code = result.code ?? CODES.ERR_UNKNOWN
        const msg = msgFromCode(code)
        console.log('[import error]', { code, raw: result.error })
        setImportError(msg)
        announce('Import failed. ' + msg)
        importInputRef.current?.focus(); importInputRef.current?.select()
        return
      }

      const { tracks: mapped, meta, title, importedAt: importedTimestamp } = result.data
      setTracks(mapped)
      setImportMeta({
        ...EMPTY_IMPORT_META,
        ...meta,
      })
      setPlaylistTitle(title || 'Imported Playlist')
      setImportedAt(importedTimestamp)
      setLastImportUrl(trimmedUrl)
      setScreen('playlist')
      announce('Playlist imported. ' + mapped.length + ' tracks.')

      requestAnimationFrame(() => {
        if (mapped.length > 0) {
          focusById('add-note-btn-' + mapped[0].id)
        }
      })
    } catch (err) {
      if (err?.name === 'AbortError') return
      const code = extractErrorCode(err)
      const msg = msgFromCode(code)
      console.log('[import error]', { code, raw: err })
      setImportError(msg)
      announce('Import failed. ' + msg)
      importInputRef.current?.focus(); importInputRef.current?.select()
    }
  }

  const handleReimport = async () => {
    if (!lastImportUrl) return
    const wasActive = document.activeElement === reimportBtnRef.current
    setImportError(null)
    announce('Re-importing playlist.')
    try {
      const result = await reimportPlaylist(lastImportUrl, {
        providerHint: importMeta.provider ?? null,
        existingMeta: importMeta,
        fallbackTitle: playlistTitle,
      })

      if (result?.stale) return

      if (!result.ok) {
        const code = result.code ?? CODES.ERR_UNKNOWN
        const msg = msgFromCode(code)
        console.log('[reimport error]', { code, raw: result.error })
        setImportError(msg)
        announce(msg)
        if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
        return
      }

      const { tracks: mapped, meta, title, importedAt: importedTimestamp } = result.data
      setTracks(mapped)
      setImportMeta({
        ...EMPTY_IMPORT_META,
        ...meta,
      })
      setPlaylistTitle(title || playlistTitle || 'Imported Playlist')
      setImportedAt(importedTimestamp)
      announce('Playlist re-imported. ' + mapped.length + ' tracks available.')
      if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
    } catch (err) {
      if (err?.name === 'AbortError') {
        return
      }
      const code = extractErrorCode(err)
      const msg = msgFromCode(code)
      console.log('[reimport error]', { code, raw: err })
      setImportError(msg)
      announce(msg)
      if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
    }
  }

  const handleLoadMore = async () => {
    if (!importMeta.cursor || !importMeta.provider || !lastImportUrl) {
      return
    }

    setImportError(null)
    announce('Loading more tracks.')
    try {
      const existingIds = tracks.map(t => t.id)
      const result = await loadMoreTracks({
        providerHint: importMeta.provider ?? null,
        existingMeta: importMeta,
        startIndex: tracks.length,
        existingIds,
        sourceUrl: lastImportUrl,
      })

      if (result?.stale) return

      if (!result.ok) {
        const code = result.code ?? CODES.ERR_UNKNOWN
        const msg = msgFromCode(code)
        console.log('[load-more error]', { code, raw: result.error })
        setImportError(msg)
        announce(msg)
        return
      }

      const additions = result.data.tracks
      const meta = result.data.meta ?? {}

      if (!additions.length) {
        setImportMeta(prev => ({
          ...prev,
          ...meta,
        }))
        announce('No additional tracks available.')
        return
      }

      setTracks(prev => [...prev, ...additions])
      setImportMeta(prev => ({
        ...prev,
        ...meta,
      }))
      setImportedAt(new Date().toISOString())
      const firstNewId = additions[0]?.id
      if (firstNewId) {
        focusById(`track-${firstNewId}`)
      } else {
        requestAnimationFrame(() => {
          loadMoreBtnRef.current?.focus()
        })
      }
      announce(additions.length + ' more tracks loaded.')
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const code = extractErrorCode(err)
        const msg = msgFromCode(code)
        console.log('[load-more error]', { code, raw: err })
        setImportError(msg)
        announce(msg)
      }
    }
  }

  const handleClearAll = () => {
    // Reset transient UI and timers
    clearInlineUndo()
    setEditingId(null); setDraft(''); setError(null)
    setImportError(null)
    // Clear persisted data
    clearAppState()

    // Reset in-memory app state
    setTracks([])
    setImportMeta({ ...EMPTY_IMPORT_META })
    setPlaylistTitle('My Playlist')
    setImportedAt(null)
    setLastImportUrl('')
    setImportUrl('')

    // Reset import session internals
    resetImportFlow()

    // Route back to landing + UX polish
    setScreen('landing')
    announce("All saved data cleared. You're back at the start.")
    setTimeout(() => importInputRef.current?.focus(), 0)
  }

  const onAddNote = (trackId) => {
    setEditingId(trackId); setDraft(''); setError(null)
    editorInvokerRef.current = document.getElementById(`add-note-btn-${trackId}`)
    setTimeout(() => { focusById(`note-input-${trackId}`) }, 0)
  }

  const onSaveNote = (trackId) => {
    if (!draft.trim()) {
      announce('Note not saved. The note is empty.')
      setError('Note cannot be empty.')
      return
    }
    setTracks(prev =>
      prev.map(t => {
        if (t.id !== trackId) return t
        const notes = getNotes(t)
        return { ...t, notes: [...notes, draft.trim()] }
      })
    )
    setEditingId(null); setDraft(''); setError(null)
    announce('Note added.')
    editorInvokerRef.current?.focus()
  }

  const onCancelNote = () => {
    setEditingId(null); setDraft(''); setError(null)
    announce('Note cancelled.')
    editorInvokerRef.current?.focus()
  }

  function makePendingId(trackId, index) {
    return `${trackId}::${index}::${Date.now()}`
  }

  const onDeleteNote = (trackId, noteIndex) => {
    const track = tracks.find(t => t.id === trackId)
    const notes = getNotes(track)
    const noteToDelete = notes[noteIndex]
    if (noteToDelete == null) return

    setTracks(prev =>
      prev.map(t => {
        if (t.id !== trackId) return t
        const n = getNotes(t)
        return { ...t, notes: n.filter((_, i) => i !== noteIndex) }
      })
    )

    const id = makePendingId(trackId, noteIndex)
    scheduleInlineUndo(id, {
      trackId,
      note: noteToDelete,
      index: noteIndex,
      restoreFocusId: `del-btn-${trackId}-${noteIndex}`,
      fallbackFocusId: `add-note-btn-${trackId}`,
    })
    announce('Note deleted. Press Undo to restore')
  }

  // Helper to hide the mock prefix from SRs but keep it visible
  return (
    <div className="app">
      {/* Screen reader announcements */}
      <LiveRegion message={announceMsg} />

      <header style={{ maxWidth: 880, margin: '20px auto 0', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Sample Tagger</h1>
          <ThemeToggle />
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: '24px auto 60px', padding: '0 16px' }}>
        {screen === 'landing' && (
          <section aria-labelledby="landing-title">
            <h2 id="landing-title" style={{ marginTop: 0 }}>Get started</h2>
            <p style={{ color: 'var(--muted)' }}>
              Paste a Spotify / YouTube / SoundCloud <strong>playlist</strong> URL to import a snapshot and start adding notes.
            </p>

            <form onSubmit={handleImport} aria-describedby={importError ? 'import-error' : undefined}>
              <div style={{ display: 'grid', gap: 8, alignItems: 'start', gridTemplateColumns: '1fr auto' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="playlist-url" style={{ display: 'block', marginBottom: 6 }}>Playlist URL</label>
                  <input
                    id="playlist-url"
                    ref={importInputRef}
                    type="url"
                    inputMode="url"
                    placeholder="https://open.spotify.com/playlist/..."
                    autoComplete="off"
                    value={importUrl}
                    onChange={handleImportUrlChange}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
                    aria-invalid={!!importError}
                  />
                  {importError && (
                    <div id="import-error" className="error-text" style={{ marginTop: 6 }}>
                      {importError}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="chip">
                    <span className="chip-dot" style={{ background: providerChip ? 'var(--accent, #4caf50)' : 'var(--border)' }} />
                    {providerChip ? providerChip : 'no match'}
                  </span>
                </div>

                <div style={{ justifySelf: 'end' }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={isAnyImportBusy}
                    aria-busy={showInitialSpinner ? 'true' : 'false'}
                  >
                    {showInitialSpinner ? 'Importing...' : 'Import playlist'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {screen === 'playlist' && (
          <PlaylistView
            playlistTitle={playlistTitle}
            importedAt={importedAt}
            importMeta={importMeta}
            tracks={tracks}
            isAnyImportBusy={isAnyImportBusy}
            showReimportSpinner={showReimportSpinner}
            showLoadMoreSpinner={showLoadMoreSpinner}
            pending={pending}
            isPending={isPending}
            editingState={{ editingId, draft, error }}
            onDraftChange={handleDraftChange}
            onAddNote={onAddNote}
            onSaveNote={onSaveNote}
            onCancelNote={onCancelNote}
            onDeleteNote={onDeleteNote}
            onUndo={undoInline}
            onDismissUndo={expireInline}
            onReimport={handleReimport}
            onClear={handleClearAll}
            onBack={handleBackToLanding}
            canReimport={Boolean(lastImportUrl)}
            reimportBtnRef={reimportBtnRef}
            loadMoreBtnRef={loadMoreBtnRef}
            onLoadMore={handleLoadMore}
          />
        )}
      </main>

      <footer style={{ maxWidth: 880, margin: '0 auto 24px', padding: '0 16px', color: 'var(--muted)' }}>
        <small>Prototype - Keyboard-first, accessible-by-default</small>
      </footer>
    </div>
  )
}
