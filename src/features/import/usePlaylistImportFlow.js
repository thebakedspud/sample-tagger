// src/features/import/usePlaylistImportFlow.js

// @ts-check
import { useCallback, useRef, useState } from 'react'
import useImportPlaylist from './useImportPlaylist.js'
import { extractErrorCode, CODES } from './adapters/types.js'

/**
 * Pull in shared typedefs from adapters/types.js so this file stays lean.
 * @typedef {import('./adapters/types.js').ImportInitialOptions} ImportInitialOptions
 * @typedef {import('./adapters/types.js').ReimportOptions} ReimportOptions
 * @typedef {import('./adapters/types.js').LoadMoreOptions} LoadMoreOptions
 * @typedef {import('./adapters/types.js').ImportResult} ImportResult
 * @typedef {import('./adapters/types.js').AdapterErrorCode} AdapterErrorCode
 */

/**
 * usePlaylistImportFlow
 *
 * Orchestrates the end-to-end import lifecycle:
 *  - initial import from a playlist URL
 *  - re-import (refresh current playlist metadata/tracks)
 *  - paginated "load more"
 *  - exposes a guarded status + errorCode and a reset() that cancels in-flight work
 *
 * Concurrency model:
 *  Multiple imports can be triggered (e.g., a fast re-import while load-more is resolving).
 *  We assign a monotonically increasing requestId to each call and only let the *latest*
 *  request update state. Older responses return `{ ok:false, stale:true }` and are ignored.
 *
 * Result contract:
 *  Each call resolves to `{ ok:true, data }` or `{ ok:false, code, error?, stale? }`.
 *  When `ok:true`, `data` contains `{ tracks, meta, title?, importedAt?, coverUrl?, total? }`.
 *
 * Error codes:
 *  `errorCode` mirrors adapter codes from `CODES` (e.g., ERR_PRIVATE_PLAYLIST, ERR_NOT_FOUND,
 *  ERR_RATE_LIMITED) or `ERR_UNKNOWN` when unmapped.
 */

/**
 * @typedef {'idle' | 'importing' | 'reimporting' | 'loadingMore'} ImportStatus
 */

/** @type {{ IDLE: ImportStatus, IMPORTING: ImportStatus, REIMPORTING: ImportStatus, LOADING_MORE: ImportStatus }} */
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

/**
 * Coerce possibly-undefined provider data to stable strings
 * for safe serialization and rendering.
 */
function ensureString(value) {
  if (value == null) return ''
  return String(value)
}

/**
 * buildTrackId(provider, fallbackIndex)
 * Generates a stable fallback track id when the adapter didn't supply one.
 * Policy: `${provider}-${1-based-index}` (e.g., "spotify-12").
 * Rationale: keeps notes/tags mergeable across re-imports when real IDs are missing.
 */
function buildTrackId(baseProvider, fallbackIndex) {
  const parts = []
  if (baseProvider) parts.push(baseProvider)
  if (fallbackIndex != null) parts.push(fallbackIndex)
  return parts.length > 0 ? parts.join('-') : `${fallbackIndex ?? ''}`.trim()
}

/**
 * buildTracks(res, providerHint, startIndex = 0, existingIds?)
 * - Normalizes adapter tracks to `{ id, title, artist, [thumbnailUrl], [sourceUrl], [durationMs], [provider] }`.
 * - If `existingIds` is provided, skips any track whose `id` is already present (client-side dedupe when appending pages).
 * - `startIndex` is used to produce fallback IDs that remain stable across pagination (1-based).
 * - `providerHint` is used when the adapter didn't stamp a provider on each track.
 */
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

    const thumbnail = ensureString(track?.thumbnailUrl ?? track?.artworkUrl ?? '')
    const sourceUrl = ensureString(track?.sourceUrl ?? '')
    const normalizedTrack = {
      id: candidateId,
      title: ensureString(track?.title || ''),
      artist: ensureString(track?.artist || ''),
      notes: [],
    }

    if (thumbnail) {
      normalizedTrack.thumbnailUrl = thumbnail
    }
    if (sourceUrl) {
      normalizedTrack.sourceUrl = sourceUrl
    }
    if (typeof track?.durationMs === 'number' && Number.isFinite(track.durationMs)) {
      normalizedTrack.durationMs = track.durationMs
    }
    if (track?.provider || provider) {
      normalizedTrack.provider = track?.provider ?? provider ?? undefined
    }

    mapped.push(normalizedTrack)
  })

  return mapped
}

/**
 * buildMeta(res, fallback)
 * Produces normalized playlist metadata:
 *  - provider: "spotify" | "youtube" | "soundcloud" | null
 *  - playlistId: string | null   // provider's playlist identifier
 *  - snapshotId: string | null   // provider's change token for this playlist revision
 *  - cursor: string | null       // opaque pagination token; null means "no more pages"
 *  - hasMore: boolean            // true iff the adapter reports another page AND provided a cursor
 *  - sourceUrl: string           // canonical URL used for this import
 *  - debug: any | null           // optional adapter debug payload (dev only)
 *
 * Null vs undefined:
 *  We use explicit `null` for "known missing" fields so callers can serialize/compare reliably.
 */
function buildMeta(res, fallback = {}) {
  const provider =
    res?.provider ??
    fallback.provider ??
    fallback.providerHint ??
    null

  const pageInfo = res?.pageInfo ?? {}
  const cursor = pageInfo?.cursor ?? null
  // Only signal "hasMore" when a usable cursor is present (truthy) AND the adapter says there are more pages.
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
  const [status, setStatus] = useState(/** @type {ImportStatus} */ (ImportFlowStatus.IDLE))

  // Give TS a precise tuple type for the error state without importing React types into runtime.
  /** @type {[AdapterErrorCode|null, import('react').Dispatch<import('react').SetStateAction<AdapterErrorCode|null>>]} */
  // @ts-ignore - tuple typing for JS + useState
  const [errorCode, setErrorCode] = useState(/** @type {AdapterErrorCode|null} */ (null))

  // Guard against out-of-order async updates.
  // Any in-flight request that finishes after a newer one is considered "stale"
  // and must not mutate state. We track a monotonically increasing requestIdRef.
  const requestIdRef = useRef(0)

  /** @param {ImportStatus} nextStatus */
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

  /**
   * Starts a fresh import of `url`.
   * @param {string} url
   * @param {ImportInitialOptions=} options
   * @returns {Promise<ImportResult>}
   */
  const importInitial = useCallback(async (url, options = {}) => {
    const trimmedUrl = typeof url === 'string' ? url.trim() : ''
    const requestId = beginRequest(ImportFlowStatus.IMPORTING)
    setErrorCode(null)

    try {
      const res = await importPlaylist(trimmedUrl, { context: { importBusyKind: 'initial' } })

      if (requestId !== requestIdRef.current) {
        // Another request started after this one; mark as stale so callers can ignore without side effects.
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
          coverUrl: res?.coverUrl ?? null,
          total: typeof res?.total === 'number' ? res.total : tracks.length,
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

  /**
   * Re-imports the same playlist (refresh metadata/tracks).
   * @param {string} url
   * @param {ReimportOptions=} options
   * @returns {Promise<ImportResult>}
   */
  const reimport = useCallback(async (url, options = {}) => {
    if (!url) return { ok: false, code: CODES.ERR_UNKNOWN }
    const trimmedUrl = String(url).trim()
    const requestId = beginRequest(ImportFlowStatus.REIMPORTING)
    setErrorCode(null)

    try {
      const res = await importPlaylist(trimmedUrl, { context: { importBusyKind: 'reimport' } })

      if (requestId !== requestIdRef.current) {
        // Another request started after this one; mark as stale so callers can ignore without side effects.
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
          coverUrl: res?.coverUrl ?? null,
          total: typeof res?.total === 'number' ? res.total : tracks.length,
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

  /**
   * Loads the next page for the current import session.
   * When the adapter indicates terminal state, returns `ok:true` with `meta.hasMore=false`.
   * @param {LoadMoreOptions=} options
   * @returns {Promise<ImportResult>}
   */
  const loadMore = useCallback(async (options = {}) => {
    const requestId = beginRequest(ImportFlowStatus.LOADING_MORE)
    setErrorCode(null)

    try {
      const res = await importNext({ context: { importBusyKind: 'load-more' } })

      if (requestId !== requestIdRef.current) {
        // Another request started after this one; mark as stale so callers can ignore without side effects.
        return { ok: false, stale: true }
      }

      finishRequest(requestId)
      setErrorCode(null)

      if (!res) {
        // Terminal page: no more data. Preserve existing meta but clear cursor/hasMore.
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
    // Cancels in-flight work by bumping the requestId and resets local state.
    resetImportSession()
    requestIdRef.current += 1
    setStatus(ImportFlowStatus.IDLE)
    setErrorCode(null)
  }, [resetImportSession])

  /**
   * Public API:
   *  - status:      'idle' | 'importing' | 'reimporting' | 'loadingMore'
   *  - errorCode:   adapter/provider error code or null
   *  - loading:     boolean passthrough from underlying adapter hook
   *  - importInitial(url, opts?): Promise<ImportResult>
   *  - reimport(url, opts?):      Promise<ImportResult>
   *  - loadMore(opts?):           Promise<ImportResult>
   *  - resetFlow():               cancels in-flight work, clears error/status
   */
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
