// src/components/UndoPlaceholder.jsx
import { useEffect, useRef } from 'react';
import { focusById } from '../utils/focusById.js'; // ensure this exists

export default function UndoPlaceholder({
  onUndo,               // function (pendingId?) -> void
  onDismiss,            // optional function (pendingId?) -> void
  label = 'Note deleted.',
  announceRefocus,      // optional function
  idForA11y,            // string used by aria-labelledby
  restoreFocusId,       // e.g. "note-del-<trackId>-<noteId>"
  fallbackFocusId,      // e.g. "add-note-<trackId>"
  pendingId             // optional, pass-through to callbacks
}) {
  const btnRef = useRef(null);

  // Auto-focus the Undo button when this placeholder mounts
  useEffect(() => {
    btnRef.current?.focus();
    // If you want this to announce when focus changes to the Undo button
    announceRefocus?.();
  }, [announceRefocus]);

  function restoreFocus() {
    if (restoreFocusId) {
      focusById(restoreFocusId);
    } else if (fallbackFocusId) {
      focusById(fallbackFocusId);
    }
  }

  function handleUndo() {
    // Execute parent undo (restores the note in state)
    onUndo?.(pendingId);
    // Give React one paint so the restored button exists in the DOM
    requestAnimationFrame(restoreFocus);
  }

  function handleDismiss() {
    onDismiss?.(pendingId);
    requestAnimationFrame(restoreFocus);
  }

  return (
    <div
      role="group"
      aria-labelledby={idForA11y}
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
      <span id={idForA11y}>{label}</span>
      <button
        ref={btnRef}
        type="button"
        className="btn-link"
        onClick={handleUndo}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleUndo();
          }
        }}
      >
        Undo
      </button>
      {onDismiss && (
        <button
          type="button"
          className="btn-link"
          aria-label="Dismiss undo"
          onClick={handleDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}
