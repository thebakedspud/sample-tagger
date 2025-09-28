// src/components/UndoPlaceholder.jsx
import { useEffect, useRef } from 'react';

export default function UndoPlaceholder({
  onUndo,
  label = 'Note deleted.',
  announceRefocus,
  idForA11y
}) {
  const btnRef = useRef(null);

  useEffect(() => {
    btnRef.current?.focus();
    announceRefocus?.();
  }, [announceRefocus]);

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
        onClick={onUndo}
      >
        Undo
      </button>
    </div>
  );
}
