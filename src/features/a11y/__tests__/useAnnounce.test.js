import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useAnnounce from '../useAnnounce.js'

describe('useAnnounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces rapid calls and only publishes the latest message', () => {
    const { result } = renderHook(() => useAnnounce({ debounceMs: 60 }))

    act(() => {
      result.current.announce('first')
      result.current.announce('second')
      result.current.announce('final')
    })

    expect(result.current.message).toBe('')

    act(() => {
      vi.advanceTimersByTime(60)
    })

    expect(result.current.message).toBe('final')
  })

  it('clear() cancels any pending announcement', () => {
    const { result } = renderHook(() => useAnnounce({ debounceMs: 60 }))

    act(() => {
      result.current.announce('incoming')
      result.current.clear()
      vi.advanceTimersByTime(60)
    })

    expect(result.current.message).toBe('')
  })

  it('flush() publishes immediately without waiting for debounce', () => {
    const { result } = renderHook(() => useAnnounce())

    act(() => {
      result.current.flush('instant')
    })

    expect(result.current.message).toBe('instant')
  })

  it('cleans up timers on unmount', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = renderHook(() => useAnnounce({ debounceMs: 60 }))

    act(() => {
      result.current.announce('later')
    })

    unmount()

    act(() => {
      vi.runAllTimers()
    })

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
