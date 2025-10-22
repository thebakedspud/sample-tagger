// src/App.jsx
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import RecoveryModal from './components/RecoveryModal.jsx'
import RestoreDialog from './components/RestoreDialog.jsx'
import { loadAppState, saveAppState, clearAppState } from './utils/storage.js'
import { focusById } from './utils/focusById.js'
import './styles/tokens.css';
import './styles/primitives.css';
import './styles/app.css';
import useAnnounce from './features/a11y/useAnnounce.js'
import { Analytics } from '@vercel/analytics/react'

// NEW: inline undo
import useInlineUndo from './features/undo/useInlineUndo.js'
import PlaylistView from './features/playlist/PlaylistView.jsx'

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
  clearDeviceContext,
} from './lib/deviceState.js'

// -- Derive initial state from storage (v3 structured: { importMeta, tracks, ... })
const persisted = loadAppState()
const INITIAL_NOTES_MAP = createInitialNotesMap(persisted)
const HAS_VALID_PLAYLIST = !!(persisted?.importMeta?.provider && persisted?.tracks?.length)
const INITIAL_SCREEN = HAS_VALID_PLAYLIST ? 'playlist' : 'landing'

// Safe default importMeta shape (mirrors storage v3)
const EMPTY_IMPORT_META = {
  provider: null,
  playlistId: null,
  snapshotId: null,
  cursor: null,
  hasMore: false,
  sourceUrl: '',
  debug: null,
}

// Handy helper so we never explode on undefined notes
function getNotes(t) {
  return Array.isArray(t?.notes) ? t.notes : [];
}

function normalizeNotesList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const out = [];
  value.forEach((note) => {
    if (typeof note !== 'string') return;
    const trimmed = note.trim();
    if (!trimmed) return;
    out.push(trimmed);
  });
  return out;
}

function hasOwn(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function cloneNotesMap(source) {
  const out = Object.create(null);
  if (!source || typeof source !== 'object') return out;
  Object.entries(source).forEach(([key, raw]) => {
    const id = typeof key === 'string' ? key : String(key);
    if (!id) return;
    const cleaned = normalizeNotesList(raw);
    if (cleaned.length > 0) {
      out[id] = cleaned;
    }
  });
  return out;
}

function createInitialNotesMap(state) {
  const fromState = cloneNotesMap(state?.notesByTrack);
  if (Array.isArray(state?.tracks)) {
    state.tracks.forEach((track) => {
      if (!track || typeof track !== 'object') return;
      const id = track.id;
      if (!id || hasOwn(fromState, id)) return;
      const cleaned = normalizeNotesList(track.notes);
      if (cleaned.length > 0) {
        fromState[id] = cleaned;
      }
    });
  }
  return fromState;
}

function ensureNotesEntries(baseMap, tracks) {
  const next = cloneNotesMap(baseMap);
  if (!Array.isArray(tracks)) return next;
  tracks.forEach((track) => {
    if (!track || typeof track !== 'object') return;
    const id = track.id;
    if (!id || hasOwn(next, id)) return;
    next[id] = [];
  });
  return next;
}

function groupNotesByTrack(rows) {
  const map = Object.create(null);
  if (!Array.isArray(rows)) return map;
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const trackId = typeof row.trackId === 'string' ? row.trackId : row.track_id;
    const body = typeof row.body === 'string' ? row.body : null;
    if (!trackId || !body) return;
    if (!Array.isArray(map[trackId])) map[trackId] = [];
    map[trackId].push(body);
  });
  return map;
}

function mergeRemoteNotes(localMap, remoteMap) {
  const merged = cloneNotesMap(localMap);
  Object.entries(remoteMap).forEach(([trackId, remoteNotes]) => {
    if (!Array.isArray(remoteNotes) || remoteNotes.length === 0) return;
    if (!hasOwn(merged, trackId) || merged[trackId].length === 0) {
      merged[trackId] = [...remoteNotes];
    }
  });
  return merged;
}

function attachNotesToTracks(trackList, notesMap) {
  if (!Array.isArray(trackList)) return [];
  const safeMap = notesMap || Object.create(null);
  return trackList.map((track) => {
    if (!track || typeof track !== 'object') return track;
    const id = track.id;
    const mappedNotes = id && hasOwn(safeMap, id) ? [...safeMap[id]] : normalizeNotesList(track.notes);
    return { ...track, notes: mappedNotes };
  });
}

function updateNotesMap(baseMap, trackId, nextNotes) {
  const map = cloneNotesMap(baseMap);
  if (!trackId) return map;
  if (Array.isArray(nextNotes) && nextNotes.length > 0) {
    map[trackId] = [...nextNotes];
  } else if (hasOwn(map, trackId)) {
    delete map[trackId];
  }
  return map;
}

export default function App() {
  const [anonContext, setAnonContext] = useState(() => ({
    deviceId: getDeviceId(),
    anonId: getAnonId(),
  }))
  const initialRecoveryCode = getStoredRecoveryCode()
  const initialRecoveryAcknowledged = initialRecoveryCode
    ? hasAcknowledgedRecovery(initialRecoveryCode)
    : false
  const [recoveryCode, setRecoveryCode] = useState(initialRecoveryCode)
  const [showRecoveryModal, setShowRecoveryModal] = useState(
    Boolean(initialRecoveryCode) && !initialRecoveryAcknowledged
  )
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState(null)
  const [bootstrapError, setBootstrapError] = useState(null)
  // SIMPLE "ROUTING"
  const [screen, setScreen] = useState(INITIAL_SCREEN)

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
  const [playlistTitle, setPlaylistTitle] = useState(persisted?.playlistTitle ?? 'My Playlist')
  const [importedAt, setImportedAt] = useState(persisted?.importedAt ?? null)
  const [lastImportUrl, setLastImportUrl] = useState(
    persisted?.lastImportUrl ?? (persisted?.importMeta?.sourceUrl ?? '')
  )

  const [notesByTrack, setNotesByTrack] = useState(() => ensureNotesEntries(INITIAL_NOTES_MAP, persisted?.tracks ?? []))
  const hasLocalNotes = useMemo(
    () =>
      Object.values(notesByTrack || {}).some(
        (value) => Array.isArray(value) && value.length > 0
      ),
    [notesByTrack]
  )

  // DATA - normalize persisted tracks so notes always exist
  const [tracks, setTracks] = useState(() =>
    attachNotesToTracks(persisted?.tracks ?? [], notesByTrack)
  )
  const tracksRef = useRef(tracks)

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)

  // Remember which button opened the editor
  const editorInvokerRef = useRef(null)
  const notesByTrackRef = useRef(notesByTrack)
  const backupFileInputRef = useRef(null)

  useEffect(() => {
    notesByTrackRef.current = notesByTrack
  }, [notesByTrack])

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
        if (hasAcknowledgedRecovery(normalizedCode)) {
          setShowRecoveryModal(false)
        } else {
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
    setShowRecoveryModal(false)
    announce('Recovery code saved. You can now continue.')
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
        setRecoveryCode(normalized)
        setShowRecoveryModal(false)

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
        const remoteMap = groupNotesByTrack(payload?.notes)
        if (!remoteMap || Object.keys(remoteMap).length === 0) {
          return
        }
        setNotesByTrack((prev) =>
          ensureNotesEntries(mergeRemoteNotes(prev, remoteMap), tracksRef.current)
        )
        setTracks((prev) =>
          prev.map((track) => {
            const remoteNotes = remoteMap[track.id]
            if (!remoteNotes || remoteNotes.length === 0) return track
            const existingNotes = Array.isArray(track.notes) ? track.notes : []
            if (existingNotes.length > 0) return track
            return { ...track, notes: [...remoteNotes] }
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

  // -- PERSISTENCE: save whenever core state changes (v3 structured shape)
  useEffect(() => {
    saveAppState({
      playlistTitle,
      importedAt,
      lastImportUrl,
      tracks,
      importMeta,
      notesByTrack,
    })
  }, [playlistTitle, importedAt, lastImportUrl, tracks, importMeta, notesByTrack])

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
  function msgFromCode(code) {
    return ERROR_MAP[code] ?? ERROR_MAP[CODES.ERR_UNKNOWN] ?? 'Something went wrong. Please try again.'
  }

  // IMPORT handlers
  const handleImport = async (e) => {
    e?.preventDefault?.()
    setImportError(null)
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

      const { tracks: mapped, meta, title, importedAt: importedTimestamp } = result.data
      const nextNotesMap = ensureNotesEntries(notesByTrackRef.current, mapped)
      setNotesByTrack(nextNotesMap)
      setTracks(attachNotesToTracks(mapped, nextNotesMap))
      setImportMeta({
        ...EMPTY_IMPORT_META,
        ...meta,
      })
      setPlaylistTitle(title || 'Imported Playlist')
      setImportedAt(importedTimestamp)
      setLastImportUrl(trimmedUrl)
      setScreen('playlist')
      announce('Playlist imported. ' + mapped.length + ' tracks.')

      requestAnimationFrame(() => {
        if (mapped.length > 0) {
          focusById('add-note-btn-' + mapped[0].id)
        }
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

  const handleReimport = async () => {
    if (!lastImportUrl) return
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

      const { tracks: mapped, meta, title, importedAt: importedTimestamp } = result.data
      const nextNotesMap = ensureNotesEntries(notesByTrackRef.current, mapped)
      setNotesByTrack(nextNotesMap)
      setTracks(attachNotesToTracks(mapped, nextNotesMap))
      setImportMeta({
        ...EMPTY_IMPORT_META,
        ...meta,
      })
      setPlaylistTitle(title || playlistTitle || 'Imported Playlist')
      setImportedAt(importedTimestamp)
      announce('Playlist re-imported. ' + mapped.length + ' tracks available.')
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

  const handleLoadMore = async () => {
    if (!importMeta.cursor || !importMeta.provider || !lastImportUrl) {
      return
    }

    setImportError(null)
    announce('Loading more tracks.')
    try {
      const existingIds = tracks.map(t => t.id)
      const result = await loadMoreTracks({
        providerHint: importMeta.provider ?? null,
        existingMeta: importMeta,
        startIndex: tracks.length,
        existingIds,
        sourceUrl: lastImportUrl,
      })

      if (result?.stale) return

      if (!result.ok) {
        const code = result.code ?? CODES.ERR_UNKNOWN
        const msg = msgFromCode(code)
        console.log('[load-more error]', { code, raw: result.error })
        setImportError(msg)
        announce(msg)
        return
      }

      const additions = result.data.tracks
      const meta = result.data.meta ?? {}

      if (!additions.length) {
        setImportMeta(prev => ({
          ...prev,
          ...meta,
        }))
        announce('No additional tracks available.')
        return
      }

      const nextNotesMap = ensureNotesEntries(notesByTrackRef.current, additions)
      setNotesByTrack(nextNotesMap)
      const additionsWithNotes = attachNotesToTracks(additions, nextNotesMap)
      setTracks(prev => [...prev, ...additionsWithNotes])
      setImportMeta(prev => ({
        ...prev,
        ...meta,
      }))
      setImportedAt(new Date().toISOString())
      const firstNewId = additions[0]?.id
      if (firstNewId) {
        focusById(`track-${firstNewId}`)
      } else {
        requestAnimationFrame(() => {
          loadMoreBtnRef.current?.focus()
        })
      }
      announce(additions.length + ' more tracks loaded.')
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const code = extractErrorCode(err)
        const msg = msgFromCode(code)
        console.log('[load-more error]', { code, raw: err })
        setImportError(msg)
        announce(msg)
      }
    }
  }

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
      }
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const timestamp = new Date().toISOString().replace(/[:]/g, '-')
      const suggestedName = `sample-tagger-notes-${timestamp}.json`

      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          const picker = /** @type {any} */ (window).showSaveFilePicker
          const handle = await picker({
            suggestedName,
            types: [
              {
                description: 'Sample Tagger notes backup',
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
      const nextMap = ensureNotesEntries(merged, tracks)
      setNotesByTrack(nextMap)
      setTracks(prev => attachNotesToTracks(prev, nextMap))
      announce('Notes restored from backup.')
    } catch (err) {
      console.error('[notes restore error]', err)
      announce('Restore failed. Please verify the file.')
    } finally {
      if (input) input.value = ''
    }
  }

  const handleClearAll = () => {
    // Reset transient UI and timers
    clearInlineUndo()
    setEditingId(null); setDraft(''); setError(null)
    setImportError(null)
    // Clear persisted data
    clearAppState()
    clearDeviceContext()
    setAnonContext({ deviceId: null, anonId: null })
    setRecoveryCode(null)
    setShowRecoveryModal(false)
    setRestoreDialogOpen(false)
    setRestoreError(null)
    setRestoreBusy(false)
    bootstrapDevice()

    // Reset in-memory app state
    setNotesByTrack(Object.create(null))
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

  // Helper to hide the mock prefix from SRs but keep it visible
  return (
    <div className="app">
      {/* Screen reader announcements */}
      <LiveRegion message={announceMsg} />

      <header style={{ maxWidth: 880, margin: '20px auto 0', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Sample Tagger</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="btn" onClick={openRestoreDialog}>
              Have a code?
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: '24px auto 60px', padding: '0 16px', paddingBottom: 128 }}>
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
                  {importError && (
                    <div id="import-error" className="error-text" style={{ marginTop: 6 }}>
                      {importError}
                    </div>
                  )}
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
            onUndo={undoInline}
            onDismissUndo={expireInline}
            onReimport={handleReimport}
            onClear={handleClearAll}
            onBack={handleBackToLanding}
            canReimport={Boolean(lastImportUrl)}
            reimportBtnRef={reimportBtnRef}
            loadMoreBtnRef={loadMoreBtnRef}
            onLoadMore={handleLoadMore}
          />
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
        onCopy={() => announce('Recovery code copied to clipboard.')}
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
      <Analytics />
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
