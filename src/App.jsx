// src/App.jsx
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import RecoveryModal from './components/RecoveryModal.jsx'
import RestoreDialog from './components/RestoreDialog.jsx'
import RecentPlaylists from './features/recent/RecentPlaylists.jsx'
import ErrorMessage from './components/ErrorMessage.jsx'
import {
  loadAppState,
  saveAppState,
  clearAppState,
  getPendingMigrationSnapshot,
  clearPendingMigrationSnapshot,
  writeAutoBackupSnapshot,
  stashPendingMigrationSnapshot,
  loadRecent,
  saveRecent,
  upsertRecent,
} from './utils/storage.js'
import { normalizeTag } from './features/tags/tagUtils.js'
import { STOCK_TAGS } from './features/tags/constants.js'
import { MAX_TAG_LENGTH, MAX_TAGS_PER_TRACK, TAG_ALLOWED_RE } from './features/tags/validation.js'
import { createTagSyncScheduler } from './features/tags/tagSyncQueue.js'
import {
  getNotes,
  normalizeNotesList,
  hasOwn,
  cloneNotesMap,
  normalizeTagList,
  cloneTagsMap,
  createInitialNotesMap,
  createInitialTagsMap,
  ensureNotesEntries,
  ensureTagsEntries,
  updateNotesMap,
  updateTagsMap,
  groupRemoteNotes,
  mergeRemoteNotes,
  mergeRemoteTags,
} from './utils/notesTagsData.js'
import { normalizeTimestamp, attachNotesToTracks } from './utils/trackProcessing.js'
import { focusById } from './utils/focusById.js'
import './styles/tokens.css';
import './styles/primitives.css';
import './styles/app.css';
import useAnnounce from './features/a11y/useAnnounce.js'
import { DEBUG_FOCUS, debugFocus } from './utils/debug.js'

// NEW: inline undo
import useInlineUndo from './features/undo/useInlineUndo.js'
import PlaylistView from './features/playlist/PlaylistView.jsx'
import AccountView from './features/account/AccountView.jsx'

// Extracted helpers
import detectProvider from './features/import/detectProvider'
import usePlaylistImportFlow, { ImportFlowStatus } from './features/import/usePlaylistImportFlow.js'

// NEW: centralised error helpers/messages
import { extractErrorCode, CODES } from './features/import/adapters/types.js'
import { ERROR_MAP } from './features/import/errors.js'
import { apiFetch } from './lib/apiClient.js'
import {
  getDeviceId,
  setDeviceId,
  getAnonId,
  setAnonId,
  saveRecoveryCode,
  getStoredRecoveryCode,
  hasAcknowledgedRecovery,
  markRecoveryAcknowledged,
  getRecoveryAcknowledgement,
  clearRecoveryAcknowledgement,
  clearDeviceContext,
  ensureRecoveryCsrfToken,
} from './lib/deviceState.js'

function bootstrapStorageState() {
  if (typeof window === 'undefined') {
    return {
      persisted: null,
      pendingMigrationSnapshot: null,
      initialRecents: [],
      persistedTracks: [],
      initialScreen: 'landing',
    }
  }

  const persisted = loadAppState()
  const pendingMigrationSnapshot = getPendingMigrationSnapshot()
  const persistedRecents = Array.isArray(persisted?.recentPlaylists)
    ? [...persisted.recentPlaylists]
    : null
  const loadedRecents = persistedRecents ?? loadRecent()
  const persistedTracks = Array.isArray(persisted?.tracks) ? [...persisted.tracks] : []
  const hasValidPlaylist = Boolean(persisted?.importMeta?.provider && persistedTracks.length)

  return {
    persisted,
    pendingMigrationSnapshot,
    initialRecents: Array.isArray(loadedRecents) ? [...loadedRecents] : [],
    persistedTracks,
    initialScreen: hasValidPlaylist ? 'playlist' : 'landing',
  }
}

/**
 * @typedef {'idle' | 'pending' | 'loading' | 'cooldown' | 'complete' | 'error'} BackgroundSyncStatus
 * @typedef {{ status: BackgroundSyncStatus, loaded: number, total: number|null, lastError: string|null, snapshotId: string|null }} BackgroundSyncState
 */

// Safe default importMeta shape (mirrors storage v3)
const EMPTY_IMPORT_META = {
  provider: null,
  playlistId: null,
  snapshotId: null,
  cursor: null,
  hasMore: false,
  sourceUrl: '',
  debug: null,
  total: null,
}

function createRecentCandidate(meta, options = {}) {
  if (!meta || typeof meta !== 'object') return null
  const provider =
    typeof meta.provider === 'string' && meta.provider.trim()
      ? meta.provider.trim().toLowerCase()
      : null
  const playlistId =
    typeof meta.playlistId === 'string' && meta.playlistId.trim()
      ? meta.playlistId.trim()
      : null
  const fallbackUrl =
    typeof meta.sourceUrl === 'string' && meta.sourceUrl.trim()
      ? meta.sourceUrl.trim()
      : null
  const sourceCandidate =
    typeof options.sourceUrl === 'string' && options.sourceUrl.trim()
      ? options.sourceUrl.trim()
      : fallbackUrl
  if (!provider || !playlistId || !sourceCandidate) return null

  const next = {
    provider,
    playlistId,
    title:
      typeof options.title === 'string' && options.title.trim()
        ? options.title.trim()
        : 'Imported Playlist',
    sourceUrl: sourceCandidate,
  }

  const importedAt = normalizeTimestamp(options.importedAt)
  if (importedAt != null) next.importedAt = importedAt
  const lastUsedAt = normalizeTimestamp(options.lastUsedAt)
  if (lastUsedAt != null) next.lastUsedAt = lastUsedAt

  if (typeof options.total === 'number' && Number.isFinite(options.total) && options.total >= 0) {
    next.total = Math.round(options.total)
  }
  if (typeof options.coverUrl === 'string' && options.coverUrl.trim()) {
    next.coverUrl = options.coverUrl.trim()
  }
  if (options.pinned) {
    next.pinned = true
  }

  return next
}

export default function App() {
  const [bootstrapState] = useState(bootstrapStorageState)
  const {
    persisted,
    pendingMigrationSnapshot,
    initialRecents,
    persistedTracks,
    initialScreen,
  } = bootstrapState

  const initialNotesMap = useMemo(() => createInitialNotesMap(persisted), [persisted])
  const initialTagsMap = useMemo(() => createInitialTagsMap(persisted), [persisted])

  const [anonContext, setAnonContext] = useState(() => ({
    deviceId: getDeviceId(),
    anonId: getAnonId(),
  }))
  const initialRecoveryCode = getStoredRecoveryCode()
  const initialRecoveryMeta = getRecoveryAcknowledgement()
  const initialRecoveryAcknowledged = initialRecoveryCode
    ? hasAcknowledgedRecovery(initialRecoveryCode)
    : false
  const [recoveryAckMeta, setRecoveryAckMeta] = useState(() => {
    if (!initialRecoveryCode || !initialRecoveryMeta) return null
    return initialRecoveryMeta.code === initialRecoveryCode
      ? initialRecoveryMeta
      : null
  })
  const [recoveryCode, setRecoveryCode] = useState(initialRecoveryCode)
  const [showRecoveryModal, setShowRecoveryModal] = useState(
    Boolean(initialRecoveryCode) && !initialRecoveryAcknowledged
  )
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState(null)
  const [regeneratingRecovery, setRegeneratingRecovery] = useState(false)
  const [recoveryRotationError, setRecoveryRotationError] = useState(null)
  const [showBackupReminder, setShowBackupReminder] = useState(false)
  const recoveryCopyButtonRef = useRef(null)
  const [recoveryCsrfToken, setRecoveryCsrfToken] = useState(() => ensureRecoveryCsrfToken())
  const [bootstrapError, setBootstrapError] = useState(null)
  const [showMigrationNotice, setShowMigrationNotice] = useState(Boolean(pendingMigrationSnapshot))
  const migrationSnapshotRef = useRef(pendingMigrationSnapshot)
  // SIMPLE "ROUTING"
  const [screen, setScreen] = useState(() => initialScreen)

  const { message: announceMsg, announce } = useAnnounce({ debounceMs: 60 })

  // IMPORT state
  const [importUrl, setImportUrl] = useState('')
  const providerChip = detectProvider(importUrl || '')
  const [importError, setImportError] = useState(null)
  const importInputRef = useRef(null)
  // PLAYLIST META (local state; persisted via storage v3 importMeta)
  const [importMeta, setImportMeta] = useState(() => {
    const initialMeta = persisted?.importMeta ?? {}
    const sourceUrl = initialMeta.sourceUrl ?? (persisted?.lastImportUrl ?? '')
    return {
      ...EMPTY_IMPORT_META,
      ...initialMeta,
      sourceUrl,
      hasMore: Boolean(initialMeta.cursor || initialMeta.hasMore),
    }
  })
  const importMetaRef = useRef(importMeta)
  useEffect(() => {
    importMetaRef.current = importMeta
  }, [importMeta])
  const [playlistTitle, setPlaylistTitle] = useState(persisted?.playlistTitle ?? 'My Playlist')
  const [importedAt, setImportedAt] = useState(persisted?.importedAt ?? null)
  const [lastImportUrl, setLastImportUrl] = useState(
    persisted?.lastImportUrl ?? (persisted?.importMeta?.sourceUrl ?? '')
  )
  const lastImportUrlRef = useRef(lastImportUrl)
  useEffect(() => {
    lastImportUrlRef.current = lastImportUrl
  }, [lastImportUrl])

  const [notesByTrack, setNotesByTrack] = useState(() =>
    ensureNotesEntries(initialNotesMap, persistedTracks))
  const [tagsByTrack, setTagsByTrack] = useState(() =>
    ensureTagsEntries(initialTagsMap, persistedTracks))
  const hasLocalNotes = useMemo(
    () =>
      Object.values(notesByTrack || {}).some(
        (value) => Array.isArray(value) && value.length > 0
      ) ||
      Object.values(tagsByTrack || {}).some(
        (value) => Array.isArray(value) && value.length > 0
      ),
    [notesByTrack, tagsByTrack]
  )
  const allCustomTags = useMemo(() => {
    const bucket = new Set()
    Object.values(tagsByTrack || {}).forEach((list) => {
      if (!Array.isArray(list)) return
      list.forEach((tag) => bucket.add(tag))
    })
    return Array.from(bucket).sort()
  }, [tagsByTrack])

  // DATA - normalize persisted tracks so notes always exist
  const [tracks, setTracks] = useState(() =>
    attachNotesToTracks(
      persistedTracks,
      notesByTrack,
      tagsByTrack,
      persistedTracks,
      { importStamp: persisted?.importedAt ?? null }
    )
  )
  const tracksRef = useRef(tracks)
  const [skipPlaylistFocusManagement, setSkipPlaylistFocusManagement] = useState(false)
  const firstVisibleTrackIdRef = useRef(null)
  const [trackFocusContext, setTrackFocusContext] = useState({ reason: null, ts: 0 })
  const initialFocusAppliedRef = useRef(false)
  /** @type {import('react').MutableRefObject<{ key: string | null, requestId: number | null } | null>} */
  const backgroundPagerRef = useRef(null)
  /** @type {import('react').MutableRefObject<Map<string, { promise: Promise<any>, controller: AbortController, mode: 'manual' | 'background', requestId: number }>>} */
  const pagerFlightsRef = useRef(new Map())
  /** @type {import('react').MutableRefObject<Map<string, true>>} */
  const pagerLastSuccessRef = useRef(new Map())
  const pagerCooldownRef = useRef({ until: 0 })
  const pagerResumeTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  const pagerRequestIdRef = useRef(0)
  const startBackgroundPaginationRef = useRef(() => {})
  /** @type {[BackgroundSyncState, import('react').Dispatch<import('react').SetStateAction<BackgroundSyncState>>]} */
  const [backgroundSync, setBackgroundSync] = useState(() => ({
    status: importMeta?.hasMore ? 'pending' : 'complete',
    loaded: persistedTracks.length,
    total:
      typeof importMeta?.total === 'number'
        ? importMeta.total
        : importMeta?.hasMore
          ? null
          : persistedTracks.length,
    lastError: null,
    snapshotId: importMeta?.snapshotId ?? null,
  }))

  const getPagerKey = useCallback((meta) => {
    if (!meta || typeof meta !== 'object') return null
    const provider = typeof meta.provider === 'string' && meta.provider.trim()
      ? meta.provider.trim()
      : 'no-provider'
    const playlistId = typeof meta.playlistId === 'string' && meta.playlistId.trim()
      ? meta.playlistId.trim()
      : 'no-playlist'
    const snapshotId = typeof meta.snapshotId === 'string' && meta.snapshotId.trim()
      ? meta.snapshotId.trim()
      : 'no-snap'
    const cursor =
      typeof meta.cursor === 'string' && meta.cursor.trim()
        ? meta.cursor.trim()
        : '∅'
    return `${provider}::${playlistId}::${snapshotId}::${cursor}`
  }, [])

  const cancelBackgroundPagination = useCallback((options = {}) => {
    if (pagerResumeTimerRef.current) {
      clearTimeout(pagerResumeTimerRef.current)
      pagerResumeTimerRef.current = null
    }
    pagerFlightsRef.current.forEach((flight) => {
      try {
        flight.controller.abort()
      } catch {
        // ignore cancellation errors
      }
    })
    pagerFlightsRef.current.clear()
    backgroundPagerRef.current = null
    if (options && options.resetHistory) {
      pagerLastSuccessRef.current.clear()
      pagerCooldownRef.current.until = 0
    }
    setBackgroundSync((prev) => {
      const hasMore = Boolean(importMetaRef.current?.hasMore)
      return {
        ...prev,
        status: hasMore ? 'pending' : 'complete',
        lastError: null,
      }
    })
  }, [setBackgroundSync])

  const [recentPlaylists, setRecentPlaylists] = useState(() => initialRecents)
  const recentRef = useRef(recentPlaylists)
  useEffect(() => {
    recentRef.current = recentPlaylists
  }, [recentPlaylists])

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
    const next = upsertRecent(recentRef.current, candidate)
    recentRef.current = next
    setRecentPlaylists(next)
    saveRecent(next)
  }, [])

  useEffect(() => {
    return () => {
      if (pagerResumeTimerRef.current) {
        clearTimeout(pagerResumeTimerRef.current)
        pagerResumeTimerRef.current = null
      }
    }
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

/**
 * @typedef {Object} ApplyImportResultOptions
 * @property {string} [sourceUrl]
 * @property {string} [announceMessage]
 * @property {string} [fallbackTitle]
 * @property {'first-track' | 'heading'} [focusBehavior]
 * @property {boolean} [updateLastImportUrl]
 * @property {{
 *   importedAt?: string | number | Date | null,
 *   total?: number | null,
 *   coverUrl?: string | null,
 *   lastUsedAt?: string | number | Date | null,
 *   pinned?: boolean
 * }} [recents]
 */

  const handleFirstVisibleTrackChange = useCallback((trackId) => {
    const prevTrackId = firstVisibleTrackIdRef.current
    firstVisibleTrackIdRef.current = trackId
    debugFocus('app:first-visible-change', {
      reportedTrackId: trackId,
      prevTrackId,
    })

    // Move focus to new first visible track when it changes
    if (prevTrackId && prevTrackId !== trackId) {
      requestAnimationFrame(() => {
        const buttonId = `add-note-btn-${trackId}`
        const elem = document.getElementById(buttonId)
        if (elem) {
          debugFocus('app:first-visible:refocus', {
            buttonId,
            from: `add-note-btn-${prevTrackId}`,
            reason: 'first-visible-changed',
          })
          elem.focus()
        } else {
          debugFocus('app:first-visible:refocus-failed', {
            buttonId,
            reason: 'button-not-found',
          })
        }
      })
    }
  }, [])

  const markTrackFocusContext = useCallback((reason) => {
    setTrackFocusContext({ reason, ts: Date.now() })
  }, [])

  const applyImportResult = useCallback(
    (
      payload,
      options = {}
    ) => {
      /** @type {ApplyImportResultOptions} */
      const {
        sourceUrl,
        announceMessage,
        fallbackTitle,
        focusBehavior = 'first-track',
        recents,
        updateLastImportUrl = true,
      } = options || {}

      cancelBackgroundPagination({ resetHistory: true })

      initialFocusAppliedRef.current = false

      // Declare variables outside try block so they're accessible in the recents block below
      const mapped = Array.isArray(payload?.tracks) ? payload.tracks : []
      const meta = payload?.meta ?? {}
      const importedTimestamp = payload?.importedAt ?? null
      const resolvedTitle = payload?.title || fallbackTitle || 'Imported Playlist'
      const trackCount = mapped.length

      try {
        setSkipPlaylistFocusManagement(true) // Gate PlaylistView's focus effect

        const previousTracks = Array.isArray(tracksRef.current) ? tracksRef.current : []
        const samePlaylist =
          previousTracks.length > 0 &&
          importMeta?.provider &&
          meta?.provider &&
          importMeta?.playlistId &&
          meta?.playlistId &&
          importMeta.provider === meta.provider &&
          importMeta.playlistId === meta.playlistId

        const nextNotesMap = ensureNotesEntries(notesByTrackRef.current, mapped)
        const nextTagsMap = ensureTagsEntries(tagsByTrackRef.current, mapped)
        setNotesByTrack(nextNotesMap)
        setTagsByTrack(nextTagsMap)
        setTracks(
          attachNotesToTracks(
            mapped,
            nextNotesMap,
            nextTagsMap,
            samePlaylist ? previousTracks : [],
            { importStamp: importedTimestamp ?? null }
          )
        )
        markTrackFocusContext('initial-import')
        setImportMeta({
          ...EMPTY_IMPORT_META,
          ...meta,
        })
        setPlaylistTitle(resolvedTitle)
        setImportedAt(importedTimestamp)
        if (updateLastImportUrl && typeof sourceUrl === 'string') {
          setLastImportUrl(sourceUrl)
        }
        setScreen('playlist')

        const message =
          typeof announceMessage === 'string'
            ? announceMessage
            : `Playlist imported. ${trackCount} tracks.`
        announce(message)

        const releaseFocusGate = () => {
          debugFocus('app:init-import:gate-release', {})
          setSkipPlaylistFocusManagement(false)
        }

        const focusButtonForTrack = (trackId, meta = {}) => {
          if (!trackId) return false
          const node = document.getElementById('add-note-btn-' + trackId)
          if (node && typeof node.focus === 'function') {
            debugFocus('app:init-import:focus-track', {
              requestedTrackId: trackId,
              resolvedTargetId: node.id,
              ...meta,
            })
            node.focus()
            return true
          }
          debugFocus('app:init-import:target-missing', {
            requestedTrackId: trackId,
            ...meta,
          })
          return false
        }

        const focusFirstVisibleWithRetry = (attempt = 0) => {
          const MAX_RETRIES = 5
          const targetId = firstVisibleTrackIdRef.current
          debugFocus('app:init-import:retry', {
            attempt,
            reportedTrackId: targetId,
          })

          if (focusButtonForTrack(targetId, { attempt, source: 'first-visible' })) {
            initialFocusAppliedRef.current = true
            releaseFocusGate()
            return
          }

          if (attempt < MAX_RETRIES) {
            requestAnimationFrame(() => focusFirstVisibleWithRetry(attempt + 1))
            return
          }

          const firstAddNoteBtn = /** @type {HTMLButtonElement | null} */ (
            document.querySelector('button[id^="add-note-btn-"]')
          )
          if (firstAddNoteBtn && typeof firstAddNoteBtn.focus === 'function') {
            debugFocus('app:init-import:fallback-first-rendered', {
              reportedTrackId: targetId,
              resolvedTargetId: firstAddNoteBtn.id,
            })
            firstAddNoteBtn.focus()
            initialFocusAppliedRef.current = true
          } else {
            debugFocus('app:init-import:fallback-heading', {
              reportedTrackId: targetId,
            })
            focusById('playlist-title')
          }
          releaseFocusGate()
        }

        requestAnimationFrame(() => {
          try {
            if (focusBehavior === 'heading') {
              debugFocus('app:init-import:heading-request', {})
              focusById('playlist-title')
              releaseFocusGate()
              return
            }
            if (focusBehavior === 'first-track' && !initialFocusAppliedRef.current && trackCount > 0) {
              focusFirstVisibleWithRetry(0)
              return
            }
            debugFocus('app:init-import:default-heading', {})
            focusById('playlist-title')
            releaseFocusGate()
          } catch (err) {
            releaseFocusGate()
            throw err
          }
        })
      } catch (err) {
        // Ensure gate is reset on errors
        setSkipPlaylistFocusManagement(false)
        throw err
      }

      if (recents) {
        const importedAtMs =
          recents.importedAt != null
            ? normalizeTimestamp(recents.importedAt)
            : normalizeTimestamp(importedTimestamp)
        pushRecentPlaylist(meta, {
          title: resolvedTitle,
          sourceUrl: sourceUrl ?? meta?.sourceUrl ?? '',
          total: typeof recents.total === 'number' ? recents.total : trackCount,
          coverUrl: recents.coverUrl,
          importedAt: importedAtMs ?? undefined,
          lastUsedAt: recents.lastUsedAt,
          pinned: recents.pinned,
        })
      }

      setBackgroundSync({
        status: meta?.hasMore ? 'pending' : 'complete',
        loaded: mapped.length,
        total:
          typeof meta?.total === 'number'
            ? meta.total
            : typeof payload?.total === 'number'
              ? payload.total
              : meta?.hasMore
                ? null
                : mapped.length,
        lastError: null,
        snapshotId: meta?.snapshotId ?? null,
      })

      return { trackCount, title: resolvedTitle }
    },
    [announce, cancelBackgroundPagination, pushRecentPlaylist, importMeta, markTrackFocusContext]
  )

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)

  // Remember which button opened the editor
  const editorInvokerRef = useRef(null)
  const notesByTrackRef = useRef(notesByTrack)
  const tagsByTrackRef = useRef(tagsByTrack)
  const backupFileInputRef = useRef(null)

  useEffect(() => {
    notesByTrackRef.current = notesByTrack
  }, [notesByTrack])

  useEffect(() => {
    tagsByTrackRef.current = tagsByTrack
  }, [tagsByTrack])

  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

  useEffect(() => {
    setBackgroundSync((prev) => {
      const loadedCount = Array.isArray(tracks) ? tracks.length : 0
      const inferredTotal =
        typeof importMeta.total === 'number'
          ? importMeta.total
          : importMeta.hasMore
            ? prev.total
            : tracks.length

      const nextStatus =
        !importMeta.hasMore && prev.status !== 'error'
          ? 'complete'
          : importMeta.hasMore && prev.status === 'complete'
            ? 'pending'
            : prev.status

      const nextLastError =
        !importMeta.hasMore && prev.status !== 'error' ? null : prev.lastError

      if (
        prev.loaded === loadedCount &&
        prev.total === inferredTotal &&
        prev.status === nextStatus &&
        prev.lastError === nextLastError
      ) {
        return prev
      }

      return {
        ...prev,
        loaded: loadedCount,
        total: inferredTotal ?? null,
        status: nextStatus,
        lastError: nextLastError,
      }
    })
  }, [tracks, importMeta.total, importMeta.hasMore])

  const {
    pending,
    schedule: scheduleInlineUndo,
    undo: undoInline,
    expire: expireInline,
    isPending,
    clear: clearInlineUndo,
  } = useInlineUndo({
    timeoutMs: 600000,
    onUndo: (meta) => {
      if (!meta) return
      const { trackId, note, index, restoreFocusId, fallbackFocusId } = meta
      const currentMap = notesByTrackRef.current
      const existing = trackId && currentMap && hasOwn(currentMap, trackId)
        ? [...currentMap[trackId]]
        : []
      const insertAt = Math.min(Math.max(index, 0), existing.length + 1)
      if (note != null) {
        existing.splice(insertAt, 0, note)
      }
      const updatedMap = updateNotesMap(currentMap, trackId, existing)
      setNotesByTrack(updatedMap)
      setTracks(prev =>
        prev.map(t => {
          if (t.id !== trackId) return t
          return { ...t, notes: [...existing] }
        })
      )
      announce('Note restored')
      requestAnimationFrame(() => {
        if (restoreFocusId && document.getElementById(restoreFocusId)) {
          focusById(restoreFocusId)
        } else if (fallbackFocusId) {
          focusById(fallbackFocusId)
        }
      })
    },
    onExpire: (meta, _id, cause) => {
      const fallbackFocusId = meta?.fallbackFocusId
      const msg = cause === 'manual' ? 'Undo expired. Note deleted' : 'Note deleted'
      announce(msg)
      if (fallbackFocusId) {
        requestAnimationFrame(() => { focusById(fallbackFocusId) })
      }
    },
  })


  const {
    status: importStatus,
    loading: importLoading,
    importInitial,
    reimport: reimportPlaylist,
    loadMore: loadMoreTracks,
    resetFlow: resetImportFlow,
  } = usePlaylistImportFlow()

  const bootstrapDevice = useCallback(async (allowRetry = true) => {
    const existingDeviceId = getDeviceId()
    try {
      const response = await apiFetch('/api/anon/bootstrap', {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 404 && existingDeviceId && allowRetry) {
        clearDeviceContext()
        setAnonContext({ deviceId: null, anonId: null })
        setRecoveryCode(null)
        setShowRecoveryModal(false)
        return bootstrapDevice(false)
      }
      if (!response.ok) {
        setBootstrapError(payload?.error ?? 'Failed to bootstrap device')
        return
      }
      const headerDeviceId = response.headers.get('x-device-id')
      if (headerDeviceId) {
        setDeviceId(headerDeviceId)
      }
      if (payload?.anonId) {
        setAnonId(payload.anonId)
      }
      if (payload?.recoveryCode) {
        const normalizedCode = payload.recoveryCode
        saveRecoveryCode(normalizedCode)
        setRecoveryCode(normalizedCode)
        const ackMeta = getRecoveryAcknowledgement()
        if (ackMeta?.code === normalizedCode && hasAcknowledgedRecovery(normalizedCode)) {
          setRecoveryAckMeta(ackMeta)
          setShowRecoveryModal(false)
        } else {
          setRecoveryAckMeta(null)
          setShowRecoveryModal(true)
        }
      }
      setAnonContext({
        deviceId: getDeviceId(),
        anonId: payload?.anonId ?? getAnonId(),
      })
      setBootstrapError(null)
    } catch (err) {
      console.error('[bootstrap] error', err)
      setBootstrapError('Failed to reach bootstrap endpoint')
    }
  }, [])

  const handleRecoveryModalConfirm = useCallback(() => {
    if (!recoveryCode) return
    markRecoveryAcknowledged(recoveryCode)
    setRecoveryAckMeta({
      code: recoveryCode,
      acknowledgedAt: Date.now(),
    })
    setShowRecoveryModal(false)
    announce('Recovery code saved. You can now continue.')
    setShowBackupReminder(false)
  }, [announce, recoveryCode])

  const openRestoreDialog = useCallback(() => {
    setRestoreError(null)
    setRestoreDialogOpen(true)
  }, [])

  const closeRestoreDialog = useCallback(() => {
    if (restoreBusy) return
    setRestoreDialogOpen(false)
    setRestoreError(null)
  }, [restoreBusy])

  const handleRestoreSubmit = useCallback(
    async (rawCode) => {
      const normalized = rawCode?.trim().toUpperCase()
      if (!normalized) return
      setRestoreBusy(true)
      setRestoreError(null)
      try {
        const response = await apiFetch('/api/anon/restore', {
          method: 'POST',
          body: JSON.stringify({ recoveryCode: normalized }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          let message = payload?.error ?? 'Restore failed. Please try again.'
          if (response.status === 401) {
            message = 'Recovery code was not recognised.'
          } else if (response.status === 429) {
            message = 'Too many attempts. Wait a bit and try again.'
          } else if (response.status === 410) {
            const rotatedAt = payload?.rotatedAt
            if (rotatedAt) {
              const formatted = new Date(rotatedAt).toLocaleString()
              message = `Code was replaced on ${formatted}.`
            } else {
              message = 'That recovery code was replaced on another device.'
            }
          }
          setRestoreError(message)
          return
        }

        const latestDeviceId = getDeviceId()
        setAnonId(payload?.anonId ?? '')
        setAnonContext({
          deviceId: latestDeviceId,
          anonId: payload?.anonId ?? null,
        })
        saveRecoveryCode(normalized)
        markRecoveryAcknowledged(normalized)
        setRecoveryAckMeta({
          code: normalized,
          acknowledgedAt: Date.now(),
        })
        setRecoveryCode(normalized)
        setShowRecoveryModal(false)
        setShowBackupReminder(false)

        clearAppState()
        setNotesByTrack(Object.create(null))
        setTracks([])
        setImportMeta({ ...EMPTY_IMPORT_META })
        setPlaylistTitle('My Playlist')
        setImportedAt(null)
        setLastImportUrl('')
        setImportUrl('')
        resetImportFlow()
        setScreen('landing')

        announce('Recovery successful. This device is now linked to your notes.')
        setRestoreDialogOpen(false)
        setRestoreError(null)
      } catch (err) {
        console.error('[restore] request failed', err)
        setRestoreError('Restore failed. Check your connection and try again.')
      } finally {
        setRestoreBusy(false)
      }
    },
    [announce, resetImportFlow]
  )

  const handleCopyRecoveryCode = useCallback(async () => {
    if (!recoveryCode) return
    const value = recoveryCode
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator?.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(value)
        announce('Recovery code copied.')
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch (_err) {
      try {
        if (typeof document !== 'undefined') {
          const textarea = document.createElement('textarea')
          textarea.value = value
          textarea.setAttribute('readonly', '')
          textarea.style.position = 'absolute'
          textarea.style.left = '-9999px'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
          announce('Recovery code copied.')
          return
        }
      } catch (_err) {
        // fall through to failure
      }
    }
    announce('Copy failed. Please copy the code manually.')
  }, [announce, recoveryCode])

  const handleRegenerateRecoveryCode = useCallback(async () => {
    if (regeneratingRecovery) return
    setRegeneratingRecovery(true)
    setRecoveryRotationError(null)
    try {
      const headers = recoveryCsrfToken
        ? { 'x-recovery-csrf': recoveryCsrfToken }
        : undefined
      const response = await apiFetch('/api/anon/recovery', {
        method: 'POST',
        headers,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message =
          payload?.error ?? 'Unable to regenerate recovery code.'
        setRecoveryRotationError(message)
        announce('Could not regenerate recovery code.')
        return
      }
      const nextCode =
        typeof payload?.recoveryCode === 'string'
          ? payload.recoveryCode.trim().toUpperCase()
          : ''
      if (payload?.anonId) {
        setAnonId(payload.anonId)
        setAnonContext((prev) => ({
          deviceId: prev?.deviceId ?? getDeviceId(),
          anonId: payload.anonId,
        }))
      }
      if (nextCode) {
        clearRecoveryAcknowledgement()
        saveRecoveryCode(nextCode)
        setRecoveryCode(nextCode)
        setRecoveryAckMeta(null)
        setShowRecoveryModal(true)
        setShowBackupReminder(true)
        announce('Recovery code regenerated. You must save this new code.')
        requestAnimationFrame(() => {
          if (recoveryCopyButtonRef.current) {
            recoveryCopyButtonRef.current.focus()
          }
        })
      } else {
        announce('Recovery code updated, but no code returned.')
      }
    } catch (err) {
      console.error('[recovery:regenerate] request failed', err)
      const message =
        typeof err?.message === 'string'
          ? err.message
          : 'Failed to regenerate recovery code. Please try again.'
      setRecoveryRotationError(message)
      announce('Could not regenerate recovery code.')
    } finally {
      setRegeneratingRecovery(false)
    }
  }, [announce, recoveryCsrfToken, regeneratingRecovery])

  const handleOpenRecoveryOptions = useCallback(() => {
    if (!recoveryCode) return
    setShowRecoveryModal(true)
    announce('Recovery code ready. Choose how you want to back it up.')
  }, [announce, recoveryCode])

  const handleOpenSpotifyLink = useCallback(() => {
    announce('Spotify linking is coming soon.')
  }, [announce])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const token = ensureRecoveryCsrfToken()
    setRecoveryCsrfToken(token)
  }, [])

  // REIMPORT focus pattern
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator?.storage?.persist) {
      navigator.storage.persist().catch(() => { /* best effort */ })
    }
  }, [])

  useEffect(() => {
    bootstrapDevice()
  }, [bootstrapDevice])

  useEffect(() => {
    const snapshot = migrationSnapshotRef.current
    if (!snapshot) return
    if (!anonContext?.anonId || !anonContext?.deviceId) return

    let cancelled = false
    setShowMigrationNotice(true)
    announce('Finishing upgrade in the background...')

    const runMigration = async () => {
      try {
        console.info('[storage:migration] starting v4 migration')
        writeAutoBackupSnapshot(snapshot)

        const response = await apiFetch('/api/db/notes')
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Failed to fetch existing notes')
        }

        const remoteList = Array.isArray(payload?.notes) ? payload.notes : []
        const { notes: remoteNoteMap, tags: remoteTagMap } = groupRemoteNotes(remoteList)
        /** @type {Map<string, Set<string>>} */
        const remoteNoteSets = new Map()
        Object.entries(remoteNoteMap).forEach(([trackId, noteList]) => {
          remoteNoteSets.set(trackId, new Set(noteList))
        })

        const combinedLocal = cloneNotesMap(snapshot.notesByTrack || {})
        if (Array.isArray(snapshot.tracks)) {
          snapshot.tracks.forEach((track) => {
            if (!track || typeof track !== 'object') return
            const id = track.id
            if (!id) return
            const existing = Array.isArray(combinedLocal[id]) ? [...combinedLocal[id]] : []
            const cleaned = normalizeNotesList(track.notes)
            cleaned.forEach((note) => {
              if (!existing.includes(note)) existing.push(note)
            })
            if (existing.length > 0) {
              combinedLocal[id] = existing
            }
          })
        }

        /** @type {{ trackId: string, body: string }[]} */
        const uploads = []
        Object.entries(combinedLocal).forEach(([trackId, notes]) => {
          const remoteSet = remoteNoteSets.get(trackId) ?? new Set()
          notes.forEach((note) => {
            const clean = typeof note === 'string' ? note.trim() : ''
            if (!clean) return
            if (!remoteSet.has(clean)) {
              uploads.push({ trackId, body: clean })
              remoteSet.add(clean)
            }
          })
        })

        const combinedTags = cloneTagsMap(snapshot.tagsByTrack || {})
        if (Array.isArray(snapshot.tracks)) {
          snapshot.tracks.forEach((track) => {
            if (!track || typeof track !== 'object') return
            const id = track.id
            if (!id) return
            const existing = Array.isArray(combinedTags[id]) ? [...combinedTags[id]] : []
            const cleaned = normalizeTagList(track.tags)
            cleaned.forEach((tag) => {
              if (!existing.includes(tag)) existing.push(tag)
            })
            if (existing.length > 0) {
              combinedTags[id] = existing
            }
          })
        }

        /** @type {{ trackId: string, tags: string[] }[]} */
        const tagUploads = []
        Object.entries(combinedTags).forEach(([trackId, tags]) => {
          const remoteTags = remoteTagMap[trackId]
          if (Array.isArray(remoteTags) && remoteTags.length > 0) return
          if (!Array.isArray(tags) || tags.length === 0) return
          tagUploads.push({ trackId, tags })
        })

        const localNoteCount = Object.values(combinedLocal).reduce(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        )

        console.info('[storage:migration] dry-run summary', {
          localTracks: snapshot.tracks?.length ?? 0,
          localNotes: localNoteCount,
          remoteNotes: remoteList.length,
          remoteTagSets: Object.keys(remoteTagMap).length,
          toUpload: uploads.length,
          tagUploads: tagUploads.length,
        })

        for (const job of uploads) {
          if (cancelled) return
          const res = await apiFetch('/api/db/notes', {
            method: 'POST',
            body: JSON.stringify(job),
          })
          if (!res.ok) {
            const errPayload = await res.json().catch(() => ({}))
            throw new Error(errPayload?.error ?? 'Failed to sync note')
          }
        }

        for (const job of tagUploads) {
          if (cancelled) return
          const res = await apiFetch('/api/db/notes', {
            method: 'POST',
            body: JSON.stringify(job),
          })
          if (!res.ok) {
            const errPayload = await res.json().catch(() => ({}))
            throw new Error(errPayload?.error ?? 'Failed to sync tags')
          }
        }

        if (!cancelled) {
          clearPendingMigrationSnapshot()
          migrationSnapshotRef.current = null
          console.info('[storage:migration] completed successfully')
          setShowMigrationNotice(false)
          announce('Upgrade complete.')
        }
      } catch (err) {
        if (cancelled) return
        console.error('[storage:migration] failed', err)
        stashPendingMigrationSnapshot(snapshot)
        setShowMigrationNotice(false)
      }
    }

    runMigration()

    return () => {
      cancelled = true
    }
  }, [anonContext?.anonId, anonContext?.deviceId, announce])

  useEffect(() => {
    if (!bootstrapError) return
    console.warn('[bootstrap] client warning', bootstrapError)
  }, [bootstrapError])

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
        setNotesByTrack((prev) =>
          ensureNotesEntries(mergeRemoteNotes(prev, remoteMap), tracksRef.current)
        )
        setTagsByTrack((prev) =>
          ensureTagsEntries(mergeRemoteTags(prev, remoteTagMap), tracksRef.current)
        )
        setTracks((prev) =>
          prev.map((track) => {
            let next = track
            const remoteNotes = remoteMap[track.id]
            if (Array.isArray(remoteNotes) && remoteNotes.length > 0) {
              const existingNotes = Array.isArray(track.notes) ? track.notes : []
              if (existingNotes.length === 0) {
                next = { ...next, notes: [...remoteNotes] }
              }
            }
            if (track.id && track.id in remoteTagMap) {
              next = { ...next, tags: [...remoteTagMap[track.id]] }
            }
            return next
          })
        )
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

  const reimportBtnRef = useRef(null)
  const loadMoreBtnRef = useRef(null)
  const tagSyncSchedulerRef = useRef(null)

  // -- PERSISTENCE: save whenever core state changes (v3 structured shape)
  useEffect(() => {
    saveAppState({
      playlistTitle,
      importedAt,
      lastImportUrl,
      tracks,
      importMeta,
      notesByTrack,
      tagsByTrack,
    })
  }, [playlistTitle, importedAt, lastImportUrl, tracks, importMeta, notesByTrack, tagsByTrack])

  // Safety: close editor if its track disappears or changes
  useEffect(() => {
    if (editingId == null) return
    if (!tracks.some(t => t.id === editingId)) {
      setEditingId(null); setDraft(''); setError(null)
    }
  }, [tracks, editingId])

  // 🔐 Safety: if you somehow land on the playlist screen with zero tracks, bounce to landing
  useEffect(() => {
    if (screen === 'playlist' && tracks.length === 0) {
      setScreen('landing')
    }
  }, [screen, tracks.length])

  // Ctrl/Cmd+Z undo
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        if (pending.size > 0) {
          e.preventDefault()
          undoInline()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pending, undoInline])

  // ===== tiny extracted handlers =====
  function handleImportUrlChange(e) { setImportUrl(e.target.value); setImportError(null) }
  const handleDraftChange = (value) => { setDraft(value) }
  function handleBackToLanding() { setScreen('landing') }

  const isInitialImportBusy = importStatus === ImportFlowStatus.IMPORTING
  const isReimportBusy = importStatus === ImportFlowStatus.REIMPORTING
  const isLoadMoreBusy = importStatus === ImportFlowStatus.LOADING_MORE
  const isAnyImportBusy = importStatus !== ImportFlowStatus.IDLE
  const showInitialSpinner = isInitialImportBusy && importLoading
  const showReimportSpinner = isReimportBusy && importLoading
  const showLoadMoreSpinner = isLoadMoreBusy && importLoading

  // Small helper to resolve a friendly message from a code
  const msgFromCode = useCallback(
    (code) =>
      ERROR_MAP[code] ?? ERROR_MAP[CODES.ERR_UNKNOWN] ?? 'Something went wrong. Please try again.',
    [],
  )

  // IMPORT handlers
  const handleImport = async (e) => {
    e?.preventDefault?.()
    setImportError(null)
    cancelBackgroundPagination({ resetHistory: true })
    const trimmedUrl = importUrl.trim()

    if (!trimmedUrl) {
      const msg = 'Paste a playlist URL to import.'
      setImportError(msg)
      announce('Import failed. URL missing.')
      importInputRef.current?.focus(); importInputRef.current?.select()
      console.log('[import error]', { code: 'URL_MISSING', raw: null })
      return
    }

    if (!providerChip) {
      const msg = msgFromCode(CODES.ERR_UNSUPPORTED_URL)
      setImportError(msg)
      announce('Import failed. Unsupported URL.')
      importInputRef.current?.focus(); importInputRef.current?.select()
      console.log('[import error]', { code: CODES.ERR_UNSUPPORTED_URL, raw: null })
      return
    }

    announce('Import started.')
    try {
      const result = await importInitial(trimmedUrl, {
        providerHint: providerChip,
        sourceUrl: trimmedUrl,
      })

      if (result?.stale) return

      if (!result.ok) {
        const code = result.code ?? CODES.ERR_UNKNOWN
        const msg = msgFromCode(code)
        console.log('[import error]', { code, raw: result.error })
        setImportError(msg)
        announce('Import failed. ' + msg)
        importInputRef.current?.focus(); importInputRef.current?.select()
        return
      }

      applyImportResult(result.data, {
        sourceUrl: trimmedUrl,
        recents: {
          importedAt: result.data?.importedAt ?? null,
          total:
            typeof result.data?.total === 'number'
              ? result.data.total
              : Array.isArray(result.data?.tracks)
                ? result.data.tracks.length
                : null,
          coverUrl: result.data?.coverUrl ?? null,
        },
      })
    } catch (err) {
      if (err?.name === 'AbortError') return
      const code = extractErrorCode(err)
      const msg = msgFromCode(code)
      console.log('[import error]', { code, raw: err })
      setImportError(msg)
      announce('Import failed. ' + msg)
      importInputRef.current?.focus(); importInputRef.current?.select()
    }
  }

  const handleSelectRecent = async (recent) => {
    if (!recent || !recent.id) {
      return { ok: false, error: 'Unknown playlist' }
    }
    if (isAnyImportBusy) {
      const msg = 'Finish the current import before loading another playlist.'
      updateRecentCardState(recent.id, { error: msg, loading: false })
      announce(msg)
      return { ok: false, error: msg }
    }

    const trimmedUrl = typeof recent.sourceUrl === 'string' ? recent.sourceUrl.trim() : ''
    if (!trimmedUrl) {
      const msg = "Can't load - link changed."
      updateRecentCardState(recent.id, { error: msg, loading: false })
      announce(msg)
      return { ok: false, error: msg }
    }

    cancelBackgroundPagination({ resetHistory: true })
    setImportUrl(trimmedUrl)
    setImportError(null)
    updateRecentCardState(recent.id, { loading: true, error: null })
    announce(`Loading playlist ${recent.title ? `"${recent.title}"` : ''}.`)

    try {
      const result = await importInitial(trimmedUrl, {
        providerHint: recent.provider,
        sourceUrl: trimmedUrl,
      })

      if (result?.stale) {
        updateRecentCardState(recent.id, {})
        return { ok: false, stale: true }
      }

      if (!result.ok) {
        const code = result.code ?? CODES.ERR_UNKNOWN
        const msg = msgFromCode(code)
        console.log('[recent import error]', { code, raw: result.error })
        updateRecentCardState(recent.id, { loading: false, error: msg })
        setImportError(msg)
        announce(msg)
        return { ok: false, error: msg }
      }

      applyImportResult(result.data, {
        sourceUrl: trimmedUrl,
        focusBehavior: 'heading',
        announceMessage: `Playlist loaded: ${recent.title || result.data?.title || 'Imported playlist'}.`,
        recents: {
          importedAt: result.data?.importedAt ?? null,
          total:
            typeof result.data?.total === 'number'
              ? result.data.total
              : Array.isArray(result.data?.tracks)
                ? result.data.tracks.length
                : null,
          coverUrl: result.data?.coverUrl ?? recent.coverUrl,
          lastUsedAt: Date.now(),
        },
      })
      updateRecentCardState(recent.id, null)
      return { ok: true }
    } catch (err) {
      if (err?.name === 'AbortError') {
        updateRecentCardState(recent.id, {})
        throw err
      }
      const code = extractErrorCode(err)
      const msg = msgFromCode(code)
      console.log('[recent import error]', { code, raw: err })
      updateRecentCardState(recent.id, { loading: false, error: msg })
      setImportError(msg)
      announce(msg)
      return { ok: false, error: msg }
    }
  }

  const handleReimport = async () => {
    if (!lastImportUrl) return
    cancelBackgroundPagination({ resetHistory: true })
    const wasActive = document.activeElement === reimportBtnRef.current
    setImportError(null)
    announce('Re-importing playlist.')
    try {
      const result = await reimportPlaylist(lastImportUrl, {
        providerHint: importMeta.provider ?? null,
        existingMeta: importMeta,
        fallbackTitle: playlistTitle,
      })

      if (result?.stale) return

      if (!result.ok) {
        const code = result.code ?? CODES.ERR_UNKNOWN
        const msg = msgFromCode(code)
        console.log('[reimport error]', { code, raw: result.error })
        setImportError(msg)
        announce(msg)
        if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
        return
      }

      const resolvedTotal =
        typeof result.data?.total === 'number'
          ? result.data.total
          : Array.isArray(result.data?.tracks)
            ? result.data.tracks.length
            : null

      applyImportResult(result.data, {
        sourceUrl: lastImportUrl,
        fallbackTitle: playlistTitle,
        announceMessage: `Playlist re-imported. ${resolvedTotal ?? 0} tracks available.`,
        recents: {
          importedAt: result.data?.importedAt ?? null,
          total: resolvedTotal,
          coverUrl: result.data?.coverUrl ?? null,
          lastUsedAt: Date.now(),
        },
        updateLastImportUrl: false,
      })
      if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
    } catch (err) {
      if (err?.name === 'AbortError') {
        return
      }
      const code = extractErrorCode(err)
      const msg = msgFromCode(code)
      console.log('[reimport error]', { code, raw: err })
      setImportError(msg)
      announce(msg)
      if (wasActive) requestAnimationFrame(() => reimportBtnRef.current?.focus())
    }
  }

  const handleLoadMore = useCallback(
    async (options = {}) => {
      const mode = options?.mode === 'background' ? 'background' : 'manual'
      const isBackground = mode === 'background'
      const metaSnapshot = options?.metaOverride ?? importMetaRef.current
      const sourceUrl = lastImportUrlRef.current

      if (!metaSnapshot?.cursor || !metaSnapshot?.provider || !sourceUrl) {
        return { ok: false, reason: 'unavailable' }
      }

      const key = getPagerKey(metaSnapshot)
      if (!key) {
        return { ok: false, reason: 'unavailable' }
      }

      if (!isBackground) {
        setImportError(null)
      }

      const finalizeManualResult = (result) => {
        if (!result || result.stale || result.aborted) {
          return result
        }
        if (result.ok) {
          if (result.added > 0) {
            const targetId = result.firstNewTrackId ?? null
            if (targetId) {
              debugFocus('app:load-more:manual', {
                firstNewTrackId: targetId,
                added: result.added,
              })
              focusById(`track-${targetId}`)
            } else {
              requestAnimationFrame(() => {
                debugFocus('app:load-more:manual-fallback', {
                  added: result.added,
                })
                loadMoreBtnRef.current?.focus()
              })
            }
            announce(`${result.added} more tracks loaded.`)
          } else {
            announce('No additional tracks available.')
          }
          setImportError(null)
        } else if (result.code === CODES.ERR_RATE_LIMITED && result.retryAt) {
          const base = msgFromCode(CODES.ERR_RATE_LIMITED)
          const resumeLabel =
            typeof result.retryAt === 'number'
              ? new Date(result.retryAt).toLocaleTimeString()
              : null
          const message = resumeLabel ? `${base} Resume after ${resumeLabel}.` : base
          setImportError(message)
          announce(message)
        } else if (result.code) {
          const message = msgFromCode(result.code)
          setImportError(message)
          announce(message)
        } else {
          const fallback = msgFromCode(CODES.ERR_UNKNOWN)
          setImportError(fallback)
          announce(fallback)
        }
        return result
      }

      const resolveRetryAfterMs = (error) => {
        if (!error || typeof error !== 'object') return null
        const directMs = Number(error.retryAfterMs)
        if (Number.isFinite(directMs) && directMs > 0) return directMs
        const retrySeconds = Number(error.retryAfterSeconds ?? error.retryAfter)
        if (Number.isFinite(retrySeconds) && retrySeconds > 0) return retrySeconds * 1000
        return null
      }

      const scheduleResume = (resumeAtMs) => {
        if (!resumeAtMs) return
        const normalized = Math.max(resumeAtMs, Date.now() + 1000)
        pagerCooldownRef.current.until = normalized
        if (pagerResumeTimerRef.current) {
          clearTimeout(pagerResumeTimerRef.current)
        }
        const delay = Math.max(0, normalized - Date.now())
        pagerResumeTimerRef.current = setTimeout(() => {
          pagerResumeTimerRef.current = null
          pagerCooldownRef.current.until = 0
          startBackgroundPaginationRef.current()
        }, delay)
      }

      const now = Date.now()
      const cooldownUntil = pagerCooldownRef.current.until ?? 0
      if (cooldownUntil > now) {
        const resumeTime = new Date(cooldownUntil).toLocaleTimeString()
        const cooldownMessage = `${msgFromCode(CODES.ERR_RATE_LIMITED)} Resume after ${resumeTime}.`
        setBackgroundSync((prev) => ({
          ...prev,
          status: 'cooldown',
          lastError: cooldownMessage,
        }))
        if (!isBackground) {
          setImportError(cooldownMessage)
          announce(cooldownMessage)
        }
        return { ok: false, code: CODES.ERR_RATE_LIMITED, retryAt: cooldownUntil }
      }

      if (pagerLastSuccessRef.current.has(key)) {
        return { ok: true, done: !metaSnapshot?.hasMore, added: 0, skipped: true }
      }

      const existingFlight = pagerFlightsRef.current.get(key)
      if (existingFlight) {
        if (isBackground) {
          backgroundPagerRef.current = { key, requestId: existingFlight.requestId }
          return existingFlight.promise
        }
        announce('Loading more tracks.')
        return existingFlight.promise.then((res) => finalizeManualResult(res))
      }

      const controller = new AbortController()
      const requestId = ++pagerRequestIdRef.current

      if (isBackground) {
        backgroundPagerRef.current = { key, requestId }
      }

      const flightPromise = (async () => {
        try {
          if (isBackground) {
            setBackgroundSync((prev) => ({
              ...prev,
              status: 'loading',
              lastError: null,
            }))
          } else {
            announce('Loading more tracks.')
          }

          const currentTracks = Array.isArray(tracksRef.current) ? tracksRef.current : []
          const existingIds = currentTracks.map((t) => t.id)
          const result = await loadMoreTracks({
            providerHint: metaSnapshot.provider ?? null,
            existingMeta: metaSnapshot,
            startIndex: currentTracks.length,
            existingIds,
            sourceUrl,
            signal: controller.signal,
          })

          if (result?.stale) {
            return { ok: false, stale: true }
          }

          if (!result.ok) {
            const code = result.code ?? CODES.ERR_UNKNOWN
            const msg = msgFromCode(code)
            console.log('[load-more error]', { code, raw: result.error })
            if (code === CODES.ERR_RATE_LIMITED) {
              const retryMs = resolveRetryAfterMs(result.error) ?? 60000
              const resumeAt = Date.now() + retryMs
              scheduleResume(resumeAt)
              const resumeTime = new Date(resumeAt).toLocaleTimeString()
              const cooldownMessage = `${msg} Resume after ${resumeTime}.`
              setBackgroundSync((prev) => ({
                ...prev,
                status: 'cooldown',
                lastError: cooldownMessage,
              }))
              return { ok: false, code, retryAt: resumeAt }
            }
            if (isBackground) {
              setBackgroundSync((prev) => ({
                ...prev,
                status: 'error',
                lastError: msg,
              }))
            } else {
              setImportError(msg)
              announce(msg)
            }
            return { ok: false, code }
          }

          const additions = Array.isArray(result.data?.tracks) ? result.data.tracks : []
          const meta = result.data?.meta ?? {}
          const hasMore = Boolean(meta?.hasMore)

          if (!additions.length) {
            setImportMeta((prev) => ({
              ...prev,
              ...meta,
            }))
            pagerLastSuccessRef.current.set(key, true)
            if (isBackground) {
              setBackgroundSync((prev) => ({
                ...prev,
                status: hasMore ? 'pending' : 'complete',
                lastError: null,
                snapshotId: meta?.snapshotId ?? prev.snapshotId ?? null,
              }))
            }
            return { ok: true, done: !hasMore, added: 0, firstNewTrackId: null }
          }

          const nextNotesMap = ensureNotesEntries(notesByTrackRef.current, additions)
          const nextTagsMap = ensureTagsEntries(tagsByTrackRef.current, additions)
          setNotesByTrack(nextNotesMap)
          setTagsByTrack(nextTagsMap)
          const baseTracks = Array.isArray(tracksRef.current) ? tracksRef.current : []
          const loadMoreStamp = new Date().toISOString()
          const additionsWithNotes = attachNotesToTracks(
            additions,
            nextNotesMap,
            nextTagsMap,
            baseTracks,
            { importStamp: loadMoreStamp },
          )
          setTracks((prev) => [...prev, ...additionsWithNotes])
          markTrackFocusContext(isBackground ? 'background-load-more' : 'manual-load-more')
          setImportMeta((prev) => ({
            ...prev,
            ...meta,
          }))
          setImportedAt(loadMoreStamp)
          pagerLastSuccessRef.current.set(key, true)

          const firstNewId = additions[0]?.id ?? null

          if (isBackground) {
            setBackgroundSync((prev) => ({
              ...prev,
              status: hasMore ? 'pending' : 'complete',
              lastError: null,
              snapshotId: meta?.snapshotId ?? prev.snapshotId ?? null,
            }))
            debugFocus('app:load-more:auto', {
              added: additions.length,
              activeAfter: document.activeElement?.id ?? null,
            })
            if (!hasMore) {
              announce('All tracks loaded; order complete.')
            }
          }

          return { ok: true, done: !hasMore, added: additions.length, firstNewTrackId: firstNewId }
        } catch (err) {
          if (err?.name === 'AbortError') {
            if (isBackground) {
              setBackgroundSync((prev) => ({
                ...prev,
                status: 'pending',
              }))
            }
            return { ok: false, aborted: true }
          }
          const code = extractErrorCode(err)
          const msg = msgFromCode(code)
          console.log('[load-more error]', { code, raw: err })
          if (isBackground) {
            setBackgroundSync((prev) => ({
              ...prev,
              status: 'error',
              lastError: msg,
            }))
          }
          return { ok: false, code }
        } finally {
          pagerFlightsRef.current.delete(key)
          if (backgroundPagerRef.current && backgroundPagerRef.current.key === key && backgroundPagerRef.current.requestId === requestId) {
            backgroundPagerRef.current = null
          }
        }
      })()

      pagerFlightsRef.current.set(key, { promise: flightPromise, controller, mode, requestId })
      return isBackground ? flightPromise : flightPromise.then((res) => finalizeManualResult(res))
    },
    [
      announce,
      getPagerKey,
      loadMoreTracks,
      markTrackFocusContext,
      msgFromCode,
      setBackgroundSync,
      setImportError,
      setImportMeta,
      setImportedAt,
      setNotesByTrack,
      setTagsByTrack,
      setTracks,
    ],
  )

  const startBackgroundPagination = useCallback(
    (metaOverride) => {
      if (importStatus !== ImportFlowStatus.IDLE) return

      const meta = metaOverride ?? importMetaRef.current
      if (!meta) return

      const hasMore = Boolean(meta?.hasMore && meta?.cursor)
      const sourceUrl = lastImportUrlRef.current
      if (!hasMore || !sourceUrl) {
        setBackgroundSync((prev) => ({
          ...prev,
          status: 'complete',
          lastError: null,
        }))
        return
      }

      const key = getPagerKey(meta)
      if (!key) return

      if (pagerLastSuccessRef.current.has(key)) {
        return
      }

      const now = Date.now()
      const cooldownUntil = pagerCooldownRef.current.until ?? 0
      if (cooldownUntil > now) {
        setBackgroundSync((prev) => ({
          ...prev,
          status: 'cooldown',
        }))
        if (!pagerResumeTimerRef.current) {
          const delay = Math.max(0, cooldownUntil - now)
          pagerResumeTimerRef.current = setTimeout(() => {
            pagerResumeTimerRef.current = null
            pagerCooldownRef.current.until = 0
            startBackgroundPaginationRef.current()
          }, delay)
        }
        return
      }

      const existingFlight = pagerFlightsRef.current.get(key)
      if (existingFlight) {
        backgroundPagerRef.current = { key, requestId: existingFlight.requestId }
        return
      }

      handleLoadMore({ mode: 'background', metaOverride: meta })
    },
    [getPagerKey, handleLoadMore, importStatus, lastImportUrlRef, setBackgroundSync],
  )

  useEffect(() => {
    startBackgroundPaginationRef.current = startBackgroundPagination
    return () => {
      startBackgroundPaginationRef.current = () => {}
    }
  }, [startBackgroundPagination])

  useEffect(() => {
    if (screen !== 'playlist') return
    if (!importMeta?.hasMore || !importMeta?.cursor) return
    if (!lastImportUrl) return
    if (importStatus !== ImportFlowStatus.IDLE) return
    startBackgroundPagination()
  }, [
    screen,
    importMeta.hasMore,
    importMeta.cursor,
    importStatus,
    lastImportUrl,
    startBackgroundPagination,
  ])

  const handleBackupNotes = async () => {
    try {
      const payload = {
        version: 1,
        generatedAt: new Date().toISOString(),
        playlist: {
          title: playlistTitle,
          provider: importMeta?.provider ?? null,
          playlistId: importMeta?.playlistId ?? null,
          snapshotId: importMeta?.snapshotId ?? null,
          sourceUrl: importMeta?.sourceUrl ?? lastImportUrl ?? '',
        },
        notesByTrack: cloneNotesMap(notesByTrackRef.current),
        tagsByTrack: cloneTagsMap(tagsByTrackRef.current),
      }
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const timestamp = new Date().toISOString().replace(/[:]/g, '-')
      const suggestedName = `playlist-notes-backup-${timestamp}.json`

      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          const picker = /** @type {any} */ (window).showSaveFilePicker
          const handle = await picker({
            suggestedName,
            types: [
              {
              description: 'Playlist Notes backup',
                accept: { 'application/json': ['.json'] },
              },
            ],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          announce('Notes exported to the selected file.')
          return
        } catch (err) {
          if (err?.name === 'AbortError') {
          announce('Backup cancelled.')
          return
        }
        throw err
      }
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = suggestedName
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      announce('Notes backup downloaded.')
    } catch (err) {
      console.error('[notes backup error]', err)
      announce('Backup failed. Please try again.')
    }
  }

  const handleRestoreNotesRequest = () => {
    backupFileInputRef.current?.click()
  }

  const handleImportNotesFromFile = async (event) => {
    const input = event.target
    const file = input?.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const importedMap = cloneNotesMap(parsed?.notesByTrack)
      const merged = cloneNotesMap(notesByTrackRef.current)
      Object.entries(importedMap).forEach(([id, notes]) => {
        merged[id] = [...notes]
      })
      const importedTags = cloneTagsMap(parsed?.tagsByTrack)
      const mergedTags = cloneTagsMap(tagsByTrackRef.current)
      Object.entries(importedTags).forEach(([id, tags]) => {
        const existing = Array.isArray(mergedTags[id]) ? [...mergedTags[id]] : []
        const combined = [...existing]
        tags.forEach((tag) => {
          const normalized = normalizeTag(tag)
          if (normalized && !combined.includes(normalized)) {
            combined.push(normalized)
          }
        })
        if (combined.length > 0) {
          mergedTags[id] = combined
        }
      })
      const nextMap = ensureNotesEntries(merged, tracks)
      const nextTagsMap = ensureTagsEntries(mergedTags, tracks)
      setNotesByTrack(nextMap)
      setTagsByTrack(nextTagsMap)
      setTracks(prev => attachNotesToTracks(prev, nextMap, nextTagsMap, prev))
      announce('Notes restored from backup.')
    } catch (err) {
      console.error('[notes restore error]', err)
      announce('Restore failed. Please verify the file.')
    } finally {
      if (input) input.value = ''
    }
  }

  const handleClearAll = () => {
    cancelBackgroundPagination({ resetHistory: true })
    // Reset transient UI and timers
    clearInlineUndo()
    setEditingId(null); setDraft(''); setError(null)
    setImportError(null)
    // Clear persisted data
    clearAppState()
    clearDeviceContext()
    setAnonContext({ deviceId: null, anonId: null })
    setRecoveryCode(null)
    setRecoveryAckMeta(null)
    setShowBackupReminder(false)
    setShowRecoveryModal(false)
    setRestoreDialogOpen(false)
    setRestoreError(null)
    setRestoreBusy(false)
    bootstrapDevice()

    // Reset in-memory app state
    setNotesByTrack(Object.create(null))
    setTagsByTrack(Object.create(null))
    setTracks([])
    setImportMeta({ ...EMPTY_IMPORT_META })
    setPlaylistTitle('My Playlist')
    setImportedAt(null)
    setLastImportUrl('')
    setImportUrl('')

    // Reset import session internals
    resetImportFlow()

    // Route back to landing + UX polish
    setScreen('landing')
    announce("All saved data cleared. You're back at the start.")
    setTimeout(() => importInputRef.current?.focus(), 0)
  }

  const sendTagUpdate = useCallback(
    async (trackId, tags) => {
      if (!trackId || !anonContext?.deviceId) return
      const response = await apiFetch('/api/db/notes', {
        method: 'POST',
        body: JSON.stringify({ trackId, tags }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error ?? 'Failed to sync tags')
      }
    },
    [anonContext?.deviceId],
  )

  useEffect(() => {
    if (!anonContext?.deviceId) {
      tagSyncSchedulerRef.current?.clear?.()
      tagSyncSchedulerRef.current = null
      return
    }
    const scheduler = createTagSyncScheduler(sendTagUpdate, 350)
    tagSyncSchedulerRef.current = scheduler
    return () => scheduler.clear()
  }, [anonContext?.deviceId, sendTagUpdate])

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

  const handleAddTag = useCallback(
    (trackId, tag) => {
      const normalized = normalizeTag(tag)
      if (!trackId || !normalized) return false
      if (normalized.length > MAX_TAG_LENGTH) {
        announce(`Tags must be ${MAX_TAG_LENGTH} characters or fewer.`)
        return false
      }
      if (!TAG_ALLOWED_RE.test(normalized)) {
        announce('Tags can only include letters, numbers, spaces, hyphen, or underscore.')
        return false
      }
      const currentMap = tagsByTrackRef.current || {}
      const existing = hasOwn(currentMap, trackId) ? [...currentMap[trackId]] : []
      if (existing.length >= MAX_TAGS_PER_TRACK) {
        announce(`Maximum of ${MAX_TAGS_PER_TRACK} tags reached for this track.`)
        return false
      }
      if (existing.includes(normalized)) {
        const title = tracksRef.current.find((t) => t.id === trackId)?.title ?? 'this track'
        announce(`Tag "${normalized}" already applied to "${title}".`)
        return false
      }
      const nextList = [...existing, normalized]
      const nextMap = updateTagsMap(currentMap, trackId, nextList)
      setTagsByTrack(nextMap)
      tagsByTrackRef.current = nextMap
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== trackId) return t
          return { ...t, tags: nextList }
        })
      )
      const title = tracksRef.current.find((t) => t.id === trackId)?.title ?? 'this track'
      announce(`Added tag "${normalized}" to "${title}".`)
      if (anonContext?.deviceId) {
        syncTrackTags(trackId, nextList).catch(() => {
          announce('Tag sync failed. Changes are saved locally.')
        })
      }
      return true
    },
    [announce, anonContext?.deviceId, syncTrackTags],
  )

  const handleRemoveTag = useCallback(
    (trackId, tag) => {
      const normalized = normalizeTag(tag)
      if (!trackId || !normalized) return
      const currentMap = tagsByTrackRef.current || {}
      const existing = hasOwn(currentMap, trackId) ? [...currentMap[trackId]] : []
      if (existing.length === 0) return
      const filtered = existing.filter((value) => value !== normalized)
      const nextMap = updateTagsMap(currentMap, trackId, filtered)
      setTagsByTrack(nextMap)
      tagsByTrackRef.current = nextMap
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== trackId) return t
          return { ...t, tags: filtered }
        })
      )
      const title = tracksRef.current.find((t) => t.id === trackId)?.title ?? 'this track'
      announce(`Removed tag "${normalized}" from "${title}".`)
      if (anonContext?.deviceId) {
        syncTrackTags(trackId, filtered).catch(() => {
          announce('Tag sync failed. Changes are saved locally.')
        })
      }
    },
    [announce, anonContext?.deviceId, syncTrackTags],
  )

  const onAddNote = (trackId) => {
    setEditingId(trackId); setDraft(''); setError(null)
    editorInvokerRef.current = document.getElementById(`add-note-btn-${trackId}`)
    setTimeout(() => { focusById(`note-input-${trackId}`) }, 0)
  }

  const onSaveNote = async (trackId) => {
    if (!draft.trim()) {
      announce('Note not saved. The note is empty.')
      setError('Note cannot be empty.')
      return
    }
    const trimmed = draft.trim()
    const existing = trackId && hasOwn(notesByTrack, trackId)
      ? [...notesByTrack[trackId]]
      : []
    const rollbackMap = updateNotesMap(notesByTrack, trackId, existing)
    const optimistic = [...existing, trimmed]
    const nextMap = updateNotesMap(notesByTrack, trackId, optimistic)
    setNotesByTrack(nextMap)
    setTracks(prev =>
      prev.map(t => {
        if (t.id !== trackId) return t
        return { ...t, notes: [...optimistic] }
      })
    )
    setEditingId(null); setDraft(''); setError(null)
    announce('Note added.')
    editorInvokerRef.current?.focus()

    if (!anonContext?.deviceId) {
      console.warn('[note save] missing device id, skipping sync')
      return
    }

    try {
      const response = await apiFetch('/api/db/notes', {
        method: 'POST',
        body: JSON.stringify({ trackId, body: trimmed }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error ?? 'Failed to save note')
      }
    } catch (err) {
      console.error('[note save] error', err)
      setError('Failed to save note. Restored previous notes.')
      setNotesByTrack(rollbackMap)
      setTracks(prev =>
        prev.map(t => {
          if (t.id !== trackId) return t
          return { ...t, notes: [...existing] }
        })
      )
      announce('Note save failed. Restored previous note list.')
    }
  }

  const onCancelNote = () => {
    setEditingId(null); setDraft(''); setError(null)
    announce('Note cancelled.')
    editorInvokerRef.current?.focus()
  }

  function makePendingId(trackId, index) {
    return `${trackId}::${index}::${Date.now()}`
  }

  const onDeleteNote = (trackId, noteIndex) => {
    const track = tracks.find(t => t.id === trackId)
    const notes = getNotes(track)
    const noteToDelete = notes[noteIndex]
    if (noteToDelete == null) return

    const existing = trackId && hasOwn(notesByTrack, trackId)
      ? [...notesByTrack[trackId]]
      : [...notes]
    const updated = existing.filter((_, i) => i !== noteIndex)
    const nextMap = updateNotesMap(notesByTrack, trackId, updated)
    setNotesByTrack(nextMap)
    setTracks(prev =>
      prev.map(t => {
        if (t.id !== trackId) return t
        return { ...t, notes: [...updated] }
      })
    )

    const id = makePendingId(trackId, noteIndex)
    scheduleInlineUndo(id, {
      trackId,
      note: noteToDelete,
      index: noteIndex,
      restoreFocusId: `del-btn-${trackId}-${noteIndex}`,
      fallbackFocusId: `add-note-btn-${trackId}`,
    })
    announce('Note deleted. Press Undo to restore')
  }

  const hasPlaylist = Array.isArray(tracks) && tracks.length > 0

  // Helper to hide the mock prefix from SRs but keep it visible
  return (
    <div className="app">
      {/* Screen reader announcements */}
      <LiveRegion message={announceMsg} />

      {showMigrationNotice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            background: 'var(--surface, #0f1115)',
            color: 'var(--fg, #ffffff)',
            padding: '12px 16px',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.16))',
            zIndex: 30,
          }}
        >
          Finishing upgrade in the background...
        </div>
      )}

      <header style={{ maxWidth: 880, margin: '20px auto 0', padding: '0 16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <h1 className="app-title">Playlist Notes</h1>
          <div className="app-header__actions">
            <nav className="app-nav" aria-label="Primary navigation">
              <button
                type="button"
                className={`app-nav__btn${screen === 'landing' ? ' is-active' : ''}`}
                onClick={() => setScreen('landing')}
                aria-current={screen === 'landing' ? 'page' : undefined}
              >
                Import
              </button>
              <button
                type="button"
                className={`app-nav__btn${screen === 'playlist' ? ' is-active' : ''}`}
                onClick={() => {
                  if (!hasPlaylist) return
                  setScreen('playlist')
                }}
                aria-current={screen === 'playlist' ? 'page' : undefined}
                disabled={!hasPlaylist}
                aria-disabled={!hasPlaylist ? 'true' : undefined}
              >
                Playlist
              </button>
              <button
                type="button"
                className={`app-nav__btn${screen === 'account' ? ' is-active' : ''}`}
                onClick={() => setScreen('account')}
                aria-current={screen === 'account' ? 'page' : undefined}
              >
                Account
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: '24px auto 60px', padding: '0 16px', paddingBottom: 128 }}>
        {screen === 'account' ? (
          <AccountView
            anonId={anonContext?.anonId}
            deviceId={anonContext?.deviceId}
            recoveryCode={recoveryCode}
            recoveryAcknowledgedAt={recoveryAckMeta?.acknowledgedAt ?? null}
            recoveryCopyButtonRef={recoveryCopyButtonRef}
            onCopyRecoveryCode={handleCopyRecoveryCode}
            onConfirmRegenerate={handleRegenerateRecoveryCode}
            regeneratingRecoveryCode={regeneratingRecovery}
            regenerationError={recoveryRotationError}
            onOpenRestoreDialog={openRestoreDialog}
            onOpenSpotifyLink={handleOpenSpotifyLink}
            spotifyLinked={false}
            spotifyAccountLabel=""
            emailLinkingEnabled={false}
            onRequestRecoveryModal={handleOpenRecoveryOptions}
            showBackupPrompt={showBackupReminder}
          />
        ) : (
          <>
            {screen === 'landing' && (
              <section aria-labelledby="landing-title">
                <h2 id="landing-title" style={{ marginTop: 0 }}>Get started</h2>
                <p style={{ color: 'var(--muted)' }}>
                  Paste a Spotify / YouTube / SoundCloud <strong>playlist</strong> URL to import a snapshot and start adding notes.
                </p>

                <form onSubmit={handleImport} aria-describedby={importError ? 'import-error' : undefined}>
                  <div style={{ display: 'grid', gap: 8, alignItems: 'start', gridTemplateColumns: '1fr auto' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="playlist-url" style={{ display: 'block', marginBottom: 6 }}>Playlist URL</label>
                      <input
                        id="playlist-url"
                        ref={importInputRef}
                        type="url"
                        inputMode="url"
                        placeholder="https://open.spotify.com/playlist/..."
                        autoComplete="off"
                        value={importUrl}
                        onChange={handleImportUrlChange}
                        style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)' }}
                        aria-invalid={!!importError}
                      />
                      <ErrorMessage id="import-error">
                        {importError}
                      </ErrorMessage>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="chip">
                        <span className="chip-dot" style={{ background: providerChip ? 'var(--accent, #4caf50)' : 'var(--border)' }} />
                        {providerChip ? providerChip : 'no match'}
                      </span>
                    </div>

                    <div style={{ justifySelf: 'end' }}>
                      <button
                        type="submit"
                        className="btn primary"
                        disabled={isAnyImportBusy}
                        aria-busy={showInitialSpinner ? 'true' : 'false'}
                      >
                        {showInitialSpinner ? 'Importing...' : 'Import playlist'}
                      </button>
                    </div>
                  </div>
                </form>

                <RecentPlaylists
                  items={recentPlaylists}
                  onSelect={handleSelectRecent}
                  cardState={recentCardState}
                  disabled={isAnyImportBusy}
                />
              </section>
            )}

            {screen === 'playlist' && (
              <PlaylistView
                playlistTitle={playlistTitle}
                importedAt={importedAt}
                importMeta={importMeta}
                tracks={tracks}
                isAnyImportBusy={isAnyImportBusy}
                showReimportSpinner={showReimportSpinner}
                showLoadMoreSpinner={showLoadMoreSpinner}
                pending={pending}
                isPending={isPending}
                editingState={{ editingId, draft, error }}
                onDraftChange={handleDraftChange}
                onAddNote={onAddNote}
                onSaveNote={onSaveNote}
                onCancelNote={onCancelNote}
                onDeleteNote={onDeleteNote}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                stockTags={STOCK_TAGS}
                customTags={allCustomTags}
                onUndo={undoInline}
                onDismissUndo={expireInline}
                onReimport={handleReimport}
                onClear={handleClearAll}
                onBack={handleBackToLanding}
                canReimport={Boolean(lastImportUrl)}
                reimportBtnRef={reimportBtnRef}
                loadMoreBtnRef={loadMoreBtnRef}
                onLoadMore={handleLoadMore}
                announce={announce}
                backgroundSync={backgroundSync}
                skipFocusManagement={skipPlaylistFocusManagement}
                focusContext={trackFocusContext}
                onFirstVisibleTrackChange={handleFirstVisibleTrackChange}
              />
            )}
          </>
        )}
      </main>

      <footer style={{ maxWidth: 880, margin: '0 auto 24px', padding: '0 16px', color: 'var(--muted)', paddingBottom: 96 }}>
        <small>Prototype - Keyboard-first, accessible-by-default</small>
      </footer>
      <div
        role="region"
        aria-label="Note backup controls"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: '100%',
          background: 'var(--surface, #0f1115)',
          borderTop: '1px solid var(--border, rgba(255,255,255,0.1))',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="btn" onClick={handleBackupNotes}>
            Backup Notes
          </button>
          <button type="button" className="btn" onClick={handleRestoreNotesRequest}>
            Restore Notes
          </button>
        </div>
      </div>
      <RecoveryModal
        open={showRecoveryModal}
        code={recoveryCode}
        onAcknowledge={handleRecoveryModalConfirm}
        onCopy={() => announce('Recovery code copied.')}
        onDownload={() => announce('Recovery code downloaded.')}
      />
      <RestoreDialog
        open={restoreDialogOpen}
        onClose={closeRestoreDialog}
        onSubmit={handleRestoreSubmit}
        onRequestBackup={handleBackupNotes}
        busy={restoreBusy}
        error={restoreError}
        hasLocalNotes={hasLocalNotes}
      />
      <input
        ref={backupFileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleImportNotesFromFile}
      />
    </div>
  )
}
