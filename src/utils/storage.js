// src/utils/storage.js
// Provides versioned persistence for the playlist app state.

/* eslint-env browser */
// @ts-check

/**
 * @typedef {'dark' | 'light'} Theme
 *
 * @typedef {'default' | 'system' | 'dyslexic'} FontPreference
 *
 * @typedef {{ font: FontPreference }} UiPrefs
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
 * @property {string=} thumbnailUrl
 * @property {string=} sourceUrl
 * @property {number=} durationMs
 * @property {string[]=} tags
 * @property {string=} album
 * @property {string=} dateAdded
 * @property {string=} importedAt
 * @property {number=} originalIndex
 * @property {'spotify' | 'youtube' | 'soundcloud'=} provider
 *
 * @typedef {Record<string, string[]>} NotesByTrack
 *
 * @typedef {Record<string, string[]>} TagsByTrack
 *
 * @typedef {Object} RecentPlaylist
 * @property {string} id // `${provider}:${playlistId}`
 * @property {'spotify' | 'youtube' | 'soundcloud'} provider
 * @property {string} playlistId
 * @property {string} title
 * @property {string} sourceUrl
 * @property {number} importedAt
 * @property {number} lastUsedAt
 * @property {string=} coverUrl
 * @property {number=} total
 * @property {boolean=} pinned
 *
 * @typedef {Object} PersistedState
 * @property {number} version
 * @property {Theme} theme
 * @property {string} playlistTitle
 * @property {string | null} importedAt
 * @property {string} lastImportUrl
 * @property {PersistedTrack[]} tracks
 * @property {ImportMeta} importMeta
 * @property {NotesByTrack} notesByTrack
 * @property {RecentPlaylist[]} recentPlaylists
 * @property {TagsByTrack} tagsByTrack
 * @property {UiPrefs} uiPrefs
 */

const STORAGE_VERSION = 6;
const LS_KEY = 'sta:v6';
const LEGACY_KEYS = ['sta:v5', 'sta:v4', 'sta:v3', 'sta:v2'];
const PENDING_MIGRATION_KEY = 'sta:v6:pending-migration';
const AUTO_BACKUP_KEY = 'sta:v6:auto-backup';
const VALID_PROVIDERS = new Set(['spotify', 'youtube', 'soundcloud']);
const RECENT_FALLBACK_TITLE = 'Untitled playlist';
const RECENT_DEFAULT_MAX = 8;
const TAG_ALLOWED_RE = /^[a-z0-9][a-z0-9\s\-_]*$/;
const TAG_MAX_LENGTH = 24;
const TAG_MAX_PER_TRACK = 32;
const FONT_PREF_DEFAULT = 'default';
const FONT_PREF_VALUES = new Set(['default', 'system', 'dyslexic']);

const EMPTY_META = Object.freeze({
  provider: null,
  playlistId: null,
  snapshotId: null,
  cursor: null,
  hasMore: false,
  sourceUrl: null,
  debug: null,
  total: null,
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
      if (typeof parsed?.version === 'number' && parsed.version < STORAGE_VERSION) {
        const normalized = normalizeState(parsed);
        setPendingMigrationSnapshot(normalized);
        const upgraded = { ...normalized, version: STORAGE_VERSION };
        persistState(upgraded);
        return upgraded;
      }
    }

    for (const legacyKey of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const migrated = migrateLegacy(JSON.parse(legacyRaw));
      if (migrated) {
        persistState(migrated);
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
    const stored = readStoredState();
    const existingRecents = sanitizeRecentList(stored?.recentPlaylists);
    const actualRecents =
      state?.recentPlaylists !== undefined
        ? sanitizeRecentList(state.recentPlaylists)
        : existingRecents;

    const existingPrefs = sanitizeUiPrefs(stored?.uiPrefs);
    const hasUiPrefs = state && Object.prototype.hasOwnProperty.call(state, 'uiPrefs');
    const actualPrefs = hasUiPrefs ? sanitizeUiPrefs(state?.uiPrefs) : existingPrefs;

    const payload = {
      version: STORAGE_VERSION,
      theme: sanitizeTheme(state?.theme),
      playlistTitle: sanitizeTitle(state?.playlistTitle),
      importedAt: typeof state?.importedAt === 'string' ? state.importedAt : null,
      lastImportUrl: typeof state?.lastImportUrl === 'string' ? state.lastImportUrl : '',
      tracks: sanitizeTracks(state?.tracks),
      importMeta: sanitizeImportMeta(state?.importMeta),
      notesByTrack: sanitizeNotesMap(state?.notesByTrack, state?.tracks),
      tagsByTrack: sanitizeTagsMap(state?.tagsByTrack, state?.tracks),
      recentPlaylists: actualRecents,
      uiPrefs: actualPrefs,
    };
    persistState(payload);
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
    const storedPrefs = readStoredState();
    const preservedPrefs =
      preserve?.uiPrefs !== undefined
        ? sanitizeUiPrefs(preserve.uiPrefs)
        : sanitizeUiPrefs(storedPrefs?.uiPrefs);
    const cleared = createEmptyState(sanitizeTheme(preserve?.theme));
    cleared.uiPrefs = preservedPrefs;
    persistState(cleared);
    return cleared;
  } catch {
    // ignore clear errors
    return null;
  }
}

/** @returns {RecentPlaylist[]} */
export function loadRecent() {
  const state = loadAppState();
  return state?.recentPlaylists ? [...state.recentPlaylists] : [];
}

/** @param {RecentPlaylist[]} list */
export function saveRecent(list) {
  try {
    const base = loadAppState() ?? createEmptyState();
    const next = {
      ...base,
      recentPlaylists: sanitizeRecentList(list),
    };
    persistState(next);
  } catch {
    // ignore persistence failures
  }
}

/**
 * @param {string} trackId
 * @returns {string[]}
 */
export function getTags(trackId) {
  const id = safeString(trackId);
  if (!id) return [];
  const state = loadAppState();
  if (!state || !state.tagsByTrack) return [];
  const tags = state.tagsByTrack[id];
  return Array.isArray(tags) ? [...tags] : [];
}

/**
 * @param {string} trackId
 * @param {string} tag
 * @returns {string[]}
 */
export function addTag(trackId, tag) {
  const id = safeString(trackId);
  const normalizedTag = normalizeTagValue(tag);
  if (!id || !normalizedTag) return getTags(trackId);
  const base = loadAppState() ?? createEmptyState();
  const currentMap = sanitizeTagsMap(base.tagsByTrack, base.tracks);
  const existing = currentMap[id] ? [...currentMap[id]] : [];
  if (!existing.includes(normalizedTag)) {
    existing.push(normalizedTag);
  }
  currentMap[id] = existing;
  const nextState = {
    ...base,
    version: STORAGE_VERSION,
    tagsByTrack: currentMap,
  };
  persistState(nextState);
  return [...currentMap[id]];
}

/**
 * @param {string} trackId
 * @param {string} tag
 * @returns {string[]}
 */
export function removeTag(trackId, tag) {
  const id = safeString(trackId);
  const normalizedTag = normalizeTagValue(tag);
  if (!id || !normalizedTag) return getTags(trackId);
  const base = loadAppState() ?? createEmptyState();
  const currentMap = sanitizeTagsMap(base.tagsByTrack, base.tracks);
  const existing = currentMap[id] ? [...currentMap[id]] : [];
  const nextList = existing.filter((entry) => entry !== normalizedTag);
  if (nextList.length > 0) {
    currentMap[id] = nextList;
  } else {
    delete currentMap[id];
  }
  const nextState = {
    ...base,
    version: STORAGE_VERSION,
    tagsByTrack: currentMap,
  };
  persistState(nextState);
  return currentMap[id] ? [...currentMap[id]] : [];
}

/** @returns {string[]} */
export function listAllCustomTags() {
  const state = loadAppState();
  if (!state) return [];
  const currentMap = sanitizeTagsMap(state.tagsByTrack, state.tracks);
  /** @type {Set<string>} */
  const accumulator = new Set();
  Object.values(currentMap).forEach((list) => {
    list.forEach((tag) => accumulator.add(tag));
  });
  return Array.from(accumulator).sort();
}

/** @returns {FontPreference} */
export function getFontPreference() {
  const stored = readStoredState();
  return sanitizeFontPreference(stored?.uiPrefs?.font);
}

/**
 * @param {unknown} font
 * @returns {FontPreference}
 */
export function setFontPreference(font) {
  const nextFont = sanitizeFontPreference(font);
  const base = loadAppState() ?? createEmptyState();
  const nextState = {
    ...base,
    uiPrefs: { font: nextFont },
  };
  persistState(nextState);
  return nextFont;
}

/**
 * @param {RecentPlaylist[]} list
 * @param {Partial<RecentPlaylist>} item
 * @param {number} [max]
 * @returns {RecentPlaylist[]}
 */
export function upsertRecent(list, item, max = RECENT_DEFAULT_MAX) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : RECENT_DEFAULT_MAX;
  const normalizedItem = normalizeRecentItem(item);
  if (!normalizedItem) {
    return sanitizeRecentList(list, limit);
  }
  const existing = sanitizeRecentList(list, limit);
  const now = Date.now();
  const idx = existing.findIndex((entry) => entry.id === normalizedItem.id);

  if (idx >= 0) {
    const current = existing[idx];
    const merged = {
      ...current,
      ...normalizedItem,
      importedAt: current.importedAt ?? normalizedItem.importedAt ?? now,
      lastUsedAt: now,
    };
    if (current.pinned || normalizedItem.pinned) {
      merged.pinned = true;
    } else if (merged.pinned) {
      delete merged.pinned;
    }
    const without = existing.filter((entry) => entry.id !== normalizedItem.id);
    return trimRecents([merged, ...without], limit);
  }

  const created = {
    ...normalizedItem,
    importedAt: normalizedItem.importedAt ?? now,
    lastUsedAt: normalizedItem.lastUsedAt ?? now,
  };
  if (!created.pinned) {
    delete created.pinned;
  }
  return trimRecents([created, ...existing], limit);
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
    notesByTrack: Object.create(null),
    tagsByTrack: Object.create(null),
    recentPlaylists: [],
    uiPrefs: sanitizeUiPrefs(null),
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
    notesByTrack: sanitizeNotesMap(data?.notesByTrack, data?.tracks),
    tagsByTrack: sanitizeTagsMap(data?.tagsByTrack, data?.tracks),
    recentPlaylists: sanitizeRecentList(data?.recentPlaylists),
    uiPrefs: sanitizeUiPrefs(data?.uiPrefs),
  };
}

/**
 * @param {any} v2
 * @returns {PersistedState | null}
 */
function migrateLegacy(v2) {
  if (!v2 || typeof v2 !== 'object') return null;
  const version = typeof v2?.version === 'number' ? v2.version : 0;
  if (version >= 4) {
    const normalized = normalizeState(v2);
    const next = { ...normalized, version: STORAGE_VERSION };
    setPendingMigrationSnapshot(next);
    return next;
  }
  const theme = sanitizeTheme(v2?.theme);
  const playlistTitle = sanitizeTitle(v2?.playlistTitle ?? v2?.title);
  const tracks = sanitizeTracks(v2?.tracks);
  const lastImportUrl = typeof v2?.lastImportUrl === 'string' ? v2.lastImportUrl : '';
  const importedAt =
    typeof v2?.importedAt === 'string' ? v2.importedAt : null;

  const importMeta = sanitizeImportMeta({
    provider: v2?.provider,
    playlistId: v2?.playlistId,
    title: playlistTitle,
    sourceUrl: lastImportUrl,
  });

  const nextPlaylistTitle = playlistTitle ?? 'My Playlist';
  const recentPlaylists = seedRecentFromLegacy(importMeta, {
    importedAt,
    lastImportUrl,
    playlistTitle: nextPlaylistTitle,
  });

  const next = {
    version: STORAGE_VERSION,
    theme,
    playlistTitle: nextPlaylistTitle,
    importedAt,
    lastImportUrl,
    tracks,
    importMeta,
    notesByTrack: sanitizeNotesMap(null, tracks),
    tagsByTrack: Object.create(null),
    recentPlaylists,
    uiPrefs: sanitizeUiPrefs(null),
  };
  setPendingMigrationSnapshot(next);
  return next;
}

/**
 * @param {unknown} theme
 * @returns {Theme}
 */
function sanitizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
}

/**
 * @param {unknown} value
 * @returns {FontPreference}
 */
function sanitizeFontPreference(value) {
  const candidate = typeof value === 'string' ? value : '';
  return FONT_PREF_VALUES.has(candidate) ? /** @type {FontPreference} */ (candidate) : FONT_PREF_DEFAULT;
}

/**
 * @param {unknown} prefs
 * @returns {UiPrefs}
 */
function sanitizeUiPrefs(prefs) {
  if (prefs && typeof prefs === 'object') {
    return { font: sanitizeFontPreference(/** @type {any} */ (prefs).font) };
  }
  return { font: FONT_PREF_DEFAULT };
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
    const record = {
      id,
      title: safeString(/** @type {any} */(t).title) || `Track ${idx + 1}`,
      artist: safeString(/** @type {any} */(t).artist) || 'Unknown Artist',
      notes: normalizeNotesArray(/** @type {any} */(t).notes),
    };
    const thumb = safeString(/** @type {any} */(t).thumbnailUrl);
    if (thumb) record.thumbnailUrl = thumb;
    const sourceUrl = safeString(/** @type {any} */(t).sourceUrl);
    if (sourceUrl) record.sourceUrl = sourceUrl;
    const duration = Number(/** @type {any} */(t).durationMs);
    if (Number.isFinite(duration) && duration > 0) {
      record.durationMs = Math.round(duration);
    }
    const album = safeString(/** @type {any} */(t).album);
    if (album) {
      record.album = album;
    }
    const dateAddedTs = coerceTimestamp(/** @type {any} */(t).dateAdded ?? /** @type {any} */(t).addedAt);
    if (dateAddedTs != null) {
      record.dateAdded = new Date(dateAddedTs).toISOString();
    }
    const importedAtTs = coerceTimestamp(/** @type {any} */(t).importedAt);
    if (importedAtTs != null) {
      record.importedAt = new Date(importedAtTs).toISOString();
    }
    const originalIndex = Number(/** @type {any} */(t).originalIndex);
    if (Number.isFinite(originalIndex) && originalIndex >= 0) {
      record.originalIndex = Math.round(originalIndex);
    }
    const provider = canonicalProvider(/** @type {any} */(t).provider);
    if (provider) {
      record.provider = provider;
    }
    const cleanedTags = normalizeTagsArray(/** @type {any} */(t).tags);
    if (cleanedTags.length > 0) {
      record.tags = cleanedTags;
    }
    out.push(record);
  });

  return out;
}

/**
 * @param {unknown} input
 * @param {unknown} fallbackTracks
 * @returns {NotesByTrack}
 */
function sanitizeNotesMap(input, fallbackTracks) {
  /** @type {NotesByTrack} */
  const out = Object.create(null);

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [rawId, rawNotes] of Object.entries(/** @type {Record<string, unknown>} */ (input))) {
      const id = safeString(rawId);
      if (!id) continue;
      const cleaned = normalizeNotesArray(rawNotes);
      if (cleaned.length > 0) {
        out[id] = cleaned;
      }
    }
  }

  if (Array.isArray(fallbackTracks)) {
    fallbackTracks.forEach((t, idx) => {
      if (!t || typeof t !== 'object') return;
      const id =
        safeString(/** @type {any} */ (t).id) ||
        `track-${idx + 1}`;
      if (!id || out[id]) return;
      const cleaned = normalizeNotesArray(/** @type {any} */ (t).notes);
      if (cleaned.length > 0) {
        out[id] = cleaned;
      }
    });
  }

  return out;
}

/**
 * @param {unknown} input
 * @param {unknown} fallbackTracks
 * @returns {TagsByTrack}
 */
function sanitizeTagsMap(input, fallbackTracks) {
  /** @type {TagsByTrack} */
  const out = Object.create(null);

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [rawId, rawTags] of Object.entries(/** @type {Record<string, unknown>} */ (input))) {
      const id = safeString(rawId);
      if (!id) continue;
      const cleaned = normalizeTagsArray(rawTags);
      if (cleaned.length > 0) {
        out[id] = cleaned;
      }
    }
  }

  if (Array.isArray(fallbackTracks)) {
    fallbackTracks.forEach((t, idx) => {
      if (!t || typeof t !== 'object') return;
      const id = safeString(/** @type {any} */ (t).id) || `track-${idx + 1}`;
      if (!id || out[id]) return;
      const cleaned = normalizeTagsArray(/** @type {any} */ (t).tags);
      if (cleaned.length > 0) {
        out[id] = cleaned;
      }
    });
  }

  return out;
}

/**
 * @param {unknown} list
 * @param {number} [max]
 * @returns {RecentPlaylist[]}
 */
function sanitizeRecentList(list, max = RECENT_DEFAULT_MAX) {
  if (!Array.isArray(list)) return [];
  /** @type {RecentPlaylist[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  list.forEach((entry) => {
    const normalized = normalizeRecentItem(entry);
    if (!normalized) return;
    if (seen.has(normalized.id)) return;
    seen.add(normalized.id);
    out.push(normalized);
  });
  return trimRecents(out, max);
}

/**
 * @param {unknown} entry
 * @returns {RecentPlaylist | null}
 */
function normalizeRecentItem(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const provider = canonicalProvider(/** @type {any} */ (entry).provider);
  const playlistId = canonicalPlaylistId(/** @type {any} */ (entry).playlistId);
  const sourceUrl = safeString(/** @type {any} */ (entry).sourceUrl);
  if (!provider || !playlistId || !sourceUrl) return null;

  const now = Date.now();
  const title = sanitizeRecentTitle(/** @type {any} */ (entry).title);
  const importedAt = coerceTimestamp(/** @type {any} */ (entry).importedAt) ?? now;
  const lastUsedAt = coerceTimestamp(/** @type {any} */ (entry).lastUsedAt) ?? importedAt;
  const coverUrl = safeString(/** @type {any} */ (entry).coverUrl);
  const total = normalizeTrackTotal(/** @type {any} */ (entry).total);
  const pinned = Boolean(/** @type {any} */ (entry).pinned);

  /** @type {RecentPlaylist} */
  const normalized = {
    id: makeRecentId(provider, playlistId),
    provider,
    playlistId,
    title,
    sourceUrl,
    importedAt,
    lastUsedAt,
  };
  if (coverUrl) normalized.coverUrl = coverUrl;
  if (typeof total === 'number') normalized.total = total;
  if (pinned) normalized.pinned = true;
  return normalized;
}

/**
 * @param {unknown} provider
 * @returns {RecentPlaylist['provider'] | null}
 */
function canonicalProvider(provider) {
  if (typeof provider !== 'string') return null;
  const normalized = provider.trim().toLowerCase();
  return VALID_PROVIDERS.has(normalized)
    ? /** @type {RecentPlaylist['provider']} */ (normalized)
    : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function canonicalPlaylistId(value) {
  const id = safeString(value);
  return id || null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function coerceTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function normalizeTrackTotal(value) {
  if (value == null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.round(number);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeRecentTitle(value) {
  const raw = safeString(value);
  return raw || RECENT_FALLBACK_TITLE;
}

/**
 * @param {RecentPlaylist['provider']} provider
 * @param {string} playlistId
 * @returns {string}
 */
function makeRecentId(provider, playlistId) {
  return `${provider}:${playlistId}`;
}

/**
 * @param {RecentPlaylist[]} list
 * @param {number} max
 * @returns {RecentPlaylist[]}
 */
function trimRecents(list, max) {
  if (!Array.isArray(list) || max <= 0) return [];
  if (list.length <= max) return list;
  const pinned = [];
  const unpinned = [];
  list.forEach((item) => {
    if (item?.pinned) {
      pinned.push(item);
    } else {
      unpinned.push(item);
    }
  });
  const pinnedToKeep = pinned.slice(0, max);
  const remaining = max - pinnedToKeep.length;
  const unpinnedToKeep = remaining > 0 ? unpinned.slice(0, remaining) : [];
  return [...pinnedToKeep, ...unpinnedToKeep];
}

/**
 * @param {ImportMeta} meta
 * @param {{ importedAt: string | null, lastImportUrl: string, playlistTitle: string }} context
 * @returns {RecentPlaylist[]}
 */
function seedRecentFromLegacy(meta, context) {
  const provider = canonicalProvider(meta?.provider);
  const playlistId = canonicalPlaylistId(meta?.playlistId);
  const sourceUrl = safeString(meta?.sourceUrl || context.lastImportUrl);
  if (!provider || !playlistId || !sourceUrl) return [];
  const timestamp = coerceTimestamp(context.importedAt) ?? Date.now();
  const seeded = {
    id: makeRecentId(provider, playlistId),
    provider,
    playlistId,
    title: sanitizeRecentTitle(context.playlistTitle),
    sourceUrl,
    importedAt: timestamp,
    lastUsedAt: timestamp,
  };
  return sanitizeRecentList([seeded]);
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
    total:
      typeof m.total === 'number' && Number.isFinite(m.total)
        ? Math.max(0, Math.trunc(m.total))
        : null,
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

/**
 * @param {unknown} maybeNotes
 * @returns {string[]}
 */
function normalizeNotesArray(maybeNotes) {
  if (!Array.isArray(maybeNotes)) return [];
  /** @type {string[]} */
  const out = [];
  maybeNotes.forEach((note) => {
    if (typeof note !== 'string') return;
    const trimmed = note.trim();
    if (!trimmed) return;
    out.push(trimmed);
  });
  return out;
}

/**
 * @param {unknown} tag
 * @returns {string}
 */
function normalizeTagValue(tag) {
  if (typeof tag !== 'string') return '';
  const trimmed = tag.trim().toLowerCase();
  return trimmed;
}

/**
 * @param {unknown} maybeTags
 * @returns {string[]}
 */
function normalizeTagsArray(maybeTags) {
  if (!Array.isArray(maybeTags)) return [];
  /** @type {string[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  maybeTags.forEach((tag) => {
    const normalized = normalizeTagValue(tag);
    if (!normalized || normalized.length > TAG_MAX_LENGTH) return;
    if (!TAG_ALLOWED_RE.test(normalized)) return;
    if (seen.has(normalized)) return;
    if (out.length >= TAG_MAX_PER_TRACK) return;
    seen.add(normalized);
    out.push(normalized);
  });
  out.sort();
  return out;
}

/**
 * @returns {any}
 */
function readStoredState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {PersistedState} state
 */
function persistState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function setPendingMigrationSnapshot(state) {
  try {
    localStorage.setItem(PENDING_MIGRATION_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function getPendingMigrationSnapshot() {
  try {
    const raw = localStorage.getItem(PENDING_MIGRATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return null;
  }
}

export function clearPendingMigrationSnapshot() {
  try {
    localStorage.removeItem(PENDING_MIGRATION_KEY);
  } catch {
    // ignore
  }
}

export function stashPendingMigrationSnapshot(state) {
  if (!state) return;
  setPendingMigrationSnapshot(state);
}

export function writeAutoBackupSnapshot(state) {
  try {
    if (!state) return;
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      playlist: {
        title: sanitizeTitle(state.playlistTitle),
        provider: sanitizeImportMeta(state.importMeta).provider,
        playlistId: safeString(state.importMeta?.playlistId),
        snapshotId: safeString(state.importMeta?.snapshotId),
        sourceUrl: safeString(state.importMeta?.sourceUrl ?? state.lastImportUrl),
      },
      notesByTrack: sanitizeNotesMap(state.notesByTrack, state.tracks),
      tagsByTrack: sanitizeTagsMap(state.tagsByTrack, state.tracks),
    };
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function getAutoBackupSnapshot() {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
