const DEVICE_KEY = 'sta:device-id';
const ANON_KEY = 'sta:anon-id';
const RECOVERY_KEY = 'sta:recovery-code';

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

export function storeRecoveryCodeOnce(recoveryCode) {
  if (typeof recoveryCode !== 'string' || !recoveryCode) return;
  if (!isBrowser()) return;
  if (!window.localStorage.getItem(RECOVERY_KEY)) {
    window.localStorage.setItem(RECOVERY_KEY, recoveryCode);
  }
}

export function getStoredRecoveryCode() {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(RECOVERY_KEY);
}

export function clearDeviceContext() {
  runtimeDeviceId = null;
  runtimeAnonId = null;
  if (isBrowser()) {
    window.localStorage.removeItem(DEVICE_KEY);
    window.localStorage.removeItem(ANON_KEY);
  }
}
