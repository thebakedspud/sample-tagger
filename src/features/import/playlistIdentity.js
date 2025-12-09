// src/features/import/playlistIdentity.js
// Helpers for deriving canonical playlist identities/keys across providers.

import {
  extractPlaylistId as extractSpotifyPlaylistId,
  extractShowId as extractSpotifyShowId,
  extractEpisodeId as extractSpotifyEpisodeId,
} from './adapters/spotifyAdapter.js'
import detectProvider from './detectProvider.js'

const PROVIDER_ALIASES = new Map([
  ['spotify', 'spotify'],
  ['youtube', 'youtube'],
  ['youtube music', 'youtube'],
  ['soundcloud', 'soundcloud'],
])

const normalizeProvider = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return PROVIDER_ALIASES.get(normalized) ?? null
}

const ensureUrlObject = (raw) => {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
      return new URL(trimmed)
    }
    return new URL(`https://${trimmed}`)
  } catch (_err) {
    return null
  }
}

const extractYoutubePlaylistId = (raw) => {
  const url = ensureUrlObject(raw)
  if (url) {
    const listParam = url.searchParams.get('list')
    if (listParam && listParam.trim()) {
      return listParam.trim()
    }
  }
  const match = /[?&]list=([\w-]+)/i.exec(raw || '')
  if (match && match[1]) {
    return match[1]
  }
  return null
}

const extractSoundCloudPlaylistId = (raw) => {
  const url = ensureUrlObject(raw)
  if (!url) return null
  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'soundcloud.com' && !hostname.endsWith('.soundcloud.com')) return null
  const pathname = url.pathname?.replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
  if (!pathname) return null
  return pathname
}

/**
 * Resolve provider + playlistId from a raw URL when possible.
 * @param {string} raw
 * @returns {{ provider: string, playlistId: string } | null}
 */
export function parsePlaylistIdentityFromUrl(raw) {
  if (typeof raw !== 'string') return null
  const detectedProvider = detectProvider(raw)
  const provider = normalizeProvider(detectedProvider)
  if (provider === 'spotify') {
    const playlistId = extractSpotifyPlaylistId(raw)
    const showId = extractSpotifyShowId(raw)
    const episodeId = extractSpotifyEpisodeId(raw)
    const resolvedId = playlistId || showId || episodeId
    return resolvedId ? { provider, playlistId: resolvedId } : null
  }
  if (provider === 'youtube') {
    const playlistId = extractYoutubePlaylistId(raw)
    return playlistId ? { provider, playlistId } : null
  }
  if (provider === 'soundcloud') {
    const playlistId = extractSoundCloudPlaylistId(raw)
    return playlistId ? { provider, playlistId } : null
  }
  return null
}

/**
 * Build canonical cache key from provider + playlistId.
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} playlistId
 * @returns {string|null}
 */
export function buildPlaylistCacheKey(provider, playlistId) {
  const normalizedProvider = normalizeProvider(provider)
  if (!normalizedProvider) return null
  if (typeof playlistId !== 'string') return null
  const trimmedId = playlistId.trim()
  if (!trimmedId) return null
  return `${normalizedProvider}:${trimmedId}`
}

/**
 * Derive identity from meta info or fallback URL.
 * @param {{ provider?: string|null, playlistId?: string|null }} meta
 * @param {string} [sourceUrl]
 * @returns {{ provider: string, playlistId: string, key: string } | null}
 */
export function derivePlaylistIdentity(meta, sourceUrl) {
  const provider = normalizeProvider(meta?.provider ?? null)
  const playlistId = typeof meta?.playlistId === 'string' ? meta.playlistId.trim() : null
  const key = buildPlaylistCacheKey(provider, playlistId)
  if (key && provider && playlistId) {
    return { provider, playlistId, key }
  }
  const inferred = sourceUrl ? parsePlaylistIdentityFromUrl(sourceUrl) : null
  if (inferred) {
    const inferredKey = buildPlaylistCacheKey(inferred.provider, inferred.playlistId)
    if (inferredKey) {
      return { ...inferred, key: inferredKey }
    }
  }
  return null
}

export default {
  parsePlaylistIdentityFromUrl,
  buildPlaylistCacheKey,
  derivePlaylistIdentity,
}
