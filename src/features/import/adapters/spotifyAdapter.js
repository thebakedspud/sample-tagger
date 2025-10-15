// src/features/import/adapters/spotifyAdapter.js
// Spotify adapter backed by the official Web API using the client-credentials flow.

// @ts-check

import { normalizeTrack } from '../normalizeTrack.js';
import { createAdapterError, CODES } from './types.js';
import { defaultFetchClient } from '../../../utils/fetchClient.js';

const PROVIDER = 'spotify';
const TOKEN_ENDPOINT = '/api/spotify/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const PLAYLIST_FIELDS = 'name,external_urls,images,owner(display_name),snapshot_id';
const TRACK_FIELDS =
  'items(track(id,uri,name,duration_ms,external_urls,album(images),artists(name),is_local,type)),next';
const PAGE_SIZE = 100;

/**
 * Extract a playlist ID from an open.spotify.com URL.
 * @param {string} raw
 * @returns {string | null}
 */
function extractPlaylistId(raw) {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'open.spotify.com') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'playlist' || !parts[1]) return null;
    return parts[1];
  } catch {
    return null;
  }
}

/**
 * @param {unknown} err
 * @returns {number | null}
 */
function extractHttpStatus(err) {
  const anyErr = /** @type {any} */ (err);
  if (typeof anyErr?.status === 'number') return anyErr.status;
  if (typeof anyErr?.details?.status === 'number') return anyErr.details.status;
  const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
  const match = /^HTTP_(\d+)/.exec(code);
  if (match) {
    const num = Number.parseInt(match[1], 10);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

/**
 * @param {'token' | 'meta' | 'tracks'} stage
 * @param {unknown} err
 */
/**
 * @param {'token' | 'meta' | 'tracks'} stage
 * @param {unknown} err
 * @returns {never}
 */
function mapSpotifyError(stage, err) {
  const anyErr = /** @type {any} */ (err);
  if (anyErr?.name === 'AbortError') throw err;

  const status = extractHttpStatus(err);
  const details = {
    stage,
    ...(typeof anyErr?.details === 'object' ? anyErr.details : {}),
    ...(status ? { status } : {}),
  };

  if (status === 401 || status === 403) {
    throw createAdapterError(CODES.ERR_PRIVATE_PLAYLIST, details, err);
  }
  if (status === 404) {
    throw createAdapterError(CODES.ERR_NOT_FOUND, details, err);
  }
  if (status === 429) {
    throw createAdapterError(CODES.ERR_RATE_LIMITED, details, err);
  }

  if (stage === 'token') {
    throw createAdapterError(CODES.ERR_NETWORK, { ...details, endpoint: TOKEN_ENDPOINT }, err);
  }

  throw createAdapterError(CODES.ERR_NETWORK, details, err);
}

/**
 * @param {'token' | 'meta' | 'tracks'} stage
 * @param {Record<string, any>} details
 */
/**
 * @param {'token' | 'meta' | 'tracks'} stage
 * @param {Record<string, unknown>} [details]
 * @returns {never}
 */
function invalidResponse(stage, details = {}) {
  throw createAdapterError(CODES.ERR_INVALID_RESPONSE, { stage, ...details });
}

/**
 * @param {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} fetchClient
 * @param {{ signal?: AbortSignal }} options
 */
async function fetchAccessToken(fetchClient, { signal }) {
  try {
    const tokenPayload = await fetchClient.getJson(TOKEN_ENDPOINT, {
      method: 'GET',
      signal,
      headers: {
        'Cache-Control': 'no-store',
      },
    });

    const accessToken = /** @type {any} */ (tokenPayload)?.access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      invalidResponse('token', { received: tokenPayload });
    }
    return accessToken;
  } catch (err) {
    mapSpotifyError('token', err);
  }
}

/**
 * @param {string} playlistId
 */
function buildPlaylistMetaUrl(playlistId) {
  const params = new URLSearchParams({
    fields: PLAYLIST_FIELDS,
  });
  return `${SPOTIFY_API_BASE}/playlists/${playlistId}?${params.toString()}`;
}

/**
 * @param {string} playlistId
 */
function buildPlaylistTracksUrl(playlistId) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    fields: TRACK_FIELDS,
  });
  return `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?${params.toString()}`;
}

/**
 * Only allow cursor URLs that target the Spotify Web API.
 * @param {string} raw
 * @returns {string | null}
 */
function sanitizeCursor(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.origin !== 'https://api.spotify.com') return null;
    if (!parsed.pathname.startsWith('/v1/')) return null;
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/**
 * @param {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} fetchClient
 * @param {string} playlistId
 * @param {string} token
 * @param {{ signal?: AbortSignal }} options
 */
async function fetchPlaylistMeta(fetchClient, playlistId, token, { signal }) {
  try {
    return await fetchClient.getJson(buildPlaylistMetaUrl(playlistId), {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    mapSpotifyError('meta', err);
  }
}

/**
 * @param {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} fetchClient
 * @param {string} playlistId
 * @param {string} token
 * @param {{ signal?: AbortSignal, cursor?: string | null }} options
 */
async function fetchPlaylistTracks(fetchClient, playlistId, token, { signal, cursor }) {
  const endpoint = cursor ? sanitizeCursor(cursor) : buildPlaylistTracksUrl(playlistId);
  if (!endpoint) {
    invalidResponse('tracks', { reason: 'invalid_cursor', cursor });
  }

  try {
    return await fetchClient.getJson(endpoint, {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    mapSpotifyError('tracks', err);
  }
}

/**
 * @param {any[]} rawItems
 * @param {any} meta
 */
function toNormalizedTracks(rawItems, meta) {
  if (!Array.isArray(rawItems)) {
    invalidResponse('tracks', { reason: 'missing_items' });
  }

  const fallbackThumb = meta?.images?.[0]?.url ?? null;
  /** @type {import('./types.js').NormalizedTrack[]} */
  const out = [];

  rawItems.forEach((item) => {
    const track = item?.track;
    if (!track || typeof track !== 'object') return;
    if (track.is_local || track.type === 'episode') return;

    const title = typeof track.name === 'string' ? track.name : '';
    const artistList = Array.isArray(track.artists)
      ? /** @type {Array<{ name?: string }>} */ (track.artists)
      : [];
    const artists = artistList
      .map((artist) => (artist && typeof artist.name === 'string' ? artist.name.trim() : ''))
      .filter(Boolean)
      .join(', ');
    const albumImages = track.album?.images;
    const albumThumb =
      Array.isArray(albumImages) && albumImages[0]?.url ? albumImages[0].url : fallbackThumb;

    const normalized = normalizeTrack(
      {
        id: track.id ?? track.uri ?? undefined,
        title,
        artist: artists,
        providerTrackId: track.id ?? track.uri ?? undefined,
        durationMs: typeof track.duration_ms === 'number' ? track.duration_ms : undefined,
        sourceUrl: track.external_urls?.spotify ?? '',
        thumbnailUrl: albumThumb ?? undefined,
        provider: PROVIDER,
      },
      out.length,
      PROVIDER
    );

    out.push(normalized);
  });

  return out;
}

/**
 * Adapter contract entry point shared with other providers.
 * @param {{
 *   url?: string,
 *   cursor?: string,
 *   signal?: AbortSignal,
 *   fetchClient?: ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>
 * }} [options]
 */
export async function importPlaylist(options = {}) {
  const fetchClient = options.fetchClient ?? defaultFetchClient;
  const playlistUrl = typeof options?.url === 'string' ? options.url.trim() : '';
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    throw createAdapterError(CODES.ERR_UNSUPPORTED_URL, {
      urlPreview: playlistUrl.slice(0, 120),
    });
  }

  const token = await fetchAccessToken(fetchClient, { signal: options.signal });
  const meta = await fetchPlaylistMeta(fetchClient, playlistId, token, { signal: options.signal });

  const tracksPayload = await fetchPlaylistTracks(fetchClient, playlistId, token, {
    signal: options.signal,
    cursor: options.cursor ?? null,
  });

  const items = /** @type {any[]} */ (tracksPayload?.items ?? []);
  const tracks = toNormalizedTracks(items, meta);
  const nextCursor = typeof tracksPayload?.next === 'string' ? tracksPayload.next : null;

  return {
    provider: PROVIDER,
    playlistId,
    title: typeof meta?.name === 'string' ? meta.name : `Spotify playlist ${playlistId}`,
    snapshotId: typeof meta?.snapshot_id === 'string' ? meta.snapshot_id : undefined,
    sourceUrl: playlistUrl,
    tracks,
    pageInfo: {
      cursor: nextCursor,
      hasMore: Boolean(nextCursor),
    },
    debug: {
      source: 'spotify:web',
      stage: options.cursor ? 'paginate' : 'initial',
      hasNext: Boolean(nextCursor),
    },
  };
}

export default { importPlaylist };
