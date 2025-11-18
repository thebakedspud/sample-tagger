import { describe, expect, it } from 'vitest'
import {
  extractTimestamp,
  formatTimestampRange,
  parseTimestampInput,
} from '../noteTimestamps.js'

describe('parseTimestampInput', () => {
  it('parses mm:ss strings into milliseconds', () => {
    expect(parseTimestampInput('1:23')).toBe(83_000)
  })

  it('rejects fractional minute or second values', () => {
    expect(parseTimestampInput('1.5:20')).toBeNull()
    expect(parseTimestampInput('1:30.25')).toBeNull()
    expect(parseTimestampInput('0.1:0.1:10')).toBeNull()
  })
})

describe('extractTimestamp', () => {
  it('returns trimmed body when no timestamp present', () => {
    expect(extractTimestamp('  no timestamp  ')).toEqual({
      timestamp: null,
      cleanedBody: 'no timestamp',
    })
  })

  it('extracts first timestamp as point data', () => {
    const result = extractTimestamp('  :30 drums hit hard  ')
    expect(result.cleanedBody).toBe('drums hit hard')
    expect(result.timestamp).toEqual({
      kind: 'point',
      startMs: 30_000,
    })
  })

  it('strips leading tokens and separators for point timestamps', () => {
    expect(extractTimestamp(':30 fat drums')).toEqual({
      cleanedBody: 'fat drums',
      timestamp: {
        kind: 'point',
        startMs: 30_000,
      },
    })
    expect(extractTimestamp(' :30 fat drums')).toEqual({
      cleanedBody: 'fat drums',
      timestamp: {
        kind: 'point',
        startMs: 30_000,
      },
    })
  })

  it('prefers the first timestamp even when later ones exist', () => {
    const result = extractTimestamp('1:05 intro then 2:10 chorus')
    expect(result.timestamp).toEqual({
      kind: 'point',
      startMs: 65_000,
    })
  })

  it('extracts timestamp ranges separated by hyphen', () => {
    const result = extractTimestamp('riff 1:05-2:10 stands out')
    expect(result.timestamp).toEqual({
      kind: 'range',
      startMs: 65_000,
      endMs: 130_000,
    })
  })

  it('strips leading tokens and separators for ranges', () => {
    const result = extractTimestamp('1:30-1:50 intro idea')
    expect(result.cleanedBody).toBe('intro idea')
    expect(result.timestamp).toEqual({
      kind: 'range',
      startMs: 90_000,
      endMs: 110_000,
    })
  })

  it('supports en dash range separators', () => {
    const result = extractTimestamp('bridge :5–:20 slaps')
    expect(result.timestamp).toEqual({
      kind: 'range',
      startMs: 5_000,
      endMs: 20_000,
    })
  })

  it('skips invalid ranges where the end precedes start', () => {
    const result = extractTimestamp('ending 2:00-1:00 fade out')
    expect(result.timestamp).toEqual({
      kind: 'point',
      startMs: 120_000,
    })
  })

  it('keeps mid-sentence tokens in body', () => {
    const result = extractTimestamp('drums at 1:30–1:50 are nice')
    expect(result.cleanedBody).toBe('drums at 1:30–1:50 are nice')
    expect(result.timestamp).toEqual({
      kind: 'range',
      startMs: 90_000,
      endMs: 110_000,
    })
  })

  it('ignores tokens glued to letters', () => {
    const result = extractTimestamp('track1:02 label-ish text')
    expect(result.timestamp).toBeNull()
  })
})

describe('formatTimestampRange', () => {
  it('formats valid ranges with en dash', () => {
    expect(formatTimestampRange(30_000, 95_000)).toBe('0:30–1:35')
  })

  it('returns null when either boundary invalid', () => {
    expect(formatTimestampRange(null, 2_000)).toBeNull()
    expect(formatTimestampRange(2_000, -5_000)).toBeNull()
  })
})
