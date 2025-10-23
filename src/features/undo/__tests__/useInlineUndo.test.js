import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useInlineUndo from '../useInlineUndo.js'

describe('useInlineUndo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules metadata and auto-expires after the timeout', () => {
    const onExpire = vi.fn()
    const meta = { trackId: 't1', note: 'hello', index: 0 }
    const { result } = renderHook(() =>
      useInlineUndo({ timeoutMs: 100, onExpire })
    )

    act(() => {
      result.current.schedule('pending-1', meta)
    })

    expect(result.current.pending.get('pending-1')).toEqual(meta)

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(onExpire).toHaveBeenCalledWith(meta, 'pending-1', 'timeout')
    expect(result.current.pending.size).toBe(0)
  })

  it('undo() restores the payload and cancels the timer', () => {
    const onUndo = vi.fn()
    const onExpire = vi.fn()
    const meta = { trackId: 't1', note: 'hello', index: 0 }
    const { result } = renderHook(() =>
      useInlineUndo({ timeoutMs: 200, onUndo, onExpire })
    )

    act(() => {
      result.current.schedule('pending-2', meta)
    })

    act(() => {
      result.current.undo('pending-2')
    })

    expect(onUndo).toHaveBeenCalledWith(meta, 'pending-2')
    expect(onExpire).not.toHaveBeenCalled()

    act(() => {
      vi.runAllTimers()
    })

    expect(onExpire).not.toHaveBeenCalled()
    expect(result.current.pending.size).toBe(0)
  })

  it('clears timers on unmount', () => {
    const onExpire = vi.fn()
    const { result, unmount } = renderHook(() =>
      useInlineUndo({ timeoutMs: 50, onExpire })
    )

    act(() => {
      result.current.schedule('pending-3', { trackId: 't2' })
    })

    unmount()

    act(() => {
      vi.runAllTimers()
    })

    expect(onExpire).not.toHaveBeenCalled()
  })
})
