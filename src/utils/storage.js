// src/utils/storage.js

// 🔐 Versioned storage key (bump when payload shape changes)
const STORAGE_VERSION = 3;
const LS_KEY = 'sta:v3';

// --- Types (for reference)
// v3 payload:
// {
//   version: 3,
//   theme: 'dark' | 'light',
//   importMeta: {
//     provider: 'spotify' | 'youtube' | 'soundcloud' | null,
//     playlistId: string | null,
//     title: string | null,
//     snapshotId: string | null,
//     cursor: string | null,
//     sourceUrl: string | null,
//   },
//   tracks: Array<{ id: string, title: string, artist: string }>,
//   notesByTrack: Record<string, Array<any>>, // keep structure flexible for now
// }

// ✅ Load and normalize any saved data
export function loadAppState() {
  try {
    const rawV3 = localStorage.getItem(LS_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3);
      if (parsed?.version === STORAGE_VERSION) {
        // Basic validation: provider optional; tracks must have stable IDs
        const isValidTracks =
          Array.isArray(parsed.tracks) &&
          parsed.tracks.every(t => t?.id && /^(sp|yt|sc)-/.test(t.id));

        if (!isValidTracks) {
          return createEmptyState(parsed?.theme);
        }
        return parsed;
      }
    }

    // 🧯 Try migrating older shapes if present
    // v2 was stored under 'sta:v2' with flat fields { version: 2, theme, provider, title, tracks, notes }
    const rawV2 = localStorage.getItem('sta:v2');
    if (rawV2) {
      const migrated = migrateV2ToV3(JSON.parse(rawV2));
      // Save migrated forward so the app uses a single key from now on
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
      return migrated;
    }

    // No prior state
    return null;
  } catch {
    // ignore parse errors (private mode, corrupted JSON, etc.)
    return null;
  }
}

// ✅ Save current app state (only the fields we explicitly support)
export function saveAppState(state) {
  try {
    const payload = {
      version: STORAGE_VERSION,
      theme: state?.theme ?? 'dark',
      importMeta: sanitizeImportMeta(state?.importMeta),
      tracks: sanitizeTracks(state?.tracks),
      notesByTrack: isPlainObject(state?.notesByTrack) ? state.notesByTrack : {},
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota or private-mode errors
  }
}

// ✅ Clear saved state, preserving theme if provided
export function clearAppState(preserve = {}) {
  try {
    const cleared = createEmptyState(preserve.theme);
    localStorage.setItem(LS_KEY, JSON.stringify(cleared));
    return cleared;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Helpers

function createEmptyState(theme = 'dark') {
  return {
    version: STORAGE_VERSION,
    theme,
    importMeta: {
      provider: null,
      playlistId: null,
      title: null,
      snapshotId: null,
      cursor: null,
      sourceUrl: null,
    },
    tracks: [],
    notesByTrack: {},
  };
}

function migrateV2ToV3(v2) {
  // v2 shape (from your file): { version: 2, theme, provider, title, tracks, notes }
  const theme = v2?.theme ?? 'dark';
  const tracks = sanitizeTracks(v2?.tracks);

  // We didn’t store playlistId/snapshotId/cursor/sourceUrl in v2 → set nulls
  const importMeta = {
    provider: v2?.provider ?? null,
    playlistId: null,
    title: v2?.title ?? null,
    snapshotId: null,
    cursor: null,
    sourceUrl: null,
  };

  // v2 had a flat `notes` array; new schema uses notesByTrack map
  const notesByTrack = isPlainObject(v2?.notesByTrack)
    ? v2.notesByTrack
    : {}; // if you only had `notes: []`, we can’t reliably remap → start fresh

  return {
    version: STORAGE_VERSION,
    theme,
    importMeta,
    tracks,
    notesByTrack,
  };
}

function sanitizeImportMeta(m) {
  if (!m || typeof m !== 'object') {
    return {
      provider: null,
      playlistId: null,
      title: null,
      snapshotId: null,
      cursor: null,
      sourceUrl: null,
    };
  }
  return {
    provider: m.provider ?? null,
    playlistId: m.playlistId ?? null,
    title: m.title ?? null,
    snapshotId: m.snapshotId ?? null,
    cursor: m.cursor ?? null,
    sourceUrl: m.sourceUrl ?? null,
  };
}

function sanitizeTracks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(t => t && typeof t === 'object')
    .map(t => ({
      id: String(t.id ?? '').trim(),
      title: String(t.title ?? '').trim() || 'Untitled',
      artist: String(t.artist ?? '').trim() || 'Unknown',
    }))
    // keep only known-stable IDs (provider-prefixed)
    .filter(t => /^(sp|yt|sc)-/.test(t.id));
}

function isPlainObject(o) {
  return typeof o === 'object' && o !== null && o.constructor === Object;
}
