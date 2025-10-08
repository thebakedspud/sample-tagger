// src/components/ThemeToggle.jsx
import { useState, useEffect } from 'react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') return true
    if (saved === 'light') return false
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  function toggleTheme() {
    setIsDark(v => !v)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Light mode toggle' : 'Dark mode toggle'}
      aria-pressed={isDark ? 'true' : 'false'}
      className="btn"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      {/* keep your emoji visible but hidden from SR */}
      <span aria-hidden="true" style={{ fontSize: 16 }}>
        {isDark ? '🌞' : '🌙'}
      </span>
      {/* optional: keep the text if you like the visual balance */}
      <span aria-hidden="true">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  )
}
