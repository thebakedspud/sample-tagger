const DEVICE_KEY = 'sta:device-id';
const ANON_KEY = 'sta:anon-id';
const RECOVERY_KEY = 'sta:recovery-code';
const RECOVERY_ACK_KEY = 'sta:recovery-ack';
const RECOVERY_CSRF_KEY = 'sta:recovery-csrf';
const RECOVERY_CSRF_TTL_MS = 30 * 60 * 1000;
const DEVICE_CONTEXT_STALE_EVENT = 'sta:device-context-stale';

let runtimeDeviceId = null;
let runtimeAnonId = null;
let runtimeRecoveryCsrf = null;
let runtimeRecoveryCsrfExpiry = 0;

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

export function hasDeviceContext() {
  return Boolean(getDeviceId() && getAnonId());
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

export function getRecoveryAcknowledgement() {
  if (!isBrowser()) return null;
  const serialized = window.localStorage.getItem(RECOVERY_ACK_KEY);
  if (!serialized || typeof serialized !== 'string') return null;
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.code !== 'string' || !parsed.code) return null;
    const acknowledgedAt =
      typeof parsed.acknowledgedAt === 'number' ? parsed.acknowledgedAt : null;
    return { code: parsed.code, acknowledgedAt };
  } catch (_err) {
    return null;
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

export function clearRecoveryAcknowledgement() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(RECOVERY_ACK_KEY);
}

function setRecoveryCsrfCookie(token, ttlMs) {
  if (!isBrowser() || typeof token !== 'string' || !token) return;
  try {
    const maxAge = Math.max(60, Math.floor(ttlMs / 1000));
    const secure = window.location?.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `sta_recovery_csrf=${token}; Max-Age=${maxAge}; Path=/; SameSite=Strict${secure}`;
  } catch (_err) {
    // best effort
  }
}

function clearRecoveryCsrfCookie() {
  if (!isBrowser()) return;
  try {
    const secure = window.location?.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `sta_recovery_csrf=; Max-Age=0; Path=/; SameSite=Strict${secure}`;
  } catch (_err) {
    // best effort
  }
}

export function ensureRecoveryCsrfToken() {
  if (!isBrowser()) return null;
  const now = Date.now();
  if (runtimeRecoveryCsrf && runtimeRecoveryCsrfExpiry - now > 5000) {
    setRecoveryCsrfCookie(runtimeRecoveryCsrf, runtimeRecoveryCsrfExpiry - now);
    return runtimeRecoveryCsrf;
  }

  const storedRaw = window.localStorage.getItem(RECOVERY_CSRF_KEY);
  if (storedRaw) {
    try {
      const parsed = JSON.parse(storedRaw);
      const token = typeof parsed?.token === 'string' ? parsed.token : '';
      const expiresAt =
        typeof parsed?.expiresAt === 'number' ? parsed.expiresAt : 0;
      if (token && expiresAt - now > 5000) {
        runtimeRecoveryCsrf = token;
        runtimeRecoveryCsrfExpiry = expiresAt;
        setRecoveryCsrfCookie(token, expiresAt - now);
        return token;
      }
    } catch (_err) {
      // fall through
    }
  }

  const fresh =
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `csrf-${now}-${Math.random().toString(16).slice(2)}`);
  const expiresAt = now + RECOVERY_CSRF_TTL_MS;
  runtimeRecoveryCsrf = fresh;
  runtimeRecoveryCsrfExpiry = expiresAt;
  try {
    window.localStorage.setItem(
      RECOVERY_CSRF_KEY,
      JSON.stringify({ token: fresh, expiresAt })
    );
  } catch (_err) {
    // best effort: still usable within runtime
  }
  setRecoveryCsrfCookie(fresh, RECOVERY_CSRF_TTL_MS);
  return fresh;
}

export function clearRecoveryState() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(RECOVERY_KEY);
  clearRecoveryAcknowledgement();
  window.localStorage.removeItem(RECOVERY_CSRF_KEY);
  runtimeRecoveryCsrf = null;
  runtimeRecoveryCsrfExpiry = 0;
  clearRecoveryCsrfCookie();
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

export function notifyDeviceContextStale(detail = null) {
  if (!isBrowser() || typeof window.dispatchEvent !== 'function') return;
  try {
    const event = new CustomEvent(DEVICE_CONTEXT_STALE_EVENT, { detail });
    window.dispatchEvent(event);
  } catch (_err) {
    // no-op
  }
}

export function subscribeDeviceContextStale(callback) {
  if (!isBrowser() || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (event) => {
    try {
      callback?.(event?.detail ?? null);
    } catch (_err) {
      // suppress subscriber errors to avoid breaking global listeners
    }
  };
  window.addEventListener(DEVICE_CONTEXT_STALE_EVENT, handler);
  return () => window.removeEventListener(DEVICE_CONTEXT_STALE_EVENT, handler);
}

export { DEVICE_CONTEXT_STALE_EVENT };
