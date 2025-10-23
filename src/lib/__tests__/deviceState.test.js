import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDeviceId,
  setDeviceId,
  getAnonId,
  setAnonId,
  saveRecoveryCode,
  getStoredRecoveryCode,
  hasAcknowledgedRecovery,
  markRecoveryAcknowledged,
  clearRecoveryState,
  clearDeviceContext,
} from '../deviceState.js';

describe('deviceState helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearDeviceContext();
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
});
