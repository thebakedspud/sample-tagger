import { useTheme } from '../theme/ThemeContext.jsx'

export default function ThemeToggle({ className = 'button' }) {  // default
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      className={className}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? '☀️ Light' : '🌙 Dark'}
    </button>
  )
}
