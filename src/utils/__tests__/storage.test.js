import { beforeEach, describe, expect, it } from 'vitest';
import { loadAppState, saveAppState } from '../storage.js';

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

    const raw = globalThis.localStorage.getItem('sta:v4');
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

    const parsed = JSON.parse(globalThis.localStorage.getItem('sta:v4'));
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

    const parsed = JSON.parse(globalThis.localStorage.getItem('sta:v4'));
    expect(parsed.notesByTrack['sp:track:1']).toEqual(['First note']);
    expect(parsed.notesByTrack['sp:track:2']).toEqual(['Second note']);

    const restored = loadAppState();
    expect(restored?.notesByTrack['sp:track:1']).toEqual(['First note']);
    expect(restored?.notesByTrack['sp:track:2']).toEqual(['Second note']);
    expect(Array.isArray(restored?.tracks)).toBe(true);
  });
});
