// src/components/UndoPlaceholder.jsx
import { useEffect, useRef } from 'react'
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
  const hoveredRef = useRef(false) // ref so RAF loop reads the current value

  // Start/stop the countdown, pausing while focused or hovered
  useEffect(() => {
    btnRef.current?.focus()
    lastTickRef.current = performance.now()

    function isDomFocused() {
      return document.activeElement === btnRef.current
    }

    function expireNow() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // Return focus first (safe target)
      focusById(fallbackFocusId)
      onDismiss?.(pendingId)
    }

    function tick(now) {
      const elapsed = now - lastTickRef.current
      lastTickRef.current = now

      // Pause if the Undo button is focused or hovered
      if (!isDomFocused() && !hoveredRef.current) {
        remainingRef.current -= elapsed
        if (remainingRef.current <= 0) {
          expireNow()
          return
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // deps: we reference only stable refs + props used in expire
  }, [fallbackFocusId, onDismiss, pendingId])

  function handleExpire() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    focusById(fallbackFocusId)
    onDismiss?.(pendingId)
  }

  function handleUndo() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    onUndo?.(pendingId)
    // restore focus to a sensible control on next frame
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
        onMouseEnter={() => { hoveredRef.current = true }}
        onMouseLeave={() => { hoveredRef.current = false }}
      >
        Undo
      </button>

      {onDismiss && (
        <button
          type="button"
          className="btn-link"
          aria-label="Dismiss undo"
          onClick={handleExpire}
          onMouseEnter={() => { hoveredRef.current = true }}
          onMouseLeave={() => { hoveredRef.current = false }}
        >
          ×
        </button>
      )}
    </div>
  )
}
