import { useTheme } from '../theme/ThemeContext'

export default function ThemeToggle({ className }) {
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
      {isDark ? '🌙 Dark' : '☀️ Light'}
    </button>
  )
}
