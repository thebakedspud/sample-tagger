import { useCallback, useRef, useState } from 'react'
import useImportPlaylist from './useImportPlaylist.js'
import { extractErrorCode, CODES } from './adapters/types.js'

export const ImportFlowStatus = Object.freeze({
  IDLE: 'idle',
  IMPORTING: 'importing',
  REIMPORTING: 'reimporting',
  LOADING_MORE: 'loadingMore',
})

const DEFAULT_TITLE = 'Imported Playlist'

function toIsoNow() {
  return new Date().toISOString()
}

function ensureString(value) {
  if (value == null) return ''
  return String(value)
}

function buildTrackId(baseProvider, fallbackIndex) {
  const parts = []
  if (baseProvider) parts.push(baseProvider)
  if (fallbackIndex != null) parts.push(fallbackIndex)
  return parts.length > 0 ? parts.join('-') : `${fallbackIndex ?? ''}`.trim()
}

function buildTracks(res, providerHint, startIndex = 0, existingIds) {
  const provider = res?.provider ?? providerHint ?? null
  const rawTracks = Array.isArray(res?.tracks) ? res.tracks : []
  const seen = existingIds ? new Set(existingIds) : null

  const mapped = []

  rawTracks.forEach((track, idx) => {
    const fallbackIndex = startIndex + idx + 1
    const rawId = track?.id
    const candidateId = ensureString(rawId || buildTrackId(provider, fallbackIndex))
    if (seen && seen.has(candidateId)) return
    if (seen) seen.add(candidateId)

    mapped.push({
      id: candidateId,
      title: ensureString(track?.title || ''),
      artist: ensureString(track?.artist || ''),
      notes: [],
    })
  })

  return mapped
}

function buildMeta(res, fallback = {}) {
  const provider =
    res?.provider ??
    fallback.provider ??
    fallback.providerHint ??
    null

  const pageInfo = res?.pageInfo ?? {}
  const cursor = pageInfo?.cursor ?? null
  const hasMore = Boolean(pageInfo?.hasMore && cursor)

  return {
    provider,
    playlistId: res?.playlistId ?? fallback.playlistId ?? null,
    snapshotId: res?.snapshotId ?? fallback.snapshotId ?? null,
    cursor,
    hasMore,
    sourceUrl: res?.sourceUrl ?? fallback.sourceUrl ?? '',
    debug: res?.debug ?? fallback.debug ?? null,
  }
}

export default function usePlaylistImportFlow() {
  const { importPlaylist, importNext, loading, reset: resetImportSession } = useImportPlaylist()
  const [status, setStatus] = useState(ImportFlowStatus.IDLE)
  const [errorCode, setErrorCode] = useState(null)
  const requestIdRef = useRef(0)

  const beginRequest = useCallback((nextStatus) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setStatus(nextStatus)
    return requestId
  }, [])

  const finishRequest = useCallback((requestId) => {
    if (requestId === requestIdRef.current) {
      setStatus(ImportFlowStatus.IDLE)
    }
  }, [])

  const importInitial = useCallback(async (url, options = {}) => {
    const trimmedUrl = typeof url === 'string' ? url.trim() : ''
    const requestId = beginRequest(ImportFlowStatus.IMPORTING)
    setErrorCode(null)

    try {
      const res = await importPlaylist(trimmedUrl, { context: { importBusyKind: 'initial' } })

      if (requestId !== requestIdRef.current) {
        return { ok: false, stale: true }
      }

      finishRequest(requestId)
      setErrorCode(null)

      const providerHint = options.providerHint ?? null
      const tracks = buildTracks(res, providerHint)
      const meta = buildMeta(res, {
        providerHint,
        sourceUrl: options.sourceUrl ?? trimmedUrl,
      })

      return {
        ok: true,
        data: {
          tracks,
          meta,
          title: res?.title || DEFAULT_TITLE,
          importedAt: toIsoNow(),
        },
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        finishRequest(requestId)
        throw err
      }

      const code = extractErrorCode(err) || CODES.ERR_UNKNOWN
      if (requestId === requestIdRef.current) {
        setErrorCode(code)
        finishRequest(requestId)
      }
      return { ok: false, code, error: err }
    }
  }, [beginRequest, finishRequest, importPlaylist])

  const reimport = useCallback(async (url, options = {}) => {
    if (!url) return { ok: false, code: CODES.ERR_UNKNOWN }
    const trimmedUrl = String(url).trim()
    const requestId = beginRequest(ImportFlowStatus.REIMPORTING)
    setErrorCode(null)

    try {
      const res = await importPlaylist(trimmedUrl, { context: { importBusyKind: 'reimport' } })

      if (requestId !== requestIdRef.current) {
        return { ok: false, stale: true }
      }

      finishRequest(requestId)
      setErrorCode(null)

      const providerHint = options.providerHint ?? options.existingMeta?.provider ?? null
      const tracks = buildTracks(res, providerHint)
      const meta = buildMeta(res, {
        providerHint,
        playlistId: options.existingMeta?.playlistId ?? null,
        snapshotId: options.existingMeta?.snapshotId ?? null,
        sourceUrl: options.existingMeta?.sourceUrl ?? trimmedUrl,
        debug: options.existingMeta?.debug ?? null,
      })

      return {
        ok: true,
        data: {
          tracks,
          meta,
          title: res?.title || options.fallbackTitle || DEFAULT_TITLE,
          importedAt: toIsoNow(),
        },
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        finishRequest(requestId)
        throw err
      }
      const code = extractErrorCode(err) || CODES.ERR_UNKNOWN
      if (requestId === requestIdRef.current) {
        setErrorCode(code)
        finishRequest(requestId)
      }
      return { ok: false, code, error: err }
    }
  }, [beginRequest, finishRequest, importPlaylist])

  const loadMore = useCallback(async (options = {}) => {
    const requestId = beginRequest(ImportFlowStatus.LOADING_MORE)
    setErrorCode(null)

    try {
      const res = await importNext({ context: { importBusyKind: 'load-more' } })

      if (requestId !== requestIdRef.current) {
        return { ok: false, stale: true }
      }

      finishRequest(requestId)
      setErrorCode(null)

      if (!res) {
        return {
          ok: true,
          data: {
            tracks: [],
            meta: {
              ...options.existingMeta,
              cursor: null,
              hasMore: false,
              sourceUrl: options.existingMeta?.sourceUrl ?? options.sourceUrl ?? '',
            },
          },
        }
      }

      const providerHint = options.providerHint ?? options.existingMeta?.provider ?? null
      const startIndex = options.startIndex ?? 0
      const existingIds = options.existingIds ? new Set(options.existingIds) : undefined
      const tracks = buildTracks(res, providerHint, startIndex, existingIds)
      const meta = buildMeta(res, {
        providerHint,
        playlistId: options.existingMeta?.playlistId ?? null,
        snapshotId: options.existingMeta?.snapshotId ?? null,
        sourceUrl: options.existingMeta?.sourceUrl ?? options.sourceUrl ?? '',
        debug: options.existingMeta?.debug ?? null,
      })

      return {
        ok: true,
        data: {
          tracks,
          meta,
        },
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        finishRequest(requestId)
        throw err
      }
      const code = extractErrorCode(err) || CODES.ERR_UNKNOWN
      if (requestId === requestIdRef.current) {
        setErrorCode(code)
        finishRequest(requestId)
      }
      return { ok: false, code, error: err }
    }
  }, [beginRequest, finishRequest, importNext])

  const resetFlow = useCallback(() => {
    resetImportSession()
    requestIdRef.current += 1
    setStatus(ImportFlowStatus.IDLE)
    setErrorCode(null)
  }, [resetImportSession])

  return {
    status,
    errorCode,
    loading,
    importInitial,
    reimport,
    loadMore,
    resetFlow,
  }
}
