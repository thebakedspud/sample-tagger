import { describe, expect, it, beforeEach, vi } from 'vitest'

const importPlaylistMock = vi.fn()

vi.mock('../mockAdapterUtils.js', () => ({
  createPagedMockAdapter: vi.fn(() => ({
    importPlaylist: importPlaylistMock,
  })),
}))

const { CODES } = await import('../types.js')
const { importPlaylist } = await import('../soundcloudAdapter.js')

describe('soundcloudAdapter importPlaylist', () => {
  beforeEach(() => {
    importPlaylistMock.mockReset()
  })

  it('returns successful payload from the underlying adapter', async () => {
    const result = { ok: true, data: [] }
    importPlaylistMock.mockResolvedValueOnce(result)

    await expect(importPlaylist({ cursor: null })).resolves.toBe(result)
  })

  it('wraps abort errors with ERR_ABORTED', async () => {
    const error = new Error('cancelled')
    error.name = 'AbortError'
    importPlaylistMock.mockRejectedValueOnce(error)

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_ABORTED,
      details: { provider: 'soundcloud' },
    })
  })

  it('wraps rate limit errors', async () => {
    importPlaylistMock.mockRejectedValueOnce({ status: 429 })

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_RATE_LIMITED,
      details: { provider: 'soundcloud' },
    })
  })

  it('wraps unauthorized errors as private playlist', async () => {
    importPlaylistMock.mockRejectedValueOnce({ status: 403 })

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_PRIVATE_PLAYLIST,
      details: { provider: 'soundcloud' },
    })
  })

  it('defaults unknown errors to ERR_UNKNOWN', async () => {
    importPlaylistMock.mockRejectedValueOnce({ status: 500 })

    await expect(importPlaylist({ cursor: null })).rejects.toMatchObject({
      code: CODES.ERR_UNKNOWN,
      details: { provider: 'soundcloud' },
    })
  })
})

