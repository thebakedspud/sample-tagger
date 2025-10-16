import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UndoPlaceholder from '../UndoPlaceholder.jsx'
import { focusById } from '../../utils/focusById.js'

vi.mock('../../utils/focusById.js', () => ({
  focusById: vi.fn(),
}))

describe('UndoPlaceholder', () => {
  let originalRaf
  let originalCancelRaf
  let rafCallback

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame
    originalCancelRaf = globalThis.cancelAnimationFrame
    rafCallback = null
    globalThis.requestAnimationFrame = (cb) => {
      rafCallback = cb
      return 1
    }
    globalThis.cancelAnimationFrame = () => {
      rafCallback = null
    }
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancelRaf
    vi.clearAllMocks()
  })

  it('invokes onUndo and restores focus when clicking Undo', async () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()

    render(
      <UndoPlaceholder
        pendingId="abc"
        onUndo={onUndo}
        onDismiss={onDismiss}
        restoreFocusId="restore-target"
        fallbackFocusId="fallback-target"
      />
    )

    const undoButton = screen.getByRole('button', { name: /^undo$/i })
    fireEvent.click(undoButton)

    expect(onUndo).toHaveBeenCalledWith('abc')

    // drive the requestAnimationFrame callback to trigger focus restore
    if (rafCallback) {
      rafCallback(performance.now())
    }

    expect(focusById).toHaveBeenCalledWith('restore-target')
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('invokes onDismiss once the countdown completes', () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()
    let now = 0

    const performanceNowSpy = vi.spyOn(performance, 'now').mockImplementation(
      () => now
    )

    render(
      <UndoPlaceholder
        pendingId="xyz"
        onUndo={onUndo}
        onDismiss={onDismiss}
        restoreFocusId="restore-target"
        fallbackFocusId="fallback-target"
        windowMs={20}
      />
    )

    const undoButton = screen.getByRole('button', { name: /^undo$/i })

    // hover pauses the countdown
    fireEvent.mouseEnter(undoButton)
    now += 15
    if (rafCallback) rafCallback(now)
    expect(onDismiss).not.toHaveBeenCalled()

    // resume countdown and allow it to expire
    fireEvent.mouseLeave(undoButton)
    fireEvent.blur(undoButton)
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
    now += 10
    if (rafCallback) rafCallback(now)
    expect(onDismiss).not.toHaveBeenCalled()

    now += 15
    if (rafCallback) rafCallback(now)

    expect(onDismiss).toHaveBeenCalledWith('xyz')
    expect(focusById).toHaveBeenCalledWith('fallback-target')

    performanceNowSpy.mockRestore()
  })

  it('fires onDismiss when clicking the dismiss control', () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()

    render(
      <UndoPlaceholder
        pendingId="def"
        onUndo={onUndo}
        onDismiss={onDismiss}
        restoreFocusId="restore-target"
        fallbackFocusId="fallback-target"
      />
    )

    const dismissButton = screen.getByRole('button', { name: /dismiss undo/i })
    fireEvent.click(dismissButton)

    expect(onDismiss).toHaveBeenCalledWith('def')
    expect(onUndo).not.toHaveBeenCalled()
    expect(focusById).toHaveBeenCalledWith('fallback-target')
  })
})
