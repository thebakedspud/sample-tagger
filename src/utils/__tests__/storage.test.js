import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTag,
  getTags,
  listAllCustomTags,
  loadAppState,
  loadRecent,
  removeTag,
  saveAppState,
  saveRecent,
  upsertRecent,
} from '../storage.js';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

describe('storage cursors', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists a null cursor through save/load', () => {
    saveAppState({
      theme: 'dark',
      playlistTitle: 'Test Playlist',
      tracks: [],
      importMeta: {
        provider: 'spotify',
        cursor: null,
        hasMore: false,
        sourceUrl: null,
      },
      lastImportUrl: '',
      importedAt: null,
    });

    const raw = globalThis.localStorage.getItem('sta:v5');
    expect(raw).toBeTypeOf('string');

    const parsed = JSON.parse(raw);
    expect(parsed.importMeta.cursor).toBeNull();

    const restored = loadAppState();
    expect(restored?.importMeta.cursor).toBeNull();
  });

  it('coerces undefined cursor values to null when persisting', () => {
    saveAppState({
      theme: 'dark',
      playlistTitle: 'Another Playlist',
      tracks: [],
      importMeta: {
        provider: 'spotify',
        cursor: undefined,
        hasMore: true,
      },
      lastImportUrl: '',
      importedAt: null,
    });

    const parsed = JSON.parse(globalThis.localStorage.getItem('sta:v5'));
    expect(parsed.importMeta.cursor).toBeNull();

    const restored = loadAppState();
    expect(restored?.importMeta.cursor).toBeNull();
  });

  it('persists notesByTrack independently of tracks', () => {
    saveAppState({
      theme: 'dark',
      playlistTitle: 'Notes Test',
      tracks: [],
      notesByTrack: {
        'sp:track:1': ['First note'],
        'sp:track:2': ['Second note'],
      },
      importMeta: {},
      lastImportUrl: '',
      importedAt: null,
    });

    const parsed = JSON.parse(globalThis.localStorage.getItem('sta:v5'));
    expect(parsed.notesByTrack['sp:track:1']).toEqual(['First note']);
    expect(parsed.notesByTrack['sp:track:2']).toEqual(['Second note']);

    const restored = loadAppState();
    expect(restored?.notesByTrack['sp:track:1']).toEqual(['First note']);
    expect(restored?.notesByTrack['sp:track:2']).toEqual(['Second note']);
    expect(Array.isArray(restored?.tracks)).toBe(true);
  });

  it('normalizes and persists tagsByTrack', () => {
    saveAppState({
      theme: 'dark',
      playlistTitle: 'Tags Test',
      tracks: [],
      tagsByTrack: {
        ' sp:track:1 ': ['Drill', 'drill', '  '],
        'sp:track:2': [' 808 ', 'Dark', 'DARK'],
      },
      importMeta: {},
      lastImportUrl: '',
      importedAt: null,
    });

    const parsed = JSON.parse(globalThis.localStorage.getItem('sta:v5'));
    expect(parsed.tagsByTrack['sp:track:1']).toEqual(['drill']);
    expect(parsed.tagsByTrack['sp:track:2']).toEqual(['808', 'dark']);

    const restored = loadAppState();
    expect(restored?.tagsByTrack['sp:track:1']).toEqual(['drill']);
    expect(restored?.tagsByTrack['sp:track:2']).toEqual(['808', 'dark']);
  });

  it('migrates v4 payloads to v5 and normalizes tags', () => {
    const legacy = {
      version: 4,
      theme: 'dark',
      playlistTitle: 'Legacy v4',
      importedAt: null,
      lastImportUrl: '',
      tracks: [],
      importMeta: { provider: 'spotify', cursor: null, hasMore: false, sourceUrl: null },
      notesByTrack: { 't1': ['First note'] },
      tagsByTrack: { 't1': ['Drill', 'DRILL'] },
      recentPlaylists: [],
    };
    globalThis.localStorage.setItem('sta:v4', JSON.stringify(legacy));

    const migrated = loadAppState();

    expect(migrated?.version).toBe(5);
    expect(migrated?.playlistTitle).toBe('Legacy v4');
    expect(migrated?.tagsByTrack['t1']).toEqual(['drill']);

    const newRaw = globalThis.localStorage.getItem('sta:v5');
    expect(newRaw).not.toBeNull();
    const parsed = JSON.parse(newRaw);
    expect(parsed.version).toBe(5);
  });
});

describe('track persistence', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
  });

  it('keeps thumbnail and metadata when saving and loading', () => {
    saveAppState({
      theme: 'dark',
      playlistTitle: 'Thumb Test',
      tracks: [
        {
          id: 'track-1',
          title: 'First',
          artist: 'Artist One',
          notes: ['Great intro'],
          thumbnailUrl: 'https://example.com/thumb.jpg',
          sourceUrl: 'https://example.com/track',
          durationMs: 123456,
        },
      ],
      importMeta: {},
      lastImportUrl: '',
      importedAt: null,
    });

    const restored = loadAppState();
    expect(restored?.tracks?.[0]?.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(restored?.tracks?.[0]?.sourceUrl).toBe('https://example.com/track');
    expect(restored?.tracks?.[0]?.durationMs).toBe(123456);
    expect(restored?.tracks?.[0]?.notes).toEqual(['Great intro']);
  });
});

describe('tag helpers', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
  });

  it('adds, removes, and lists tags with normalization', () => {
    expect(getTags('track-1')).toEqual([]);

    addTag('track-1', 'Drill');
    addTag('track-1', 'drill'); // dedupe
    addTag('track-1', ' 808 ');

    expect(getTags('track-1')).toEqual(['drill', '808']);
    expect(listAllCustomTags()).toEqual(['808', 'drill']);

    removeTag('track-1', 'DRILL');
    expect(getTags('track-1')).toEqual(['808']);
    expect(listAllCustomTags()).toEqual(['808']);

    removeTag('track-1', '808');
    expect(getTags('track-1')).toEqual([]);
    expect(listAllCustomTags()).toEqual([]);
  });
});

describe('recent playlists storage', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function baseRecentData() {
    return {
      id: 'spotify:abc123',
      provider: 'spotify',
      playlistId: 'abc123',
      title: 'Focus Mix',
      sourceUrl: 'https://open.spotify.com/playlist/abc123',
    };
  }

  it('upserts recents with dedupe and preserves importedAt', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(2000);
    const first = upsertRecent([], baseRecentData(), 6);
    expect(first).toHaveLength(1);
    expect(first[0].importedAt).toBe(2000);
    expect(first[0].lastUsedAt).toBe(2000);

    spy.mockReturnValue(5000);
    const updated = upsertRecent(first, {
      ...baseRecentData(),
      title: 'Focus Mix (updated)',
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].title).toBe('Focus Mix (updated)');
    expect(updated[0].importedAt).toBe(2000);
    expect(updated[0].lastUsedAt).toBe(5000);
  });

  it('trims to max while keeping pinned entries first', () => {
    let list = [];
    for (let i = 0; i < 5; i += 1) {
      list = upsertRecent(
        list,
        {
          id: `spotify:${i}`,
          provider: 'spotify',
          playlistId: String(i),
          title: `Playlist ${i}`,
          sourceUrl: `https://example.com/${i}`,
          importedAt: i + 1,
          lastUsedAt: i + 1,
        },
        5,
      );
    }

    list = list.map((item) => {
      if (item.playlistId === '1' || item.playlistId === '3') {
        return { ...item, pinned: true };
      }
      return item;
    });

    const result = upsertRecent(list, {
      id: 'spotify:new',
      provider: 'spotify',
      playlistId: 'new',
      title: 'Newest',
      sourceUrl: 'https://example.com/new',
      importedAt: 999,
      lastUsedAt: 999,
      pinned: false,
    }, 5);

    expect(result).toHaveLength(5);
    const pinnedFirst = result.slice(0, 2);
    expect(pinnedFirst.every((item) => item.pinned === true)).toBe(true);
    expect(result.some((item) => item.id === 'spotify:new')).toBe(true);
  });

  it('preserves recents when saveAppState runs without providing them', () => {
    saveRecent([baseRecentData()]);
    saveAppState({
      theme: 'dark',
      playlistTitle: 'Notes Test',
      tracks: [],
      importMeta: {},
      lastImportUrl: '',
      importedAt: null,
      notesByTrack: {},
    });
    const stored = loadRecent();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('spotify:abc123');
  });

  it('migrates v3 storage and seeds recents when data exists', () => {
    const legacy = {
      version: 3,
      theme: 'dark',
      playlistTitle: 'Legacy Mix',
      importedAt: '2023-04-01T12:00:00.000Z',
      lastImportUrl: 'https://open.spotify.com/playlist/legacy',
      provider: 'spotify',
      playlistId: 'legacy',
      tracks: [],
    };
    globalThis.localStorage.setItem('sta:v3', JSON.stringify(legacy));

    const migrated = loadAppState();
    expect(migrated).not.toBeNull();
    const recents = migrated?.recentPlaylists ?? [];
    expect(recents).toHaveLength(1);
    expect(recents[0].id).toBe('spotify:legacy');
    expect(recents[0].title).toBe('Legacy Mix');
    expect(recents[0].sourceUrl).toBe('https://open.spotify.com/playlist/legacy');
    expect(typeof recents[0].importedAt).toBe('number');
    expect(typeof recents[0].lastUsedAt).toBe('number');
    expect(migrated?.tagsByTrack).toEqual({});
  });
});
