import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTagSyncScheduler } from '../../tags/tagSyncQueue.js'

describe('createTagSyncScheduler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces multiple updates into a single send call', async () => {
    vi.useFakeTimers()
    const send = vi.fn(() => Promise.resolve())
    const scheduler = createTagSyncScheduler(send, 300)

    const promise1 = scheduler.schedule('track-1', ['drill'])
    const promise2 = scheduler.schedule('track-1', ['drill', 'dark'])

    vi.advanceTimersByTime(299)
    expect(send).not.toHaveBeenCalled()

    const promise3 = scheduler.schedule('track-1', ['dark'])

    vi.advanceTimersByTime(300)

    await Promise.all([promise1, promise2, promise3])

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('track-1', ['dark'])
  })
})

