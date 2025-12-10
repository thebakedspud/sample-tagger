// src/utils/focusById.js

/**
 * Focus an element by id on the next animation frame, asking the browser
 * not to scroll it into view. This helps avoid unexpected scroll jumps,
 * especially on mobile when the soft keyboard appears.
 *
 * @param {string} id
 * @param {FocusOptions} [options]
 */
export function focusById(id, options = {}) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el || typeof el.focus !== 'function') return;
    try {
      // Newer browsers support preventScroll in the options bag.
      el.focus({ preventScroll: true, ...options });
    } catch {
      // Fallback for older browsers that don't support an options object.
      el.focus();
    }
  });
}

/**
 * Schedules focus on a specific element on the next animation frame to avoid
 * forcing a synchronous layout flush immediately after DOM mutations.
 *
 * @param {HTMLElement | null} element
 * @param {FocusOptions} [options]
 */
export function focusElement(element, options = {}) {
  if (!element || typeof element.focus !== 'function') return;
  requestAnimationFrame(() => {
    if (typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true, ...options });
    } catch {
      element.focus();
    }
  });
}

// Optional default export so `import focusById from ...` also works
export default focusById;
