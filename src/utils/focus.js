// src/utils/focus.js
export function focusById(id) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(id)
    if (el) el.focus()
  })
}
