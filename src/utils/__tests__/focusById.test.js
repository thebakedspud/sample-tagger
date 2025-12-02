import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import focusById, { focusElement } from '../focusById.js'

describe('focusById', () => {
  /** @type {Function[]} */
  let rafCallbacks = []
  const originalRaf = globalThis.requestAnimationFrame

  beforeEach(() => {
    rafCallbacks = []
    globalThis.requestAnimationFrame = (cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
    document.body.innerHTML = ''
  })

  const flushRaf = () => {
    const cbs = [...rafCallbacks]
    rafCallbacks = []
    cbs.forEach((cb) => cb(Date.now()))
  }

  it('calls focus with preventScroll: true when supported', () => {
    const el = document.createElement('button')
    el.id = 'test-btn'
    el.focus = vi.fn()
    document.body.appendChild(el)

    focusById('test-btn')
    flushRaf()

    expect(el.focus).toHaveBeenCalledWith(
      expect.objectContaining({ preventScroll: true }),
    )
  })

  it('falls back to focus() without options if preventScroll throws', () => {
    const el = document.createElement('button')
    el.id = 'test-btn'
    const focusMock = vi.fn().mockImplementationOnce((opts) => {
      if (opts && 'preventScroll' in opts) {
        throw new Error('Not supported')
      }
    })
    el.focus = focusMock
    document.body.appendChild(el)

    focusById('test-btn')
    flushRaf()

    expect(focusMock).toHaveBeenCalledTimes(2)
    expect(focusMock).toHaveBeenLastCalledWith()
  })

  it('does nothing for non-existent element', () => {
    focusById('does-not-exist')
    flushRaf()
    // Should not throw
  })

  it('merges custom options with preventScroll', () => {
    const el = document.createElement('button')
    el.id = 'test-btn'
    el.focus = vi.fn()
    document.body.appendChild(el)

    focusById('test-btn', { customFlag: true })
    flushRaf()

    expect(el.focus).toHaveBeenCalledWith(
      expect.objectContaining({ preventScroll: true, customFlag: true }),
    )
  })
})

describe('focusElement', () => {
  /** @type {Function[]} */
  let rafCallbacks = []
  const originalRaf = globalThis.requestAnimationFrame

  beforeEach(() => {
    rafCallbacks = []
    globalThis.requestAnimationFrame = (cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
  })

  const flushRaf = () => {
    const cbs = [...rafCallbacks]
    rafCallbacks = []
    cbs.forEach((cb) => cb(Date.now()))
  }

  it('calls focus with preventScroll on element reference', () => {
    const el = document.createElement('input')
    el.focus = vi.fn()

    focusElement(el)
    flushRaf()

    expect(el.focus).toHaveBeenCalledWith(
      expect.objectContaining({ preventScroll: true }),
    )
  })

  it('does nothing for null element', () => {
    // @ts-expect-error - deliberate null
    focusElement(null)
    flushRaf()
    // Should not throw
  })
})

