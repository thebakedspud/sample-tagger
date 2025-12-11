// src/features/notes/noteDeleteQueue.js
// Offline-first queue for note deletions. Deletions are queued locally
// and synced to the server when online.

// @ts-check

const STORAGE_KEY = 'sta:pending-note-deletes'

/**
 * @typedef {Object} PendingDelete
 * @property {string} noteId
 * @property {string} trackId
 * @property {number} queuedAt
 */

/**
 * Load the pending delete queue from localStorage
 * @returns {PendingDelete[]}
 */
function loadQueue() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.noteId === 'string' &&
        typeof item.trackId === 'string' &&
        typeof item.queuedAt === 'number'
    )
  } catch (_err) {
    return []
  }
}

/**
 * Save the pending delete queue to localStorage
 * @param {PendingDelete[]} queue
 */
function saveQueue(queue) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    if (queue.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    }
  } catch (_err) {
    // Storage full or unavailable - queue will be lost
    console.error('[noteDeleteQueue] failed to save queue', _err)
  }
}

/**
 * Queue a note deletion for background sync
 * @param {string} noteId - The note's unique ID
 * @param {string} trackId - The track ID (for debugging/logging)
 */
export function queueNoteDeletion(noteId, trackId) {
  if (!noteId) return
  const queue = loadQueue()
  // Avoid duplicates
  if (queue.some((item) => item.noteId === noteId)) return
  queue.push({
    noteId,
    trackId,
    queuedAt: Date.now(),
  })
  saveQueue(queue)
}

/**
 * Remove a note from the delete queue (e.g., after undo)
 * @param {string} noteId
 */
export function cancelNoteDeletion(noteId) {
  if (!noteId) return
  const queue = loadQueue()
  const filtered = queue.filter((item) => item.noteId !== noteId)
  if (filtered.length !== queue.length) {
    saveQueue(filtered)
  }
}

/**
 * Get the current queue size (for debugging/UI)
 * @returns {number}
 */
export function getQueueSize() {
  return loadQueue().length
}

/**
 * Flush pending deletions to the server
 * @param {(url: string, options?: RequestInit) => Promise<Response>} apiFetch
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function flushDeleteQueue(apiFetch) {
  const queue = loadQueue()
  if (queue.length === 0) return { processed: 0, failed: 0 }

  /** @type {PendingDelete[]} */
  const remaining = []
  let processed = 0

  for (const item of queue) {
    try {
      const response = await apiFetch(`/api/db/notes?noteId=${encodeURIComponent(item.noteId)}`, {
        method: 'DELETE',
      })
      // Treat 200, 404 (already deleted), and 401/403 (unauthorized - note doesn't belong to user) as success
      // Only retry on 5xx errors
      if (response.ok || response.status === 404 || response.status === 401 || response.status === 403) {
        processed++
      } else if (response.status >= 500) {
        remaining.push(item)
      } else {
        // 4xx errors other than 401/403/404 - don't retry
        processed++
      }
    } catch (_err) {
      // Network error - keep for retry
      remaining.push(item)
    }
  }

  saveQueue(remaining)
  return { processed, failed: remaining.length }
}

/**
 * Create a delete queue manager with auto-flush on online event
 * @param {(url: string, options?: RequestInit) => Promise<Response>} apiFetch
 * @returns {{ flush: () => Promise<{ processed: number, failed: number }>, destroy: () => void }}
 */
export function createDeleteQueueManager(apiFetch) {
  const flush = () => flushDeleteQueue(apiFetch)

  const handleOnline = () => {
    flush().catch((err) => {
      console.error('[noteDeleteQueue] flush on online failed', err)
    })
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
  }

  const destroy = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
    }
  }

  return { flush, destroy }
}
