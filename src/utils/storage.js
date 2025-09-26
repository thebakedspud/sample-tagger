// src/utils/storage.js
const LS_KEY = 'sta:v1';

export function loadAppState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAppState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

export function clearAppState() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}
