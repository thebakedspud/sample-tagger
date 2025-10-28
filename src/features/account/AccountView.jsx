import { useEffect, useMemo, useRef, useState } from 'react';
import ThemeToggle from '../../components/ThemeToggle.jsx';
import FontSettings from '../../components/display/FontSettings.jsx';

function maskCodeSegment(segment, index, segments) {
  if (!segment) return '';
  const isLast = index === segments.length - 1;
  if (isLast && segment.length > 1) {
    const visible = segment.slice(-2);
    return `${'*'.repeat(Math.max(0, segment.length - 2))}${visible}`;
  }
  return '*'.repeat(segment.length);
}

function formatMasked(code) {
  if (!code) return '----';
  const segments = code.split('-');
  return segments
    .map((segment, index) => maskCodeSegment(segment, index, segments))
    .join('-');
}

function formatTimestamp(timestamp) {
  if (!timestamp) return null;
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (_err) {
    return null;
  }
}

export default function AccountView({
  anonId,
  deviceId,
  recoveryCode,
  recoveryAcknowledgedAt,
  recoveryCopyButtonRef,
  onConfirmRegenerate,
  onCopyRecoveryCode,
  regeneratingRecoveryCode = false,
  regenerationError = null,
  onOpenRestoreDialog,
  onOpenSpotifyLink,
  spotifyLinked = false,
  spotifyAccountLabel = '',
  emailLinkingEnabled = false,
  onRequestRecoveryModal,
  showBackupPrompt = false,
}) {
  const [masked, setMasked] = useState(true);
  const autoMaskTimer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  const safeCode = recoveryCode ?? '';
  const displayCode = masked ? formatMasked(safeCode) : safeCode;
  const ackLabel = useMemo(
    () => formatTimestamp(recoveryAcknowledgedAt),
    [recoveryAcknowledgedAt]
  );

  const spotifyStatus = spotifyLinked
    ? spotifyAccountLabel || 'Linked'
    : 'Not linked';

  useEffect(() => {
    if (!masked) {
      if (autoMaskTimer.current) clearTimeout(autoMaskTimer.current);
      autoMaskTimer.current = setTimeout(() => {
        setMasked(true);
      }, 30_000);
    }
    return () => {
      if (autoMaskTimer.current) {
        clearTimeout(autoMaskTimer.current);
        autoMaskTimer.current = null;
      }
    };
  }, [masked]);

  useEffect(() => {
    // Reset masked view whenever the code changes.
    setMasked(true);
  }, [recoveryCode]);

  const handleToggleMask = () => {
    if (!recoveryCode) return;
    setMasked((prev) => !prev);
  };

  const handleRegenerateClick = () => {
    if (regeneratingRecoveryCode) return;
    const confirmMessage =
      'This will replace your current recovery code. The old one will stop working. Continue?';
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;
    onConfirmRegenerate?.();
  };

  return (
    <div className="account-screen" role="region" aria-label="Account settings">
      <section
        className="card account-card account-summary-card"
        aria-labelledby="account-heading"
      >
        <header className="account-card__header">
          <div>
            <h1 id="account-heading">Account</h1>
            <p className="account-card__description">
              Your notes are tied to this anonymous ID. Save your recovery code
              to restore on another device.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={handleToggleMask}
            aria-pressed={!masked}
            disabled={!recoveryCode}
          >
            {masked ? 'Reveal code' : 'Hide code'}
          </button>
        </header>

        <div className="account-summary__code">
          <code aria-live="polite">{displayCode}</code>
        </div>

        <dl className="account-summary__meta">
          <div>
            <dt>Device ID</dt>
            <dd>{deviceId ?? 'Not registered yet'}</dd>
          </div>
          <div>
            <dt>Anon ID</dt>
            <dd>{anonId ?? 'Pending'}</dd>
          </div>
          <div>
            <dt>Recovery status</dt>
            <dd>
              {ackLabel
                ? `Saved on ${ackLabel}`
                : 'Not saved yet - make sure you copy it'}
            </dd>
          </div>
        </dl>

        <div className="row account-summary__actions">
          <button
            type="button"
            className="btn"
            ref={recoveryCopyButtonRef}
            onClick={onCopyRecoveryCode}
            disabled={!recoveryCode}
          >
            Copy ID
          </button>
          <button
            type="button"
            className="btn destructive"
            onClick={handleRegenerateClick}
            disabled={regeneratingRecoveryCode}
          >
            {regeneratingRecoveryCode ? 'Regenerating...' : 'Regenerate'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onRequestRecoveryModal}
            disabled={!recoveryCode}
          >
            Backup options
          </button>
        </div>
        {regenerationError && (
          <p role="alert" className="account-summary__error">
            {regenerationError}
          </p>
        )}
        {showBackupPrompt && (
          <div className="account-summary__backup">
            <p>
              New recovery code ready. Back it up to stay in sync across
              devices.
            </p>
            <button type="button" className="btn" onClick={onRequestRecoveryModal}>
              Back up now
            </button>
          </div>
        )}
      </section>

      <section className="card account-card">
        <header className="account-card__header">
          <div>
            <h2>Spotify Account</h2>
            <p className="account-card__description">
              Connect to import playlists directly.
            </p>
          </div>
          <span
            className={`account-status${
              spotifyLinked ? ' account-status--active' : ''
            }`}
            aria-live="polite"
          >
            {spotifyLinked ? 'Linked' : 'Not linked'}
          </span>
        </header>
        <p className="account-card__note">{spotifyStatus}</p>
        <div className="row account-card__actions">
          <button
            type="button"
            className="btn"
            onClick={onOpenSpotifyLink}
          >
            {spotifyLinked ? 'Delink Spotify Account' : 'Link Spotify Account'}
          </button>
        </div>
      </section>

      <section className="card account-card">
        <header className="account-card__header">
          <div>
            <h2>Recover Notes</h2>
            <p className="account-card__description">
              Restore notes from another device with your recovery code.
            </p>
          </div>
        </header>
        <div className="row account-card__actions">
          <button
            type="button"
            className="btn"
            onClick={onOpenRestoreDialog}
          >
            Recover Notes
          </button>
        </div>
      </section>

      <section className="card account-card">
        <header className="account-card__header">
          <div>
            <h2>Link an Email Address</h2>
            <p className="account-card__description">
              Optional - get recovery help without losing anonymity.
            </p>
          </div>
        </header>
        <div className="row account-card__actions">
          <button
            type="button"
            className="btn"
            disabled={!emailLinkingEnabled}
            aria-disabled={!emailLinkingEnabled ? 'true' : undefined}
          >
            Link Email
          </button>
          {!emailLinkingEnabled && (
            <span className="account-card__note">
              Coming soon - email linking is disabled for now.
            </span>
          )}
        </div>
      </section>

      <section className="card account-card">
        <header className="account-card__header">
          <div>
            <h2>Font &amp; Display</h2>
            <p className="account-card__description">
              Choose how the app looks and feels.
            </p>
          </div>
        </header>
        <div className="display-settings">
          <ThemeToggle />
          <FontSettings />
        </div>
      </section>
    </div>
  );
}
