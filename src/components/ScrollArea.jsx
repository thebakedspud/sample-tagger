import { forwardRef, useEffect, useRef, useImperativeHandle } from 'react'

/**
 * @typedef {object} ScrollAreaProps
 * @property {string} [className] - Additional CSS classes
 * @property {import('react').CSSProperties} [style] - Inline styles
 * @property {string} [saveKey] - If provided, persists scrollTop to sessionStorage
 *   under this key. Useful for restoring scroll position on remount.
 * @property {import('react').ReactNode} [children]
 */

/**
 * Lightweight scroll container that isolates scroll context from the window.
 * Designed for virtualized lists to prevent iOS Safari keyboard-triggered
 * viewport changes from causing scroll jumps.
 *
 * @type {import('react').ForwardRefExoticComponent<ScrollAreaProps & import('react').RefAttributes<HTMLDivElement>>}
 */
const ScrollArea = forwardRef(function ScrollArea(
  /** @type {ScrollAreaProps} */
  { className, style, saveKey, children, ...rest },
  ref,
) {
  const innerRef = useRef(null)

  // Expose the inner ref to parent components
  useImperativeHandle(ref, () => innerRef.current, [])

  // Restore scroll position on mount if saveKey is provided
  useEffect(() => {
    if (!saveKey || !innerRef.current) return

    try {
      const saved = sessionStorage.getItem(saveKey)
      if (saved != null) {
        const scrollTop = parseInt(saved, 10)
        if (Number.isFinite(scrollTop) && scrollTop > 0) {
          innerRef.current.scrollTop = scrollTop
        }
      }
    } catch {
      // Silently ignore storage errors (private browsing, quota, etc.)
    }
  }, [saveKey])

  // Save scroll position on unmount if saveKey is provided
  useEffect(() => {
    if (!saveKey) return

    const el = innerRef.current
    return () => {
      if (!el) return
      try {
        sessionStorage.setItem(saveKey, String(Math.round(el.scrollTop)))
      } catch {
        // Silently ignore storage errors
      }
    }
  }, [saveKey])

  return (
    <div
      ref={innerRef}
      className={className ? `scroll-area ${className}` : 'scroll-area'}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})

export default ScrollArea
