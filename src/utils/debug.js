/**
 * Development-only focus debugging utilities
 * @module utils/debug
 */

/**
 * Feature flag for focus debugging
 * Enabled in development environments, disabled in production
 * Safe for SSR contexts (checks for globalThis availability)
 */
export const DEBUG_FOCUS = (() => {
  if (typeof globalThis === 'undefined') return true
  const maybeProcess =
    typeof globalThis === 'object' && globalThis && 'process' in globalThis
      ? /** @type {{ env?: { NODE_ENV?: string } }} */ (globalThis.process)
      : undefined
  if (maybeProcess && maybeProcess.env && typeof maybeProcess.env.NODE_ENV === 'string') {
    return maybeProcess.env.NODE_ENV !== 'production'
  }
  return true
})()

/**
 * Log focus state for debugging purposes
 * Only logs when DEBUG_FOCUS is enabled and document is available
 *
 * @param {string} label - Debug label for the log entry
 * @param {object} details - Additional details to include in the log
 */
export function debugFocus(label, details = {}) {
  if (!DEBUG_FOCUS || typeof document === 'undefined') return
  const active = document.activeElement
  const payload = {
    ...details,
    activeId: active?.id ?? null,
    activeRole: typeof active?.getAttribute === 'function' ? active.getAttribute('role') : null,
    ts: Date.now(),
  }
  console.log(`[focus dbg] ${label}`, payload)
}
