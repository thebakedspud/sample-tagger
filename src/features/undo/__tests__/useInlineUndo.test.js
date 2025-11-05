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

  it('ignores schedule calls without an id and keeps pending empty', () => {
    const { result } = renderHook(() => useInlineUndo({ timeoutMs: 100 }))

    act(() => {
      result.current.schedule(null, { trackId: 'missing' })
      result.current.schedule('', { trackId: 'missing' })
    })

    expect(result.current.pending.size).toBe(0)
  })

  it('skips expire when id not found and exposes isPending helper', () => {
    const onExpire = vi.fn()
    const meta = { trackId: 't3' }
    const { result } = renderHook(() =>
      useInlineUndo({ timeoutMs: 200, onExpire })
    )

    act(() => {
      result.current.expire('unknown')
    })
    expect(onExpire).not.toHaveBeenCalled()

    act(() => {
      result.current.schedule('pending-4', meta)
    })
    expect(result.current.isPending('pending-4')).toBe(true)

    act(() => {
      result.current.expire('pending-4')
    })
    expect(onExpire).toHaveBeenCalledWith(meta, 'pending-4', 'manual')
    expect(result.current.isPending('pending-4')).toBe(false)
  })

  it('reschedules timers when scheduling the same id twice', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useInlineUndo({ timeoutMs: 100, onExpire }))

    act(() => {
      result.current.schedule('pending-5', { label: 'first' })
    })
    act(() => {
      vi.advanceTimersByTime(50)
      result.current.schedule('pending-5', { label: 'second' })
    })

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(onExpire.mock.calls[0][0]).toEqual({ label: 'second' })
    expect(onExpire.mock.calls[0][1]).toBe('pending-5')
  })

  it('clear removes all timers and pending entries', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useInlineUndo({ timeoutMs: 100, onExpire }))

    act(() => {
      result.current.schedule('a', { value: 1 })
      result.current.schedule('b', { value: 2 })
    })
    expect(result.current.pending.size).toBe(2)

    act(() => {
      result.current.clear()
    })

    expect(result.current.pending.size).toBe(0)
    act(() => {
      vi.runAllTimers()
    })
    expect(onExpire).not.toHaveBeenCalled()
  })
})
