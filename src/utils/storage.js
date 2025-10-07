// src/utils/storage.js

// Keep a versioned key so older saves don’t conflict
const LS_KEY = 'sta:v2';
const STORAGE_VERSION = 2;

// ✅ Load and normalise any saved data
export function loadAppState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Validate: must have provider + track IDs like sp-/yt-/sc-
    const hasValidPlaylist =
      parsed.provider &&
      Array.isArray(parsed.tracks) &&
      parsed.tracks.length > 0 &&
      parsed.tracks.every(t => t?.id && /^(sp|yt|sc)-/.test(t.id));

    // If old shape or no provider, reset but keep theme
    if (!hasValidPlaylist || parsed.version !== STORAGE_VERSION) {
      return {
        version: STORAGE_VERSION,
        theme: parsed?.theme ?? 'dark',
        provider: null,
        title: '',
        tracks: [],
        notes: [],
      };
    }

    return parsed;
  } catch {
    // ignore parse errors (e.g. private mode, corrupted JSON)
    return null;
  }
}

// ✅ Save current app state
export function saveAppState(state) {
  try {
    const next = { version: STORAGE_VERSION, ...state };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota or private-mode errors
  }
}

// ✅ Clear saved state, preserving theme if provided
export function clearAppState(preserve = {}) {
  try {
    const cleared = {
      version: STORAGE_VERSION,
      theme: preserve.theme ?? 'dark',
      provider: null,
      title: '',
      tracks: [],
      notes: [],
    };
    localStorage.setItem(LS_KEY, JSON.stringify(cleared));
    return cleared;
  } catch {
    return null;
  }
}
