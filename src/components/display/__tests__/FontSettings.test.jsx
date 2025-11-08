import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import FontSettings from '../FontSettings.jsx'

/** @implements {Storage} */
class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.map = new Map()
  }

  get length() {
    return this.map.size
  }

  key(index) {
    if (typeof index !== 'number' || index < 0 || index >= this.map.size) {
      return null
    }
    return Array.from(this.map.keys())[index] ?? null
  }

  getItem(key) {
    const normalizedKey = String(key)
    return this.map.has(normalizedKey) ? this.map.get(normalizedKey) ?? null : null
  }

  setItem(key, value) {
    this.map.set(String(key), String(value))
  }

  removeItem(key) {
    this.map.delete(String(key))
  }

  clear() {
    this.map.clear()
  }
}

describe('FontSettings', () => {
  beforeEach(() => {
    globalThis.localStorage = /** @type {Storage} */ (new MemoryStorage())
    document.documentElement.removeAttribute('data-font')
  })

  it('preselects stored font preference and applies attribute', () => {
    localStorage.setItem(
      'sta:v6',
      JSON.stringify({
        version: 6,
        theme: 'dark',
        playlistTitle: 'Example',
        importedAt: null,
        lastImportUrl: '',
        tracks: [],
        importMeta: {},
        notesByTrack: {},
        tagsByTrack: {},
        recentPlaylists: [],
        uiPrefs: { font: 'system' },
      }),
    )

    render(<FontSettings />)
    expect(screen.getByRole('radio', { name: 'Match system' })).toBeChecked()
    expect(document.documentElement.getAttribute('data-font')).toBe('system')
  })

  it('updates storage and document attribute when selection changes', () => {
    render(<FontSettings />)
    const dyslexic = screen.getByRole('radio', { name: 'Dyslexic friendly' })
    fireEvent.click(dyslexic)

    expect(document.documentElement.getAttribute('data-font')).toBe('dyslexic')
    const stored = JSON.parse(localStorage.getItem('sta:v6'))
    expect(stored.uiPrefs.font).toBe('dyslexic')
  })
})
