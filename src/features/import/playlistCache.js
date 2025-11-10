// src/features/import/playlistCache.js

/**
 * Lightweight persistence helpers for playlist import caching.
 * Stores a bounded list of serialized import results in localStorage so we can
 * hydrate the UI instantly on subsequent visits.
 *
 * The storage schema is intentionally simple (JSON + version flag) to avoid
 * pulling in additional dependencies while still allowing future migrations.
 */

const STORAGE_KEY = 'sta:playlist-cache:v1'
const STORAGE_VERSION = 1
export const PLAYLIST_CACHE_MAX_ENTRIES = 5

/**
 * @typedef {import('./adapters/types.js').ImportResult} ImportResult
 */

/**
 * @typedef {Object} PlaylistCacheEntry
 * @property {string} key
 * @property {number} storedAt
 * @property {ImportResult} data
 */

/**
 * @typedef {{ version: number, entries: PlaylistCacheEntry[] }} PlaylistCachePayload
 */

const canUseStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

/**
 * @returns {PlaylistCachePayload | null}
 */
function readRawPayload() {
  if (!canUseStorage()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const version = Number(parsed.version)
    const entries = Array.isArray(parsed.entries) ? parsed.entries : []
    return { version, entries }
  } catch {
    return null
  }
}

/**
 * @param {PlaylistCacheEntry} entry
 * @returns {PlaylistCacheEntry | null}
 */
function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const key = typeof entry.key === 'string' && entry.key.trim() ? entry.key.trim() : null
  if (!key) return null
  const storedAt = Number(entry.storedAt)
  if (!Number.isFinite(storedAt) || storedAt <= 0) return null
  if (!entry.data || typeof entry.data !== 'object') return null
  return {
    key,
    storedAt,
    data: entry.data,
  }
}

/**
 * Reads persisted playlist cache entries from localStorage.
 * @returns {PlaylistCacheEntry[]}
 */
export function loadPersistedPlaylistCache() {
  const payload = readRawPayload()
  if (!payload || payload.version !== STORAGE_VERSION) {
    return []
  }
  const normalized = payload.entries
    .map((entry) => normalizeEntry(entry))
    .filter((entry) => entry !== null)
  return normalized
}

/**
 * Persists the provided entries (already sorted/trimmed) to localStorage.
 * @param {Iterable<PlaylistCacheEntry>} entries
 */
export function persistPlaylistCacheEntries(entries) {
  if (!canUseStorage()) return
  try {
    const snapshot = Array.from(entries || [])
    const payload = {
      version: STORAGE_VERSION,
      entries: snapshot.map((entry) => ({
        key: entry.key,
        storedAt: entry.storedAt,
        data: entry.data,
      })),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    console.error('[playlist cache] failed to persist entries', err)
  }
}

/**
 * Clears the persisted playlist cache. Primarily for tests.
 */
export function clearPlaylistCacheStorage() {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Utility that sorts entries newest-first and trims to the configured max.
 * @param {PlaylistCacheEntry[]} entries
 * @returns {PlaylistCacheEntry[]}
 */
export function sortAndTrimEntries(entries) {
  const copy = Array.isArray(entries) ? [...entries] : []
  copy.sort((a, b) => b.storedAt - a.storedAt)
  if (copy.length > PLAYLIST_CACHE_MAX_ENTRIES) {
    copy.length = PLAYLIST_CACHE_MAX_ENTRIES
  }
  return copy
}
