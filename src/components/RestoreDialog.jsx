import { useEffect, useState, useRef } from 'react';

/** @type {import('react').CSSProperties} */
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  zIndex: 1000,
};

/** @type {import('react').CSSProperties} */
const dialogStyle = {
  width: 'min(520px, 100%)',
  backgroundColor: 'var(--surface, #0f1115)',
  borderRadius: 12,
  border: '1px solid var(--border, rgba(255,255,255,0.1))',
  padding: '26px',
  color: 'var(--fg, #f7f7f7)',
  boxShadow: '0 20px 48px rgba(0,0,0,0.45)',
};

export default function RestoreDialog({
  open,
  onClose,
  onSubmit,
  onRequestBackup,
  busy = false,
  error = null,
  hasLocalNotes = false,
}) {
  const [code, setCode] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(!hasLocalNotes);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setConfirmReplace(!hasLocalNotes);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
    }
  }, [open, hasLocalNotes]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (busy) return;
    if (!code) return;
    if (hasLocalNotes && !confirmReplace) return;
    onSubmit?.(code);
  };

  return (
    <div style={overlayStyle} role="presentation">
      <div
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-dialog-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <h2 id="restore-dialog-title" style={{ marginTop: 0 }}>
          Restore notes with your recovery code
        </h2>
        <p style={{ marginBottom: 18 }}>
          Enter the 20-character code you saved when you first joined. We’ll link this device to
          your existing notes.
        </p>
        {hasLocalNotes && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(255,196,0,0.08)',
              border: '1px solid rgba(255,196,0,0.25)',
              marginBottom: 18,
            }}
          >
            <strong>Heads up:</strong> this device already has local notes. Replacing will clear
            them. Export a backup first if you want to keep them.
            <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
              <button type="button" className="btn" onClick={onRequestBackup}>
                Download backup
              </button>
            </div>
            <label style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <input
                type="checkbox"
                checked={confirmReplace}
                onChange={(event) => setConfirmReplace(event.target.checked)}
              />
              <span>I’m okay replacing the notes on this device.</span>
            </label>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="restore-code-input" style={{ display: 'block', fontWeight: 600 }}>
            Recovery code
          </label>
          <input
            ref={inputRef}
            id="restore-code-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="AAAAA-BBBBB-CCCCC-DDDDD"
            value={code}
            onChange={(event) => {
              const value = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
              setCode(value);
            }}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              background: 'var(--card, #161920)',
              color: 'inherit',
              fontFamily: 'var(--mono, "Fira Code", monospace)',
              letterSpacing: '0.08em',
            }}
          />
          {error && (
            <p style={{ marginTop: 10, color: 'var(--error, #f87171)' }}>
              {error}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 12,
              marginTop: 24,
            }}
          >
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !code || (hasLocalNotes && !confirmReplace)}
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
