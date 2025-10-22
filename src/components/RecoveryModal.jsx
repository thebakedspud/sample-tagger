import { useEffect, useState, useRef } from 'react';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  zIndex: 1000,
};

const modalStyle = {
  width: 'min(560px, 100%)',
  backgroundColor: 'var(--surface, #0f1115)',
  borderRadius: 12,
  border: '1px solid var(--border, rgba(255,255,255,0.1))',
  padding: '28px',
  color: 'var(--fg, #f7f7f7)',
  boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
};

const codeStyle = {
  fontFamily: 'var(--mono, "Fira Code", monospace)',
  fontSize: '1.4rem',
  letterSpacing: '0.08em',
  textAlign: 'center',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 8,
  padding: '16px',
  margin: '18px 0',
  wordSpacing: '0.12em',
};

export default function RecoveryModal({
  open,
  code,
  onAcknowledge,
  onCopy,
  onDownload,
}) {
  const [ackChecked, setAckChecked] = useState(false);
  const [feedback, setFeedback] = useState('');
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) {
      setAckChecked(false);
      setFeedback('');
      confirmRef.current?.focus({ preventScroll: true });
    }
  }, [open, code]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setFeedback('Copied to clipboard.');
      onCopy?.();
    } catch (_err) {
      setFeedback('Unable to copy automatically. Please copy manually.');
    }
  };

  const handleDownload = () => {
    if (!code) return;
    const now = new Date();
    const humanTime = now.toLocaleString();
    const contents = [
      'Sample Tagger — Recovery Code',
      `Generated: ${humanTime}`,
      '',
      `Recovery code: ${code}`,
      '',
      'Keep this code safe. It is the only way to regain access to your notes if this device is lost or cleared.',
    ].join('\n');

    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const timestampSlug = now.toISOString().replace(/[:.]/g, '-');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sample-tagger-recovery-${timestampSlug}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setFeedback('Downloaded .txt file.');
    onDownload?.();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!ackChecked || !code) return;
    onAcknowledge?.();
  };

  return (
    <div style={overlayStyle} role="presentation">
      <div
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-modal-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <h2 id="recovery-modal-title" style={{ marginTop: 0 }}>
          Save your recovery code
        </h2>
        <p style={{ marginBottom: 12 }}>
          This one-time code lets you restore your anonymous notes on a new device.
          Store it securely before continuing.
        </p>
        <div style={codeStyle} aria-live="polite">
          {code}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={handleCopy}>
            Copy to clipboard
          </button>
          <button type="button" className="btn" onClick={handleDownload}>
            Download .txt
          </button>
          <button type="button" className="btn" disabled title="Email linking coming soon">
            Email (coming soon)
          </button>
        </div>
        {feedback && (
          <p style={{ marginTop: 12, color: 'var(--muted, #9aa1b5)' }}>{feedback}</p>
        )}
        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              type="checkbox"
              checked={ackChecked}
              onChange={(event) => setAckChecked(event.target.checked)}
            />
            <span>
              I understand that losing this code means losing access to all my notes forever.
            </span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button
              ref={confirmRef}
              type="submit"
              className="btn primary"
              disabled={!ackChecked}
            >
              I saved the code
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
