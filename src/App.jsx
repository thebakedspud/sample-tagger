import { useEffect, useState, useRef } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { loadAppState, saveAppState, clearAppState } from './utils/storage.js'

// Level-1 provider detection
function detectProvider(url) {
  try {
    const u = new URL(url)
    const host = u.hostname // slightly safer than .host (ignores port)

    if ((/youtube\.com|youtu\.be/).test(host) && (u.searchParams.get('list') || u.pathname.includes('/playlist'))) {
      return 'youtube'
    }
    if ((/open\.spotify\.com/).test(host) && u.pathname.startsWith('/playlist')) {
      return 'spotify'
    }
    if ((/soundcloud\.com/).test(host)) {
      return 'soundcloud'
    }
  } catch {
    // Invalid URL or parsing failed
  }
  return null
}

// Mock importer for MVP (replace with real proxy fetch later)
async function mockImport(url) {
  const provider = detectProvider(url)
  if (!provider) {
    const err = new Error('UNSUPPORTED_OR_INVALID_URL')
    err.code = 'UNSUPPORTED_OR_INVALID_URL'
    throw err
  }
  // Simulate network/processing delay
  await new Promise(r => setTimeout(r, 700))

  // Simple demo payload based on provider
  if (provider === 'spotify') {
    return {
      provider,
      title: 'Imported from Spotify',
      tracks: [
        { id: 'sp-1', title: 'Nautilus', artist: 'Bob James' },
        { id: 'sp-2', title: 'The Champ', artist: 'The Mohawks' },
        { id: 'sp-3', title: 'Electric Relaxation', artist: 'A Tribe Called Quest' },
      ]
    }
  }
  if (provider === 'youtube') {
    return {
      provider,
      title: 'Imported from YouTube',
      tracks: [
        { id: 'yt-1', title: 'Amen Break (Full)', artist: 'The Winstons' },
        { id: 'yt-2', title: 'Cissy Strut', artist: 'The Meters' },
        { id: 'yt-3', title: 'Apache', artist: 'Incredible Bongo Band' },
      ]
    }
  }
  // soundcloud
  return {
    provider,
    title: 'Imported from SoundCloud',
    tracks: [
      { id: 'sc-1', title: 'Soulful Loop 92bpm', artist: 'crate_digger' },
      { id: 'sc-2', title: 'Dusty Rhodes 84bpm', artist: 'vinyl_junkie' },
      { id: 'sc-3', title: 'Blue Smoke 78bpm', artist: 'midnight_sampler' },
    ]
  }
}

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

  // UNDO state
  const [undo, setUndo] = useState(null)
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0)
  const undoBtnRef = useRef(null)
  const countdownRef = useRef(null)
  const lastFocusOnUndoRef = useRef(null)

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

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (undo?.timerId) clearTimeout(undo.timerId)
    }
  }, [undo])

  // Countdown display
  useEffect(() => {
    if (!undo) return
    setUndoSecondsLeft(5)
    let ticks = 5
    const id = setInterval(() => {
      ticks -= 1
      setUndoSecondsLeft(ticks)
      if (ticks <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [undo])

  // Ctrl+Z undo
  useEffect(() => {
    const onKeyDown = (e) => {
      if (undo && e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        onUndoDelete()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo])

  // IMPORT handlers
  const handleImport = async (e) => {
    e?.preventDefault?.()
    setImportError(null)
    if (!importUrl.trim()) {
      setImportError('Paste a playlist URL to import.')
      announce('Import failed. URL missing.')
      importInputRef.current?.focus()
      return
    }
    if (!provider) {
      setImportError('That URL doesn’t look like a Spotify, YouTube, or SoundCloud playlist.')
      announce('Import failed. Unsupported URL.')
      importInputRef.current?.focus()
      return
    }
    try {
      setImportLoading(true)
      announce('Import started.')
      const res = await mockImport(importUrl.trim())
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
          const btn = document.getElementById(`add-note-btn-${mapped[0].id}`)
          btn?.focus()
        }
      }, 0)
    } catch (err) {
      const msg = err?.code === 'UNSUPPORTED_OR_INVALID_URL'
        ? 'That link is not a supported playlist URL.'
        : 'Couldn’t import right now. Check the link or try again.'
      setImportError(msg)
      announce(`Import failed. ${msg}`)
      importInputRef.current?.focus()
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

      const res = await mockImport(lastImportUrl)
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
    if (undo?.timerId) clearTimeout(undo.timerId)
    setUndo(null)

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
      const textarea = document.getElementById(`note-input-${trackId}`)
      textarea?.focus()
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

  const onDeleteNote = (trackId, noteIndex) => {
    const noteToDelete = tracks.find(t => t.id === trackId)?.notes[noteIndex]
    if (noteToDelete == null) return

    lastFocusOnUndoRef.current = { trackId, noteIndex }

    setTracks(prev =>
      prev.map(t =>
        t.id === trackId
          ? { ...t, notes: t.notes.filter((_, i) => i !== noteIndex) }
          : t
      )
    )

    if (undo?.timerId) clearTimeout(undo.timerId)

    const timerId = setTimeout(() => {
      setUndo(null)
      announce('Delete finalized.')
    }, 5000)

    setUndo({ trackId, note: noteToDelete, index: noteIndex, timerId })
    announce('Note deleted. Undo available for 5 seconds.')

    setTimeout(() => {
      const btn = document.getElementById(`add-note-btn-${trackId}`)
      btn?.focus()
    }, 0)
  }

  const onUndoDelete = () => {
    if (!undo) return
    const { trackId, note, index, timerId } = undo
    clearTimeout(timerId)

    setTracks(prev =>
      prev.map(t => {
        if (t.id !== trackId) return t
        const notes = [...t.notes]
        const insertAt = Math.min(Math.max(index, 0), notes.length)
        notes.splice(insertAt, 0, note)
        return { ...t, notes }
      })
    )

    setUndo(null)
    announce('Note restored.')

    setTimeout(() => {
      const target = lastFocusOnUndoRef.current
      if (target && target.trackId === trackId) {
        const btn = document.getElementById(`del-btn-${trackId}-${index}`)
        if (btn) {
          btn.focus()
          return
        }
      }
      const addBtn = document.getElementById(`add-note-btn-${trackId}`)
      addBtn?.focus()
    }, 0)
  }

  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .toast-enter { opacity: 0; transform: translateY(8px); }
          .toast-enter-active { opacity: 1; transform: translateY(0); transition: opacity 160ms ease, transform 160ms ease; }
          .toast-exit { opacity: 1; transform: translateY(0); }
          .toast-exit-active { opacity: 0; transform: translateY(8px); transition: opacity 140ms ease, transform 140ms ease; }
        }
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

      {/* Undo Toast */}
      <Toast
        show={!!undo}
        onClose={() => {
          if (undo?.timerId) clearTimeout(undo.timerId)
          setUndo(null)
          announce('Undo dismissed.')
        }}
      >
        <span>
          Note deleted —{' '}
          <span id="undo-countdown" ref={countdownRef}>
            {undoSecondsLeft > 0 ? `${undoSecondsLeft}s` : ''}
          </span>
          {' '}to undo.
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            ref={undoBtnRef}
            className="button primary"
            onClick={onUndoDelete}
            aria-describedby="undo-countdown"
          >
            Undo
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              if (undo?.timerId) clearTimeout(undo.timerId)
              setUndo(null)
              announce('Undo dismissed.')
            }}
            aria-label="Dismiss undo"
          >
            Dismiss
          </button>
        </div>
      </Toast>

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
                    value={importUrl}
                    onChange={(e) => { setImportUrl(e.target.value); setImportError(null) }}
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
                  <span className="chip" aria-live="polite" aria-atomic="true" title={provider ? `Detected ${provider}` : 'No provider detected yet'}>
                    <span className="chip-dot" style={{ background: provider ? 'var(--accent, #4caf50)' : 'var(--border)' }} />
                    {provider ? provider : 'no match'}
                  </span>
                </div>

                <div style={{ justifySelf: 'end' }}>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!provider || importLoading}
                    aria-busy={importLoading ? 'true' : 'false'}
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

            <ul role="list" style={{ padding: 0, listStyle: 'none' }}>
              {tracks.map((t, i) => (
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

                  {t.notes.length > 0 && (
                    <ul role="list" style={{ marginTop: 8, marginBottom: 0, paddingLeft: 16 }}>
                      {t.notes.map((n, idx) => (
                        <li
                          key={idx}
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
                      ))}
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
                        onChange={(e) => setDraft(e.target.value)}
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
              ))}
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

function Toast({ show, onClose, children }) {
  const [phase, setPhase] = useState('idle')
  const phaseRef = useRef(phase)
  const nodeRef = useRef(null)

  // keep ref synced so we can read phase without adding it to deps
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (show) {
      if (reduceMotion) {
        setPhase('enter-active')
        return
      }
      setPhase('enter')
      const id = requestAnimationFrame(() => setPhase('enter-active'))
      return () => cancelAnimationFrame(id)
    } else if (phaseRef.current !== 'idle') {
      if (reduceMotion) {
        setPhase('idle')
        return
      }
      setPhase('exit')
      const t = setTimeout(() => setPhase('idle'), 150)
      return () => clearTimeout(t)
    }
  }, [show])

  const className =
    phase === 'enter'
      ? 'toast-enter'
      : phase === 'enter-active'
      ? 'toast-enter-active'
      : phase === 'exit'
      ? 'toast-exit'
      : phase === 'exit-active'
      ? 'toast-exit-active'
      : ''

  if (!show && phase === 'idle') return null

  return (
    <div
      ref={nodeRef}
      className={className}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        maxWidth: 880,
        width: 'calc(100% - 32px)',
        zIndex: 1000,
        pointerEvents: 'none',
        }}
    >
      <div
        role="group"
        aria-label="Undo delete"
        style={{
          pointerEvents: 'auto',
          margin: '0 auto',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--fg)',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
        <button type="button" className="button" onClick={onClose} aria-label="Close undo" title="Close">✕</button>
      </div>
    </div>
  )
}
