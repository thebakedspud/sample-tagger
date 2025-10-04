import { useEffect, useState, useRef } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { loadAppState, saveAppState, clearAppState } from './utils/storage.js'
import { focusById } from './utils/focusById.js'

// NEW: inline undo
import { usePendingDelete } from './features/undo/usePendingDelete'
import UndoPlaceholder from './components/UndoPlaceholder.jsx'

// ✅ Extracted helpers
import detectProvider from './features/import/detectProvider'
import importPlaylist from './features/import/mockImporter'

export default function App() {
  // SIMPLE "ROUTING"
  const [screen, setScreen] = useState('landing')

  // ANNOUNCEMENTS (for screen readers)
  const [announceMsg, setAnnounceMsg] = useState('')
  function announce(msg) {
    setAnnounceMsg(msg)
  }

  // IMPORT state
  const [importUrl, setImportUrl] = useState('')
  const provider = detectProvider(importUrl || '')
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState(null)
  const importInputRef = useRef(null)

  // PLAYLIST META
  const [playlistTitle, setPlaylistTitle] = useState('My Playlist')
  const [importedAt, setImportedAt] = useState(null) // ISO string
  const [lastImportUrl, setLastImportUrl] = useState('')

  // DATA
  const [tracks, setTracks] = useState([
    // Existing demo data remains; it will be replaced on successful import
    { id: 1, title: 'Nautilus', artist: 'Bob James', notes: [] },
    { id: 2, title: 'Electric Relaxation', artist: 'A Tribe Called Quest', notes: [] },
    { id: 3, title: 'The Champ', artist: 'The Mohawks', notes: [] },
  ])

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null) // error message for note editor

  // Remember which button opened the editor
  const editorInvokerRef = useRef(null)

  // NEW — inline undo bookkeeping:
  // pending map: id -> { trackId, note, index, restoreFocusId, fallbackFocusId }
  const [pending, setPending] = useState(new Map())
  const pendingRef = useRef(pending)              // <-- keep latest pending in a ref
  useEffect(() => { pendingRef.current = pending }, [pending])

  const lastPendingIdRef = useRef(null)

  // IMPORTANT: make hook timer inert; let the component own expiry (so it can pause on focus/hover)
  const { start: startPendingDelete, undo: undoPending, isPending } = usePendingDelete({
    timeoutMs: 600000, // 10 minutes — effectively disables auto-finalize from the hook
    onAnnounce: announce,
    onFinalize: (id) => {
      // Safety net only; should rarely/never fire now
      const meta = pendingRef.current.get(id)
      setPending(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })

      announce('Note deleted')

      if (meta?.fallbackFocusId) {
        requestAnimationFrame(() => {
          focusById(meta.fallbackFocusId)
        })
      }
    }
  })

  // REIMPORT focus pattern
  const reimportBtnRef = useRef(null)
  const [reimportLoading, setReimportLoading] = useState(false)

  // —— PERSISTENCE: load-once from localStorage
  useEffect(() => {
    const saved = loadAppState()
    if (!saved) return

    if (Array.isArray(saved.tracks)) setTracks(saved.tracks)
    if (typeof saved.playlistTitle === 'string') setPlaylistTitle(saved.playlistTitle)
    if (typeof saved.importedAt === 'string') setImportedAt(saved.importedAt)
    if (typeof saved.lastImportUrl === 'string') setLastImportUrl(saved.lastImportUrl)

    if (Array.isArray(saved.tracks) && saved.tracks.length) setScreen('playlist')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // —— PERSISTENCE: save whenever core state changes
  useEffect(() => {
    saveAppState({
      tracks,
      playlistTitle,
      importedAt,
      lastImportUrl,
    })
  }, [tracks, playlistTitle, importedAt, lastImportUrl])

  // Safety: close editor if its track disappears or changes
  useEffect(() => {
    if (editingId == null) return
    if (!tracks.some(t => t.id === editingId)) {
      setEditingId(null)
      setDraft('')
      setError(null)
    }
  }, [tracks, editingId])

  // Ctrl/Cmd+Z undo (for the most recent pending delete)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'z'
      ) {
        const id = lastPendingIdRef.current
        if (id && isPending(id)) {
          e.preventDefault()
          handleUndoInline(id)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending])

  // ===== NEW: tiny extracted handlers (stay inside App.jsx) =====
  function handleImportUrlChange(e) {
    setImportUrl(e.target.value)
    setImportError(null)
  }

  function handleDraftChange(e) {
    setDraft(e.target.value)
  }
  // ==============================================================

  // IMPORT handlers
  const handleImport = async (e) => {
    e?.preventDefault?.()
    setImportError(null)
    if (!importUrl.trim()) {
      setImportError('Paste a playlist URL to import.')
      announce('Import failed. URL missing.')
      if (importInputRef.current) {
        importInputRef.current.focus()
        importInputRef.current.select()
      }
      return
    }
    if (!provider) {
      setImportError('That URL doesn’t look like a Spotify, YouTube, or SoundCloud playlist.')
      announce('Import failed. Unsupported URL.')
      if (importInputRef.current) {
        importInputRef.current.focus()
        importInputRef.current.select()
      }
      return
    }
    try {
      setImportLoading(true)
      announce('Import started.')
      const res = await importPlaylist(importUrl.trim())
      // Map to your track shape, preserving notes array
      const mapped = res.tracks.map((t, idx) => ({
        id: t.id || `${res.provider}-${idx}`,
        title: t.title,
        artist: t.artist || '',
        notes: [],
      }))
      setTracks(mapped)
      setPlaylistTitle(res.title || 'Imported Playlist')
      const now = new Date().toISOString()
      setImportedAt(now)
      setLastImportUrl(importUrl.trim())
      setScreen('playlist')
      announce(`Playlist imported. ${mapped.length} tracks.`)

      // Move focus to first "Add note" button when ready (first-time import UX)
      setTimeout(() => {
        if (mapped.length > 0) {
          focusById(`add-note-btn-${mapped[0].id}`)
        }
      }, 0)
    } catch (err) {
      const msg = err?.code === 'UNSUPPORTED_OR_INVALID_URL'
        ? 'That link is not a supported playlist URL.'
        : 'Couldn’t import right now. Check the link or try again.'
      setImportError(msg)
      announce(`Import failed. ${msg}`)
      if (importInputRef.current) {
        importInputRef.current.focus()
        importInputRef.current.select()
      }
    } finally {
      setImportLoading(false)
    }
  }

  // Re-import keeps focus on the same button and announces results
  const handleReimport = async () => {
    if (!lastImportUrl) return

    const wasActive = document.activeElement === reimportBtnRef.current
    try {
      setReimportLoading(true)
      announce('Re-importing playlist…')

      const res = await importPlaylist(lastImportUrl)
      const mapped = res.tracks.map((t, idx) => ({
        id: t.id || `${res.provider}-${idx}`,
        title: t.title,
        artist: t.artist || '',
        notes: [],
      }))
      setTracks(mapped)
      setPlaylistTitle(res.title || 'Imported Playlist')
      setImportedAt(new Date().toISOString())

      announce(`Playlist re-imported. ${mapped.length} tracks available.`)

      if (wasActive) {
        // wait a frame in case the list rerender affected focus
        requestAnimationFrame(() => reimportBtnRef.current?.focus())
      }
    } catch {
      announce('Re-import failed. Try again.')
    } finally {
      setReimportLoading(false)
    }
  }

  // —— Clear-all handler (full reset)
  const handleClearAll = () => {
    // Cancel any pending placeholders
    setPending(new Map())

    clearAppState() // wipe localStorage

    // reset in-memory state
    setTracks([
      { id: 1, title: 'Nautilus', artist: 'Bob James', notes: [] },
      { id: 2, title: 'Electric Relaxation', artist: 'A Tribe Called Quest', notes: [] },
      { id: 3, title: 'The Champ', artist: 'The Mohawks', notes: [] },
    ])
    setPlaylistTitle('My Playlist')
    setImportedAt(null)
    setLastImportUrl('')
    setEditingId(null)
    setDraft('')
    setError(null)

    setScreen('landing')
    announce('All saved data cleared. You’re back at the start.')
    setTimeout(() => importInputRef.current?.focus(), 0)
  }

  const onAddNote = (trackId) => {
    setEditingId(trackId)
    setDraft('')
    setError(null)
    editorInvokerRef.current = document.getElementById(`add-note-btn-${trackId}`)
    setTimeout(() => {
      focusById(`note-input-${trackId}`)
    }, 0)
  }

  const onSaveNote = (trackId) => {
    if (!draft.trim()) {
      announce('Note not saved. The note is empty.')
      setError('Note cannot be empty.')
      return
    }
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId ? { ...t, notes: [...t.notes, draft.trim()] } : t
      )
    )
    setEditingId(null)
    setDraft('')
    setError(null)
    announce('Note added.')
    editorInvokerRef.current?.focus()
  }

  const onCancelNote = (_trackId) => {
    setEditingId(null)
    setDraft('')
    setError(null)
    announce('Note cancelled.')
    editorInvokerRef.current?.focus()
  }

  // Create a unique pending id for a deletion (per note)
  function makePendingId(trackId, index) {
    // Include time to avoid collisions when deleting the same index repeatedly
    return `${trackId}::${index}::${Date.now()}`
  }

  const onDeleteNote = (trackId, noteIndex) => {
    const noteToDelete = tracks.find(t => t.id === trackId)?.notes[noteIndex]
    if (noteToDelete == null) return

    // Remove the note now…
    setTracks(prev =>
      prev.map(t =>
        t.id === trackId
          ? { ...t, notes: t.notes.filter((_, i) => i !== noteIndex) }
          : t
      )
    )

    // …and insert a placeholder record to render inline at the same index.
    const id = makePendingId(trackId, noteIndex)
    lastPendingIdRef.current = id
    setPending(prev => {
      const next = new Map(prev)
      next.set(id, {
        trackId,
        note: noteToDelete,
        index: noteIndex,

        // NEW: where to send focus after Undo/dismiss
        restoreFocusId: `del-btn-${trackId}-${noteIndex}`,
        fallbackFocusId: `add-note-btn-${trackId}`,
      })
      return next
    })

    // Start timer via hook (announces initial delete; expiry will be owned by component)
    startPendingDelete(id)

    // Focus will move into the inline Undo button when the placeholder mounts.
  }

  function handleUndoInline(id) {
    const meta = pending.get(id)
    if (!meta) return
    const {
      trackId,
      note,
      index,
      restoreFocusId,
      fallbackFocusId
    } = meta

    // Cancel hook timer
    undoPending(id)

    // Restore note at its original index (clamped to current length)
    setTracks(prev =>
      prev.map(t => {
        if (t.id !== trackId) return t
        const notes = [...t.notes]
        const insertAt = Math.min(Math.max(index, 0), notes.length)
        notes.splice(insertAt, 0, note)
        return { ...t, notes }
      })
    )

    // Remove placeholder
    setPending(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })

    announce('Note restored')

    // After re-render, move focus to the restored Delete (fallback to Add note)
    requestAnimationFrame(() => {
      if (restoreFocusId && document.getElementById(restoreFocusId)) {
        focusById(restoreFocusId)
      } else if (fallbackFocusId) {
        focusById(fallbackFocusId)
      }
    })
  }

  // NEW: component-owned expiry handler (called by UndoPlaceholder onDismiss)
  function handleExpireInline(id) {
    const meta = pendingRef.current.get(id)

    // Remove placeholder
    setPending(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })

    // Announce final state distinctly from initial delete
    announce('Undo expired. Note deleted')

    // Focus to safe fallback
    if (meta?.fallbackFocusId) {
      requestAnimationFrame(() => {
        focusById(meta.fallbackFocusId)
      })
    }
  }

  return (
    <>
      <style>{`
        .error-text { color: #d9534f; font-size: 0.9em; margin-top: 4px; }
        .chip { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border:1px solid var(--border); border-radius:999px; font-size:12px; color:var(--muted); background:var(--card); }
        .chip-dot { width:8px; height:8px; border-radius:999px; display:inline-block; }
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
                    placeholder="https://open.spotify.com/playlist/…"
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
                  <span className="chip" title={provider ? `Detected ${provider}` : 'No provider detected yet'}>
                    <span className="chip-dot" style={{ background: provider ? 'var(--accent, #4caf50)' : 'var(--border)' }} />
                    {provider ? provider : 'no match'}
                  </span>
                </div>

                <div style={{ justifySelf: 'end' }}>
                  <button
                    type="submit"
                    className="button primary"
                    // Keep focusable/clickable; validate in handleImport
                    disabled={importLoading}
                    aria-busy={importLoading ? 'true' : 'false'}
                    title={!provider ? 'Paste a Spotify/YouTube/SoundCloud playlist URL' : undefined}
                  >
                    {importLoading ? 'Importing…' : 'Import playlist'}
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
                <h2 id="playlist-title" style={{ marginTop: 0, marginBottom: 0 }}>{playlistTitle}</h2>
                {importedAt && (
                  <span className="chip" title="Snapshot info">
                    {tracks.length} tracks • imported {new Date(importedAt).toLocaleDateString()} {new Date(importedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {lastImportUrl && (
                  <button
                    type="button"
                    ref={reimportBtnRef}
                    className="button"
                    onClick={handleReimport}
                    aria-label="Re-import this playlist"
                    title="Fetch a fresh snapshot of this playlist"
                    disabled={reimportLoading}
                    aria-busy={reimportLoading ? 'true' : 'false'}
                  >
                    {reimportLoading ? 'Re-importing…' : 'Re-import'}
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  onClick={handleClearAll}
                  title="Remove saved playlist and notes from this device"
                >
                  Clear
                </button>
                <button type="button" className="button" onClick={() => setScreen('landing')}>
                  ← Back
                </button>
              </div>
            </div>

            <ul style={{ padding: 0, listStyle: 'none' }}>
              {tracks.map((t, i) => {
                // Build a quick lookup of pending placeholders for this track by index
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
                // Sort placeholders by index so they appear in the right order
                placeholders.sort((a, b) => a.index - b.index)

                // Render notes with inline placeholders at original indices.
                // We iterate from 0..notes.length and insert any placeholders that belong at each index.
                const rows = []
                const noteCount = t.notes.length
                for (let idx = 0; idx <= noteCount; idx++) {
                  // Insert placeholder(s) that target this index
                  placeholders
                    .filter(ph => ph.index === idx && isPending(ph.pid))
                    .forEach(ph => {
                      rows.push(
                        <li key={`ph-${ph.pid}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <UndoPlaceholder
                            pendingId={ph.pid}
                            onUndo={handleUndoInline}             // receives pendingId
                            onDismiss={handleExpireInline}        // component-owned expiry
                            restoreFocusId={ph.restoreFocusId}
                            fallbackFocusId={ph.fallbackFocusId}
                          />
                        </li>
                      )
                    })

                  // Insert the real note if exists at this index
                  if (idx < noteCount) {
                    const n = t.notes[idx]
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
                        <span>– {n}</span>
                        <button
                          type="button"
                          id={`del-btn-${t.id}-${idx}`}
                          className="button"
                          aria-label={`Delete note ${idx + 1} for ${t.title}`}
                          onClick={() => onDeleteNote(t.id, idx)}
                        >
                          Delete
                        </button>
                      </li>
                    )
                  }
                }

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
                      <span>
                        <strong>{i + 1}.</strong> {t.title} — {t.artist}
                        {t.notes.length > 0 && (
                          <span style={{ marginLeft: 8, color: 'var(--muted)' }}>
                            · {t.notes.length} note{t.notes.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          id={`add-note-btn-${t.id}`}
                          className="button"
                          aria-label={`Add note to ${t.title}`}
                          onClick={() => onAddNote(t.id)}
                        >
                          Add note
                        </button>
                      </div>
                    </div>

                    {(t.notes.length > 0 || placeholders.length > 0) && (
                      <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 16 }}>
                        {rows}
                      </ul>
                    )}

                    {editingId === t.id && (
                      <div style={{ marginTop: 10 }}>
                        <label htmlFor={`note-input-${t.id}`} style={{ display: 'block', marginBottom: 6 }}>
                          Note for “{t.title}”
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
                          <button type="button" className="button primary" onClick={() => onSaveNote(t.id)}>
                            Save note
                          </button>
                          <button type="button" className="button" onClick={() => onCancelNote(t.id)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>

      <footer style={{ maxWidth: 880, margin: '0 auto 24px', padding: '0 16px', color: 'var(--muted)' }}>
        <small>Prototype · Keyboard-first, accessible-by-default</small>
      </footer>
    </>
  )
}
