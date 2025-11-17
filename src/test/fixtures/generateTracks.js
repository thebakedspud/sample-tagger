/**
 * Generate deterministic track fixtures for large-scale rendering tests.
 * @param {number} count
 * @param {object} [options]
 * @param {boolean} [options.withNotes]
 * @param {boolean} [options.withTags]
 * @param {number} [options.startIndex]
 * @param {boolean} [options.withLegacyNotes] - Emit legacy string notes instead of NoteEntry[]
 */
export function generateTracks(count, options = {}) {
  const {
    withNotes = false,
    withTags = false,
    startIndex = 0,
    withLegacyNotes = false,
  } = options
  const baseTimestamp = Date.UTC(2024, 0, 1)
  const minuteMs = 60 * 1000
  const total = Math.max(count, 0)
  return Array.from({ length: total }, (_, offset) => {
    const idx = startIndex + offset
    const id = `track-${idx}`
    const tags = withTags ? [`tag-${idx % 10}`, `tag-${(idx + 3) % 10}`] : []
    let notes = []
    if (withNotes) {
      if (withLegacyNotes) {
        notes = [`Note for track ${idx}`]
      } else {
        const createdAt = baseTimestamp - idx * minuteMs
        notes = [
          {
            body: `Note for track ${idx}`,
            createdAt,
            timestampMs: createdAt,
          },
        ]
      }
    }

    return {
      id,
      title: `Track ${idx}`,
      artist: `Artist ${idx % 25}`,
      notes,
      tags,
      dateAdded: new Date(baseTimestamp - idx * minuteMs).toISOString(),
    }
  })
}
