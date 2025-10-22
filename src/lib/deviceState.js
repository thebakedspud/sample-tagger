const DEVICE_KEY = 'sta:device-id';
const ANON_KEY = 'sta:anon-id';
const RECOVERY_KEY = 'sta:recovery-code';
const RECOVERY_ACK_KEY = 'sta:recovery-ack';

let runtimeDeviceId = null;
let runtimeAnonId = null;

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getDeviceId() {
  if (runtimeDeviceId) return runtimeDeviceId;
  if (!isBrowser()) return null;
  const stored = window.localStorage.getItem(DEVICE_KEY);
  runtimeDeviceId = stored || null;
  return runtimeDeviceId;
}

export function setDeviceId(deviceId) {
  if (typeof deviceId !== 'string' || !deviceId) return;
  runtimeDeviceId = deviceId;
  if (isBrowser()) {
    window.localStorage.setItem(DEVICE_KEY, deviceId);
  }
}

export function getAnonId() {
  if (runtimeAnonId) return runtimeAnonId;
  if (!isBrowser()) return null;
  const stored = window.localStorage.getItem(ANON_KEY);
  runtimeAnonId = stored || null;
  return runtimeAnonId;
}

export function setAnonId(anonId) {
  if (typeof anonId !== 'string' || !anonId) return;
  runtimeAnonId = anonId;
  if (isBrowser()) {
    window.localStorage.setItem(ANON_KEY, anonId);
  }
}

export function saveRecoveryCode(recoveryCode) {
  if (typeof recoveryCode !== 'string' || !recoveryCode) return;
  if (!isBrowser()) return;
  window.localStorage.setItem(RECOVERY_KEY, recoveryCode);
}

export function getStoredRecoveryCode() {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(RECOVERY_KEY);
}

export function hasAcknowledgedRecovery(recoveryCode) {
  if (!isBrowser()) return false;
  const serialized = window.localStorage.getItem(RECOVERY_ACK_KEY);
  if (!serialized || typeof serialized !== 'string') return false;
  try {
    const parsed = JSON.parse(serialized);
    if (!recoveryCode) {
      return Boolean(parsed?.code);
    }
    return parsed?.code === recoveryCode;
  } catch (_err) {
    return false;
  }
}

export function markRecoveryAcknowledged(recoveryCode) {
  if (!isBrowser() || typeof recoveryCode !== 'string' || !recoveryCode) return;
  const payload = {
    code: recoveryCode,
    acknowledgedAt: Date.now(),
  };
  window.localStorage.setItem(RECOVERY_ACK_KEY, JSON.stringify(payload));
}

export function clearRecoveryState() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(RECOVERY_KEY);
  window.localStorage.removeItem(RECOVERY_ACK_KEY);
}

export function clearDeviceContext() {
  runtimeDeviceId = null;
  runtimeAnonId = null;
  if (isBrowser()) {
    window.localStorage.removeItem(DEVICE_KEY);
    window.localStorage.removeItem(ANON_KEY);
  }
  clearRecoveryState();
}
