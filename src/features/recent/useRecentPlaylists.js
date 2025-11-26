import { useState, useCallback, useEffect } from 'react'
import { saveRecent, upsertRecent } from '../../utils/storage.js'
import { createRecentCandidate } from './recentUtils.js'
import { normalizeTimestamp } from '../../utils/trackProcessing.js'
import usePersistentPlaylistCache from '../import/usePersistentPlaylistCache.js'

const normalizeSourceKey = (raw) =>
  typeof raw === 'string' && raw.trim() ? raw.trim() : ''

const computeTotalFromPayload = (payload) => {
  if (!payload) return null
  if (typeof payload.total === 'number' && payload.total >= 0) {
    return Math.round(payload.total)
  }
  if (Array.isArray(payload.tracks)) {
    return payload.tracks.length
  }
  return null
}

/**
 * Manage the recent playlists list plus any per-card UI state.
 *
 * Note: `initialRecents` is only read during the initial render; passing a new
 * array later will not reset the managed state.
 *
 * @param {any[]} initialRecents
 * @returns {{
 *  recentPlaylists: any[],
 *  recentCardState: Record<string, any>,
 *  updateRecentCardState: (id: string, updater: Record<string, any> | ((prev: Record<string, any>) => Record<string, any> | void)) => void,
 *  pushRecentPlaylist: (meta: any, options?: Record<string, any>) => void,
 * }}
 */
export function useRecentPlaylists(initialRecents) {
  const [recentPlaylists, setRecentPlaylists] = useState(() => initialRecents)
  const [recentCardState, setRecentCardState] = useState(() => ({}))
  const { cachedPlaylists, isHydrating, getCachedResult } = usePersistentPlaylistCache()

  const updateRecentCardState = useCallback((id, updater) => {
    if (!id) return
    setRecentCardState((prev) => {
      const next = { ...prev }
      if (typeof updater === 'function') {
        const draft = updater(next[id] ?? {})
        if (draft && Object.keys(draft).length > 0) {
          next[id] = draft
        } else {
          delete next[id]
        }
      } else if (updater && Object.keys(updater).length > 0) {
        next[id] = { ...(next[id] ?? {}), ...updater }
      } else {
        delete next[id]
      }
      return next
    })
  }, [])

  const pushRecentPlaylist = useCallback((meta, options = {}) => {
    const candidate = createRecentCandidate(meta, options)
    if (!candidate) return
    setRecentPlaylists((prev) => {
      const next = upsertRecent(prev, candidate)
      if (next === prev) return prev
      saveRecent(next)
      return next
    })
  }, [])

  useEffect(() => {
    setRecentCardState((prev) => {
      const activeIds = new Set(recentPlaylists.map((item) => item.id))
      const next = {}
      Object.entries(prev).forEach(([id, state]) => {
        if (activeIds.has(id)) {
          next[id] = state
        }
      })
      return next
    })
  }, [recentPlaylists])

  useEffect(() => {
    if (isHydrating) return
    if (!cachedPlaylists) return
    setRecentPlaylists((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev
      let changed = false
      const next = prev.map((item) => {
        const urlKey = normalizeSourceKey(item?.sourceUrl)
        const canonicalKey =
          typeof item?.provider === 'string' &&
          item.provider &&
          typeof item?.playlistId === 'string' &&
          item.playlistId
            ? `${item.provider}:${item.playlistId}`
            : null
        const payload =
          (canonicalKey ? getCachedResult(canonicalKey) : null) ||
          (urlKey ? getCachedResult(urlKey) : null)
        if (!payload || typeof payload !== 'object') return item

        const updates = {}
        const cachedTitle =
          typeof payload.title === 'string' && payload.title.trim()
            ? payload.title.trim()
            : null
        if (cachedTitle && cachedTitle !== item.title) {
          updates.title = cachedTitle
        }
        const cachedCover =
          typeof payload.coverUrl === 'string' && payload.coverUrl.trim()
            ? payload.coverUrl.trim()
            : null
        if (cachedCover && cachedCover !== item.coverUrl) {
          updates.coverUrl = cachedCover
        }
        const cachedTotal = computeTotalFromPayload(payload)
        if (cachedTotal != null && cachedTotal !== item.total) {
          updates.total = cachedTotal
        }
        const cachedImportedAt = normalizeTimestamp(payload.importedAt)
        if (cachedImportedAt != null && cachedImportedAt !== item.importedAt) {
          updates.importedAt = cachedImportedAt
        }
        if (Object.keys(updates).length === 0) {
          return item
        }
        changed = true
        return { ...item, ...updates }
      })
      if (changed) {
        saveRecent(next)
        return next
      }
      return prev
    })
  }, [cachedPlaylists, getCachedResult, isHydrating])

  return {
    recentPlaylists,
    recentCardState,
    updateRecentCardState,
    pushRecentPlaylist,
  }
}
