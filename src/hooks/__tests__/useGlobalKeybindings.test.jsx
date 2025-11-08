import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef } from 'react'
import { useGlobalKeybindings } from '../useGlobalKeybindings.js'

function TestHarness({ onUndo, onJumpHome }) {
  const titleRef = useRef(null)
  useGlobalKeybindings({ onUndo, onJumpHome, homeFocusRef: titleRef })
  return (
    <button type="button" ref={titleRef}>
      Playlist Notes
    </button>
  )
}

const dispatchKey = (target, options) => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...options,
  })
  target.dispatchEvent(event)
  return event
}

describe('useGlobalKeybindings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('invokes undo callback on Ctrl/Cmd+Z', () => {
    const undo = vi.fn()
    const jump = vi.fn()
    render(<TestHarness onUndo={undo} onJumpHome={jump} />)

    dispatchKey(window, { key: 'z', ctrlKey: true })

    expect(undo).toHaveBeenCalledTimes(1)
    expect(jump).not.toHaveBeenCalled()
  })

  it('focuses the provided title ref and calls onJumpHome when Home is pressed outside inputs', async () => {
    const undo = vi.fn()
    const jump = vi.fn()
    render(<TestHarness onUndo={undo} onJumpHome={jump} />)

    const titleButton = screen.getByRole('button', { name: 'Playlist Notes' })

    dispatchKey(window, { key: 'Home' })

    await waitFor(() => {
      expect(jump).toHaveBeenCalledTimes(1)
      expect(titleButton).toHaveFocus()
    })
  })

  it('ignores Home presses that originate from editable elements', () => {
    const undo = vi.fn()
    const jump = vi.fn()
    render(<TestHarness onUndo={undo} onJumpHome={jump} />)

    const input = document.createElement('input')
    document.body.appendChild(input)

    dispatchKey(input, { key: 'Home' })

    expect(jump).not.toHaveBeenCalled()

    input.remove()
  })
})
