import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import usePlaylistImportController from '../usePlaylistImportController.js';
import { CODES } from '../adapters/types.js';
import { playlistActions } from '../../playlist/actions.js';

const detectProviderMock = vi.hoisted(() => vi.fn(() => 'spotify'));
const importFlowState = vi.hoisted(() => ({ status: 'idle', loading: false }));
const importInitialMock = vi.hoisted(() => vi.fn());
const reimportMock = vi.hoisted(() => vi.fn());
const loadMoreMock = vi.hoisted(() => vi.fn());
const resetFlowMock = vi.hoisted(() => vi.fn());
const primeUpstreamServicesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const apiFetchMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ notes: [] }),
      headers: { get: () => null },
    }),
  ),
);

const createDeferred = () => {
  /** @type {(value: any) => void} */
  let resolve;
  /** @type {(reason?: any) => void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (!resolve || !reject) {
    throw new Error('Deferred helpers not initialized');
  }
  return { promise, resolve, reject };
};

vi.mock('../detectProvider.js', () => ({
  default: detectProviderMock,
}));

vi.mock('../usePlaylistImportFlow.js', () => ({
  default: vi.fn(() => ({
    status: importFlowState.status,
    loading: importFlowState.loading,
    importInitial: importInitialMock,
    reimport: reimportMock,
    loadMore: loadMoreMock,
    resetFlow: resetFlowMock,
    primeUpstreamServices: primeUpstreamServicesMock,
  })),
  ImportFlowStatus: {
    IDLE: 'idle',
    IMPORTING: 'importing',
    REIMPORTING: 'reimporting',
    LOADING_MORE: 'loadingMore',
  },
}));

const focusByIdMock = vi.fn();
vi.mock('../../utils/focusById.js', () => ({
  focusById: focusByIdMock,
}));

vi.mock('../../../lib/apiClient.js', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('../../utils/debug.js', () => ({
  DEBUG_FOCUS: false,
  debugFocus: vi.fn(),
}));

const cacheStore = vi.hoisted(() => ({
  map: new Map(),
}));

const cacheApi = vi.hoisted(() => ({
  cachedPlaylists: cacheStore.map,
  isHydrating: false,
  getCachedResult: vi.fn(),
  rememberCachedResult: vi.fn(),
  forgetCachedResult: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock('../usePersistentPlaylistCache.js', () => ({
  __esModule: true,
  default: () => cacheApi,
}));

const createDeps = (overrides = {}) => {
  const importInputRef = /** @type {import('react').RefObject<HTMLInputElement>} */ ({
    current: /** @type {unknown} */ ({
      focus: vi.fn(),
      select: vi.fn(),
    }),
  });
  const reimportBtnRef = /** @type {import('react').RefObject<HTMLButtonElement>} */ ({
    current: /** @type {unknown} */ ({
      focus: vi.fn(),
    }),
  });
  const loadMoreBtnRef = /** @type {import('react').RefObject<HTMLButtonElement>} */ ({
    current: /** @type {unknown} */ ({
      focus: vi.fn(),
    }),
  });
  return {
    dispatch: vi.fn(),
    announce: vi.fn(),
    tracks: [],
    tracksRef: { current: [] },
    notesByTrack: {},
    tagsByTrack: {},
    setScreen: vi.fn(),
    pushRecentPlaylist: vi.fn(),
    updateRecentCardState: vi.fn(),
    setSkipPlaylistFocusManagement: vi.fn(),
    markTrackFocusContext: vi.fn(),
    firstVisibleTrackIdRef: { current: null },
    initialFocusAppliedRef: { current: false },
    importInputRef,
    reimportBtnRef,
    loadMoreBtnRef,
    lastImportUrlRef: { current: '' },
    setPlaylistTitle: vi.fn(),
    setImportedAt: vi.fn(),
    setLastImportUrl: vi.fn(),
    playlistTitle: 'My Playlist',
    screen: 'landing',
    lastImportUrl: '',
    initialImportMeta: {
      provider: null,
      playlistId: null,
      cursor: null,
      sourceUrl: '',
      hasMore: false,
      snapshotId: null,
      total: null,
      contentKind: null,
    },
    initialPersistedTrackCount: 0,
    ...overrides,
  };
};

let rafSpy;
let getElementByIdSpy;
let querySelectorSpy;

beforeEach(() => {
  vi.clearAllMocks();
  cacheStore.map.clear();
  cacheApi.getCachedResult.mockReset();
  cacheApi.rememberCachedResult.mockReset();
  cacheApi.forgetCachedResult.mockReset();
  cacheApi.clearCache.mockReset();
  cacheApi.getCachedResult.mockImplementation((key) =>
    key ? cacheStore.map.get(key) ?? null : null,
  );
  cacheApi.rememberCachedResult.mockImplementation((key, payload, options = {}) => {
    if (!key) return;
    cacheStore.map.set(key.trim(), payload);
    if (options?.aliases && Array.isArray(options.aliases)) {
      options.aliases.forEach((alias) => {
        if (typeof alias === 'string' && alias.trim()) {
          cacheStore.map.set(alias.trim(), payload);
        }
      });
    }
  });
  importFlowState.status = 'idle';
  importFlowState.loading = false;
  detectProviderMock.mockReturnValue('spotify');
  importInitialMock.mockReset();
  reimportMock.mockReset();
  loadMoreMock.mockReset();
  resetFlowMock.mockReset();
  primeUpstreamServicesMock.mockClear();
  apiFetchMock.mockClear();
  focusByIdMock.mockReset();
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    if (typeof cb === 'function') {
      cb(0);
    }
    return 0;
  });
  getElementByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue(null);
  querySelectorSpy = vi.spyOn(document, 'querySelector').mockReturnValue(null);
});

afterEach(() => {
  rafSpy.mockRestore();
  getElementByIdSpy.mockRestore();
  querySelectorSpy.mockRestore();
});

describe('usePlaylistImportController', () => {
  it('handles successful import and updates playlist state', async () => {
    const deps = createDeps();
    const importData = {
      tracks: [{ id: 'track-1', notes: ['n1'], tags: ['rock'] }],
      meta: {
        hasMore: false,
        provider: 'spotify',
        playlistId: 'playlist-123',
        snapshotId: 'snap-1',
        total: 1,
      },
      importedAt: '2024-01-01T00:00:00.000Z',
      title: 'Demo Playlist',
      coverUrl: 'cover.jpg',
      total: 1,
    };
    importInitialMock.mockResolvedValue({ ok: true, data: importData });

    const { result } = renderHook(() => usePlaylistImportController(deps));

    await act(() => {
      result.current.setImportUrl('https://open.spotify.com/playlist/xyz');
    });
    await act(async () => {
      await result.current.handleImport();
    });

    await waitFor(() => {
      expect(importInitialMock).toHaveBeenCalledWith(
        'https://open.spotify.com/playlist/xyz',
        { providerHint: 'spotify', sourceUrl: 'https://open.spotify.com/playlist/xyz' },
      );
    });
    await waitFor(() => {
      const actionType = playlistActions.setTracksWithNotes([], {}, {}).type;
      expect(deps.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: actionType }));
    });
    expect(deps.setScreen).toHaveBeenCalledWith('playlist');
    expect(deps.setPlaylistTitle).toHaveBeenCalledWith('Demo Playlist');
    expect(deps.setImportedAt).toHaveBeenCalledWith(importData.importedAt);
    expect(deps.setLastImportUrl).toHaveBeenCalledWith('https://open.spotify.com/playlist/xyz');
    expect(deps.announce).toHaveBeenCalledWith('Playlist imported. 1 track.');
    expect(deps.pushRecentPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'spotify' }),
      expect.objectContaining({ total: 1 }),
    );
    expect(result.current.importMeta).toMatchObject({
      provider: 'spotify',
      playlistId: 'playlist-123',
      snapshotId: 'snap-1',
    });
    expect(result.current.backgroundSync.status).toBe('complete');
  });

  it('routes podcast imports to the podcast screen', async () => {
    const deps = createDeps();
    const importData = {
      tracks: [{ id: 'episode-1', kind: 'podcast', notes: [], tags: [] }],
      meta: {
        hasMore: false,
        provider: 'spotify',
        playlistId: 'show-123',
        snapshotId: 'show-snap',
        total: 1,
      },
      importedAt: '2024-02-01T00:00:00.000Z',
      title: 'Daily Podcast',
      total: 1,
    };
    importInitialMock.mockResolvedValue({ ok: true, data: importData });

    const { result } = renderHook(() => usePlaylistImportController(deps));

    await act(() => {
      result.current.setImportUrl('https://open.spotify.com/show/abc');
    });
    await act(async () => {
      await result.current.handleImport();
    });

    await waitFor(() => {
      expect(deps.setScreen).toHaveBeenCalledWith('podcast');
    });
    expect(deps.announce).toHaveBeenCalledWith('Podcast imported. 1 episode.');
    expect(result.current.importMeta.contentKind).toBe('podcast');
  });

  it('rejects selecting a recent playlist when an import is in progress', async () => {
    importFlowState.status = 'importing';
    const deps = createDeps();
    const { result } = renderHook(() => usePlaylistImportController(deps));

    let outcome;
    await act(async () => {
      outcome = await result.current.handleSelectRecent({
        id: 'recent-1',
        sourceUrl: 'https://example.com',
        provider: 'spotify',
        title: 'Recent',
      });
    });

    expect(outcome).toEqual({ ok: false, error: 'Finish the current import before loading another playlist.' });
    expect(deps.updateRecentCardState).toHaveBeenCalledWith('recent-1', {
      error: { message: 'Finish the current import before loading another playlist.', type: 'error' },
      loading: false,
    });
    expect(importInitialMock).not.toHaveBeenCalled();
  });

  it('hydrates a recent playlist from cache without re-importing', async () => {
    const deps = createDeps();
    const cachedPayload = {
      tracks: [{ id: 'track-1', notes: [], tags: [] }],
      meta: { provider: 'spotify', playlistId: 'playlist-xyz', snapshotId: 'snap-1', hasMore: false },
      importedAt: '2024-01-05T00:00:00.000Z',
    };
    cacheStore.map.set('spotify:playlist-xyz', cachedPayload);
    cacheStore.map.set('https://open.spotify.com/playlist/xyz', cachedPayload);

    const { result } = renderHook(() => usePlaylistImportController(deps));
    let outcome;
    await act(async () => {
      outcome = await result.current.handleSelectRecent({
        id: 'recent-1',
        sourceUrl: 'https://open.spotify.com/playlist/xyz',
        provider: 'spotify',
        playlistId: 'playlist-xyz',
        title: 'Saved Playlist',
      });
    });

    expect(outcome).toEqual({ ok: true });
    expect(importInitialMock).not.toHaveBeenCalled();
    expect(deps.updateRecentCardState).toHaveBeenCalledWith('recent-1', null);
    expect(apiFetchMock).toHaveBeenCalled();
  });

  it('loads more tracks manually and announces result', async () => {
    const existingTracks = [{ id: 'base-1', notes: [], tags: [] }];
    const deps = createDeps({
      tracks: existingTracks,
      tracksRef: { current: existingTracks },
      notesByTrack: { 'base-1': [] },
      tagsByTrack: { 'base-1': [] },
      lastImportUrl: 'https://open.spotify.com/playlist/xyz',
      lastImportUrlRef: { current: 'https://open.spotify.com/playlist/xyz' },
      initialImportMeta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: 'cursor-1',
        sourceUrl: 'https://open.spotify.com/playlist/xyz',
        hasMore: true,
        snapshotId: 'snap-1',
        total: null,
      },
    });

    loadMoreMock.mockResolvedValue({
      ok: true,
      data: {
        tracks: [{ id: 'new-1', notes: [], tags: [] }],
        meta: { hasMore: false, cursor: null, snapshotId: 'snap-2' },
      },
    });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    expect(result.current.importMeta.hasMore).toBe(true);
    await act(async () => {
      result.current.setImportMeta(deps.initialImportMeta);
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.handleLoadMore();
    });

    expect(outcome).toEqual(
      expect.objectContaining({ ok: true, added: 1, done: true, firstNewTrackId: 'new-1' }),
    );
    expect(loadMoreMock).toHaveBeenCalled();
    await waitFor(() => {
      const actionType = playlistActions.setTracksWithNotes([], {}, {}).type;
      expect(deps.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: actionType }));
    });
    expect(deps.announce).toHaveBeenCalledWith('Loading more tracks.');
    expect(deps.announce).toHaveBeenCalledWith('1 more tracks loaded.');
    expect(result.current.importMeta.hasMore).toBe(false);
  });

  it('re-import falls back to existing title when adapter omits metadata', async () => {
    const deps = createDeps({
      playlistTitle: 'Custom Title',
      lastImportUrl: 'https://open.spotify.com/playlist/xyz',
      lastImportUrlRef: { current: 'https://open.spotify.com/playlist/xyz' },
      initialImportMeta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: null,
        sourceUrl: 'https://open.spotify.com/playlist/xyz',
        hasMore: false,
        snapshotId: 'snap-1',
        total: 5,
      },
    });

    reimportMock.mockResolvedValue({
      ok: true,
      data: {
        tracks: [{ id: 'track-1', notes: [], tags: [] }],
        meta: { provider: 'spotify', playlistId: 'playlist-123', snapshotId: 'snap-2' },
        importedAt: '2024-01-02T00:00:00.000Z',
      },
    });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(async () => {
      await result.current.handleReimport();
    });

    expect(reimportMock).toHaveBeenCalledWith(
      'https://open.spotify.com/playlist/xyz',
      expect.objectContaining({ fallbackTitle: 'Custom Title' }),
    );
    expect(deps.setPlaylistTitle).toHaveBeenCalledWith('Custom Title');
  });

  it('preserves recent artwork when adapter response lacks cover art', async () => {
    const deps = createDeps();
    importInitialMock.mockResolvedValue({
      ok: true,
      data: {
        tracks: [{ id: 'track-1', notes: [], tags: [] }],
        meta: { provider: 'spotify', playlistId: 'playlist-123', snapshotId: 'snap-1', hasMore: false },
        importedAt: '2024-01-03T00:00:00.000Z',
        coverUrl: null,
      },
    });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    let outcome;
    await act(async () => {
      outcome = await result.current.handleSelectRecent({
        id: 'recent-1',
        sourceUrl: 'https://open.spotify.com/playlist/xyz',
        provider: 'spotify',
        title: 'Recent Playlist',
        coverUrl: 'stored.jpg',
      });
    });
    expect(outcome).toEqual({ ok: true });

    await waitFor(() => {
      expect(deps.pushRecentPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'spotify' }),
        expect.objectContaining({ coverUrl: 'stored.jpg' }),
      );
    });
  });

  it('hydrates cached playlist immediately while refreshing on subsequent imports', async () => {
    const deps = createDeps();
    const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
    const initialPayload = {
      tracks: [{ id: 'track-1', title: 'Cached Track', artist: 'Artist A' }],
      meta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: null,
        hasMore: false,
        sourceUrl: spotifyUrl,
      },
      title: 'Cached Playlist',
      coverUrl: 'initial.jpg',
    };
    const refreshedPayload = {
      tracks: [{ id: 'track-2', title: 'New Track', artist: 'Artist B' }],
      meta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: null,
        hasMore: false,
        sourceUrl: spotifyUrl,
      },
      title: 'Refreshed Playlist',
      coverUrl: 'updated.jpg',
    };
    importInitialMock.mockResolvedValueOnce({ ok: true, data: initialPayload });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(() => {
      result.current.setImportUrl(spotifyUrl);
    });
    await act(async () => {
      await result.current.handleImport();
    });

    deps.setPlaylistTitle.mockClear();
    deps.announce.mockClear();
    const deferred = createDeferred();
    importInitialMock.mockImplementationOnce(() => deferred.promise);

    await act(() => {
      result.current.setImportUrl(spotifyUrl);
    });

    await act(async () => {
      const pending = result.current.handleImport();
      await Promise.resolve();
      expect(deps.setPlaylistTitle).toHaveBeenCalledWith('Cached Playlist');
      expect(deps.announce).toHaveBeenCalledWith(
        expect.stringContaining('Showing saved playlist while refreshing'),
      );
      deferred.resolve({ ok: true, data: refreshedPayload });
      await pending;
    });

    expect(result.current.isRefreshingCachedData).toBe(false);
    expect(deps.setPlaylistTitle).toHaveBeenLastCalledWith('Refreshed Playlist');
  });

  it('reuses cached data when selecting a recent playlist while refreshing in the background', async () => {
    const deps = createDeps();
    const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
    const cachedPayload = {
      tracks: [{ id: 'track-1', title: 'Cached Track', artist: 'Artist A' }],
      meta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: null,
        hasMore: false,
        sourceUrl: spotifyUrl,
      },
      title: 'Cached Playlist',
    };
    importInitialMock.mockResolvedValueOnce({ ok: true, data: cachedPayload });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(() => {
      result.current.setImportUrl(spotifyUrl);
    });
    await act(async () => {
      await result.current.handleImport();
    });

    deps.setPlaylistTitle.mockClear();
    deps.announce.mockClear();
    const recent = {
      id: 'recent-1',
      sourceUrl: spotifyUrl,
      provider: 'spotify',
      title: 'Recent Playlist',
      coverUrl: 'recent.jpg',
    };

    await act(async () => {
      await result.current.handleSelectRecent(recent);
    });

    expect(result.current.isRefreshingCachedData).toBe(false);
    expect(deps.setPlaylistTitle).toHaveBeenLastCalledWith('Cached Playlist');
    expect(importInitialMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalled();
  });

  it('falls back to live import when cache is missing', async () => {
    const deps = createDeps();
    const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
    const recent = {
      id: 'recent-1',
      sourceUrl: spotifyUrl,
      provider: 'spotify',
      title: 'Missing cache',
    };
    importInitialMock.mockResolvedValueOnce({
      ok: true,
      data: {
        tracks: [{ id: 'track-1', notes: [], tags: [] }],
        meta: { provider: 'spotify', playlistId: 'playlist-123', hasMore: false },
      },
    });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(async () => {
      await result.current.handleSelectRecent(recent);
    });

    expect(importInitialMock).toHaveBeenCalled();
    expect(deps.announce).toHaveBeenCalledWith(
      expect.stringContaining('Saved copy unavailable'),
    );
  });

  it('syncs annotations after loading a recent playlist from cache', async () => {
    const deps = createDeps();
    const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
    const cachedPayload = {
      tracks: [{ id: 'track-1', title: 'Cached Track', artist: 'Artist A' }],
      meta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: null,
        hasMore: false,
        sourceUrl: spotifyUrl,
      },
      title: 'Cached Playlist',
    };
    cacheStore.map.set('spotify:playlist-123', cachedPayload);
    cacheStore.map.set(spotifyUrl.trim(), cachedPayload);
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        notes: [{ trackId: 'track-1', body: 'Server note' }],
      }),
      headers: { get: () => null },
    });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    const recent = {
      id: 'recent-1',
      sourceUrl: spotifyUrl,
      provider: 'spotify',
      title: 'Recent Playlist',
    };
    await act(async () => {
      await result.current.handleSelectRecent(recent);
    });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/db/notes');
    expect(deps.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REMOTE_DATA_MERGE' }),
    );
  });

  it('reuses cached data when reimporting while refreshing in the background', async () => {
    const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
    const deps = createDeps({
      lastImportUrl: spotifyUrl,
      lastImportUrlRef: { current: spotifyUrl },
    });
    const cachedPayload = {
      tracks: [{ id: 'track-1', title: 'Cached Track', artist: 'Artist A' }],
      meta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: null,
        hasMore: false,
        sourceUrl: spotifyUrl,
      },
      title: 'Cached Playlist',
    };
    const refreshedPayload = {
      tracks: [{ id: 'track-2', title: 'New Track', artist: 'Artist B' }],
      meta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: null,
        hasMore: false,
        sourceUrl: spotifyUrl,
      },
      title: 'Refreshed Playlist',
    };
    importInitialMock.mockResolvedValueOnce({ ok: true, data: cachedPayload });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(() => {
      result.current.setImportUrl(spotifyUrl);
    });
    await act(async () => {
      await result.current.handleImport();
    });

    deps.setPlaylistTitle.mockClear();
    deps.announce.mockClear();
    const deferred = createDeferred();
    reimportMock.mockImplementationOnce(() => deferred.promise);

    await act(async () => {
      const pending = result.current.handleReimport();
      await Promise.resolve();
      expect(deps.setPlaylistTitle).toHaveBeenCalledWith('Cached Playlist');
      expect(deps.announce).toHaveBeenCalledWith(
        expect.stringContaining('Showing saved playlist while refreshing'),
      );
      deferred.resolve({ ok: true, data: refreshedPayload });
      await pending;
    });

    expect(result.current.isRefreshingCachedData).toBe(false);
    expect(deps.setPlaylistTitle).toHaveBeenLastCalledWith('Refreshed Playlist');
  });

  it('primes upstream services once per session when a Spotify URL is entered', async () => {
    const deps = createDeps();
    const { result } = renderHook(() => usePlaylistImportController(deps));

    await act(() => {
      result.current.setImportUrl('https://open.spotify.com/playlist/abc1234567890123456789');
    });

    await waitFor(() => {
      expect(primeUpstreamServicesMock).toHaveBeenCalledTimes(1);
    });

    await act(() => {
      result.current.setImportUrl('https://open.spotify.com/playlist/another1234567890123456');
    });

    expect(primeUpstreamServicesMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces cancel state and announcement on initial import abort', async () => {
    const deps = createDeps();
    importInitialMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(() => {
      result.current.setImportUrl('https://open.spotify.com/playlist/xyz');
    });
    await act(async () => {
      await result.current.handleImport();
    });

    expect(result.current.importError).toEqual({ message: 'Import canceled.', type: 'cancel' });
    expect(deps.announce).toHaveBeenCalledWith('Import canceled.');
  });

  it('surfaces cancel state and announcement on reimport abort', async () => {
    const deps = createDeps({
      lastImportUrl: 'https://open.spotify.com/playlist/xyz',
      lastImportUrlRef: { current: 'https://open.spotify.com/playlist/xyz' },
      importMeta: { provider: 'spotify', playlistId: 'playlist-xyz' },
    });
    reimportMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(async () => {
      await result.current.handleReimport();
    });

    expect(result.current.importError).toEqual({ message: 'Import canceled.', type: 'cancel' });
    expect(deps.announce).toHaveBeenCalledWith('Import canceled.');
  });

  it('surfaces cancel state on select recent abort', async () => {
    const deps = createDeps();
    const recent = {
      id: 'recent-1',
      sourceUrl: 'https://open.spotify.com/playlist/xyz',
      provider: 'spotify',
      title: 'Recent Playlist',
    };
    importInitialMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await expect(
      act(async () => {
        await result.current.handleSelectRecent(recent);
      }),
    ).rejects.toBeTruthy();

    expect(deps.updateRecentCardState).toHaveBeenCalledWith(
      'recent-1',
      expect.objectContaining({ loading: false, error: { message: 'Import canceled.', type: 'cancel' } }),
    );
    expect(deps.announce).toHaveBeenCalledWith('Import canceled.');
  });

  describe('cache updates during pagination', () => {
    it('updates cache with cumulative tracks after each load-more page', async () => {
      const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
      const initialTracks = [{ id: 'track-1', notes: [], tags: [] }];
      const initialMeta = {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: 'cursor-1',
        hasMore: true,
        sourceUrl: spotifyUrl,
        snapshotId: 'snap-1',
        total: 200,
      };
      cacheStore.map.set(spotifyUrl, {
        tracks: initialTracks,
        meta: initialMeta,
        coverUrl: 'cover.jpg',
      });
      const deps = createDeps({
        tracks: initialTracks,
        tracksRef: { current: initialTracks },
        notesByTrack: { 'track-1': [] },
        tagsByTrack: { 'track-1': [] },
        lastImportUrl: spotifyUrl,
        lastImportUrlRef: { current: spotifyUrl },
        initialImportMeta: initialMeta,
        playlistTitle: 'Test Playlist',
      });
      loadMoreMock.mockResolvedValueOnce({
        ok: true,
        data: {
          tracks: [{ id: 'track-2', notes: [], tags: [] }],
          meta: {
            provider: 'spotify',
            playlistId: 'playlist-123',
            cursor: null,
            hasMore: false,
            sourceUrl: spotifyUrl,
          },
          title: 'Test Playlist',
          total: 200,
        },
      });

      const { result } = renderHook(() => usePlaylistImportController(deps));
      await act(() => {
        result.current.setImportMeta(deps.initialImportMeta);
      });
      await act(async () => {
        await result.current.handleLoadMore({ mode: 'background' });
      });

      const cachedPayload = cacheStore.map.get(spotifyUrl);
      expect(cachedPayload).toBeTruthy();
      expect(cachedPayload.tracks).toHaveLength(2);
      expect(cachedPayload.tracks.map((t) => t.id)).toEqual(['track-1', 'track-2']);
      expect(cachedPayload.meta.hasMore).toBe(false);
      expect(cachedPayload.meta.cursor).toBeNull();
    });

    it('preserves coverUrl from existing cache when load-more lacks artwork', async () => {
      const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
      const initialTracks = [{ id: 'track-1', notes: [], tags: [] }];
      const initialMeta = {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: 'cursor-1',
        hasMore: true,
        sourceUrl: spotifyUrl,
      };
      cacheStore.map.set(spotifyUrl, {
        tracks: initialTracks,
        meta: initialMeta,
        coverUrl: 'original-cover.jpg',
      });
      const deps = createDeps({
        tracks: initialTracks,
        tracksRef: { current: initialTracks },
        notesByTrack: { 'track-1': [] },
        tagsByTrack: { 'track-1': [] },
        lastImportUrl: spotifyUrl,
        lastImportUrlRef: { current: spotifyUrl },
        initialImportMeta: initialMeta,
        playlistTitle: 'Playlist',
      });
      loadMoreMock.mockResolvedValueOnce({
        ok: true,
        data: {
          tracks: [{ id: 'track-2', notes: [], tags: [] }],
          meta: {
            provider: 'spotify',
            playlistId: 'playlist-123',
            cursor: null,
            hasMore: false,
            sourceUrl: spotifyUrl,
          },
          title: 'Playlist',
        },
      });

      const { result } = renderHook(() => usePlaylistImportController(deps));
      await act(() => {
        result.current.setImportMeta(deps.initialImportMeta);
      });
      await act(async () => {
        await result.current.handleLoadMore({ mode: 'background' });
      });

      const cachedPayload = cacheStore.map.get(spotifyUrl);
      expect(cachedPayload.coverUrl).toBe('original-cover.jpg');
      expect(cachedPayload.tracks).toHaveLength(2);
    });

    it('retains cache progress when pagination is interrupted mid-way', async () => {
      const spotifyUrl = 'https://open.spotify.com/playlist/xyz';
      const initialTracks = [{ id: 't1', notes: [], tags: [] }];
      const initialMeta = {
        provider: 'spotify',
        playlistId: 'playlist-999',
        cursor: 'cursor-1',
        hasMore: true,
        sourceUrl: spotifyUrl,
      };
      cacheStore.map.set(spotifyUrl, {
        tracks: initialTracks,
        meta: initialMeta,
        coverUrl: 'cover.jpg',
      });
      const deps = createDeps({
        tracks: initialTracks,
        tracksRef: { current: initialTracks },
        notesByTrack: { t1: [] },
        tagsByTrack: { t1: [] },
        lastImportUrl: spotifyUrl,
        lastImportUrlRef: { current: spotifyUrl },
        initialImportMeta: initialMeta,
      });
      loadMoreMock
        .mockResolvedValueOnce({
          ok: true,
          data: {
            tracks: [{ id: 't2', notes: [], tags: [] }],
            meta: {
              provider: 'spotify',
              playlistId: 'playlist-999',
              cursor: 'cursor-2',
              hasMore: true,
              sourceUrl: spotifyUrl,
            },
            title: 'Playlist',
          },
        })
        .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      const { result } = renderHook(() => usePlaylistImportController(deps));
      await act(() => {
        result.current.setImportMeta(deps.initialImportMeta);
      });
      await act(async () => {
        await result.current.handleLoadMore({ mode: 'background' });
      });

      const cachedAfterFirstPage = cacheStore.map.get(spotifyUrl);
      expect(cachedAfterFirstPage.tracks).toHaveLength(2);
      expect(cachedAfterFirstPage.meta.hasMore).toBe(true);
      expect(cachedAfterFirstPage.coverUrl).toBe('cover.jpg');

      let outcome;
      await act(async () => {
        outcome = await result.current.handleLoadMore({ mode: 'background' });
      });
      expect(outcome).toEqual({ ok: false, aborted: true });

      const cachedAfterAbort = cacheStore.map.get(spotifyUrl);
      expect(cachedAfterAbort.tracks).toHaveLength(2);
      expect(cachedAfterAbort.meta.hasMore).toBe(true);
    });

    it('gracefully handles load-more when sourceUrl is missing', async () => {
      const deps = createDeps({
        lastImportUrl: '',
        lastImportUrlRef: { current: '' },
        initialImportMeta: {
          provider: 'spotify',
          playlistId: 'playlist-123',
          cursor: 'cursor-1',
          hasMore: true,
          sourceUrl: '',
        },
      });

      const { result } = renderHook(() => usePlaylistImportController(deps));
      let outcome;
      await act(async () => {
        outcome = await result.current.handleLoadMore();
      });

      expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
      expect(loadMoreMock).not.toHaveBeenCalled();
      expect(cacheApi.rememberCachedResult).not.toHaveBeenCalled();
    });
  });

  it('formats rate limit with retry seconds for load more', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const deps = createDeps({
      tracks: [{ id: 'base', notes: [], tags: [] }],
      tracksRef: { current: [{ id: 'base', notes: [], tags: [] }] },
      notesByTrack: { base: [] },
      tagsByTrack: { base: [] },
      lastImportUrl: 'https://open.spotify.com/playlist/xyz',
      lastImportUrlRef: { current: 'https://open.spotify.com/playlist/xyz' },
      initialImportMeta: {
        provider: 'spotify',
        playlistId: 'playlist-123',
        cursor: 'cursor-1',
        sourceUrl: 'https://open.spotify.com/playlist/xyz',
        hasMore: true,
        snapshotId: 'snap-1',
      },
    });
    const retryAt = Date.now() + 4500;
    loadMoreMock.mockResolvedValue({
      ok: false,
      code: CODES.ERR_RATE_LIMITED,
      retryAt,
    });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(async () => {
      result.current.setImportMeta(deps.initialImportMeta);
    });
    await act(async () => {
      await result.current.handleLoadMore();
    });

    expect(result.current.importError).toEqual({
      message: expect.stringContaining('Too many requests'),
      type: 'rateLimit',
    });
    expect(deps.announce).toHaveBeenCalledWith(expect.stringContaining('Too many requests'));
    nowSpy.mockRestore();
  });

  it('formats rate limit fallback message with no retryAt', async () => {
    const deps = createDeps();
    importInitialMock.mockResolvedValueOnce({
      ok: false,
      code: CODES.ERR_RATE_LIMITED,
    });
    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(() => {
      result.current.setImportUrl('https://open.spotify.com/playlist/xyz');
    });
    await act(async () => {
      await result.current.handleImport();
    });

    expect(result.current.importError).toEqual({
      message: 'Too many requests. Try again shortly.',
      type: 'rateLimit',
    });
    expect(deps.announce).toHaveBeenCalledWith('Import failed. Too many requests. Try again shortly.');
  });

  it('formats rate limit fallback on reimport with no retryAt', async () => {
    const deps = createDeps({
      lastImportUrl: 'https://open.spotify.com/playlist/xyz',
      lastImportUrlRef: { current: 'https://open.spotify.com/playlist/xyz' },
      importMeta: { provider: 'spotify', playlistId: 'playlist-xyz' },
    });
    reimportMock.mockResolvedValueOnce({
      ok: false,
      code: CODES.ERR_RATE_LIMITED,
    });

    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(async () => {
      await result.current.handleReimport();
    });

    expect(result.current.importError).toEqual({
      message: 'Too many requests. Try again shortly.',
      type: 'rateLimit',
    });
    expect(deps.announce).toHaveBeenCalledWith('Too many requests. Try again shortly.');
  });

  it('clears import error when set to null', async () => {
    const deps = createDeps();
    const { result } = renderHook(() => usePlaylistImportController(deps));
    await act(() => {
      result.current.setImportError({ message: 'oops', type: 'error' });
    });
    expect(result.current.importError).toEqual({ message: 'oops', type: 'error' });
    await act(() => {
      result.current.setImportError(null);
    });
    expect(result.current.importError).toBeNull();
  });
});
