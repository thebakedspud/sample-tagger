// src/utils/storage.js
const LS_KEY = 'sta:v1';

export function loadAppState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    // Intentionally ignore read/parse errors (e.g. private mode, corrupted JSON)
    return null;
  }
}

export function saveAppState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // Intentionally ignore write errors (quota exceeded, private mode)
    // console.warn('Storage save failed', e); // enable during dev if needed
  }
}

export function clearAppState() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // Intentionally ignore clear errors (non-blocking)
  }
}
