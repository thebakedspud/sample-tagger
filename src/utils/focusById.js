// src/utils/focusById.js
export function focusById(id) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el && typeof el.focus === 'function') {
      el.focus();
    }
  });
}

// Optional default export so `import focusById from ...` also works
export default focusById;
