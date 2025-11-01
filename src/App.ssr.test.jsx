import { afterEach, describe, expect, it, vi } from 'vitest'

describe('App SSR import', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    if (originalWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
    if (originalDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = originalDocument
    }
  })

  it('does not throw when imported without window', async () => {
    vi.resetModules()
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)

    await expect(import('./App.jsx')).resolves.toBeDefined()
  })
})
