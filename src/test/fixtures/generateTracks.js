/**
 * Generate deterministic track fixtures for large-scale rendering tests.
 * @param {number} count
 * @param {object} [options]
 * @param {boolean} [options.withNotes]
 * @param {boolean} [options.withTags]
 * @param {number} [options.startIndex]
 */
export function generateTracks(count, options = {}) {
  const { withNotes = false, withTags = false, startIndex = 0 } = options
  const total = Math.max(count, 0)
  return Array.from({ length: total }, (_, offset) => {
    const idx = startIndex + offset
    const id = `track-${idx}`
    const tags = withTags ? [`tag-${idx % 10}`, `tag-${(idx + 3) % 10}`] : []
    const notes = withNotes ? [`Note for track ${idx}`] : []

    return {
      id,
      title: `Track ${idx}`,
      artist: `Artist ${idx % 25}`,
      notes,
      tags,
      dateAdded: new Date(Date.now() - idx * 1000 * 60).toISOString(),
    }
  })
}
