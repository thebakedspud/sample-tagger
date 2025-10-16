import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Manage inline undo placeholders with timers and metadata.
 * @param {{
 *   timeoutMs?: number,
 *   onUndo?: (meta: any, id: string) => void,
 *   onExpire?: (meta: any, id: string, cause: 'timeout' | 'manual') => void,
 * }} [options]
 */
export default function useInlineUndo(options) {
  const { timeoutMs = 600000, onUndo, onExpire } = options || {}
  const [pending, setPending] = useState(() => new Map())
  const pendingRef = useRef(pending)
  const timersRef = useRef(new Map())
  const lastIdRef = useRef(null)

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  const clearTimer = useCallback((id) => {
    if (!id) return
    const existing = timersRef.current.get(id)
    if (existing != null) {
      window.clearTimeout(existing)
      timersRef.current.delete(id)
    }
  }, [])

  const updateLastId = useCallback((nextMap) => {
    const keys = Array.from(nextMap.keys())
    lastIdRef.current = keys.length > 0 ? keys[keys.length - 1] : null
  }, [])

  const schedule = useCallback((id, meta) => {
    if (!id) return

    clearTimer(id)
    setPending(prev => {
      const next = new Map(prev)
      next.set(id, meta)
      updateLastId(next)
      return next
    })

    const tid = window.setTimeout(() => {
      timersRef.current.delete(id)
      const metaForId = pendingRef.current.get(id)
      if (!metaForId) return
      setPending(prev => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        updateLastId(next)
        return next
      })
      onExpire?.(metaForId, id, 'timeout')
    }, timeoutMs)

    timersRef.current.set(id, tid)
  }, [clearTimer, onExpire, timeoutMs, updateLastId])

  const undo = useCallback((id) => {
    const targetId = id ?? lastIdRef.current
    if (!targetId) return
    const meta = pendingRef.current.get(targetId)
    if (!meta) return

    clearTimer(targetId)
    setPending(prev => {
      if (!prev.has(targetId)) return prev
      const next = new Map(prev)
      next.delete(targetId)
      updateLastId(next)
      return next
    })
    onUndo?.(meta, targetId)
  }, [clearTimer, onUndo, updateLastId])

  const expire = useCallback((id) => {
    const targetId = id ?? lastIdRef.current
    if (!targetId) return
    const meta = pendingRef.current.get(targetId)
    if (!meta) return

    clearTimer(targetId)
    setPending(prev => {
      if (!prev.has(targetId)) return prev
      const next = new Map(prev)
      next.delete(targetId)
      updateLastId(next)
      return next
    })
    onExpire?.(meta, targetId, 'manual')
  }, [clearTimer, onExpire, updateLastId])

  const clearAll = useCallback(() => {
    for (const tid of timersRef.current.values()) {
      window.clearTimeout(tid)
    }
    timersRef.current.clear()
    setPending(new Map())
    lastIdRef.current = null
  }, [])

  const isPending = useCallback((id) => pendingRef.current.has(id), [])

  useEffect(() => () => {
    for (const tid of timersRef.current.values()) {
      window.clearTimeout(tid)
    }
    timersRef.current.clear()
  }, [])

  return {
    pending,
    schedule,
    undo,
    expire,
    isPending,
    clear: clearAll,
    lastPendingId: lastIdRef,
  }
}
