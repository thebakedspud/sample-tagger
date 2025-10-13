// src/features/import/adapters/spotifyAdapter.js
// Lightweight Spotify adapter: grabs live playlist metadata via oEmbed but
// still feeds mock tracks so the rest of the pipeline can run end-to-end.

// @ts-check

import { normalizeTrack } from '../normalizeTrack.js';
import { mockPlaylists } from '../../../data/mockPlaylists.js';
import { createAdapterError, CODES } from './types.js';

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
async function fetchOEmbedFrom(endpoint, { signal } = {}) {
  const res = await fetch(endpoint, { signal, headers: { Accept: 'application/json' } });
  if (res.status === 404) {
    throw createAdapterError(CODES.ERR_NOT_FOUND, { endpoint });
  }
  if (!res.ok) {
    throw createAdapterError(CODES.ERR_NETWORK, { status: res.status, endpoint });
  }
  return res.json();
}

/**
 * Call Spotify's oEmbed endpoint. In dev we optionally fall back to a Vite proxy
 * to avoid CORS blocks during local development.
 * @param {string} playlistUrl
 * @param {{ signal?: AbortSignal }} [options]
 */
async function fetchOEmbed(playlistUrl, { signal } = {}) {
  const remoteEndpoint = buildOEmbedEndpoint(OEMBED_REMOTE_BASE, playlistUrl);
  const importMeta = /** @type {any} */ (typeof import.meta !== 'undefined' ? import.meta : undefined);
  const isDev = Boolean(importMeta?.env?.DEV);
  if (isDev) {
    console.debug('[spotify][oembed] request', remoteEndpoint);
  }

  try {
    const data = await fetchOEmbedFrom(remoteEndpoint, { signal });
    if (isDev) {
      console.debug('[spotify][oembed] remote success', { title: data?.title ?? null });
    }
    return data;
  } catch (err) {
    const anyErr = /** @type {any} */ (err);
    if (anyErr?.name === 'AbortError') throw err;
    if (anyErr?.code) throw err;

    if (isDev) {
      const proxyEndpoint = buildOEmbedEndpoint(DEV_PROXY_PATH, playlistUrl);
      console.debug('[spotify][oembed] remote failed, trying proxy', proxyEndpoint);
      try {
        const data = await fetchOEmbedFrom(proxyEndpoint, { signal });
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

    throw createAdapterError(CODES.ERR_NETWORK, { endpoint: remoteEndpoint }, anyErr);
  }
}

/**
 * Adapter contract entry point shared with other providers.
 * @param {{ url?: string, signal?: AbortSignal }} [options]
 */
export async function importPlaylist(options = {}) {
  const playlistUrl = typeof options?.url === 'string' ? options.url.trim() : '';
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    throw createAdapterError(CODES.ERR_UNSUPPORTED_URL, {
      urlPreview: playlistUrl.slice(0, 120),
    });
  }

  let meta;
  try {
    meta = await fetchOEmbed(playlistUrl, { signal: options.signal });
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
