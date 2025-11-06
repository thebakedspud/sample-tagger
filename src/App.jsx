// src/App.jsx
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import RecoveryModal from './components/RecoveryModal.jsx'
import RestoreDialog from './components/RestoreDialog.jsx'
import RecentPlaylists from './features/recent/RecentPlaylists.jsx'
import ErrorMessage from './components/ErrorMessage.jsx'
import {
  saveAppState,
  clearAppState,
  clearPendingMigrationSnapshot,
  writeAutoBackupSnapshot,
  stashPendingMigrationSnapshot,
  saveRecent,
  upsertRecent,
} from './utils/storage.js'
import { normalizeTag } from './features/tags/tagUtils.js'
import { STOCK_TAGS } from './features/tags/constants.js'
import { MAX_TAG_LENGTH, MAX_TAGS_PER_TRACK, TAG_ALLOWED_RE } from './features/tags/validation.js'
import {
  getNotes,
  normalizeNotesList,
  cloneNotesMap,
  normalizeTagList,
  cloneTagsMap,
  ensureNotesEntries,
  ensureTagsEntries,
  groupRemoteNotes,
} from './utils/notesTagsData.js'
import { bootstrapStorageState, EMPTY_IMPORT_META } from './utils/storageBootstrap.js'
import { createRecentCandidate } from './features/recent/recentUtils.js'

/** @typedef {import('./features/import/adapters/types.js').ImportMeta} ImportMeta */
/** @typedef {import('./features/import/adapters/types.js').ImportResult} ImportResult */
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
import useDeviceRecovery from './features/account/useDeviceRecovery.js'

// Extracted helpers
import usePlaylistImportController from './features/import/usePlaylistImportController.js'
import { apiFetch } from './lib/apiClient.js'
import { getDeviceId, getAnonId } from './lib/deviceState.js'

// NEW: Playlist state reducer + context provider
import { playlistActions } from './features/playlist/actions.js'
import { createNoteSnapshot, validateTag } from './features/playlist/helpers.js'
import { PlaylistStateProvider } from './features/playlist/PlaylistProvider.jsx'
import {
  usePlaylistDispatch,
  usePlaylistTracks,
  usePlaylistNotesByTrack,
  usePlaylistTagsByTrack,
  usePlaylistEditingState,
  usePlaylistDerived,
  usePlaylistSync,
} from './features/playlist/usePlaylistContext.js'
import buildInitialPlaylistState from './features/playlist/buildInitialPlaylistState.js'

/**
 * @typedef {'idle' | 'pending' | 'loading' | 'cooldown' | 'complete' | 'error'} BackgroundSyncStatus
 * @typedef {{ status: BackgroundSyncStatus, loaded: number, total: number|null, lastError: string|null, snapshotId?: string|null }} BackgroundSyncState
 */

/**
 * Inner component that consumes playlist state from context
 * @param {{ persisted: any, pendingMigrationSnapshot: any, initialRecents: any, persistedTracks: any, initialScreen: string, onAnonContextChange: Function }} props
 */
function AppInner({ persisted, pendingMigrationSnapshot, initialRecents, persistedTracks, initialScreen, onAnonContextChange }) {
  const [showMigrationNotice, setShowMigrationNotice] = useState(Boolean(pendingMigrationSnapshot))
  const migrationSnapshotRef = useRef(pendingMigrationSnapshot)
  
  // SIMPLE "ROUTING"
  const [screen, setScreen] = useState(
    /** @type {'landing' | 'playlist' | 'account'} */ (initialScreen)
  )

  const { message: announceMsg, announce } = useAnnounce({ debounceMs: 60 })

  // IMPORT state
  const importInputRef = useRef(null)
  const initialImportMeta = useMemo(() => {
    const initialMeta = persisted?.importMeta ?? {}
    const sourceUrl = initialMeta.sourceUrl ?? (persisted?.lastImportUrl ?? '')
    return /** @type {ImportMeta} */ ({
      ...EMPTY_IMPORT_META,
      ...initialMeta,
      sourceUrl,
      hasMore: Boolean(initialMeta.cursor || initialMeta.hasMore),
    })
  }, [persisted])
  
  const [playlistTitle, setPlaylistTitle] = useState(persisted?.playlistTitle ?? 'My Playlist')
  const [importedAt, setImportedAt] = useState(persisted?.importedAt ?? null)
  const [lastImportUrl, setLastImportUrl] = useState(
    persisted?.lastImportUrl ?? (persisted?.importMeta?.sourceUrl ?? '')
  )
  const lastImportUrlRef = useRef(lastImportUrl)
  useEffect(() => {
    lastImportUrlRef.current = lastImportUrl
  }, [lastImportUrl])

  // NEW: Consume playlist state from context
  const dispatch = usePlaylistDispatch()
  const tracks = usePlaylistTracks()
  const notesByTrack = usePlaylistNotesByTrack()
  const tagsByTrack = usePlaylistTagsByTrack()
  const editingState = usePlaylistEditingState()
  const { hasLocalNotes, allCustomTags } = usePlaylistDerived()
  const { trackId: editingId, draft, error: editingError } = editingState
  const { syncTrackTags } = usePlaylistSync()
  const tracksRef = useRef(tracks)
  const [skipPlaylistFocusManagement, setSkipPlaylistFocusManagement] = useState(false)
  const firstVisibleTrackIdRef = useRef(null)
  const [trackFocusContext, setTrackFocusContext] = useState({ reason: null, ts: 0 })
  const initialFocusAppliedRef = useRef(false)
  const [recentPlaylists, setRecentPlaylists] = useState(() => initialRecents)
  /** @type {import('react').MutableRefObject<typeof initialRecents>} */
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

  const reimportBtnRef = useRef(null)
  const loadMoreBtnRef = useRef(null)

  const {
    importUrl,
    setImportUrl,
    importError,
    setImportError,
    providerChip,
    importMeta,
    setImportMeta,
    isAnyImportBusy,
    showInitialSpinner,
    showReimportSpinner,
    showLoadMoreSpinner,
    handleImport,
    handleSelectRecent,
    handleReimport,
    handleLoadMore,
    cancelBackgroundPagination,
    backgroundSync,
    resetImportFlow,
  } = usePlaylistImportController({
    dispatch,
    announce,
    tracks,
    tracksRef,
    notesByTrack,
    tagsByTrack,
    setScreen,
    pushRecentPlaylist,
    updateRecentCardState,
    setSkipPlaylistFocusManagement,
    markTrackFocusContext,
    firstVisibleTrackIdRef,
    initialFocusAppliedRef,
    importInputRef,
    reimportBtnRef,
    loadMoreBtnRef,
    lastImportUrlRef,
    setPlaylistTitle,
    setImportedAt,
    setLastImportUrl,
    playlistTitle,
    screen,
    lastImportUrl,
    initialImportMeta,
    initialPersistedTrackCount: Array.isArray(persistedTracks) ? persistedTracks.length : 0,
  })

  // OLD: These state variables moved to playlistReducer
  // const [editingId, setEditingId] = useState(null)
  // const [draft, setDraft] = useState('')
  // const [error, setError] = useState(null)

  // Remember which button opened the editor
  const editorInvokerRef = useRef(null)
  const notesByTrackRef = useRef(notesByTrack)
  const tagsByTrackRef = useRef(tagsByTrack)
  const backupFileInputRef = useRef(null)

  // Sync refs when state changes
  useEffect(() => {
    notesByTrackRef.current = notesByTrack
  }, [notesByTrack])

  useEffect(() => {
    tagsByTrackRef.current = tagsByTrack
  }, [tagsByTrack])

  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

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
      
      // Restore note using reducer
      dispatch(playlistActions.restoreNote(trackId, note, index))
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
  // Device & Recovery Management
  const {
    deviceId,
    anonId,
    recoveryCode,
    recoveryAcknowledgedAt,
    showRecoveryModal,
    restoreDialogOpen,
    showBackupReminder,
    bootstrapError,
    restoreBusy,
    restoreError,
    regeneratingRecovery,
    recoveryRotationError,
    acknowledgeRecoveryModal,
    openRecoveryModal,
    copyRecoveryCode,
    regenerateRecoveryCode,
    openRestoreDialog,
    closeRestoreDialog,
    submitRestore,
    recoveryCopyButtonRef,
  } = useDeviceRecovery({
    announce,
    onAppReset: useCallback(
      async ({ announcement, screenTarget }) => {
        // Clear all app state
        clearAppState()
        
        // Reset playlist state via reducer
        dispatch(playlistActions.resetState())
        
        setImportMeta({ ...EMPTY_IMPORT_META })
        setPlaylistTitle('My Playlist')
        setImportedAt(null)
        setLastImportUrl('')
        setImportUrl('')
        resetImportFlow()
        setScreen(screenTarget ?? 'landing')

        if (announcement) announce(announcement)
      },
      [announce, resetImportFlow, dispatch, setImportMeta, setPlaylistTitle, setImportedAt, setLastImportUrl, setImportUrl, setScreen]
    ),
  })

  // Update parent's anonContext when device recovery changes
  useEffect(() => {
    onAnonContextChange({ deviceId, anonId })
  }, [deviceId, anonId, onAnonContextChange])

  // Reconstruct anonContext for local use (backup/restore flows)
  const anonContext = useMemo(
    () => ({ deviceId, anonId }),
    [deviceId, anonId]
  )

  const handleOpenSpotifyLink = useCallback(() => {
    announce('Spotify linking is coming soon.')
  }, [announce])

  // REIMPORT focus pattern
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator?.storage?.persist) {
      navigator.storage.persist().catch(() => { /* best effort */ })
    }
  }, [])

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

  // Remote sync effect moved to PlaylistProvider

  // tagSyncSchedulerRef moved to PlaylistProvider

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
      dispatch(playlistActions.cancelNoteEdit())
    }
  }, [tracks, editingId, dispatch])

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
  const handleDraftChange = (value) => { dispatch(playlistActions.changeDraft(value)) }
  function handleBackToLanding() { setScreen('landing') }

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
      
      // Update via reducer
      dispatch(playlistActions.setTracksWithNotes(
        tracks,
        nextMap,
        nextTagsMap,
        tracks,
        null
      ))
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
    setImportError(null)
    // Clear persisted data
    clearAppState()

    // Reset playlist state via reducer
    dispatch(playlistActions.resetState())
    
    // Reset other app state
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

  // sendTagUpdate, tag sync scheduler, and syncTrackTags moved to PlaylistProvider

  const handleAddTag = useCallback(
    (trackId, tag) => {
      // Get existing tags for validation
      const existingTags = tagsByTrack[trackId] || []
      
      // Validate before dispatching (no try/catch control flow)
      const validation = validateTag(tag, existingTags, MAX_TAGS_PER_TRACK, MAX_TAG_LENGTH)
      
      if (!validation.valid) {
        announce(validation.error || 'Invalid tag.')
        return false
      }
      
      const normalized = validation.normalized
      
      // Dispatch action (validation passed)
      dispatch(playlistActions.addTag(trackId, normalized, existingTags))
      
      // Success feedback
      const title = tracks.find((t) => t.id === trackId)?.title ?? 'this track'
      announce(`Added tag "${normalized}" to "${title}".`)
      
      // Sync to remote
      if (anonContext?.deviceId) {
        const updatedTags = [...existingTags, normalized]
        syncTrackTags(trackId, updatedTags).catch(() => {
          announce('Tag sync failed. Changes are saved locally.')
        })
      }
      return true
    },
    [announce, anonContext?.deviceId, syncTrackTags, tagsByTrack, tracks, dispatch],
  )

  const handleRemoveTag = useCallback(
    (trackId, tag) => {
      const normalized = normalizeTag(tag)
      if (!trackId || !normalized) return
      
      const existing = tagsByTrack[trackId] || []
      if (existing.length === 0) return
      
      // Remove tag
      dispatch(playlistActions.removeTag(trackId, normalized))
      
      // Feedback
      const title = tracks.find((t) => t.id === trackId)?.title ?? 'this track'
      announce(`Removed tag "${normalized}" from "${title}".`)
      
      // Sync to remote
      if (anonContext?.deviceId) {
        const filtered = existing.filter((value) => value !== normalized)
        syncTrackTags(trackId, filtered).catch(() => {
          announce('Tag sync failed. Changes are saved locally.')
        })
      }
    },
    [announce, anonContext?.deviceId, syncTrackTags, tagsByTrack, tracks, dispatch],
  )

  const onAddNote = (trackId) => {
    dispatch(playlistActions.startNoteEdit(trackId))
    editorInvokerRef.current = document.getElementById(`add-note-btn-${trackId}`)
    setTimeout(() => { focusById(`note-input-${trackId}`) }, 0)
  }

  const onSaveNote = async (trackId) => {
    if (!draft.trim()) {
      announce('Note not saved. The note is empty.')
      dispatch(playlistActions.setEditingError('Note cannot be empty.'))
      return
    }
    const trimmed = draft.trim()
    // Create snapshot before optimistic update
    const snapshot = createNoteSnapshot(notesByTrack, trackId)
    
    // Optimistic update
    dispatch(playlistActions.saveNoteOptimistic(trackId, trimmed))
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
      // Rollback on failure (atomic update)
      dispatch(playlistActions.rollbackNoteSaveWithError(
        trackId, 
        snapshot.previousNotes, 
        'Failed to save note. Restored previous notes.'
      ))
      announce('Note save failed. Restored previous note list.')
    }
  }

  const onCancelNote = () => {
    dispatch(playlistActions.cancelNoteEdit())
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

    // Delete note
    dispatch(playlistActions.deleteNote(trackId, noteIndex))

    // Schedule undo
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
            anonId={anonId}
            deviceId={deviceId}
            recoveryCode={recoveryCode}
            recoveryAcknowledgedAt={recoveryAcknowledgedAt}
            recoveryCopyButtonRef={recoveryCopyButtonRef}
            onCopyRecoveryCode={copyRecoveryCode}
            onConfirmRegenerate={regenerateRecoveryCode}
            regeneratingRecoveryCode={regeneratingRecovery}
            regenerationError={recoveryRotationError}
            onOpenRestoreDialog={openRestoreDialog}
            onOpenSpotifyLink={handleOpenSpotifyLink}
            spotifyLinked={false}
            spotifyAccountLabel=""
            emailLinkingEnabled={false}
            onRequestRecoveryModal={openRecoveryModal}
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

                <form
                  onSubmit={(event) => {
                    void handleImport(event)
                  }}
                  aria-describedby={importError ? 'import-error' : undefined}
                >
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
                editingState={{ editingId, draft, error: editingError }}
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
                onReimport={() => {
                  void handleReimport()
                }}
                onClear={handleClearAll}
                onBack={handleBackToLanding}
                canReimport={Boolean(lastImportUrl)}
                reimportBtnRef={reimportBtnRef}
                loadMoreBtnRef={loadMoreBtnRef}
                onLoadMore={() => {
                  void handleLoadMore()
                }}
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
        onAcknowledge={acknowledgeRecoveryModal}
        onCopy={() => announce('Recovery code copied.')}
        onDownload={() => announce('Recovery code downloaded.')}
      />
      <RestoreDialog
        open={restoreDialogOpen}
        onClose={closeRestoreDialog}
        onSubmit={submitRestore}
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

/**
 * Middle layer - provides device context to playlist provider
 * @param {{ persisted: any, pendingMigrationSnapshot: any, initialRecents: any, persistedTracks: any, initialScreen: string, initialPlaylistStateWithData: any }} props
 */
function AppWithDeviceContext({ persisted, pendingMigrationSnapshot, initialRecents, persistedTracks, initialScreen, initialPlaylistStateWithData }) {
  // Get initial device context from device state module
  // This will be updated by useDeviceRecovery inside AppInner
  const [anonContext, setAnonContext] = useState(() => ({
    deviceId: getDeviceId(),
    anonId: getAnonId()
  }))

  return (
    <PlaylistStateProvider initialState={initialPlaylistStateWithData} anonContext={anonContext}>
      <AppInner
        persisted={persisted}
        pendingMigrationSnapshot={pendingMigrationSnapshot}
        initialRecents={initialRecents}
        persistedTracks={persistedTracks}
        initialScreen={initialScreen}
        onAnonContextChange={setAnonContext}
      />
    </PlaylistStateProvider>
  )
}

/**
 * Outer App component - bootstraps state and provides playlist context
 */
export default function App() {
  const bootstrapState = useMemo(bootstrapStorageState, [])
  // Centralised builder keeps playlist bootstrap logic in sync with reducer helpers
  const { initialPlaylistStateWithData } = useMemo(
    () => buildInitialPlaylistState(bootstrapState),
    [bootstrapState],
  )

  const {
    persisted,
    pendingMigrationSnapshot,
    initialRecents,
    persistedTracks,
    initialScreen,
  } = bootstrapState

  return (
    <AppWithDeviceContext
      persisted={persisted}
      pendingMigrationSnapshot={pendingMigrationSnapshot}
      initialRecents={initialRecents}
      persistedTracks={persistedTracks}
      initialScreen={initialScreen}
      initialPlaylistStateWithData={initialPlaylistStateWithData}
    />
  )
}
