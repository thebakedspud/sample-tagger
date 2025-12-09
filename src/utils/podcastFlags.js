// src/utils/podcastFlags.js
// Helpers for reading the VITE_ENABLE_PODCASTS flag with test overrides.

const TRUE_LITERALS = new Set(['1', 'true', 'yes', 'on']);
const FALSE_LITERALS = new Set(['0', 'false', 'no', 'off']);
const GLOBAL_OVERRIDE_KEY = '__PLAYLIST_NOTES_ENABLE_PODCASTS_OVERRIDE__';

function coerceFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value == null) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return false;
    if (TRUE_LITERALS.has(trimmed)) return true;
    if (FALSE_LITERALS.has(trimmed)) return false;
    return true;
  }
  return Boolean(value);
}

function readOverride() {
  if (typeof globalThis === 'undefined') return undefined;
  if (Object.prototype.hasOwnProperty.call(globalThis, GLOBAL_OVERRIDE_KEY)) {
    return globalThis[GLOBAL_OVERRIDE_KEY];
  }
  return undefined;
}

export function isPodcastImportEnabled() {
  const override = readOverride();
  if (override !== undefined) {
    return coerceFlag(override);
  }
  return coerceFlag(import.meta?.env?.VITE_ENABLE_PODCASTS);
}

export function __setPodcastFlagOverrideForTests(value) {
  if (typeof globalThis === 'undefined') return;
  if (value === undefined) {
    delete globalThis[GLOBAL_OVERRIDE_KEY];
  } else {
    globalThis[GLOBAL_OVERRIDE_KEY] = value;
  }
}
