// src/utils/focusById.js
export function focusById(id) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el && typeof el.focus === 'function') {
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
export function focusElement(element, options) {
  if (!element || typeof element.focus !== 'function') return;
  requestAnimationFrame(() => {
    if (typeof element.focus === 'function') {
      element.focus(options);
    }
  });
}

// Optional default export so `import focusById from ...` also works
export default focusById;
