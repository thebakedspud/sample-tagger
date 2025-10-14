// src/utils/storage.js
// Provides versioned persistence for the playlist app state.

/* eslint-env browser */
// @ts-check

/**
 * @typedef {'dark' | 'light'} Theme
 *
 * @typedef {Object} ImportMeta
 * @property {'spotify' | 'youtube' | 'soundcloud' | null} [provider]
 * @property {string | null} [playlistId]
 * @property {string | null} [snapshotId]
 * @property {string | null} [cursor]
 * @property {boolean} [hasMore]
 * @property {string | null} [sourceUrl]
 * @property {{ isMock?: boolean, lastErrorCode?: string | null } | null} [debug]
 *
 * @typedef {Object} PersistedTrack
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string[]} notes
 *
 * @typedef {Object} PersistedState
 * @property {number} version
 * @property {Theme} theme
 * @property {string} playlistTitle
 * @property {string | null} importedAt
 * @property {string} lastImportUrl
 * @property {PersistedTrack[]} tracks
 * @property {ImportMeta} importMeta
 */

const STORAGE_VERSION = 3;
const LS_KEY = 'sta:v3';
const LEGACY_KEYS = ['sta:v2'];
const VALID_PROVIDERS = new Set(['spotify', 'youtube', 'soundcloud']);

const EMPTY_META = Object.freeze({
  provider: null,
  playlistId: null,
  snapshotId: null,
  cursor: null,
  hasMore: false,
  sourceUrl: null,
  debug: null,
});

/** @returns {PersistedState | null} */
export function loadAppState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === STORAGE_VERSION) {
        return normalizeState(parsed);
      }
    }

    for (const legacyKey of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const migrated = migrateLegacy(JSON.parse(legacyRaw));
      if (migrated) {
        localStorage.setItem(LS_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }

    return null;
  } catch {
    // ignore malformed or unavailable storage
    return null;
  }
}

/** @param {Partial<PersistedState>} state */
export function saveAppState(state) {
  try {
    const payload = {
      version: STORAGE_VERSION,
      theme: sanitizeTheme(state?.theme),
      playlistTitle: sanitizeTitle(state?.playlistTitle),
      importedAt: typeof state?.importedAt === 'string' ? state.importedAt : null,
      lastImportUrl: typeof state?.lastImportUrl === 'string' ? state.lastImportUrl : '',
      tracks: sanitizeTracks(state?.tracks),
      importMeta: sanitizeImportMeta(state?.importMeta),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode errors
  }
}

/**
 * @param {Partial<PersistedState>} [preserve]
 * @returns {PersistedState | null}
 */
export function clearAppState(preserve = {}) {
  try {
    const cleared = createEmptyState(sanitizeTheme(preserve?.theme));
    localStorage.setItem(LS_KEY, JSON.stringify(cleared));
    return cleared;
  } catch {
    // ignore clear errors
    return null;
  }
}

// Helpers

/**
 * @param {Theme} [theme]
 * @returns {PersistedState}
 */
function createEmptyState(theme = 'dark') {
  return {
    version: STORAGE_VERSION,
    theme,
    playlistTitle: 'My Playlist',
    importedAt: null,
    lastImportUrl: '',
    tracks: [],
    importMeta: { ...EMPTY_META },
  };
}

/**
 * @param {any} data
 * @returns {PersistedState}
 */
function normalizeState(data) {
  const base = createEmptyState(sanitizeTheme(data?.theme));
  return {
    ...base,
    playlistTitle: sanitizeTitle(data?.playlistTitle) ?? base.playlistTitle,
    importedAt: typeof data?.importedAt === 'string' ? data.importedAt : base.importedAt,
    lastImportUrl: typeof data?.lastImportUrl === 'string' ? data.lastImportUrl : base.lastImportUrl,
    tracks: sanitizeTracks(data?.tracks),
    importMeta: sanitizeImportMeta(data?.importMeta),
  };
}

/**
 * @param {any} v2
 * @returns {PersistedState | null}
 */
function migrateLegacy(v2) {
  if (!v2 || typeof v2 !== 'object') return null;
  const theme = sanitizeTheme(v2?.theme);
  const playlistTitle = sanitizeTitle(v2?.playlistTitle ?? v2?.title);
  const tracks = sanitizeTracks(v2?.tracks);
  const lastImportUrl = typeof v2?.lastImportUrl === 'string' ? v2.lastImportUrl : '';

  const importMeta = sanitizeImportMeta({
    provider: v2?.provider,
    title: playlistTitle,
    sourceUrl: lastImportUrl,
  });

  return {
    version: STORAGE_VERSION,
    theme,
    playlistTitle: playlistTitle ?? 'My Playlist',
    importedAt: typeof v2?.importedAt === 'string' ? v2.importedAt : null,
    lastImportUrl,
    tracks,
    importMeta,
  };
}

/**
 * @param {unknown} theme
 * @returns {Theme}
 */
function sanitizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

/**
 * @param {unknown} title
 * @returns {string}
 */
function sanitizeTitle(title) {
  if (typeof title !== 'string') return 'My Playlist';
  const trimmed = title.trim();
  return trimmed || 'My Playlist';
}

/**
 * Build a clean list of PersistedTrack (no nulls).
 * @param {unknown} list
 * @returns {PersistedTrack[]}
 */
function sanitizeTracks(list) {
  if (!Array.isArray(list)) return [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {PersistedTrack[]} */
  const out = [];

  list.forEach((t, idx) => {
    if (!t || typeof t !== 'object') return;
    const id = safeString(/** @type {any} */(t).id) || `track-${idx + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      title: safeString(/** @type {any} */(t).title) || `Track ${idx + 1}`,
      artist: safeString(/** @type {any} */(t).artist) || 'Unknown Artist',
      notes: Array.isArray(/** @type {any} */(t).notes) ? [.../** @type {any} */(t).notes] : [],
    });
  });

  return out;
}

/**
 * @param {any} meta
 * @returns {ImportMeta}
 */
function sanitizeImportMeta(meta) {
  if (!meta || typeof meta !== 'object') return { ...EMPTY_META };
  const m = /** @type {any} */ (meta);
  const provider = VALID_PROVIDERS.has(m.provider) ? m.provider : null;
  const rawCursor = m.cursor;
  const cursor =
    typeof rawCursor === 'string' && rawCursor.trim().length > 0
      ? rawCursor.trim()
      : null;
  return {
    provider,
    playlistId: safeString(m.playlistId),
    snapshotId: safeString(m.snapshotId),
    cursor,
    hasMore: Boolean(m.hasMore) || Boolean(cursor),
    sourceUrl: safeString(m.sourceUrl),
    debug: sanitizeDebug(m.debug),
  };
}

/**
 * @param {any} debug
 * @returns {{ isMock: boolean, lastErrorCode: string | null } | null}
 */
function sanitizeDebug(debug) {
  if (!debug || typeof debug !== 'object') return null;
  const d = /** @type {any} */ (debug);
  return {
    isMock: Boolean(d.isMock),
    lastErrorCode: safeString(d.lastErrorCode) || null,
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeString(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed || '';
}
