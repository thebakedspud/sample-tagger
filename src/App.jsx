// src/App.jsx
import { useEffect, useState, useRef } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { loadAppState, saveAppState, clearAppState } from './utils/storage.js'
import { focusById } from './utils/focusById.js'
import './styles/tokens.css';
import './styles/primitives.css';

// NEW: inline undo
import { usePendingDelete } from './features/undo/usePendingDelete'
import UndoPlaceholder from './components/UndoPlaceholder.jsx'

// Extracted helpers
import detectProvider from './features/import/detectProvider'
import useImportPlaylist from './features/import/useImportPlaylist.js'

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

  // ANNOUNCEMENTS (for screen readers) - light debounce
  const [announceMsg, setAnnounceMsg] = useState('')
  const announceTimerRef = useRef(null)
  function announce(msg) {
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current)
    announceTimerRef.current = setTimeout(() => {
      setAnnounceMsg(msg)
      announceTimerRef.current = null
    }, 60)
  }

  // IMPORT state
  const [importUrl, setImportUrl] = useState('')
  const providerChip = detectProvider(importUrl || '')
  const [importError, setImportError] = useState(null)
  const importInputRef = useRef(null)
  const [importBusyKind, setImportBusyKind] = useState(null)

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

  // NEW - inline undo bookkeeping:
  const [pending, setPending] = useState(new Map())
  const pendingRef = useRef(pending)
  useEffect(() => { pendingRef.current = pending }, [pending])

  const lastPendingIdRef = useRef(null)

  // IMPORTANT: make hook timer inert; let the component own expiry
  const { start: startPendingDelete, undo: undoPending, isPending } = usePendingDelete({
    timeoutMs: 600000,
    onAnnounce: announce,
    onFinalize: (id) => {
      const meta = pendingRef.current.get(id)
      setPending(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      announce('Note deleted')
      if (meta?.fallbackFocusId) {
        requestAnimationFrame(() => { focusById(meta.fallbackFocusId) })
      }
    }
  })

  // REIMPORT focus pattern
  const reimportBtnRef = useRef(null)

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
        const id = lastPendingIdRef.current
        if (id && isPending(id)) { e.preventDefault(); handleUndoInline(id) }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending])

  // ===== tiny extracted handlers =====
  function handleImportUrlChange(e) { setImportUrl(e.target.value); setImportError(null) }
  function handleDraftChange(e) { setDraft(e.target.value) }

  function normalizeTrackId(raw) {
    return /^\d+$/.test(String(raw)) ? Number(raw) : raw;
  }

  function handleAddNoteClick(e) {
    const trackId = normalizeTrackId(e.currentTarget.dataset.trackId)
    onAddNote(trackId)
  }
  function handleDeleteNoteClick(e) {
    const btn = e.currentTarget
    const trackId = normalizeTrackId(btn.dataset.trackId)
    const noteIndex = Number(btn.dataset.noteIndex)
    onDeleteNote(trackId, noteIndex)
  }
  function handleSaveNoteClick(e) {
    const trackId = normalizeTrackId(e.currentTarget.dataset.trackId)
    onSaveNote(trackId)
  }
  function handleCancelNoteClick(e) {
    const trackId = normalizeTrackId(e.currentTarget.dataset.trackId)
    onCancelNote(trackId)
  }
  function handleBackToLanding() { setScreen('landing') }

  // import hook (mock-first, async)
  const { importPlaylist: runImport, importNext, loading: importLoading, reset: resetImportSession } = useImportPlaylist()
  const isInitialImportBusy = importBusyKind === 'initial'
  const isReimportBusy = importBusyKind === 'reimport'
  const isLoadMoreBusy = importBusyKind === 'load-more'
  const isAnyImportBusy = importLoading || importBusyKind !== null
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

    setImportBusyKind('initial')

    try {
      announce('Import started.')
      const res = await runImport(trimmedUrl)

      const mapped = res.tracks.map((t, idx) => ({
        id: t.id || [(res.provider ?? providerChip), idx + 1].filter(Boolean).join('-'),
        title: t.title,
        artist: t.artist || '',
        notes: [],
      }))
      setTracks(mapped)

      setImportMeta({
        ...EMPTY_IMPORT_META,
        provider: res.provider ?? providerChip ?? null,
        playlistId: res.playlistId ?? null,
        snapshotId: res.snapshotId ?? null,
        cursor: res.pageInfo?.cursor ?? null,
        hasMore: Boolean(res.pageInfo?.hasMore && res.pageInfo?.cursor),
        sourceUrl: res.sourceUrl ?? trimmedUrl,
        debug: res.debug ?? null,
      })

      setPlaylistTitle(res.title || 'Imported Playlist')
      const timestamp = new Date().toISOString()
      setImportedAt(timestamp)
      setLastImportUrl(trimmedUrl)
      setScreen('playlist')
      announce('Playlist imported. ' + mapped.length + ' tracks.')

      requestAnimationFrame(() => {
        if (mapped.length > 0) {
          focusById('add-note-btn-' + mapped[0].id)
        }
      })
    } catch (err) {
      // Abort is a true cancel: no error UI
      if (err?.name === "AbortError") return

      const code = extractErrorCode(err)
      const msg = msgFromCode(code)
      console.log('[import error]', { code, raw: err })
      setImportError(msg)
      announce('Import failed. ' + msg)
      importInputRef.current?.focus(); importInputRef.current?.select()
    } finally {
      setImportBusyKind(null)
    }
  }

  const handleReimport = async () => {
    if (!lastImportUrl) return
    const wasActive = document.activeElement === reimportBtnRef.current
    setImportError(null)
    setImportBusyKind('reimport')
    try {
      announce('Re-importing playlist.')
      const res = await runImport(lastImportUrl)

      const mapped = res.tracks.map((t, idx) => ({
        id: t.id || [(res.provider ?? importMeta.provider), idx + 1].filter(Boolean).join('-'),
        title: t.title,
        artist: t.artist || '',
        notes: [],
      }))
      setTracks(mapped)

      setImportMeta({
        ...EMPTY_IMPORT_META,
        provider: res.provider ?? importMeta.provider ?? null,
        playlistId: res.playlistId ?? importMeta.playlistId ?? null,
        snapshotId: res.snapshotId ?? importMeta.snapshotId ?? null,
        cursor: res.pageInfo?.cursor ?? null,
        hasMore: Boolean(res.pageInfo?.hasMore && res.pageInfo?.cursor),
        sourceUrl: res.sourceUrl ?? lastImportUrl,
        debug: res.debug ?? null,
      })

      setPlaylistTitle(res.title || playlistTitle || 'Imported Playlist')
      setImportedAt(new Date().toISOString())
      announce('Playlist re-imported. ' + mapped.length + ' tracks available.')
      if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
    } catch (err) {
      if (err?.name === 'AbortError') {
        setImportBusyKind(null)
        return
      }
      const code = extractErrorCode(err)
      const msg = msgFromCode(code)
      console.log('[reimport error]', { code, raw: err })
      setImportError(msg)
      announce(msg)
      if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
    } finally {
      setImportBusyKind(null)
    }
  }

  const handleLoadMore = async () => {
    if (!importMeta.cursor || !importMeta.provider || !lastImportUrl) {
      return
    }

    setImportError(null)
    setImportBusyKind('load-more')

    try {
      announce('Loading more tracks.')
      const res = await importNext({
        cursor: importMeta.cursor,
        provider: importMeta.provider,
        url: importMeta.sourceUrl || lastImportUrl,
      })

      if (!res) {
        setImportMeta(prev => ({ ...prev, cursor: null, hasMore: false }))
        announce('No additional tracks available.')
        return
      }

      const startIndex = tracks.length
      const mapped = res.tracks.map((t, idx) => ({
        id: t.id || [(res.provider ?? importMeta.provider), startIndex + idx + 1].filter(Boolean).join('-'),
        title: t.title,
        artist: t.artist || '',
        notes: [],
      }))
      const existingIds = new Set(tracks.map(t => t.id))
      const unique = mapped.filter(t => !existingIds.has(t.id))

      if (unique.length === 0) {
        setImportMeta(prev => ({
          ...prev,
          cursor: res.pageInfo?.cursor ?? null,
          hasMore: Boolean(res.pageInfo?.hasMore && res.pageInfo?.cursor),
          sourceUrl: res.sourceUrl ?? prev.sourceUrl ?? lastImportUrl,
          debug: res.debug ?? prev.debug,
        }))
        announce('No additional tracks available.')
        return
      }

      setTracks(prev => [...prev, ...unique])
      setImportMeta(prev => ({
        ...prev,
        playlistId: res.playlistId ?? prev.playlistId ?? null,
        snapshotId: res.snapshotId ?? prev.snapshotId ?? null,
        cursor: res.pageInfo?.cursor ?? null,
        hasMore: Boolean(res.pageInfo?.hasMore && res.pageInfo?.cursor),
        sourceUrl: res.sourceUrl ?? prev.sourceUrl ?? lastImportUrl,
        debug: res.debug ?? prev.debug,
      }))
      setImportedAt(new Date().toISOString())
      requestAnimationFrame(() => focusById('add-note-btn-' + unique[0].id))
      announce(unique.length + ' more tracks loaded.')
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const code = extractErrorCode(err)
        const msg = msgFromCode(code)
        console.log('[load-more error]', { code, raw: err })
        setImportError(msg)
        announce(msg)
      }
    } finally {
      setImportBusyKind(null)
    }
  }

  const handleClearAll = () => {
    // Reset transient UI and timers
    setPending(new Map())
    setEditingId(null); setDraft(''); setError(null)
    setImportError(null)
    setImportBusyKind(null)

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
    resetImportSession()

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
    lastPendingIdRef.current = id
    setPending(prev => {
      const next = new Map(prev)
      next.set(id, {
        trackId,
        note: noteToDelete,
        index: noteIndex,
        restoreFocusId: `del-btn-${trackId}-${noteIndex}`,
        fallbackFocusId: `add-note-btn-${trackId}`,
      })
      return next
    })

    startPendingDelete(id)
  }

  function handleUndoInline(id) {
    const meta = pending.get(id)
    if (!meta) return
    const { trackId, note, index, restoreFocusId, fallbackFocusId } = meta

    undoPending(id)

    setTracks(prev =>
      prev.map(t => {
        if (t.id !== trackId) return t
        const notes = [...getNotes(t)]
        const insertAt = Math.min(Math.max(index, 0), notes.length)
        notes.splice(insertAt, 0, note)
        return { ...t, notes }
      })
    )

    setPending(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })

    announce('Note restored')
    requestAnimationFrame(() => {
      if (restoreFocusId && document.getElementById(restoreFocusId)) {
        focusById(restoreFocusId)
      } else if (fallbackFocusId) {
        focusById(fallbackFocusId)
      }
    })
  }

  function handleExpireInline(id) {
    const meta = pendingRef.current.get(id)
    setPending(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    announce('Undo expired. Note deleted')
    if (meta?.fallbackFocusId) {
      requestAnimationFrame(() => { focusById(meta.fallbackFocusId) })
    }
  }

  // Helper to hide the mock prefix from SRs but keep it visible
  const MOCK_PREFIX = 'MOCK DATA ACTIVE - '
  const hasMockPrefix = typeof playlistTitle === 'string' && playlistTitle.startsWith(MOCK_PREFIX)
  const cleanTitle = hasMockPrefix ? playlistTitle.slice(MOCK_PREFIX.length) : playlistTitle

  return (
    <div className="app">
      <style>{`
        .error-text { color: #d9534f; font-size: 0.9em; margin-top: 4px; }
        .chip { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; font-size:12px; color:var(--muted); background:var(--card); }
        .chip-dot { width:8px; height:8px; border-radius:999px; display:inline-block; }
        .sr-only {
          position: absolute !important;
          width: 1px; height: 1px;
          padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 1px, 1px);
          white-space: nowrap; border: 0;
        }
      `}</style>

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
          <section aria-labelledby="playlist-title">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Clean label for SR, hide mock prefix textually */}
                <h2 id="playlist-title" aria-label={cleanTitle} style={{ marginTop: 0, marginBottom: 0 }}>
                  {hasMockPrefix && <span aria-hidden="true">{MOCK_PREFIX}</span>}
                  {cleanTitle}
                </h2>
                {importedAt && (
                  <span className="chip">
                    {tracks.length} tracks - imported {new Date(importedAt).toLocaleDateString()} {new Date(importedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {lastImportUrl && (
                  <button
                    type="button"
                    ref={reimportBtnRef}
                    className="btn"
                    onClick={handleReimport}
                    aria-label="Re-import this playlist"
                    disabled={isAnyImportBusy}
                    aria-busy={showReimportSpinner ? 'true' : 'false'}
                  >
                    {showReimportSpinner ? 'Re-importing...' : 'Re-import'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={handleClearAll}
                  aria-label="Clear all data"
                >
                  Clear
                </button>
                <button type="button" className="btn" onClick={handleBackToLanding}>
                  Back
                </button>
              </div>
            </div>

            <ul style={{ padding: 0, listStyle: 'none' }}>
              {tracks.map((t, i) => {
                const placeholders = []
                for (const [pid, meta] of pending.entries()) {
                  if (meta.trackId === t.id) {
                    placeholders.push({
                      pid,
                      index: meta.index,
                      restoreFocusId: meta.restoreFocusId,
                      fallbackFocusId: meta.fallbackFocusId,
                    })
                  }
                }
                placeholders.sort((a, b) => a.index - b.index)

                const rows = []
                const noteArr = getNotes(t)
                const noteCount = noteArr.length
                for (let idx = 0; idx <= noteCount; idx++) {
                  placeholders
                    .filter(ph => ph.index === idx && isPending(ph.pid))
                    .forEach(ph => {
                      rows.push(
                        <li key={`ph-${ph.pid}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <UndoPlaceholder
                            pendingId={ph.pid}
                            onUndo={handleUndoInline}
                            onDismiss={handleExpireInline}
                            restoreFocusId={ph.restoreFocusId}
                            fallbackFocusId={ph.fallbackFocusId}
                          />
                        </li>
                      )
                    })

                  if (idx < noteCount) {
                    const n = noteArr[idx]
                    rows.push(
                      <li
                        key={`n-${t.id}-${idx}`}
                        style={{
                          color: 'var(--fg)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span>- {n}</span>
                        <button
                          type="button"
                          id={`del-btn-${t.id}-${idx}`}
                          className="btn"
                          aria-label={`Delete note ${idx + 1} for ${t.title}`}
                          data-track-id={t.id}
                          data-note-index={idx}
                          onClick={handleDeleteNoteClick}
                        >
                          Delete
                        </button>
                      </li>
                    )
                  }
                }

                const isEditing = editingId === t.id

                return (
                  <li
                    key={t.id}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      boxShadow: 'var(--shadow)',
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {/* Track title as a proper heading; split title/artist for cleaner SR output */}
                      <h3 id={`t-${t.id}`} style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                        <span aria-hidden="true">{i + 1}. </span>
                        <span id={`title-${t.id}`}>{t.title}</span>
                        {' - '}
                        <span aria-hidden="true">{t.artist}</span>
                        {noteArr.length > 0 && (
                          <span style={{ marginLeft: 8, color: 'var(--muted)', fontWeight: 400 }}>
                            - {noteArr.length} note{noteArr.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </h3>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          id={`add-note-btn-${t.id}`}
                          className="btn"
                          aria-label="Add note"
                          aria-describedby={`title-${t.id}`}
                          data-track-id={t.id}
                          onClick={handleAddNoteClick}
                        >
                          Add note
                        </button>
                      </div>
                    </div>

                    {(noteArr.length > 0 || placeholders.length > 0) && (
                      <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 16 }}>
                        {rows}
                      </ul>
                    )}

                    {isEditing && (
                      <section id={`note-${t.id}`} aria-labelledby={`t-${t.id}`} style={{ marginTop: 10 }}>
                        <label className="sr-only" htmlFor={`note-input-${t.id}`}>
                          Note text
                        </label>
                        <textarea
                          id={`note-input-${t.id}`}
                          rows={3}
                          value={draft}
                          aria-describedby={error ? `note-error-${t.id}` : undefined}
                          onChange={handleDraftChange}
                          style={{
                            width: '100%',
                            padding: 8,
                            borderRadius: 6,
                            border: `1px solid ${error ? '#d9534f' : 'var(--border)'}`,
                            background: 'var(--card)',
                            color: 'var(--fg)',
                          }}
                        />
                        {error && (
                          <div id={`note-error-${t.id}`} className="error-text">
                            {error}
                          </div>
                        )}
                        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="btn primary"
                            data-track-id={t.id}
                            onClick={handleSaveNoteClick}
                          >
                            Save note
                          </button>
                          <button
                            type="button"
                            className="btn"
                            data-track-id={t.id}
                            onClick={handleCancelNoteClick}
                          >
                            Cancel
                          </button>
                        </div>
                      </section>
                    )}
                  </li>
                )
              })}
            </ul>
            {importMeta.hasMore && importMeta.cursor && (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={handleLoadMore}
                  disabled={isAnyImportBusy}
                  aria-busy={showLoadMoreSpinner ? 'true' : 'false'}
                >
                  {showLoadMoreSpinner ? 'Loading more...' : 'Load more'}
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      <footer style={{ maxWidth: 880, margin: '0 auto 24px', padding: '0 16px', color: 'var(--muted)' }}>
        <small>Prototype - Keyboard-first, accessible-by-default</small>
      </footer>
    </div>
  )
}
