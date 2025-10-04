// src/features/undo/usePendingDelete.js
import { useEffect, useRef, useState } from 'react';

/**
 * Inline-undo helper for list items.
 * Manages timers and announcements for "pending delete" placeholders.
 *
 * Usage:
 *   const { start, undo, isPending } = usePendingDelete({
 *     timeoutMs: 5000,
 *     onAnnounce: (msg) => {},
 *     onFinalize: (id) => {} // called when timer elapses
 *   })
 *
 *   start(id)          -> begin the timer for this id
 *   undo(id)           -> cancel timer and announce restore
 *   isPending(id)      -> whether id is currently pending
 */
export function usePendingDelete({ timeoutMs = 5000, onAnnounce, onFinalize }) {
  const [pending, setPending] = useState(new Map()); // id -> true
  const timersRef = useRef(new Map());               // id -> timerId

  const say = (msg) => { try { onAnnounce?.(msg); } catch { /* no-op */ } };

  function start(id) {
    if (timersRef.current.has(id)) return; // already running

    const tid = setTimeout(() => {
      timersRef.current.delete(id);
      setPending(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      onFinalize?.(id);
      say('Note deleted');
    }, timeoutMs);

    timersRef.current.set(id, tid);
    setPending(prev => {
      const next = new Map(prev);
      next.set(id, true);
      return next;
    });
    say('Note deleted. Press Undo to restore');
  }

  function undo(id) {
    const tid = timersRef.current.get(id);
    if (tid) {
      clearTimeout(tid);
      timersRef.current.delete(id);
    }
    setPending(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    say('Note restored');
  }

  function isPending(id) {
    return pending.has(id);
  }

  // Cleanup all timers on unmount
  useEffect(() => {
    // Snapshot the ref once so cleanup uses a stable reference
    const timersAtMount = timersRef.current;

    return () => {
      for (const tid of timersAtMount.values()) clearTimeout(tid);
      timersAtMount.clear();
    };
  }, []);

  return { start, undo, isPending };
}
