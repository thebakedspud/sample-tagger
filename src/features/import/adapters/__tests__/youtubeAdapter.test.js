import { describe, expect, it, beforeEach, vi } from 'vitest'

const importPlaylistMock = vi.fn()

vi.mock('../mockAdapterUtils.js', () => ({
  createPagedMockAdapter: vi.fn(() => ({
    importPlaylist: importPlaylistMock,
  })),
}))

const { CODES } = await import('../types.js')
const { importPlaylist } = await import('../youtubeAdapter.js')

describe('youtubeAdapter importPlaylist', () => {
  beforeEach(() => {
    importPlaylistMock.mockReset()
  })

  it('returns adapter payload on success', async () => {
    const result = { ok: true, data: [] }
    importPlaylistMock.mockResolvedValueOnce(result)

    await expect(importPlaylist({ cursor: null })).resolves.toBe(result)
  })

  it('maps AbortError to ERR_ABORTED', async () => {
    const error = new Error('cancel')
    error.name = 'AbortError'
    importPlaylistMock.mockRejectedValueOnce(error)

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_ABORTED,
      details: { provider: 'youtube' },
    })
  })

  it('maps 429 to ERR_RATE_LIMITED', async () => {
    importPlaylistMock.mockRejectedValueOnce({ status: 429 })

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_RATE_LIMITED,
      details: { provider: 'youtube' },
    })
  })

  it('maps 401 to ERR_PRIVATE_PLAYLIST', async () => {
    importPlaylistMock.mockRejectedValueOnce({ status: 401 })

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_PRIVATE_PLAYLIST,
      details: { provider: 'youtube' },
    })
  })

  it('falls back to ERR_UNKNOWN for unexpected errors', async () => {
    importPlaylistMock.mockRejectedValueOnce({ status: 500 })

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_UNKNOWN,
      details: { provider: 'youtube' },
    })
  })
})

