import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { makeFetchClient } from '../fetchClient.js'

describe('makeFetchClient', () => {
  const originalFetch = globalThis.fetch
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('throws HTTP_<status> error with metadata when response is not ok', async () => {
    const response = {
      ok: false,
      status: 503,
      json: vi.fn(),
    }
    fetchMock.mockResolvedValue(response)
    const client = makeFetchClient(fetchMock)

    await expect(client.getJson('/api/test')).rejects.toMatchObject({
      message: 'HTTP_503',
      code: 'HTTP_503',
      details: { url: '/api/test', status: 503 },
    })
    expect(response.json).not.toHaveBeenCalled()
  })

  it('returns parsed json when response ok', async () => {
    const payload = { ok: true }
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(payload),
    })
    const client = makeFetchClient(fetchMock)

    await expect(client.getJson('/api/ok', { method: 'GET' })).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledWith('/api/ok', { method: 'GET' })
  })
})
