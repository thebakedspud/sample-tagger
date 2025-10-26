import { describe, expect, it } from 'vitest'
import { STOCK_TAGS } from '../../tags/constants.js'
import { getTagSuggestions, normalizeTag } from '../../tags/tagUtils.js'

describe('tag utils', () => {
  it('normalizes tags by trimming and lowercasing', () => {
    expect(normalizeTag('  Drill  ')).toBe('drill')
    expect(normalizeTag('')).toBe('')
    expect(normalizeTag(null)).toBe('')
  })

  it('returns stock matches first for a prefix search', () => {
    const result = getTagSuggestions('dr', {
      stock: STOCK_TAGS,
      custom: ['drone', 'dramatic'],
    })
    expect(result.slice(0, 3)).toEqual(['drums', 'dreamy', 'drone'])
    expect(result).toContain('dramatic')
  })

  it('filters out existing tags and avoids duplicates', () => {
    const result = getTagSuggestions('bo', {
      stock: STOCK_TAGS,
      custom: ['boomy', 'boom-bap'],
      exclude: ['boom-bap'],
    })
    expect(result).toEqual(['boomy'])
  })

  it('falls back to substring matching when no prefix matches', () => {
    const result = getTagSuggestions('ma', {
      stock: ['alpha', 'gamma', 'delta'],
      custom: ['drama'],
    })
    expect(result).toEqual(['gamma', 'drama'])
  })
})
