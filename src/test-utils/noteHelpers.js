// Shared helpers for tests dealing with note objects

/**
 * Build a deterministic note entry for tests
 * @param {string} body
 * @param {{ createdAt?: number, timestampMs?: number | null, timestampEndMs?: number | null }} [overrides]
 * @returns {{ body: string, createdAt: number, timestampMs?: number | null, timestampEndMs?: number | null }}
 */
export function makeNote(body, overrides = {}) {
  const createdAt =
    typeof overrides.createdAt === 'number' && Number.isFinite(overrides.createdAt)
      ? Math.trunc(overrides.createdAt)
      : 1
  const note = {
    body,
    createdAt,
  }
  if ('timestampMs' in overrides) {
    const value = overrides.timestampMs
    if (typeof value === 'number' && Number.isFinite(value)) {
      note.timestampMs = Math.trunc(value)
    } else if (value == null) {
      note.timestampMs = null
    }
  }
  if ('timestampEndMs' in overrides) {
    const value = overrides.timestampEndMs
    if (typeof value === 'number' && Number.isFinite(value)) {
      note.timestampEndMs = Math.trunc(value)
    } else if (value == null) {
      note.timestampEndMs = null
    }
  }
  return note
}

/**
 * Extract note bodies from array of entries (legacy strings supported)
 * @param {Array<{ body?: string } | string> | undefined} notes
 * @returns {string[]}
 */
export function noteBodies(notes) {
  if (!Array.isArray(notes)) return []
  return notes
    .map((note) => {
      if (typeof note === 'string') return note
      if (note && typeof note.body === 'string') return note.body
      return ''
    })
    .filter(Boolean)
}
