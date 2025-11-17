const DATE_OPTIONS = /** @type {Intl.DateTimeFormatOptions} */ ({
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})
const TIME_OPTIONS = /** @type {Intl.DateTimeFormatOptions} */ ({
  hour: 'numeric',
  minute: '2-digit',
})

export function formatNoteCreatedAt(createdAt) {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  const datePart = new Intl.DateTimeFormat(undefined, DATE_OPTIONS).format(date)
  const timePart = new Intl.DateTimeFormat(undefined, TIME_OPTIONS).format(date)
  return `${datePart} · ${timePart}`
}

export function formatTimestampMs(timestampMs) {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0) return null
  const totalSeconds = Math.floor(timestampMs / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (value) => String(value).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${minutes}:${pad(seconds)}`
}

export function parseTimestampInput(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const segments = trimmed.split(':')
  if (segments.length < 2 || segments.length > 3) return null
  const numbers = segments.map((segment) => Number(segment))
  if (numbers.some((num) => Number.isNaN(num) || num < 0)) return null
  const [hours, minutes, seconds] =
    segments.length === 3 ? numbers : [0, numbers[0], numbers[1]]
  if (minutes >= 60 || seconds >= 60) return null
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  return totalSeconds * 1000
}
