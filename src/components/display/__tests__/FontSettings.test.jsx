import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import FontSettings from '../FontSettings.jsx'

class MemoryStorage {
  constructor() {
    this.map = new Map()
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }

  setItem(key, value) {
    this.map.set(key, String(value))
  }

  removeItem(key) {
    this.map.delete(key)
  }

  clear() {
    this.map.clear()
  }
}

describe('FontSettings', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage()
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
