// src/features/import/adapters/spotifyAdapter.js
// Spotify adapter backed by the official Web API using the client-credentials flow.

// @ts-check

import { normalizeTrack } from '../normalizeTrack.js';
import { createAdapterError, CODES } from './types.js';
import { defaultFetchClient } from '../../../utils/fetchClient.js';
import { isDev } from '../../../utils/isDev.js';

const PROVIDER = 'spotify';
const TOKEN_ENDPOINT = '/api/spotify/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const PLAYLIST_FIELDS = 'name,external_urls,images,owner(display_name),snapshot_id';
const TRACK_FIELDS =
  'items(added_at,track(id,uri,name,duration_ms,external_urls,album(name,images),artists(name),is_local,type)),next,total';
const PAGE_SIZE = 100;
const TOKEN_REFRESH_BUFFER_MS = 30_000;
const CANONICAL_BASE_URL = 'https://open.spotify.com/playlist/';
const IDEAL_TRACK_THUMB_WIDTH = 80; // ~2x the 40px display size for HiDPI clarity

/**
 * @typedef {{ value: string, tokenType: string, expiresAt: number }} TokenMemo
 */

/** @type {TokenMemo | null} */
let tokenMemo = null;
/** @type {Promise<TokenMemo> | null} */
let tokenPromise = null;

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'play.spotify.com']);
const PLAYLIST_ID_LENGTH = 22;
const PLAYLIST_ID_PATTERN = /^[0-9a-zA-Z]+$/;

/**
 * @param {string | undefined} maybeId
 * @returns {string | null}
 */
function sanitizePlaylistId(maybeId) {
  if (!maybeId) return null;
  const trimmed = maybeId.trim();
  if (trimmed.length !== PLAYLIST_ID_LENGTH) return null;
  return PLAYLIST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function debugLog(label, payload) {
  if (isDev()) {
    console.debug(`[spotify] ${label}`, payload);
  }
}

/**
 * Extract a playlist ID from supported Spotify playlist formats.
 * Supports canonical, legacy user, embed, and URI share links.
 * @param {string} raw
 * @returns {string | null}
 */
export function extractPlaylistId(raw) {
  if (typeof raw !== 'string') return null;

  const input = raw.trim();
  if (!input) return null;

  const lowerInput = input.toLowerCase();

  if (lowerInput.startsWith('spotify://')) {
    const translated = `https://open.spotify.com/${input.slice('spotify://'.length).replace(/^\/+/, '')}`;
    return extractPlaylistId(translated);
  }

  if (lowerInput.startsWith('spotify:')) {
    const parts = input.split(':').filter(Boolean);
    if (parts.length >= 3 && parts[parts.length - 2]?.toLowerCase() === 'playlist') {
      return sanitizePlaylistId(parts[parts.length - 1]);
    }
    return null;
  }

  const candidateUrl = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  try {
    const parsed = new URL(candidateUrl);
    const host = parsed.hostname.toLowerCase();
    if (!SPOTIFY_HOSTS.has(host)) return null;

    const rawSegments = parsed.pathname.split('/').filter(Boolean);
    if (!rawSegments.length) return null;
    const segments = rawSegments.map((seg) => seg.toLowerCase());

    // Canonical: /playlist/{id}
    if (segments[0] === 'playlist') {
      return sanitizePlaylistId(rawSegments[1]);
    }

    // Localized: /intl-xx/playlist/{id}
    if (segments[0]?.startsWith('intl-') && segments[1] === 'playlist') {
      return sanitizePlaylistId(rawSegments[2]);
    }

    // Legacy: /user/{userId}/playlist/{id}
    if (segments[0] === 'user' && segments[2] === 'playlist') {
      return sanitizePlaylistId(rawSegments[3]);
    }

    // Embed: /embed/playlist/{id}
    if (segments[0] === 'embed' && segments[1] === 'playlist') {
      return sanitizePlaylistId(rawSegments[2]);
    }

    return null;
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
 * @param {Record<string, unknown>} [details]
 * @returns {never}
 */
function invalidResponse(stage, details = {}) {
  throw createAdapterError(CODES.ERR_INVALID_RESPONSE, { stage, ...details });
}

/**
 * Spotify returns album images ordered from largest to smallest. We prefer the smallest thumbnail
 * that still exceeds our desired display width to avoid downloading unnecessary bytes.
 * @param {Array<{ url?: string, width?: number, height?: number }>} albumImages
 * @param {string | null} fallbackUrl
 * @returns {string | null}
 */
function selectAlbumThumb(albumImages, fallbackUrl) {
  if (!Array.isArray(albumImages) || !albumImages.length) return fallbackUrl ?? null;

  const normalized = albumImages
    .map((img) => {
      if (!img || typeof img.url !== 'string') return null;
      const width =
        typeof img.width === 'number'
          ? img.width
          : typeof img.height === 'number'
            ? img.height
            : null;
      return { url: img.url, width };
    })
    .filter(Boolean);

  if (!normalized.length) return fallbackUrl ?? null;

  const withWidth = normalized.filter((img) => typeof img.width === 'number');
  if (withWidth.length) {
    const sorted = withWidth.slice().sort((a, b) => a.width - b.width);
    const candidate =
      sorted.find((img) => (img.width ?? Infinity) >= IDEAL_TRACK_THUMB_WIDTH) ??
      sorted[sorted.length - 1];
    return candidate.url;
  }

  // Width metadata missing: Spotify orders images largest -> smallest, so last is smallest.
  return normalized[normalized.length - 1].url;
}

export const __private = {
  selectAlbumThumb,
};

/**
 * @param {TokenMemo | null} memo
 */
function isTokenFresh(memo) {
  if (!memo) return false;
  return Date.now() + TOKEN_REFRESH_BUFFER_MS < memo.expiresAt;
}

function invalidateTokenMemo() {
  tokenMemo = null;
}

/**
 * @param {any} payload
 * @returns {TokenMemo}
 */
function toTokenMemo(payload) {
  const accessToken = /** @type {any} */ (payload)?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    invalidResponse('token', { reason: 'missing_token', received: payload });
  }

  const tokenType =
    typeof payload?.token_type === 'string' && payload.token_type.trim()
      ? payload.token_type
      : 'Bearer';

  const now = Date.now();
  const rawExpiresAt = Number(/** @type {any} */ (payload)?.expires_at);
  if (Number.isFinite(rawExpiresAt) && rawExpiresAt > now) {
    return {
      value: accessToken,
      tokenType,
      expiresAt: rawExpiresAt,
    };
  }

  const rawExpiresIn = Number(/** @type {any} */ (payload)?.expires_in);
  // Use a small safety margin so we never present an already-expired token under clock skew.
  const safeExpiresInSeconds = Number.isFinite(rawExpiresIn)
    ? Math.max(5, rawExpiresIn - 5)
    : 55;

  return {
    value: accessToken,
    tokenType,
    expiresAt: now + safeExpiresInSeconds * 1000,
  };
}

/**
 * @param {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} fetchClient
 * @param {{ signal?: AbortSignal, forceRefresh?: boolean }} [options]
 * @returns {Promise<TokenMemo>}
 */
async function fetchAccessToken(fetchClient, { signal, forceRefresh = false } = {}) {
  if (forceRefresh) {
    invalidateTokenMemo();
  }

  // Fast path: still-fresh memoized token.
  if (!forceRefresh && isTokenFresh(tokenMemo)) {
    debugLog('token:hit', { expiresInMs: tokenMemo.expiresAt - Date.now() });
    return /** @type {TokenMemo} */ (tokenMemo);
  }

  // Coalesce concurrent callers when not forcing refresh.
  if (!forceRefresh && tokenPromise) {
    return tokenPromise;
  }

  debugLog('token:fetch', { forceRefresh });

  const request = (async () => {
    try {
      const tokenPayload = await fetchClient.getJson(TOKEN_ENDPOINT, {
        method: 'GET',
        signal,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
      const memo = toTokenMemo(tokenPayload);
      tokenMemo = memo;
      debugLog('token:stored', { expiresAt: memo.expiresAt });
      return memo;
    } catch (err) {
      invalidateTokenMemo();
      mapSpotifyError('token', err);
    }
  })();

  tokenPromise = request;
  try {
    return await request;
  } finally {
    if (tokenPromise === request) {
      tokenPromise = null;
    }
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
 * @param {string} playlistId
 */
function buildCanonicalPlaylistUrl(playlistId) {
  return `${CANONICAL_BASE_URL}${playlistId}`;
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
 * @param {TokenMemo} token
 * @param {{ signal?: AbortSignal }} options
 */
async function fetchPlaylistMeta(fetchClient, playlistId, token, { signal }) {
  try {
    return await fetchClient.getJson(buildPlaylistMetaUrl(playlistId), {
      signal,
      headers: {
        Authorization: `${token.tokenType} ${token.value}`,
      },
    });
  } catch (err) {
    mapSpotifyError('meta', err);
  }
}

/**
 * @param {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} fetchClient
 * @param {string} playlistId
 * @param {TokenMemo} token
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
        Authorization: `${token.tokenType} ${token.value}`,
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
    const albumThumb = selectAlbumThumb(track.album?.images, fallbackThumb);
    const albumName =
      track?.album && typeof track.album.name === 'string' ? track.album.name : undefined;
    const addedAt = typeof item?.added_at === 'string' ? item.added_at : undefined;

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
        album: albumName,
        dateAdded: addedAt,
      },
      out.length, // note: indices are page-local
      PROVIDER
    );

    out.push(normalized);
  });

  return out;
}

/**
 * Spotify playlist import adapter (client-credentials via server token proxy).
 *
 * Inputs:
 *  - options.url: any supported Spotify playlist link/URI. Required for first page.
 *  - options.cursor: opaque Spotify "next" URL from a prior call. Optional for pagination.
 *  - options.signal: AbortSignal to cancel both token + data requests.
 *  - options.fetchClient: injected fetch client (tests/SSR).
 *
 * Returns:
 *  {
 *    provider, playlistId, title, snapshotId?, sourceUrl, coverUrl?, total?,
 *    tracks: NormalizedTrack[],
 *    pageInfo: { cursor: string|null, hasMore: boolean },
 *    debug: { source, stage, hasNext, tokenRefreshed, metaMs, tracksMs, tokenMs, inputUrl? }
 *  }
 *
 * Throws adapter errors (createAdapterError) with codes:
 *  - ERR_UNSUPPORTED_URL, ERR_PRIVATE_PLAYLIST (401/403), ERR_NOT_FOUND (404),
 *    ERR_RATE_LIMITED (429), ERR_INVALID_RESPONSE, ERR_NETWORK, ERR_UNKNOWN.
 *
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

  const signal = options.signal;
  const cursor = options.cursor ?? null;
  let lastError = null;
  let tokenRefreshed = false;

  const perfNow =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now();

  const runWithToken = async (forceRefresh = false) => {
    const tokenStart = Date.now();
    const token = await fetchAccessToken(fetchClient, { signal, forceRefresh });
    const tokenMs = Date.now() - tokenStart;

    // Fetch playlist meta and first page of tracks in parallel under the same token.
    // If either returns 401 once, we retry the whole pair with a fresh token (see loop below).
    let metaMs = null;
    let tracksMs = null;

    const metaStart = perfNow();
    const metaPromise = fetchPlaylistMeta(fetchClient, playlistId, token, { signal }).then((meta) => {
      metaMs = perfNow() - metaStart;
      return meta;
    });

    const trackStart = perfNow();
    const tracksPromise = fetchPlaylistTracks(fetchClient, playlistId, token, {
      signal,
      cursor,
    }).then((payload) => {
      tracksMs = perfNow() - trackStart;
      return payload;
    });

    const [meta, tracksPayload] = await Promise.all([metaPromise, tracksPromise]);
    debugLog('parallel:fetch', {
      metaMs,
      tracksMs,
      tokenMs,
      next: Boolean(tracksPayload?.next),
      total: typeof tracksPayload?.total === 'number' ? tracksPayload.total : null,
      items: Array.isArray(tracksPayload?.items) ? tracksPayload.items.length : 0,
    });
    return { meta, tracksPayload, timings: { metaMs, tracksMs, tokenMs } };
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const forceRefresh = attempt > 0;
    try {
      const { meta, tracksPayload, timings } = await runWithToken(forceRefresh);

      const items = /** @type {any[]} */ (tracksPayload?.items ?? []);
      const tracks = toNormalizedTracks(items, meta); // note: indices are page-local
      const nextCursor = typeof tracksPayload?.next === 'string' ? tracksPayload.next : null;
      const totalTracks =
        typeof tracksPayload?.total === 'number' && Number.isFinite(tracksPayload.total)
          ? tracksPayload.total
          : undefined;
      const coverImage =
        Array.isArray(meta?.images) && meta.images[0]?.url ? meta.images[0].url : undefined;

      const canonicalUrl = buildCanonicalPlaylistUrl(playlistId);

      return {
        provider: PROVIDER,
        playlistId,
        title: typeof meta?.name === 'string' ? meta.name : `Spotify playlist ${playlistId}`,
        snapshotId: typeof meta?.snapshot_id === 'string' ? meta.snapshot_id : undefined,
        sourceUrl: canonicalUrl,
        coverUrl: coverImage,
        total: totalTracks,
        tracks,
        pageInfo: {
          cursor: nextCursor,
          hasMore: Boolean(nextCursor),
        },
        debug: {
          source: 'spotify:web',
          stage: cursor ? 'paginate' : 'initial',
          hasNext: Boolean(nextCursor),
          tokenRefreshed,
          metaMs: timings.metaMs,
          tracksMs: timings.tracksMs,
          tokenMs: timings.tokenMs,
          inputUrl: playlistUrl || null,
        },
      };
    } catch (err) {
      lastError = err;
      const status = extractHttpStatus(err);
      if (status === 401 && attempt === 0) {
        // Unauthorized once → drop memo and retry with a fresh token.
        debugLog('token:retry', { reason: 'unauthorized', playlist: playlistId.slice(0, 8) });
        invalidateTokenMemo();
        tokenRefreshed = true;
        continue;
      }
      throw err;
    }
  }

  throw /** @type {Error} */ (lastError ?? createAdapterError(CODES.ERR_UNKNOWN));
}

export default { importPlaylist };

export function __resetSpotifyTokenMemoForTests() {
  tokenMemo = null;
  tokenPromise = null;
}
