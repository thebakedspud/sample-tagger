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
  'items(added_at,track(id,uri,name,duration_ms,external_urls,album(name,images),artists(name),is_local,type,show(publisher,name,images))),next,total';
const SHOW_FIELDS = 'name,publisher,images,external_urls';
const EPISODE_FIELDS =
  'id,uri,name,description,duration_ms,images,external_urls,show(id,name,publisher,images)';
const PLAYLIST_PAGE_SIZE = 100;
const SHOW_PAGE_SIZE = 50;
const TOKEN_REFRESH_BUFFER_MS = 30_000;
const CANONICAL_BASE_URL = 'https://open.spotify.com/';
const TRACK_THUMB_DISPLAY_WIDTH = 40;
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
function sanitizeSpotifyId(maybeId) {
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
 * Extract a Spotify ID from supported formats for the given path segment.
 * Supports canonical, legacy user, embed, localized (/intl-xx), and URI share links.
 * @param {string} raw
 * @param {'playlist' | 'show' | 'episode'} kind
 * @returns {string | null}
 */
function extractIdByKind(raw, kind) {
  if (typeof raw !== 'string') return null;

  const input = raw.trim();
  if (!input) return null;

  const lowerInput = input.toLowerCase();

  if (lowerInput.startsWith('spotify://')) {
    const translated = `https://open.spotify.com/${input.slice('spotify://'.length).replace(/^\/+/, '')}`;
    return extractIdByKind(translated, kind);
  }

  if (lowerInput.startsWith('spotify:')) {
    const parts = input.split(':').filter(Boolean);
    if (parts.length >= 3 && parts[parts.length - 2]?.toLowerCase() === kind) {
      return sanitizeSpotifyId(parts[parts.length - 1]);
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

    // Canonical: /{kind}/{id}
    if (segments[0] === kind) {
      return sanitizeSpotifyId(rawSegments[1]);
    }

    // Localized: /intl-xx/{kind}/{id}
    if (segments[0]?.startsWith('intl-') && segments[1] === kind) {
      return sanitizeSpotifyId(rawSegments[2]);
    }

    // Legacy: /user/{userId}/playlist/{id}
    if (kind === 'playlist' && segments[0] === 'user' && segments[2] === 'playlist') {
      return sanitizeSpotifyId(rawSegments[3]);
    }

    // Embed: /embed/{kind}/{id}
    if (segments[0] === 'embed' && segments[1] === kind) {
      return sanitizeSpotifyId(rawSegments[2]);
    }

    return null;
  } catch {
    return null;
  }
}

export function extractPlaylistId(raw) {
  return extractIdByKind(raw, 'playlist');
}

export function extractShowId(raw) {
  return extractIdByKind(raw, 'show');
}

export function extractEpisodeId(raw) {
  return extractIdByKind(raw, 'episode');
}

function podcastsEnabled() {
  return Boolean(/** @type {any} */ (import.meta?.env?.VITE_ENABLE_PODCASTS));
}

/**
 * @param {string} raw
 * @returns {{ type: 'playlist' | 'show' | 'episode', id: string, canonicalUrl: string } | null}
 */
function detectContent(raw) {
  const playlistId = extractPlaylistId(raw);
  if (playlistId) {
    return {
      type: 'playlist',
      id: playlistId,
      canonicalUrl: buildCanonicalPlaylistUrl(playlistId),
    };
  }

  const showId = extractShowId(raw);
  if (showId) {
    return {
      type: 'show',
      id: showId,
      canonicalUrl: `${CANONICAL_BASE_URL}show/${showId}`,
    };
  }

  const episodeId = extractEpisodeId(raw);
  if (episodeId) {
    return {
      type: 'episode',
      id: episodeId,
      canonicalUrl: `${CANONICAL_BASE_URL}episode/${episodeId}`,
    };
  }

  return null;
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
    const isRegionRestriction = status === 403 && details?.stage === 'tracks';
    if (isRegionRestriction) {
      throw createAdapterError(CODES.ERR_EPISODE_UNAVAILABLE, details, err);
    }
    throw createAdapterError(CODES.ERR_PRIVATE_PLAYLIST, details, err);
  }
  if (status === 404) {
    throw createAdapterError(CODES.ERR_NOT_FOUND, details, err);
  }
  if (status === 451) {
    throw createAdapterError(CODES.ERR_EPISODE_UNAVAILABLE, details, err);
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
    const selectClosestToIdeal = (candidates) => {
      if (!candidates.length) return null;
      return candidates.reduce((best, img) => {
        if (!best) return img;
        const bestDelta = Math.abs((best.width ?? IDEAL_TRACK_THUMB_WIDTH) - IDEAL_TRACK_THUMB_WIDTH);
        const imgDelta = Math.abs((img.width ?? IDEAL_TRACK_THUMB_WIDTH) - IDEAL_TRACK_THUMB_WIDTH);
        return imgDelta < bestDelta ? img : best;
      }, null);
    };

    const hiDpiCandidates = sorted.filter((img) => (img.width ?? 0) >= TRACK_THUMB_DISPLAY_WIDTH);
    const candidate = selectClosestToIdeal(hiDpiCandidates) ?? selectClosestToIdeal(sorted);
    if (candidate) return candidate.url;
  }

  // Width metadata missing: Spotify orders images largest -> smallest, so last is smallest.
  return normalized[normalized.length - 1].url;
}

export const __private = {
  selectAlbumThumb,
};

/**
 * @param {any} episode
 * @param {{ id?: string, name?: string, publisher?: string, images?: any[] }} showMeta
 * @param {number} index
 * @param {string | undefined} addedAt
 */
function normalizeEpisodeItem(episode, showMeta, index, addedAt) {
  if (!episode || typeof episode !== 'object') return null;
  const episodeId = episode?.id ?? episode?.uri;
  if (!episodeId) return null;

  const showName =
    typeof episode?.show?.name === 'string'
      ? episode.show.name
      : typeof showMeta?.name === 'string'
        ? showMeta.name
        : undefined;

  const publisher =
    typeof episode?.show?.publisher === 'string'
      ? episode.show.publisher
      : typeof showMeta?.publisher === 'string'
        ? showMeta.publisher
        : undefined;

  const showId = typeof episode?.show?.id === 'string' ? episode.show.id : showMeta?.id;
  const thumbnailUrl =
    selectAlbumThumb(episode?.images, null) ??
    selectAlbumThumb(showMeta?.images, null) ??
    null;

  return normalizeTrack(
    {
      id: episodeId,
      providerTrackId: episodeId,
      title: typeof episode?.name === 'string' ? episode.name : '',
      artist: showName ?? '',
      album: showName ?? undefined,
      durationMs:
        typeof episode?.duration_ms === 'number' && Number.isFinite(episode.duration_ms)
          ? episode.duration_ms
          : undefined,
      sourceUrl: episode?.external_urls?.spotify ?? '',
      thumbnailUrl: thumbnailUrl ?? undefined,
      provider: PROVIDER,
      kind: 'podcast',
      showId: typeof showId === 'string' ? showId : undefined,
      showName: showName ?? undefined,
      publisher: publisher ?? undefined,
      description: typeof episode?.description === 'string' ? episode.description : undefined,
      dateAdded: addedAt,
    },
    index,
    PROVIDER
  );
}

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
    limit: String(PLAYLIST_PAGE_SIZE),
    fields: TRACK_FIELDS,
  });
  return `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?${params.toString()}`;
}

/**
 * @param {string} playlistId
 */
function buildCanonicalPlaylistUrl(playlistId) {
  return `${CANONICAL_BASE_URL}playlist/${playlistId}`;
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
 * @param {string} showId
 * @param {TokenMemo} token
 * @param {{ signal?: AbortSignal, offset?: number }} options
 */
async function fetchShowEpisodes(fetchClient, showId, token, { signal, offset = 0, cursor }) {
  const endpoint = cursor ? sanitizeCursor(cursor) : buildShowEpisodesUrl(showId, offset);
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
 * @param {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} fetchClient
 * @param {string} showId
 * @param {TokenMemo} token
 * @param {{ signal?: AbortSignal }} options
 */
async function fetchShowMeta(fetchClient, showId, token, { signal }) {
  try {
    return await fetchClient.getJson(buildShowMetaUrl(showId), {
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
 * @param {string} episodeId
 * @param {TokenMemo} token
 * @param {{ signal?: AbortSignal }} options
 */
async function fetchEpisode(fetchClient, episodeId, token, { signal }) {
  try {
    return await fetchClient.getJson(buildEpisodeUrl(episodeId), {
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
 * @param {string} showId
 */
function buildShowMetaUrl(showId) {
  const params = new URLSearchParams({
    market: 'from_token',
    fields: SHOW_FIELDS,
  });
  return `${SPOTIFY_API_BASE}/shows/${showId}?${params.toString()}`;
}

/**
 * @param {string} showId
 * @param {number} [offset]
 */
function buildShowEpisodesUrl(showId, offset = 0) {
  const params = new URLSearchParams({
    limit: String(SHOW_PAGE_SIZE),
    offset: String(offset),
    market: 'from_token',
    fields:
      'items(id,uri,name,description,duration_ms,images,external_urls,release_date,release_date_precision,show(id,name,publisher,images)),next,total',
  });
  return `${SPOTIFY_API_BASE}/shows/${showId}/episodes?${params.toString()}`;
}

/**
 * @param {string} episodeId
 */
function buildEpisodeUrl(episodeId) {
  const params = new URLSearchParams({
    market: 'from_token',
    fields: EPISODE_FIELDS,
  });
  return `${SPOTIFY_API_BASE}/episodes/${episodeId}?${params.toString()}`;
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
    if (track.is_local) return;

    const addedAt = typeof item?.added_at === 'string' ? item.added_at : undefined;

    if (track.type === 'episode') {
      const normalizedEpisode = normalizeEpisodeItem(track, track.show ?? {}, out.length, addedAt);
      if (normalizedEpisode) {
        out.push(normalizedEpisode);
      }
      return;
    }

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
        kind: 'music',
      },
      out.length, // note: indices are page-local
      PROVIDER
    );

    out.push(normalized);
  });

  return out;
}

/**
 * @param {any[]} rawItems
 * @param {any} showMeta
 * @param {number} startIndex
 */
function toNormalizedShowEpisodes(rawItems, showMeta, startIndex = 0) {
  if (!Array.isArray(rawItems)) {
    invalidResponse('tracks', { reason: 'missing_episodes' });
  }

  /** @type {import('./types.js').NormalizedTrack[]} */
  const out = [];

  rawItems.forEach((episode, idx) => {
    const normalized = normalizeEpisodeItem(episode, showMeta, startIndex + idx, undefined);
    if (normalized) {
      out.push(normalized);
    }
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
  const detected = detectContent(playlistUrl);
  if (!detected) {
    throw createAdapterError(CODES.ERR_UNSUPPORTED_URL, {
      urlPreview: playlistUrl.slice(0, 120),
    });
  }

  const { type: contentType, id: contentId, canonicalUrl } = detected;
  const isPodcast = contentType === 'show' || contentType === 'episode';
  if (isPodcast && !podcastsEnabled()) {
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

    let metaMs = null;
    let tracksMs = null;

    if (contentType === 'playlist') {
      const metaStart = perfNow();
      const metaPromise = fetchPlaylistMeta(fetchClient, contentId, token, { signal }).then((meta) => {
        metaMs = perfNow() - metaStart;
        return meta;
      });

      const trackStart = perfNow();
      const tracksPromise = fetchPlaylistTracks(fetchClient, contentId, token, {
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
    }

    if (contentType === 'show') {
      const metaStart = perfNow();
      const metaPromise = fetchShowMeta(fetchClient, contentId, token, { signal }).then((meta) => {
        metaMs = perfNow() - metaStart;
        return meta;
      });

      const trackStart = perfNow();
      const tracksPromise = fetchShowEpisodes(fetchClient, contentId, token, {
        signal,
        cursor,
      }).then((payload) => {
        tracksMs = perfNow() - trackStart;
        return payload;
      });

      const [meta, tracksPayload] = await Promise.all([metaPromise, tracksPromise]);
      debugLog('parallel:fetch:show', {
        metaMs,
        tracksMs,
        tokenMs,
        next: Boolean(tracksPayload?.next),
        total: typeof tracksPayload?.total === 'number' ? tracksPayload.total : null,
        items: Array.isArray(tracksPayload?.items) ? tracksPayload.items.length : 0,
      });
      return { meta, tracksPayload, timings: { metaMs, tracksMs, tokenMs } };
    }

    const metaStart = perfNow();
    const episodePayload = await fetchEpisode(fetchClient, contentId, token, { signal }).then((episode) => {
      metaMs = perfNow() - metaStart;
      return episode;
    });
    debugLog('episode:fetch', {
      metaMs,
      tokenMs,
      id: contentId.slice(0, 8),
    });
    return { meta: episodePayload, tracksPayload: episodePayload, timings: { metaMs, tracksMs: 0, tokenMs } };
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const forceRefresh = attempt > 0;
    try {
      const { meta, tracksPayload, timings } = await runWithToken(forceRefresh);

      if (contentType === 'playlist') {
        const items = /** @type {any[]} */ (tracksPayload?.items ?? []);
        const tracks = toNormalizedTracks(items, meta); // note: indices are page-local
        const nextCursor = typeof tracksPayload?.next === 'string' ? tracksPayload.next : null;
        const totalTracks =
          typeof tracksPayload?.total === 'number' && Number.isFinite(tracksPayload.total)
            ? tracksPayload.total
            : undefined;
        const coverImage =
          Array.isArray(meta?.images) && meta.images[0]?.url ? meta.images[0].url : undefined;

        return {
          provider: PROVIDER,
          playlistId: contentId,
          title: typeof meta?.name === 'string' ? meta.name : `Spotify playlist ${contentId}`,
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
            contentType,
          },
        };
      }

      if (contentType === 'show') {
        const items = /** @type {any[]} */ (tracksPayload?.items ?? []);
        const nextCursor = typeof tracksPayload?.next === 'string' ? tracksPayload.next : null;
        const totalEpisodes =
          typeof tracksPayload?.total === 'number' && Number.isFinite(tracksPayload.total)
            ? tracksPayload.total
            : undefined;
        const longShow = typeof totalEpisodes === 'number' && totalEpisodes > 500;

        if (!items.length && !nextCursor) {
          throw createAdapterError(CODES.ERR_SHOW_EMPTY, { showId: contentId });
        }

        const tracks = toNormalizedShowEpisodes(items, meta, 0);

        const coverImage =
          Array.isArray(meta?.images) && meta.images[0]?.url ? meta.images[0].url : undefined;

        return {
          provider: PROVIDER,
          playlistId: contentId,
          title: typeof meta?.name === 'string' ? meta.name : `Spotify show ${contentId}`,
          sourceUrl: canonicalUrl,
          coverUrl: coverImage,
          total: totalEpisodes,
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
            contentType,
            longShow,
          },
        };
      }

      const episodeTrack = normalizeEpisodeItem(
        tracksPayload,
        tracksPayload?.show ?? {},
        0,
        undefined
      );
      if (!episodeTrack) {
        throw createAdapterError(CODES.ERR_PODCAST_CONTENT, { episodeId: contentId });
      }

      return {
        provider: PROVIDER,
        playlistId: contentId,
        title:
          typeof tracksPayload?.name === 'string'
            ? tracksPayload.name
            : `Spotify episode ${contentId}`,
        sourceUrl: canonicalUrl,
        coverUrl: episodeTrack.thumbnailUrl ?? undefined,
        total: 1,
        tracks: [episodeTrack],
        pageInfo: {
          cursor: null,
          hasMore: false,
        },
        debug: {
          source: 'spotify:web',
          stage: 'episode',
          hasNext: false,
          tokenRefreshed,
          metaMs: timings.metaMs,
          tracksMs: timings.tracksMs,
          tokenMs: timings.tokenMs,
          inputUrl: playlistUrl || null,
          contentType,
        },
      };
    } catch (err) {
      lastError = err;
      const status = extractHttpStatus(err);
      if (status === 401 && attempt === 0) {
        // Unauthorized once — drop memo and retry with a fresh token.
        debugLog('token:retry', { reason: 'unauthorized', playlist: contentId.slice(0, 8) });
        invalidateTokenMemo();
        tokenRefreshed = true;
        continue;
      }
      throw err;
    }
  }

  throw /** @type {Error} */ (lastError ?? createAdapterError(CODES.ERR_UNKNOWN));
}

/**
 * Prefetch and memoize a Spotify access token so user-initiated imports
 * can skip the round trip when possible. Errors are swallowed on purpose
 * to avoid surfacing noise for speculative calls.
 * @param {{ signal?: AbortSignal, fetchClient?: ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient> }} [options]
 */
export async function prime(options = {}) {
  const fetchClient = options.fetchClient ?? defaultFetchClient;
  try {
    await fetchAccessToken(fetchClient, { signal: options.signal });
  } catch (err) {
    debugLog('token:prime_failed', { message: err instanceof Error ? err.message : String(err ?? 'unknown') });
  }
}

export default { importPlaylist, prime };

export function __resetSpotifyTokenMemoForTests() {
  tokenMemo = null;
  tokenPromise = null;
}
