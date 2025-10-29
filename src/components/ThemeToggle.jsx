// src/components/ThemeToggle.jsx
import { useState, useEffect } from 'react'

function applyTheme(isDark) {
  const theme = isDark ? 'dark' : 'light'

  // Set data-theme on both <html> and <body> (covers selector differences)
  const root = document.documentElement
  const body = document.body

  root.dataset.theme = theme
  body.dataset.theme = theme

  // Also set explicit classes as a fallback
  root.classList.toggle('theme-dark', isDark)
  root.classList.toggle('theme-light', !isDark)
  body.classList.toggle('theme-dark', isDark)
  body.classList.toggle('theme-light', !isDark)

  // Persist
  localStorage.setItem('theme', theme)
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') return true
    if (saved === 'light') return false
    return (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    )
  })

  useEffect(() => {
    applyTheme(isDark)
  }, [isDark])

  function toggleTheme() {
    setIsDark(v => !v)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark ? 'true' : 'false'}
      className="btn"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1.2 }}
    >
      {/* emoji visible, hidden from SR */}
      <span aria-hidden="true" style={{ fontSize: 16 }}>
        {isDark ? '☀️' : '🌙'}
      </span>
      <span aria-hidden="true">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  )
}
