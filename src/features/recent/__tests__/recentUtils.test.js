import { describe, expect, it, beforeEach } from 'vitest'
import { createRecentCandidate } from '../recentUtils.js'

describe('createRecentCandidate', () => {
  beforeEach(() => {
    // Nothing to reset currently, placeholder in case future stateful deps appear.
  })

  it('returns null when meta is missing required fields', () => {
    expect(createRecentCandidate(null)).toBeNull()
    expect(
      createRecentCandidate({ provider: 'spotify', playlistId: null, sourceUrl: 'url' }),
    ).toBeNull()
    expect(
      createRecentCandidate({ provider: '', playlistId: 'id', sourceUrl: 'url' }),
    ).toBeNull()
    expect(
      createRecentCandidate({ provider: 'spotify', playlistId: 'id', sourceUrl: '' }),
    ).toBeNull()
  })

  it('prefers options.sourceUrl and normalizes optional metadata', () => {
    const meta = { provider: 'Spotify', playlistId: 'abc123', sourceUrl: 'https://fallback' }
    const candidate = createRecentCandidate(meta, {
      sourceUrl: ' https://override ',
      title: '  Favorite Tracks ',
      importedAt: '2024-01-01T00:00:00Z',
      lastUsedAt: new Date('2024-02-01T12:00:00Z'),
      total: 42.7,
      coverUrl: ' https://image ',
      pinned: true,
    })

    expect(candidate).toEqual({
      provider: 'spotify',
      playlistId: 'abc123',
      title: 'Favorite Tracks',
      sourceUrl: 'https://override',
      importedAt: Date.parse('2024-01-01T00:00:00Z'),
      lastUsedAt: Date.parse('2024-02-01T12:00:00Z'),
      total: 43,
      coverUrl: 'https://image',
      pinned: true,
    })
  })

  it('falls back to meta.sourceUrl when options.sourceUrl missing and leaves optional fields empty', () => {
    const meta = { provider: 'youtube', playlistId: 'p1', sourceUrl: 'https://playlist' }
    const candidate = createRecentCandidate(meta, { title: '' })

    expect(candidate).toEqual({
      provider: 'youtube',
      playlistId: 'p1',
      title: 'Imported Playlist',
      sourceUrl: 'https://playlist',
    })
  })

  it('ignores invalid optional values', () => {
    const meta = { provider: 'soundcloud', playlistId: 'id-1', sourceUrl: 'https://sound' }
    const candidate = createRecentCandidate(meta, {
      importedAt: 'invalid',
      lastUsedAt: Number.NaN,
      total: -5,
      coverUrl: '   ',
      pinned: false,
    })

    expect(candidate).toEqual({
      provider: 'soundcloud',
      playlistId: 'id-1',
      title: 'Imported Playlist',
      sourceUrl: 'https://sound',
    })
  })
})

