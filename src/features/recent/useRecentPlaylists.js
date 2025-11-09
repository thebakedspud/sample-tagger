import { useState, useCallback, useEffect } from 'react'
import { saveRecent, upsertRecent } from '../../utils/storage.js'
import { createRecentCandidate } from './recentUtils.js'

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

  return {
    recentPlaylists,
    recentCardState,
    updateRecentCardState,
    pushRecentPlaylist,
  }
}
