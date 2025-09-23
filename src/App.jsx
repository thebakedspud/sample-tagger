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

  // VERY SIMPLE "ROUTING"
  const [screen, setScreen] = useState('landing') // 'landing' | 'playlist'

  // ANNOUNCEMENTS (for screen readers)
  const liveRef = useRef(null)
  const announce = (msg) => {
    if (!liveRef.current) return
    liveRef.current.textContent = '' // clear
    // tiny delay helps some SRs pick up consecutive messages
    setTimeout(() => {
      liveRef.current.textContent = msg
    }, 30)
  }

  // DUMMY DATA (in-memory)
  const [tracks, setTracks] = useState([
    { id: 1, title: 'Nautilus', artist: 'Bob James', notes: [] },
    { id: 2, title: 'Electric Relaxation', artist: 'A Tribe Called Quest', notes: [] },
    { id: 3, title: 'The Champ', artist: 'The Mohawks', notes: [] },
  ])

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')

  const onImportClick = () => {
    setScreen('playlist')
    announce('Imported 3 tracks. Playlist view loaded.')
  }

  const onAddNote = (trackId) => {
    setEditingId(trackId)
    setDraft('')
    // Move focus to textarea after it appears
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
    // Return focus to the Add note button
    const btn = document.getElementById(`add-note-btn-${trackId}`)
    btn?.focus()
  }

  const onCancelNote = (trackId) => {
    setEditingId(null)
    setDraft('')
    announce('Note cancelled.')
    // Return focus to the Add note button
    const btn = document.getElementById(`add-note-btn-${trackId}`)
    btn?.focus()
  }

  return (
    // LANDMARKS + LIVE REGION
    <>
      <header style={{ maxWidth: 880, margin: '20px auto 0', padding: '0 16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
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

      {/* Live region for announcements */}
      <div
        ref={liveRef}
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          left: -9999,
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
      />

      <main style={{ maxWidth: 880, margin: '24px auto 60px', padding: '0 16px' }}>
        {screen === 'landing' && (
          <section aria-labelledby="landing-title">
            <h2 id="landing-title" style={{ marginTop: 0 }}>
              Get started
            </h2>
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 id="playlist-title" style={{ marginTop: 0 }}>
                My Playlist
              </h2>
              <button className="button" onClick={() => setScreen('landing')}>
                ← Back
              </button>
            </div>

            {/* Real list semantics */}
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
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      <strong>{i + 1}.</strong> {t.title} — {t.artist}
                      {t.notes.length > 0 && (
                        <span style={{ marginLeft: 8, color: 'var(--muted)' }}>
                          · {t.notes.length} note{t.notes.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {/* Visible alternative to right-click */}
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

                  {/* Existing notes */}
                  {t.notes.length > 0 && (
                    <ul
                      role="list"
                      style={{ marginTop: 8, marginBottom: 0, paddingLeft: 16 }}
                    >
                      {t.notes.map((n, idx) => (
                        <li key={idx} style={{ color: 'var(--fg)' }}>
                          – {n}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Inline note editor */}
                  {editingId === t.id && (
                    <div style={{ marginTop: 10 }}>
                      <label
                        htmlFor={`note-input-${t.id}`}
                        style={{ display: 'block', marginBottom: 6 }}
                      >
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
                        <button
                          className="button primary"
                          onClick={() => onSaveNote(t.id)}
                        >
                          Save note
                        </button>
                        <button
                          className="button"
                          onClick={() => onCancelNote(t.id)}
                        >
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

      <footer
        style={{
          maxWidth: 880,
          margin: '0 auto 24px',
          padding: '0 16px',
          color: 'var(--muted)',
        }}
      >
        <small>Prototype · Keyboard-first, accessible-by-default</small>
      </footer>
    </>
  )
}
