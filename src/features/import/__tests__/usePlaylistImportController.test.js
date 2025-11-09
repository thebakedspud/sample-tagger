import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import usePlaylistImportController from '../usePlaylistImportController.js';
import { playlistActions } from '../../playlist/actions.js';

const detectProviderMock = vi.hoisted(() => vi.fn(() => 'spotify'));
const importFlowState = vi.hoisted(() => ({ status: 'idle', loading: false }));
const importInitialMock = vi.hoisted(() => vi.fn());
const reimportMock = vi.hoisted(() => vi.fn());
const loadMoreMock = vi.hoisted(() => vi.fn());
const resetFlowMock = vi.hoisted(() => vi.fn());
const primeUpstreamServicesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

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

vi.mock('../../utils/debug.js', () => ({
  DEBUG_FOCUS: false,
  debugFocus: vi.fn(),
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
  importFlowState.status = 'idle';
  importFlowState.loading = false;
  detectProviderMock.mockReturnValue('spotify');
  importInitialMock.mockReset();
  reimportMock.mockReset();
  loadMoreMock.mockReset();
  resetFlowMock.mockReset();
  primeUpstreamServicesMock.mockClear();
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
    expect(deps.announce).toHaveBeenCalledWith('Playlist imported. 1 tracks.');
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
      error: 'Finish the current import before loading another playlist.',
      loading: false,
    });
    expect(importInitialMock).not.toHaveBeenCalled();
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
});
