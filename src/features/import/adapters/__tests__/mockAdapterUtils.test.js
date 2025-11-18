import { describe, expect, it } from 'vitest'
import { createPagedMockAdapter } from '../mockAdapterUtils.js'

describe('createPagedMockAdapter', () => {
  const baseTracks = [
    { title: 'Intro', artist: 'Artist A', dateAdded: '2024-01-01T00:00:00Z' },
    { title: 'Outro', artist: 'Artist B' },
  ]

  it('returns paginated results with deterministic ids and cursors', async () => {
    const adapter = createPagedMockAdapter({
      provider: 'spotify',
      title: 'Mock Playlist',
      tracks: baseTracks,
      total: 12,
      coverUrl: 'https://cover',
    })

    const first = await adapter.importPlaylist({ url: 'https://playlist', cursor: null })
    expect(first.tracks).toHaveLength(10)
    expect(first.tracks[0]).toMatchObject({
      id: 'spotify-mock-1',
      providerTrackId: 'spotify-raw-1',
      title: 'Intro',
      artist: 'Artist A',
    })
    expect(first.pageInfo).toEqual({ cursor: 'page:1', hasMore: true })
    expect(first.coverUrl).toBe('https://cover')
    expect(first.sourceUrl).toBe('https://playlist')

    const second = await adapter.importPlaylist({ cursor: first.pageInfo.cursor })
    expect(second.tracks).toHaveLength(2)
    expect(second.pageInfo).toEqual({ cursor: null, hasMore: false })
  })

  it('falls back to generated dates and clears non-string cover urls', async () => {
    const adapter = createPagedMockAdapter({
      provider: 'youtube',
      title: 'Demo Playlist',
      tracks: [{ title: 'Single', artist: 'Demo Artist', dateAdded: 'invalid-date' }],
      total: 1,
      coverUrl: /** @type {any} */ (null),
    })

    const page = await adapter.importPlaylist({ cursor: undefined })
    expect(page.coverUrl).toBeUndefined()
    expect(page.tracks[0].dateAdded).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('treats invalid cursors as the first page and honors abort signals', async () => {
    const adapter = createPagedMockAdapter({
      provider: 'soundcloud',
      title: 'Abortable Playlist',
      tracks: baseTracks,
      total: 5,
    })

    const invalidCursorPage = await adapter.importPlaylist({ cursor: 'not-a-cursor' })
    expect(invalidCursorPage.tracks[0].id).toBe('soundcloud-mock-1')

    const controller = new AbortController()
    controller.abort()
    await expect(adapter.importPlaylist({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
