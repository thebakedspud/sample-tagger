import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDeviceContext,
  clearRecoveryAcknowledgement,
  clearRecoveryState,
  ensureRecoveryCsrfToken,
  getAnonId,
  getDeviceId,
  getRecoveryAcknowledgement,
  getStoredRecoveryCode,
  hasAcknowledgedRecovery,
  markRecoveryAcknowledged,
  saveRecoveryCode,
  setAnonId,
  setDeviceId,
} from '../deviceState.js';

describe('deviceState helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearDeviceContext();
    clearRecoveryAcknowledgement();
    document.cookie = '';
  });

  it('persists device and anon ids', () => {
    expect(getDeviceId()).toBeNull();
    setDeviceId('device-1');
    expect(getDeviceId()).toBe('device-1');

    setAnonId('anon-1');
    expect(getAnonId()).toBe('anon-1');
  });

  it('handles recovery code storage and acknowledgement', () => {
    saveRecoveryCode('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(getStoredRecoveryCode()).toBe('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(hasAcknowledgedRecovery('AAAAA-BBBBB-CCCCC-DDDDD')).toBe(false);

    markRecoveryAcknowledged('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(hasAcknowledgedRecovery('AAAAA-BBBBB-CCCCC-DDDDD')).toBe(true);

    clearRecoveryState();
    expect(getStoredRecoveryCode()).toBeNull();
  });

  it('clears everything on clearDeviceContext', () => {
    setDeviceId('device-2');
    setAnonId('anon-2');
    saveRecoveryCode('AAAAA-BBBBB-CCCCC-DDDDD');
    markRecoveryAcknowledged('AAAAA-BBBBB-CCCCC-DDDDD');

    clearDeviceContext();
    expect(getDeviceId()).toBeNull();
    expect(getAnonId()).toBeNull();
    expect(getStoredRecoveryCode()).toBeNull();
  });

  it('ignores invalid inputs and malformed acknowledgement payloads', () => {
    setDeviceId('');
    setAnonId('');
    expect(window.localStorage.getItem('sta:device-id')).toBeNull();
    expect(window.localStorage.getItem('sta:anon-id')).toBeNull();

    window.localStorage.setItem('sta:recovery-ack', 'not-json');
    expect(hasAcknowledgedRecovery('code-1')).toBe(false);
  });

  it('reuses stored acknowledgement when no code provided', () => {
    markRecoveryAcknowledged('code-123');
    const ack = getRecoveryAcknowledgement();
    expect(ack?.code).toBe('code-123');
    expect(typeof ack?.acknowledgedAt).toBe('number');
    expect(hasAcknowledgedRecovery()).toBe(true);
  });

  it('reuses runtime csrf tokens while refreshing cookies', () => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
    const first = ensureRecoveryCsrfToken();
    expect(first).toMatch(/csrf|-/);
    const cookieAfterFirst = document.cookie;

    vi.setSystemTime(new Date('2024-01-01T00:00:05Z'));
    const second = ensureRecoveryCsrfToken();
    expect(second).toBe(first);
    expect(document.cookie).toBe(cookieAfterFirst);
    vi.useRealTimers();
  });

  it('hydrates csrf token from storage when still valid', () => {
    const now = Date.now();
    window.localStorage.setItem(
      'sta:recovery-csrf',
      JSON.stringify({ token: 'stored-token', expiresAt: now + 60_000 }),
    );
    const token = ensureRecoveryCsrfToken();
    expect(token).toBe('stored-token');
    expect(document.cookie).toContain('sta_recovery_csrf=stored-token');
  });

  it('generates fresh csrf tokens when stored values are invalid', () => {
    window.localStorage.setItem('sta:recovery-csrf', 'invalid-json');
    const token = ensureRecoveryCsrfToken();
    expect(token).toMatch(/csrf|-/);
    expect(window.localStorage.getItem('sta:recovery-csrf')).toContain(token);
  });
});
