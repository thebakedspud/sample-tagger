import { useEffect, useMemo, useRef, useState } from 'react';
import ThemeToggle from '../../components/ThemeToggle.jsx';
import FontSettings from '../../components/display/FontSettings.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';

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

/**
 * @typedef {Object} AccountViewProps
 * @property {string|null} [anonId]
 * @property {string|null} [deviceId]
 * @property {string|null} [recoveryCode]
 * @property {Date|string|null} [recoveryAcknowledgedAt]
 * @property {import('react').RefObject<HTMLButtonElement>} [recoveryCopyButtonRef]
 * @property {() => void} [onConfirmRegenerate]
 * @property {() => void} [onCopyRecoveryCode]
 * @property {boolean} [regeneratingRecoveryCode]
 * @property {string|null} [regenerationError]
 * @property {() => void} [onOpenRestoreDialog]
 * @property {() => void} [onRequestRecoveryModal]
 * @property {boolean} [showBackupPrompt]
 * @property {() => void} [onOpenSpotifyLink]
 * @property {boolean} [spotifyLinked]
 * @property {string} [spotifyAccountLabel]
 * @property {boolean} [emailLinkingEnabled]
 */

/**
 * @param {AccountViewProps} props
 */
export default function AccountView({
  anonId = null,
  deviceId = null,
  recoveryCode,
  recoveryAcknowledgedAt,
  recoveryCopyButtonRef,
  onConfirmRegenerate,
  onCopyRecoveryCode,
  regeneratingRecoveryCode = false,
  regenerationError = null,
  onOpenRestoreDialog,
  onRequestRecoveryModal,
  onOpenSpotifyLink,
  spotifyLinked = false,
  spotifyAccountLabel = '',
  emailLinkingEnabled = false,
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
              Your notes are tied to this anonymous recovery code. Save your
              recovery code to restore notes and tags on another device or
              browser.
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
        <ErrorMessage id="account-summary-error" className="account-summary__error">
          {regenerationError}
        </ErrorMessage>
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

      {/* Spotify Account and Link Email cards intentionally hidden for now */}
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
