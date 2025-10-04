// src/components/UndoPlaceholder.jsx
import { useEffect, useRef, useState } from 'react'
import { focusById } from '../utils/focusById.js'

export default function UndoPlaceholder({
  onUndo,            // (pendingId?) -> void
  onDismiss,         // optional (pendingId?) -> void
  restoreFocusId,    // e.g. "note-del-<trackId>-<noteId>"
  fallbackFocusId,   // e.g. "add-note-<trackId>"
  pendingId,         // optional passthrough
  windowMs = 8000    // can tweak if you want more/less time
}) {
  const btnRef = useRef(null)
  const rafRef = useRef(null)
  const remainingRef = useRef(windowMs)
  const lastTickRef = useRef(0)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    btnRef.current?.focus()
    lastTickRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function isDomFocused() {
    return document.activeElement === btnRef.current
  }

  function tick(now) {
    const elapsed = now - lastTickRef.current
    lastTickRef.current = now

    // Pause if the Undo button is actually focused in the DOM, or hovered
    if (!isDomFocused() && !hovered) {
      remainingRef.current -= elapsed
      if (remainingRef.current <= 0) {
        handleExpire()
        return
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  function handleExpire() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    focusById(fallbackFocusId)
    onDismiss?.(pendingId)
  }

  function handleUndo() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    onUndo?.(pendingId)
    requestAnimationFrame(() => {
      focusById(restoreFocusId || fallbackFocusId)
    })
  }

  return (
    <div
      className="undo-inline"
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0.5rem 0.75rem',
        borderRadius: '8px',
        background: 'var(--card)',
      }}
    >
      {/* Visual label for sighted users; hidden from SR to avoid duplicate reads */}
      <span aria-hidden="true">Note deleted.</span>

      <button
        ref={btnRef}
        type="button"
        className="btn-link"
        onClick={handleUndo}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleUndo()
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        Undo
      </button>

      {onDismiss && (
        <button
          type="button"
          className="btn-link"
          aria-label="Dismiss undo"
          onClick={handleExpire}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          ×
        </button>
      )}
    </div>
  )
}
