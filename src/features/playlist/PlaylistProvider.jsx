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

const TAG_SYNC_QUEUE_PREFIX = 'sta:pending-tag-sync:'
const TAG_SIGNATURE_DELIMITER = '\u0001'

const canUseLocalStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const getTagQueueStorageKey = (deviceId) => `${TAG_SYNC_QUEUE_PREFIX}${deviceId}`

const getTagsSignature = (tags) =>
  Array.isArray(tags) ? tags.join(TAG_SIGNATURE_DELIMITER) : ''

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
  const syncAttemptedRef = useRef(false)
  const retryTimeoutRef = useRef(null)
  const pendingTagQueueRef = useRef(new Map())
  const isFlushingPendingTagsRef = useRef(false)
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
    syncAttemptedRef.current = false
  }, [anonContext?.deviceId])

  const markSyncError = useCallback(
    (payload) => {
      syncAttemptedRef.current = false
      updateInitialSyncStatus(payload)
    },
    [updateInitialSyncStatus],
  )

  const persistPendingTagQueue = useCallback(() => {
    const deviceId = anonContext?.deviceId
    if (!deviceId || !canUseLocalStorage()) return
    const key = getTagQueueStorageKey(deviceId)
    const entries = Array.from(pendingTagQueueRef.current.values())
    if (entries.length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(
      key,
      JSON.stringify(
        entries.map((entry) => ({
          trackId: entry.trackId,
          tags: entry.tags,
          updatedAt: entry.updatedAt,
        })),
      ),
    )
  }, [anonContext?.deviceId])

  const hydratePendingTagQueue = useCallback(() => {
    pendingTagQueueRef.current = new Map()
    const deviceId = anonContext?.deviceId
    if (!deviceId || !canUseLocalStorage()) return
    const key = getTagQueueStorageKey(deviceId)
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      parsed.forEach((entry) => {
        if (!entry?.trackId || !Array.isArray(entry.tags)) return
        pendingTagQueueRef.current.set(entry.trackId, {
          trackId: entry.trackId,
          tags: entry.tags,
          updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
          signature: getTagsSignature(entry.tags),
        })
      })
    } catch (err) {
      console.error('[tag sync] failed to load pending queue', err)
      window.localStorage.removeItem(key)
    }
  }, [anonContext?.deviceId])

  const upsertPendingTagUpdate = useCallback(
    (trackId, tags) => {
      if (!trackId || !anonContext?.deviceId || !canUseLocalStorage()) return
      pendingTagQueueRef.current.delete(trackId)
      pendingTagQueueRef.current.set(trackId, {
        trackId,
        tags: Array.isArray(tags) ? [...tags] : [],
        updatedAt: Date.now(),
        signature: getTagsSignature(tags),
      })
      persistPendingTagQueue()
    },
    [anonContext?.deviceId, persistPendingTagQueue],
  )

  const clearPendingTagUpdate = useCallback(
    (trackId, tags) => {
      if (!trackId || pendingTagQueueRef.current.size === 0) return
      const entry = pendingTagQueueRef.current.get(trackId)
      if (!entry) return
      const signature = getTagsSignature(tags)
      if (entry.signature && signature && entry.signature !== signature) {
        return
      }
      pendingTagQueueRef.current.delete(trackId)
      persistPendingTagQueue()
    },
    [persistPendingTagQueue],
  )

  // Remote sync: fetch notes/tags from server on mount when anonId is available
  useEffect(() => {
    if (!anonContext?.deviceId) return
    if (initialSyncStatusRef.current === 'complete') return
    if (syncAttemptedRef.current) return
    const hasAnyLocalData =
      Array.isArray(initialState?.tracks) && initialState.tracks.length > 0
    if (!hasAnyLocalData) {
      updateInitialSyncStatus({ status: 'complete', lastError: null })
      return
    }
    syncAttemptedRef.current = true

    let cancelled = false
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutId = null
    const clearTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
    /** @type {AbortController | null} */
    let activeAbortController = null

    const syncNotes = async () => {
      const abortController = new AbortController()
      activeAbortController = abortController
      try {
        updateInitialSyncStatus({ status: 'loading', lastError: null })
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            markSyncError({
              status: 'error',
              lastError: 'Sync timed out. Retrying soon...',
            })
            scheduleRetry()
            abortController.abort()
          }
          timeoutId = null
        }, 30000)

        const response = await apiFetch('/api/db/notes', {
          signal: abortController.signal,
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) {
          clearTimer()
          return
        }
        if (!response.ok) {
          clearTimer()
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            notifyDeviceContextStale({ source: 'notes-sync', status: response.status })
          }
          console.error('[notes sync] failed', payload)
          markSyncError({
            status: 'error',
            lastError: payload?.error ?? `Sync failed (${response.status})`,
          })
          scheduleRetry()
          return
        }
        const { notes: remoteMap, tags: remoteTagMap } = groupRemoteNotes(payload?.notes)
        const hasRemoteNotes = Object.keys(remoteMap).length > 0
        const hasRemoteTags = Object.keys(remoteTagMap).length > 0
        if (!hasRemoteNotes && !hasRemoteTags) {
          clearTimer()
          updateInitialSyncStatus({ status: 'complete', lastError: null })
          return
        }
        // Merge remote data using reducer
        dispatch(playlistActions.mergeRemoteData(remoteMap, remoteTagMap))
        clearTimer()
        updateInitialSyncStatus({ status: 'complete', lastError: null })
      } catch (err) {
        if (err?.name === 'AbortError') {
          clearTimer()
          return
        }
        if (!cancelled) {
          clearTimer()
          console.error('[notes sync] error', err)
          markSyncError({
            status: 'error',
            lastError: err?.message ?? 'Sync failed',
          })
          scheduleRetry()
        }
      } finally {
        if (activeAbortController === abortController) {
          activeAbortController = null
        }
      }
    }

    const scheduleRetry = () => {
      if (cancelled) return
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      retryTimeoutRef.current = setTimeout(() => {
        if (cancelled) return
        syncAttemptedRef.current = true
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(syncNotes)
          return
        }
        syncNotes()
      }, 5000)
    }

    let deferredHandle = /** @type {number | null} */ (null)
    if (typeof requestIdleCallback === 'function') {
      deferredHandle = requestIdleCallback(syncNotes)
    } else {
      setTimeout(syncNotes, 0)
    }

    return () => {
      cancelled = true
      clearTimer()
      if (activeAbortController) {
        activeAbortController.abort()
        activeAbortController = null
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      if (typeof cancelIdleCallback === 'function' && typeof deferredHandle === 'number') {
        cancelIdleCallback(deferredHandle)
      }
    }
  }, [anonContext?.deviceId, initialState?.tracks, markSyncError, updateInitialSyncStatus])

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
        clearPendingTagUpdate(trackId, tags)
      } catch (err) {
        console.error('[tag sync] error', err)
        throw err  // Re-throw to propagate to caller
      }
    },
    [anonContext?.deviceId, clearPendingTagUpdate],
  )

  const flushPendingTagQueue = useCallback(async () => {
    if (!anonContext?.deviceId) return
    if (isFlushingPendingTagsRef.current) return
    if (pendingTagQueueRef.current.size === 0) return
    isFlushingPendingTagsRef.current = true
    try {
      for (const [trackId, entry] of pendingTagQueueRef.current) {
        try {
          await sendTagUpdate(trackId, entry.tags)
        } catch (_err) {
          break
        }
      }
    } finally {
      isFlushingPendingTagsRef.current = false
    }
  }, [anonContext?.deviceId, sendTagUpdate])

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

  useEffect(() => {
    hydratePendingTagQueue()
    if (!anonContext?.deviceId) return undefined
    flushPendingTagQueue()
    if (typeof window === 'undefined') return undefined
    const handleOnline = () => {
      flushPendingTagQueue()
    }
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [anonContext?.deviceId, flushPendingTagQueue, hydratePendingTagQueue])

  // Expose sync method for components to use
  const syncTrackTags = useCallback(
    (trackId, tags) => {
      if (!trackId) return Promise.resolve()
      upsertPendingTagUpdate(trackId, tags)
      const scheduler = tagSyncSchedulerRef.current
      if (scheduler) {
        return scheduler.schedule(trackId, tags)
      }
      return sendTagUpdate(trackId, tags)
    },
    [sendTagUpdate, upsertPendingTagUpdate],
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
