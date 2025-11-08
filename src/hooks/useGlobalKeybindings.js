import { useEffect } from 'react'

/**
 * @param {Object} params
 * @param {(() => void) | null | undefined} params.onUndo
 * @param {(() => void) | null | undefined} params.onJumpHome
 * @param {import('react').RefObject<HTMLElement>} [params.homeFocusRef]
 */
export function useGlobalKeybindings({ onUndo, onJumpHome, homeFocusRef } = {}) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    /** @param {EventTarget | null} target */
    const isEditableTarget = (target) => {
      if (!target || !(target instanceof HTMLElement)) return false
      const tagName = target.tagName
      return (
        target.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT'
      )
    }

    /** @param {KeyboardEvent} event */
    const handler = (event) => {
      if (event.defaultPrevented) return

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

      if (
        onUndo &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        key === 'z'
      ) {
        event.preventDefault()
        onUndo()
        return
      }

      if (
        onJumpHome &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key === 'Home'
      ) {
        // Do not hijack Home when user is editing text
        if (isEditableTarget(event.target)) return
        event.preventDefault()
        onJumpHome()
        if (homeFocusRef?.current) {
          const focusTarget = () => {
            homeFocusRef.current?.focus()
          }
          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(focusTarget)
          } else {
            setTimeout(focusTarget, 0)
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onUndo, onJumpHome, homeFocusRef])
}
