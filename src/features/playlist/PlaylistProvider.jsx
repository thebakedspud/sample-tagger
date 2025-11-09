// src/features/playlist/PlaylistProvider.jsx

import { useReducer, useEffect, useRef, useCallback, useMemo } from 'react'
// eslint-disable-next-line no-unused-vars -- used in JSDoc types
import { playlistReducer, initialPlaylistState } from './playlistReducer.js'
import { playlistActions } from './actions.js'
import { apiFetch } from '../../lib/apiClient.js'
import { groupRemoteNotes } from '../../utils/notesTagsData.js'
import { createTagSyncScheduler } from '../tags/tagSyncQueue.js'
import { PlaylistStateContext, PlaylistDispatchContext, PlaylistSyncContext } from './contexts.js'
import { notifyDeviceContextStale } from '../../lib/deviceState.js'

/** @typedef {import('../import/usePlaylistImportController.js').BackgroundSyncState} BackgroundSyncState */

/**
 * Provider component that manages playlist state via reducer
 * 
 * @param {Object} props
 * @param {typeof initialPlaylistState} props.initialState - Initial state for the reducer
 * @param {{ deviceId: string | null, anonId: string | null }} props.anonContext - Device context for sync
 * @param {(status: BackgroundSyncState) => void} [props.onInitialSyncStatusChange]
 * @param {import('react').ReactNode} props.children - Child components
 */
export function PlaylistStateProvider({ initialState, anonContext, onInitialSyncStatusChange, children }) {
  const [state, dispatch] = useReducer(playlistReducer, initialState)
  const tagSyncSchedulerRef = useRef(null)
  const initialSyncStatusRef = useRef('idle')
  const updateInitialSyncStatus = useCallback(
    (next) => {
      const payload = /** @type {BackgroundSyncState} */ ({
        status: next?.status ?? initialSyncStatusRef.current ?? 'idle',
        lastError:
          typeof next?.lastError === 'string' || next?.lastError === null
            ? next.lastError
            : null,
        loaded: typeof next?.loaded === 'number' ? next.loaded : 0,
        total:
          typeof next?.total === 'number' || next?.total === null
            ? next.total
            : null,
        snapshotId: typeof next?.snapshotId === 'string' ? next.snapshotId : null,
      })
      initialSyncStatusRef.current = payload.status
      onInitialSyncStatusChange?.(payload)
    },
    [onInitialSyncStatusChange],
  )

  useEffect(() => {
    initialSyncStatusRef.current = 'idle'
  }, [anonContext?.deviceId])

  // Remote sync: fetch notes/tags from server on mount when anonId is available
  useEffect(() => {
    if (!anonContext?.deviceId) return
    if (initialSyncStatusRef.current === 'complete') return
    const hasAnyLocalData =
      Array.isArray(initialState?.tracks) && initialState.tracks.length > 0
    if (!hasAnyLocalData) {
      updateInitialSyncStatus({ status: 'complete', lastError: null })
      return
    }

    let cancelled = false
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutId = null

    const syncNotes = async () => {
      try {
        updateInitialSyncStatus({ status: 'loading', lastError: null })
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            updateInitialSyncStatus({
              status: 'error',
              lastError: 'Sync timed out. Retrying soon...',
            })
          }
        }, 30000)

        const response = await apiFetch('/api/db/notes')
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok) {
          if (timeoutId) clearTimeout(timeoutId)
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            notifyDeviceContextStale({ source: 'notes-sync', status: response.status })
          }
          console.error('[notes sync] failed', payload)
          updateInitialSyncStatus({
            status: 'error',
            lastError: payload?.error ?? `Sync failed (${response.status})`,
          })
          return
        }
        const { notes: remoteMap, tags: remoteTagMap } = groupRemoteNotes(payload?.notes)
        const hasRemoteNotes = Object.keys(remoteMap).length > 0
        const hasRemoteTags = Object.keys(remoteTagMap).length > 0
        if (!hasRemoteNotes && !hasRemoteTags) {
          updateInitialSyncStatus({ status: 'complete', lastError: null })
          return
        }
        // Merge remote data using reducer
        dispatch(playlistActions.mergeRemoteData(remoteMap, remoteTagMap))
        updateInitialSyncStatus({ status: 'complete', lastError: null })
      } catch (err) {
        if (!cancelled) {
          if (timeoutId) clearTimeout(timeoutId)
          console.error('[notes sync] error', err)
          updateInitialSyncStatus({
            status: 'error',
            lastError: err?.message ?? 'Sync failed',
          })
        }
      }
    }

    let deferredHandle = /** @type {number | null} */ (null)
    if (typeof requestIdleCallback === 'function') {
      deferredHandle = requestIdleCallback(syncNotes)
    } else {
      setTimeout(syncNotes, 0)
    }

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (typeof cancelIdleCallback === 'function' && typeof deferredHandle === 'number') {
        cancelIdleCallback(deferredHandle)
      }
    }
  }, [anonContext?.deviceId, updateInitialSyncStatus, initialState?.tracks])

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
