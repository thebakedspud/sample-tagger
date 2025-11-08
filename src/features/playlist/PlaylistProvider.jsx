// src/features/playlist/PlaylistProvider.jsx

import { useReducer, useEffect, useRef, useCallback, useMemo } from 'react'
// eslint-disable-next-line no-unused-vars -- used in JSDoc types
import { playlistReducer, initialPlaylistState } from './playlistReducer.js'
import { playlistActions } from './actions.js'
import { apiFetch } from '../../lib/apiClient.js'
import { groupRemoteNotes } from '../../utils/notesTagsData.js'
import { createTagSyncScheduler } from '../tags/tagSyncQueue.js'
import { PlaylistStateContext, PlaylistDispatchContext, PlaylistSyncContext } from './contexts.js'

/**
 * Provider component that manages playlist state via reducer
 * 
 * @param {Object} props
 * @param {typeof initialPlaylistState} props.initialState - Initial state for the reducer
 * @param {{ deviceId: string | null, anonId: string | null }} props.anonContext - Device context for sync
 * @param {import('react').ReactNode} props.children - Child components
 */
export function PlaylistStateProvider({ initialState, anonContext, children }) {
  const [state, dispatch] = useReducer(playlistReducer, initialState)
  const tagSyncSchedulerRef = useRef(null)

  // Remote sync: fetch notes/tags from server on mount when anonId is available
  useEffect(() => {
    if (!anonContext?.anonId) return
    let cancelled = false

    const syncNotes = async () => {
      try {
        const response = await apiFetch('/api/db/notes')
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok) {
          console.error('[notes sync] failed', payload)
          return
        }
        const { notes: remoteMap, tags: remoteTagMap } = groupRemoteNotes(payload?.notes)
        const hasRemoteNotes = Object.keys(remoteMap).length > 0
        const hasRemoteTags = Object.keys(remoteTagMap).length > 0
        if (!hasRemoteNotes && !hasRemoteTags) {
          return
        }
        // Merge remote data using reducer
        dispatch(playlistActions.mergeRemoteData(remoteMap, remoteTagMap))
      } catch (err) {
        if (!cancelled) {
          console.error('[notes sync] error', err)
        }
      }
    }

    syncNotes()

    return () => {
      cancelled = true
    }
  }, [anonContext?.anonId])

  // Helper to send tag update to server
  const sendTagUpdate = useCallback(
    async (trackId, tags) => {
      if (!anonContext?.deviceId) return
      try {
        const response = await apiFetch('/api/db/notes', {
          method: 'POST',
          body: JSON.stringify({ trackId, tags }),
        })
        if (!response.ok) {
          console.error('[tag sync] failed', { trackId, tags })
          throw new Error('Failed to sync tags')
        }
      } catch (err) {
        console.error('[tag sync] error', err)
        throw err  // Re-throw to propagate to caller
      }
    },
    [anonContext?.deviceId],
  )

  // Tag sync scheduler: debounces tag updates to reduce API load
  useEffect(() => {
    if (!anonContext?.deviceId) {
      tagSyncSchedulerRef.current?.clear?.()
      tagSyncSchedulerRef.current = null
      return
    }
    const scheduler = createTagSyncScheduler(sendTagUpdate, 350)
    tagSyncSchedulerRef.current = scheduler
    return () => scheduler?.clear()
  }, [anonContext?.deviceId, sendTagUpdate])

  // Expose sync method for components to use
  const syncTrackTags = useCallback(
    (trackId, tags) => {
      if (!trackId) return Promise.resolve()
      const scheduler = tagSyncSchedulerRef.current
      if (scheduler) {
        return scheduler.schedule(trackId, tags)
      }
      return sendTagUpdate(trackId, tags)
    },
    [sendTagUpdate],
  )

  // Memoize context value to prevent unnecessary re-renders
  const syncValue = useMemo(() => ({ syncTrackTags }), [syncTrackTags])

  return (
    <PlaylistStateContext.Provider value={state}>
      <PlaylistDispatchContext.Provider value={dispatch}>
        <PlaylistSyncContext.Provider value={syncValue}>
          {children}
        </PlaylistSyncContext.Provider>
      </PlaylistDispatchContext.Provider>
    </PlaylistStateContext.Provider>
  )
}

