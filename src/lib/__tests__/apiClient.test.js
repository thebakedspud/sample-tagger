import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('../deviceState.js', () => ({
  getDeviceId: vi.fn(),
  setDeviceId: vi.fn(),
}))

const { getDeviceId, setDeviceId } = await import('../deviceState.js')
const { apiFetch } = await import('../apiClient.js')

describe('apiFetch', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ ok: true }),
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('injects device id and content-type headers when needed', async () => {
    getDeviceId.mockReturnValue('device-1')

    await apiFetch('/api/test', { method: 'POST', body: JSON.stringify({ hello: 'world' }) })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = global.fetch.mock.calls[0]
    expect(init.headers.get('x-device-id')).toBe('device-1')
    expect(init.headers.get('Accept')).toBe('application/json')
    expect(init.headers.get('Content-Type')).toBe('application/json')
  })

  it('preserves existing content-type headers and updates device id from response header', async () => {
    getDeviceId.mockReturnValue(null)
    const responseHeaders = new Headers({ 'x-device-id': 'new-device' })
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: responseHeaders,
      json: vi.fn().mockResolvedValue({ ok: true }),
    })

    await apiFetch('/api/test', {
      headers: { 'Content-Type': 'application/custom' },
      body: 'payload',
    })

    const [, init] = global.fetch.mock.calls[0]
    expect(init.headers.get('Content-Type')).toBe('application/custom')
    expect(init.headers.get('x-device-id')).toBeNull()
    expect(setDeviceId).toHaveBeenCalledWith('new-device')
  })

  it('does not call setDeviceId when header matches existing value', async () => {
    getDeviceId.mockReturnValue('device-123')
    const responseHeaders = new Headers({ 'x-device-id': 'device-123' })
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: responseHeaders,
      json: vi.fn().mockResolvedValue({ ok: true }),
    })

    await apiFetch('/api/test')

    expect(setDeviceId).not.toHaveBeenCalled()
  })
})

