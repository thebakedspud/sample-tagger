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
  const aliasLookupRef = useRef(new Map())
  const [isHydrating, setIsHydrating] = useState(true)
  const [, forceVersion] = useState(0)
  const bumpVersion = useCallback(
    () => forceVersion((prev) => (prev + 1) % Number.MAX_SAFE_INTEGER),
    [],
  )

  useEffect(() => {
    const entries = loadPersistedPlaylistCache()
    const map = new Map()
    const aliasMap = new Map()
    entries.forEach((entry) => {
      const normalizedAliases = Array.isArray(entry.aliases) ? entry.aliases : []
      map.set(entry.key, {
        key: entry.key,
        storedAt: entry.storedAt,
        data: cloneImportResult(entry.data),
        aliases: normalizedAliases,
      })
      normalizedAliases.forEach((alias) => {
        if (!alias) return
        if (aliasMap.has(alias) || map.has(alias)) {
          console.warn(`[playlist cache] alias conflict detected for "${alias}" during hydration`)
          return
        }
        aliasMap.set(alias, entry.key)
      })
    })
    cacheRef.current = map
    aliasLookupRef.current = aliasMap
    setIsHydrating(false)
    bumpVersion()
  }, [bumpVersion])

  const persistCurrentCache = useCallback(() => {
    const ordered = sortAndTrimEntries(Array.from(cacheRef.current.values()))
    cacheRef.current = new Map(ordered.map((entry) => [entry.key, entry]))
    const aliasMap = new Map()
    ordered.forEach((entry) => {
      if (Array.isArray(entry.aliases)) {
        entry.aliases.forEach((alias) => {
          if (!alias) return
          if (aliasMap.has(alias) || cacheRef.current.has(alias)) {
            console.warn(
              `[playlist cache] alias conflict detected for "${alias}" while persisting`,
            )
            return
          }
          aliasMap.set(alias, entry.key)
        })
      }
    })
    aliasLookupRef.current = aliasMap
    persistPlaylistCacheEntries(ordered)
    bumpVersion()
  }, [bumpVersion])

  const getCachedResult = useCallback((key) => {
    const normalized = normalizeKey(key)
    if (!normalized) return null
    const direct = cacheRef.current.get(normalized)
    const entry = direct ?? (() => {
      const aliasKey = aliasLookupRef.current.get(normalized)
      if (!aliasKey) return null
      return cacheRef.current.get(aliasKey) ?? null
    })()
    if (!entry) return null
    return cloneImportResult(entry.data)
  }, [])

  const rememberCachedResult = useCallback(
    (key, payload, options = {}) => {
      const normalized = normalizeKey(key)
      if (!normalized || !payload) return
      const aliases = Array.isArray(options.aliases)
        ? options.aliases
            .map((alias) => normalizeKey(alias))
            .filter((alias) => alias && alias !== normalized)
        : []
      const existing = cacheRef.current.get(normalized)
      if (existing?.aliases?.length) {
        existing.aliases.forEach((alias) => {
          aliasLookupRef.current.delete(alias)
        })
      }
      aliases.forEach((alias) => {
        const currentOwner = aliasLookupRef.current.get(alias)
        if (currentOwner && currentOwner !== normalized) {
          const ownerEntry = cacheRef.current.get(currentOwner)
          if (ownerEntry?.aliases) {
            ownerEntry.aliases = ownerEntry.aliases.filter((item) => item !== alias)
          }
          aliasLookupRef.current.delete(alias)
        }
        if (cacheRef.current.has(alias)) {
          console.warn(`[playlist cache] alias "${alias}" conflicts with an existing key`)
          return
        }
      })
      cacheRef.current.set(normalized, {
        key: normalized,
        storedAt: Date.now(),
        data: cloneImportResult(payload),
        aliases,
      })
      aliases.forEach((alias) => {
        if (!alias) return
        aliasLookupRef.current.set(alias, normalized)
      })
      persistCurrentCache()
    },
    [persistCurrentCache],
  )

  const forgetCachedResult = useCallback(
    (key) => {
      const normalized = normalizeKey(key)
      if (!normalized) return
      const entry = cacheRef.current.get(normalized)
      if (!entry) return
      cacheRef.current.delete(normalized)
      if (Array.isArray(entry.aliases)) {
        entry.aliases.forEach((alias) => {
          aliasLookupRef.current.delete(alias)
        })
      }
      persistCurrentCache()
    },
    [persistCurrentCache],
  )

  const clearCache = useCallback(() => {
    cacheRef.current = new Map()
    aliasLookupRef.current = new Map()
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
