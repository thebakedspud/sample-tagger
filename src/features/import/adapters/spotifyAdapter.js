// src/features/import/adapters/spotifyAdapter.js
// Lightweight Spotify adapter: grabs live playlist metadata via oEmbed but
// still feeds mock tracks so the rest of the pipeline can run end-to-end.

// @ts-check

import { normalizeTrack } from '../normalizeTrack.js';
import { mockPlaylists } from '../../../data/mockPlaylists.js';
import { createAdapterError, CODES } from './types.js';
import { defaultFetchClient } from '../../../utils/fetchClient.js';

const PROVIDER = 'spotify';
const OEMBED_REMOTE_BASE = 'https://open.spotify.com/oembed';
const DEV_PROXY_PATH = '/api/spotify/oembed';

/**
 * Build an oEmbed endpoint URL from a base.
 * @param {string} base
 * @param {string} playlistUrl
 */
function buildOEmbedEndpoint(base, playlistUrl) {
  return `${base}?url=${encodeURIComponent(playlistUrl)}`;
}

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
 * Fetch and validate an oEmbed response from a specific endpoint.
 * @param {string} endpoint
 * @param {{ signal?: AbortSignal }} [options]
 */
/**
 * Parse a status code from an HTTP_* error code.
 * @param {unknown} code
 */
function toStatus(code) {
  if (typeof code !== 'string') return null;
  const match = /^HTTP_(\d+)/.exec(code);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

/**
 * Fetch and validate an oEmbed response from a specific endpoint.
 * @param {ReturnType<typeof import('../../../utils/fetchClient.js').makeFetchClient>} fetchClient
 * @param {string} endpoint
 * @param {{ signal?: AbortSignal }} [options]
 */
async function fetchOEmbedFrom(fetchClient, endpoint, { signal } = {}) {
  try {
    return await fetchClient.getJson(endpoint, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    const anyErr = /** @type {any} */ (err);
    if (anyErr?.name === 'AbortError') throw err;

    const status = toStatus(anyErr?.code);
    const details = { endpoint, ...(status ? { status } : {}) };

    if (status === 404) {
      throw createAdapterError(CODES.ERR_NOT_FOUND, details, err);
    }
    if (status === 401 || status === 403) {
      throw createAdapterError(CODES.ERR_PRIVATE_PLAYLIST, details, err);
    }
    if (status === 429) {
      throw createAdapterError(CODES.ERR_RATE_LIMITED, details, err);
    }
    if (status != null) {
      throw createAdapterError(CODES.ERR_NETWORK, details, err);
    }
    throw createAdapterError(CODES.ERR_NETWORK, details, err);
  }
}

/**
 * Call Spotify's oEmbed endpoint. In dev we optionally fall back to a Vite proxy
 * to avoid CORS blocks during local development.
 * @param {string} playlistUrl
 * @param {{ signal?: AbortSignal }} [options]
 */
async function fetchOEmbed(playlistUrl, { signal, fetchClient }) {
  const remoteEndpoint = buildOEmbedEndpoint(OEMBED_REMOTE_BASE, playlistUrl);
  const importMeta = /** @type {any} */ (typeof import.meta !== 'undefined' ? import.meta : undefined);
  const isDev = Boolean(importMeta?.env?.DEV);
  if (isDev) {
    console.debug('[spotify][oembed] request', remoteEndpoint);
  }

  try {
    const data = await fetchOEmbedFrom(fetchClient, remoteEndpoint, { signal });
    if (isDev) {
      console.debug('[spotify][oembed] remote success', { title: data?.title ?? null });
    }
    return data;
  } catch (err) {
    const anyErr = /** @type {any} */ (err);
    if (anyErr?.name === 'AbortError') throw err;
    if (anyErr?.code === CODES.ERR_NOT_FOUND) throw err;
    if (anyErr?.code && anyErr.code !== CODES.ERR_NETWORK && anyErr.code !== CODES.ERR_RATE_LIMITED) {
      throw err;
    }

    if (isDev) {
      const proxyEndpoint = buildOEmbedEndpoint(DEV_PROXY_PATH, playlistUrl);
      console.debug('[spotify][oembed] remote failed, trying proxy', proxyEndpoint);
      try {
        const data = await fetchOEmbedFrom(fetchClient, proxyEndpoint, { signal });
        console.debug('[spotify][oembed] proxy success', { title: data?.title ?? null });
        return data;
      } catch (proxyErr) {
        const proxyAnyErr = /** @type {any} */ (proxyErr);
        if (proxyAnyErr?.name === 'AbortError') throw proxyErr;
        if (proxyAnyErr?.code) {
          if (proxyAnyErr?.details && typeof proxyAnyErr.details === 'object') {
            proxyAnyErr.details.endpoint = proxyEndpoint;
            proxyAnyErr.details.upstream = remoteEndpoint;
          }
          throw proxyErr;
        }
        throw createAdapterError(
          CODES.ERR_NETWORK,
          { endpoint: proxyEndpoint, upstream: remoteEndpoint },
          proxyAnyErr
        );
      }
    }

    if (anyErr?.code) throw err;
    throw createAdapterError(CODES.ERR_NETWORK, { endpoint: remoteEndpoint }, anyErr);
  }
}

/**
 * Adapter contract entry point shared with other providers.
 * @param {{ url?: string, signal?: AbortSignal }} [options]
 */
export async function importPlaylist(options = {}) {
  const fetchClient = options?.fetchClient ?? defaultFetchClient;
  const playlistUrl = typeof options?.url === 'string' ? options.url.trim() : '';
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    throw createAdapterError(CODES.ERR_UNSUPPORTED_URL, {
      urlPreview: playlistUrl.slice(0, 120),
    });
  }

  let meta;
  try {
    meta = await fetchOEmbed(playlistUrl, { signal: options.signal, fetchClient });
  } catch (err) {
    const finalErr = /** @type {any} */ (err);
    if (finalErr?.name === 'AbortError') throw err;
    throw finalErr;
  }

  const mock = mockPlaylists.spotify || { tracks: [] };
  const tracks = Array.isArray(mock.tracks)
    ? mock.tracks.map((t, i) => normalizeTrack(t, i, PROVIDER))
    : [];

  return {
    provider: PROVIDER,
    playlistId,
    title: meta?.title || `Spotify Playlist ${playlistId}`,
    snapshotId: null,
    sourceUrl: playlistUrl,
    tracks,
    pageInfo: { hasMore: false, cursor: null },
    debug: {
      source: 'oembed+mockTracks',
      oembed: {
        title: meta?.title ?? null,
        thumbnail_url: meta?.thumbnail_url ?? null,
      },
    },
  };
}

export default { importPlaylist };
