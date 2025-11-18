const DATE_OPTIONS = /** @type {Intl.DateTimeFormatOptions} */ ({
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})
const TIME_OPTIONS = /** @type {Intl.DateTimeFormatOptions} */ ({
  hour: 'numeric',
  minute: '2-digit',
})

const TOKEN_RE = /(?:(?:\d{1,3}:){1,2}\d{1,2}|:\d{1,2}(?::\d{1,2})?)/g
const RANGE_SEP_RE = /^\s*[-–]\s*/
const WORD_CHAR_RE = /[0-9A-Za-z_]/

const pad = (value) => String(value).padStart(2, '0')

function normalizeTokenNumbers(token) {
  if (typeof token !== 'string') return null
  const trimmed = token.trim()
  if (!trimmed.includes(':')) return null
  const segments = trimmed.split(':')
  if (segments.length < 2 || segments.length > 3) return null
  const numbers = segments.map((segment, index) => {
    if (segment === '' && index === 0) return 0
    const numeric = Number(segment)
    if (
      Number.isNaN(numeric) ||
      numeric < 0 ||
      !Number.isFinite(numeric) ||
      !Number.isInteger(numeric)
    ) {
      return null
    }
    return numeric
  })
  if (numbers.some((num) => num == null)) {
    return null
  }
  const [hours, minutes, seconds] =
    segments.length === 3
      ? /** @type {[number, number, number]} */ (numbers)
      : /** @type {[number, number, number]} */ ([0, numbers[0], numbers[1]])
  if (minutes >= 60 || seconds >= 60) return null
  const totalSeconds = hours * 3600 + minutes * 60 + seconds
  return {
    ms: totalSeconds * 1000,
    label: hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`,
  }
}

function findTokenMatch(text) {
  if (typeof text !== 'string' || !text) return null
  TOKEN_RE.lastIndex = 0
  let match
  while ((match = TOKEN_RE.exec(text)) != null) {
    const index = match.index
    const charBefore = index > 0 ? text[index - 1] : ''
    if (charBefore && WORD_CHAR_RE.test(charBefore)) {
      continue
    }
    return { value: match[0], index }
  }
  return null
}

function matchTokenAtStart(text) {
  if (typeof text !== 'string') return null
  const anchored = text.match(/^((?:\d{1,3}:){1,2}\d{1,2}|:\d{1,2}(?::\d{1,2})?)/)
  if (!anchored) return null
  return { value: anchored[0], length: anchored[0].length }
}

function parseRangeCandidate(baseMs, afterText) {
  if (typeof baseMs !== 'number' || !Number.isFinite(baseMs)) return null
  if (typeof afterText !== 'string') return null
  const sepMatch = afterText.match(RANGE_SEP_RE)
  if (!sepMatch) return null
  const nextText = afterText.slice(sepMatch[0].length)
  const tokenMatch = matchTokenAtStart(nextText)
  if (!tokenMatch) return null
  const parsed = normalizeTokenNumbers(tokenMatch.value)
  if (!parsed) return null
  if (parsed.ms < baseMs) return null
  return { endMs: parsed.ms, consumed: sepMatch[0].length + tokenMatch.length }
}

export function formatNoteCreatedAt(createdAt) {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  const datePart = new Intl.DateTimeFormat(undefined, DATE_OPTIONS).format(date)
  const timePart = new Intl.DateTimeFormat(undefined, TIME_OPTIONS).format(date)
  return `${datePart} · ${timePart}`
}

export function formatTimestampMs(timestampMs) {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0) {
    return null
  }
  const totalSeconds = Math.floor(timestampMs / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const hours = Math.floor(totalSeconds / 3600)
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${minutes}:${pad(seconds)}`
}

export function formatTimestampRange(startMs, endMs) {
  const startLabel = formatTimestampMs(startMs)
  const endLabel = formatTimestampMs(endMs)
  if (!startLabel || !endLabel) return null
  return `${startLabel}–${endLabel}`
}

export function parseTimestampInput(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = normalizeTokenNumbers(trimmed)
  return parsed ? parsed.ms : null
}

export function extractTimestamp(input) {
  const rawText = typeof input === 'string' ? input : ''
  const cleanedBody = rawText.trim()
  if (!cleanedBody) {
    return { timestamp: null, cleanedBody }
  }
  const match = findTokenMatch(cleanedBody)
  if (!match) {
    return { timestamp: null, cleanedBody }
  }
  const parsed = normalizeTokenNumbers(match.value)
  if (!parsed) {
    return { timestamp: null, cleanedBody }
  }
  let trimmedBody = cleanedBody
  const afterText = cleanedBody.slice(match.index + match.value.length)
  const range = parseRangeCandidate(parsed.ms, afterText)
  if (match.index === 0) {
    const skipLength = match.value.length + (range ? range.consumed ?? 0 : 0)
    const remainder = cleanedBody.slice(skipLength)
    trimmedBody = remainder.replace(/^[\s\t\-–:]+/, '').trim()
    if (range) {
      return {
        timestamp: {
          kind: 'range',
          startMs: parsed.ms,
          endMs: range.endMs,
        },
        cleanedBody: trimmedBody,
      }
    }
  }
  if (range) {
    return {
      timestamp: {
        kind: 'range',
        startMs: parsed.ms,
        endMs: range.endMs,
      },
      cleanedBody: trimmedBody,
    }
  }
  return {
    timestamp: {
      kind: 'point',
      startMs: parsed.ms,
    },
    cleanedBody: trimmedBody,
  }
}
