// src/App.jsx
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import LiveRegion from './components/LiveRegion.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import FontSettings from './components/display/FontSettings.jsx'
import RecoveryModal from './components/RecoveryModal.jsx'
import RestoreDialog from './components/RestoreDialog.jsx'
import RecentPlaylists from './features/recent/RecentPlaylists.jsx'
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
import { createTagSyncScheduler } from './features/tags/tagSyncQueue.js'
import { focusById } from './utils/focusById.js'
import './styles/tokens.css';
import './styles/primitives.css';
import './styles/app.css';
import useAnnounce from './features/a11y/useAnnounce.js'

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
const pendingMigrationSnapshot = getPendingMigrationSnapshot()
const INITIAL_NOTES_MAP = createInitialNotesMap(persisted)
const INITIAL_TAGS_MAP = createInitialTagsMap(persisted)
const HAS_VALID_PLAYLIST = !!(persisted?.importMeta?.provider && persisted?.tracks?.length)
const INITIAL_SCREEN = HAS_VALID_PLAYLIST ? 'playlist' : 'landing'
const persistedRecents = Array.isArray(persisted?.recentPlaylists) ? [...persisted.recentPlaylists] : null
const loadedRecents = persistedRecents ?? loadRecent()
const INITIAL_RECENTS = Array.isArray(loadedRecents) ? [...loadedRecents] : []

const MAX_TAGS_PER_TRACK = 32
const MAX_TAG_LENGTH = 24
const TAG_ALLOWED_RE = /^[a-z0-9][a-z0-9\s\-_]*$/

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

function normalizeTagList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  value.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized || normalized.length > MAX_TAG_LENGTH) return;
    if (!TAG_ALLOWED_RE.test(normalized)) return;
    if (seen.has(normalized)) return;
    if (out.length >= MAX_TAGS_PER_TRACK) return;
    seen.add(normalized);
    out.push(normalized);
  });
  out.sort();
  return out;
}

function cloneTagsMap(source) {
  const out = Object.create(null);
  if (!source || typeof source !== 'object') return out;
  Object.entries(source).forEach(([key, raw]) => {
    const id = typeof key === 'string' ? key : String(key);
    if (!id) return;
    const cleaned = normalizeTagList(raw);
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

function createInitialTagsMap(state) {
  const fromState = cloneTagsMap(state?.tagsByTrack);
  if (Array.isArray(state?.tracks)) {
    state.tracks.forEach((track) => {
      if (!track || typeof track !== 'object') return;
      const id = track.id;
      if (!id || hasOwn(fromState, id)) return;
      const cleaned = normalizeTagList(track.tags);
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

function groupRemoteNotes(rows) {
  const noteMap = Object.create(null);
  const tagMap = Object.create(null);
  if (!Array.isArray(rows)) return { notes: noteMap, tags: tagMap };
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const trackId =
      typeof row.trackId === 'string' ? row.trackId : row.track_id;
    if (!trackId) return;
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    if (body) {
      if (!Array.isArray(noteMap[trackId])) noteMap[trackId] = [];
      noteMap[trackId].push(body);
    }
    if ('tags' in row) {
      const cleaned = normalizeTagList(row.tags);
      tagMap[trackId] = cleaned;
    }
  });
  return { notes: noteMap, tags: tagMap };
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

function mergeRemoteTags(localMap, remoteMap) {
  const merged = cloneTagsMap(localMap);
  Object.entries(remoteMap).forEach(([trackId, remoteTags]) => {
    merged[trackId] = Array.isArray(remoteTags) ? [...remoteTags] : [];
  });
  return merged;
}

function ensureTagsEntries(baseMap, tracks) {
  const next = cloneTagsMap(baseMap);
  if (!Array.isArray(tracks)) return next;
  tracks.forEach((track) => {
    if (!track || typeof track !== 'object') return;
    const id = track.id;
    if (!id || hasOwn(next, id)) return;
    next[id] = [];
  });
  return next;
}

function attachNotesToTracks(trackList, notesMap, tagsMap) {
  if (!Array.isArray(trackList)) return [];
  const safeMap = notesMap || Object.create(null);
  const safeTags = tagsMap || Object.create(null);
  return trackList.map((track) => {
    if (!track || typeof track !== 'object') return track;
    const id = track.id;
    const mappedNotes = id && hasOwn(safeMap, id) ? [...safeMap[id]] : normalizeNotesList(track.notes);
    const mappedTags = id && hasOwn(safeTags, id) ? [...safeTags[id]] : normalizeTagList(track.tags);
    return { ...track, notes: mappedNotes, tags: mappedTags };
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

function updateTagsMap(baseMap, trackId, nextTags) {
  const map = cloneTagsMap(baseMap);
  if (!trackId) return map;
  if (Array.isArray(nextTags) && nextTags.length > 0) {
    map[trackId] = [...nextTags];
  } else if (hasOwn(map, trackId)) {
    delete map[trackId];
  }
  return map;
}

function normalizeTimestamp(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? Math.trunc(ms) : null
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : Math.trunc(parsed)
  }
  return null
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
  const [showMigrationNotice, setShowMigrationNotice] = useState(Boolean(pendingMigrationSnapshot))
  const migrationSnapshotRef = useRef(pendingMigrationSnapshot)
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

  const [notesByTrack, setNotesByTrack] = useState(() =>
    ensureNotesEntries(INITIAL_NOTES_MAP, persisted?.tracks ?? []))
  const [tagsByTrack, setTagsByTrack] = useState(() =>
    ensureTagsEntries(INITIAL_TAGS_MAP, persisted?.tracks ?? []))
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
    attachNotesToTracks(persisted?.tracks ?? [], notesByTrack, tagsByTrack)
  )
  const tracksRef = useRef(tracks)

  const [recentPlaylists, setRecentPlaylists] = useState(() => INITIAL_RECENTS)
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

      const mapped = Array.isArray(payload?.tracks) ? payload.tracks : []
      const meta = payload?.meta ?? {}
      const importedTimestamp = payload?.importedAt ?? null
      const resolvedTitle = payload?.title || fallbackTitle || 'Imported Playlist'

      const nextNotesMap = ensureNotesEntries(notesByTrackRef.current, mapped)
      const nextTagsMap = ensureTagsEntries(tagsByTrackRef.current, mapped)
      setNotesByTrack(nextNotesMap)
      setTagsByTrack(nextTagsMap)
      setTracks(attachNotesToTracks(mapped, nextNotesMap, nextTagsMap))
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

      const trackCount = mapped.length
      const message =
        typeof announceMessage === 'string'
          ? announceMessage
          : `Playlist imported. ${trackCount} tracks.`
      announce(message)

      requestAnimationFrame(() => {
        if (focusBehavior === 'heading') {
          focusById('playlist-title')
          return
        }
        if (trackCount > 0 && mapped[0]?.id) {
          focusById('add-note-btn-' + mapped[0].id)
        } else {
          focusById('playlist-title')
        }
      })

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

      return { trackCount, title: resolvedTitle }
    },
    [announce, pushRecentPlaylist]
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
      const nextTagsMap = ensureTagsEntries(tagsByTrackRef.current, additions)
      setNotesByTrack(nextNotesMap)
      setTagsByTrack(nextTagsMap)
      const additionsWithNotes = attachNotesToTracks(additions, nextNotesMap, nextTagsMap)
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
        tagsByTrack: cloneTagsMap(tagsByTrackRef.current),
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
      setTracks(prev => attachNotesToTracks(prev, nextMap, nextTagsMap))
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Sample Tagger</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="btn" onClick={openRestoreDialog}>
              Have a code?
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: '24px auto 60px', padding: '0 16px', paddingBottom: 128 }}>
        <section aria-labelledby="display-settings-title" className="card font-settings-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 id="display-settings-title" style={{ margin: '0 0 4px' }}>
                Display
              </h2>
              <p style={{ margin: 0, color: 'var(--muted)' }}>Theme and font preferences</p>
            </div>
            <ThemeToggle />
          </div>
          <FontSettings />
        </section>

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
