// src/features/import/usePersistentPlaylistCache.js

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadPersistedPlaylistCache,
  persistPlaylistCacheEntries,
  sortAndTrimEntries,
} from './playlistCache.js'

const cloneImportResult = (result) => {
  if (!result || typeof result !== 'object') return result
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(result)
    } catch {
      // fall through to JSON clone
    }
  }
  try {
    return JSON.parse(JSON.stringify(result))
  } catch {
    return result
  }
}

const normalizeKey = (key) =>
  typeof key === 'string' && key.trim() ? key.trim() : ''

/**
 * Shared playlist cache hook that keeps an in-memory Map synced with persisted storage.
 * Future consumers (import controller, recents) can rely on the same API without duplicating logic.
 */
export function usePersistentPlaylistCache() {
  const cacheRef = useRef(new Map())
  const [isHydrating, setIsHydrating] = useState(true)
  const [, forceVersion] = useState(0)
  const bumpVersion = useCallback(
    () => forceVersion((prev) => (prev + 1) % Number.MAX_SAFE_INTEGER),
    [],
  )

  useEffect(() => {
    const entries = loadPersistedPlaylistCache()
    const map = new Map()
    entries.forEach((entry) => {
      map.set(entry.key, {
        key: entry.key,
        storedAt: entry.storedAt,
        data: cloneImportResult(entry.data),
      })
    })
    cacheRef.current = map
    setIsHydrating(false)
    bumpVersion()
  }, [bumpVersion])

  const persistCurrentCache = useCallback(() => {
    const ordered = sortAndTrimEntries(Array.from(cacheRef.current.values()))
    cacheRef.current = new Map(ordered.map((entry) => [entry.key, entry]))
    persistPlaylistCacheEntries(ordered)
    bumpVersion()
  }, [bumpVersion])

  const getCachedResult = useCallback((key) => {
    const normalized = normalizeKey(key)
    if (!normalized) return null
    const entry = cacheRef.current.get(normalized)
    if (!entry) return null
    return cloneImportResult(entry.data)
  }, [])

  const rememberCachedResult = useCallback((key, payload) => {
    const normalized = normalizeKey(key)
    if (!normalized || !payload) return
    cacheRef.current.set(normalized, {
      key: normalized,
      storedAt: Date.now(),
      data: cloneImportResult(payload),
    })
    persistCurrentCache()
  }, [persistCurrentCache])

  const forgetCachedResult = useCallback((key) => {
    const normalized = normalizeKey(key)
    if (!normalized) return
    if (!cacheRef.current.has(normalized)) return
    cacheRef.current.delete(normalized)
    persistCurrentCache()
  }, [persistCurrentCache])

  const clearCache = useCallback(() => {
    cacheRef.current = new Map()
    persistPlaylistCacheEntries([])
    bumpVersion()
  }, [bumpVersion])

  return {
    cachedPlaylists: cacheRef.current,
    isHydrating,
    getCachedResult,
    rememberCachedResult,
    forgetCachedResult,
    clearCache,
  }
}

export default usePersistentPlaylistCache
