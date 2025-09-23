import { useEffect, useState, useRef } from 'react'

function getInitialTheme() {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function App() {
  // THEME
  const [theme, setTheme] = useState(getInitialTheme)
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('theme-light', 'theme-dark')
    root.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light')
    localStorage.setItem('theme', theme)
  }, [theme])

  // SIMPLE "ROUTING"
  const [screen, setScreen] = useState('landing')

  // ANNOUNCEMENTS (for screen readers)
  const liveRef = useRef(null)
  const announce = (msg) => {
    if (!liveRef.current) return
    liveRef.current.textContent = ''
    setTimeout(() => {
      liveRef.current.textContent = msg
    }, 30)
  }

  // DATA
  const [tracks, setTracks] = useState([
    { id: 1, title: 'Nautilus', artist: 'Bob James', notes: [] },
    { id: 2, title: 'Electric Relaxation', artist: 'A Tribe Called Quest', notes: [] },
    { id: 3, title: 'The Champ', artist: 'The Mohawks', notes: [] },
  ])

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

  // Remember which button opened the editor
  const editorInvokerRef = useRef(null)

  // UNDO state
  const [undo, setUndo] = useState(null) // { trackId, note, index, timerId }
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0)
  const undoBtnRef = useRef(null)
  const countdownRef = useRef(null)
  const lastFocusOnUndoRef = useRef(null) // { trackId, noteIndex }

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

  const onImportClick = () => {
    setScreen('playlist')
    announce('Imported 3 tracks. Playlist view loaded.')
  }

  const onAddNote = (trackId) => {
    setEditingId(trackId)
    setDraft('')
    // remember the button that opened the editor
    editorInvokerRef.current = document.getElementById(`add-note-btn-${trackId}`)
    setTimeout(() => {
      const textarea = document.getElementById(`note-input-${trackId}`)
      textarea?.focus()
    }, 0)
  }

  const onSaveNote = (trackId) => {
    if (!draft.trim()) {
      announce('Note not saved. The note is empty.')
      return
    }
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId ? { ...t, notes: [...t.notes, draft.trim()] } : t
      )
    )
    setEditingId(null)
    setDraft('')
    announce('Note added.')
    // return focus to whoever opened editor
    editorInvokerRef.current?.focus()
  }

  const onCancelNote = (trackId) => {
    setEditingId(null)
    setDraft('')
    announce('Note cancelled.')
    // return focus to whoever opened editor
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

    // stability: focus back to Add note after delete
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
      `}</style>

      <header style={{ maxWidth: 880, margin: '20px auto 0', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Sample Tagger</h1>
          <button
            className="button"
            aria-label="Toggle dark mode"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      <div
        ref={liveRef}
        role="status"
        aria-live="polite"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}
      />

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
            ref={undoBtnRef}
            className="button primary"
            onClick={onUndoDelete}
            aria-describedby="undo-countdown"
          >
            Undo
          </button>
          <button
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
              Load a Spotify / YouTube / SoundCloud playlist to start adding notes.
            </p>
            <button className="button primary" onClick={onImportClick}>
              Import playlist
            </button>
          </section>
        )}

        {screen === 'playlist' && (
          <section aria-labelledby="playlist-title">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="playlist-title" style={{ marginTop: 0 }}>My Playlist</h2>
              <button className="button" onClick={() => setScreen('landing')}>
                ← Back
              </button>
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
                        onChange={(e) => setDraft(e.target.value)}
                        style={{
                          width: '100%',
                          padding: 8,
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--fg)',
                        }}
                      />
                      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <button className="button primary" onClick={() => onSaveNote(t.id)}>
                          Save note
                        </button>
                        <button className="button" onClick={() => onCancelNote(t.id)}>
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
  const nodeRef = useRef(null)

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
    } else if (phase !== 'idle') {
      if (reduceMotion) {
        setPhase('idle')
        return
      }
      setPhase('exit')
      const t = setTimeout(() => setPhase('idle'), 150)
      return () => clearTimeout(t)
    }
  }, [show])

  if (!show && phase === 'idle') return null

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
        <button className="button" onClick={onClose} aria-label="Close undo">
          ✕
        </button>
      </div>
    </div>
  )
}
