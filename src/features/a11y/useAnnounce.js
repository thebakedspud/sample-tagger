import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Manage debounced announcements for a live region.
 * @param {{ debounceMs?: number }} [options]
 */
export default function useAnnounce(options) {
  const { debounceMs = 60 } = options || {}
  const [message, setMessage] = useState('')
  const timerRef = useRef(/** @type {number | undefined} */ (undefined))

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  const announce = useCallback((text) => {
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      setMessage(text)
      timerRef.current = undefined
    }, debounceMs)
  }, [clearTimer, debounceMs])

  const clear = useCallback(() => {
    clearTimer()
    setMessage('')
  }, [clearTimer])

  const flush = useCallback((text) => {
    clearTimer()
    setMessage(text)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return { message, announce, clear, flush }
}
