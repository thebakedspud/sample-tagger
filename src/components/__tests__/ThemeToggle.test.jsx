import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeToggle from '../ThemeToggle.jsx'

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    document.documentElement.dataset.theme = ''
    document.body.dataset.theme = ''
    document.documentElement.className = ''
    document.body.className = ''
    mockMatchMedia(false)
  })

  it('initializes from saved dark preference and sets attributes', async () => {
    localStorage.setItem('theme', 'dark')

    render(<ThemeToggle />)

    const button = await screen.findByRole('button', { name: /switch to light mode/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.body.classList.contains('theme-dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('toggles theme and persists preference', async () => {
    localStorage.setItem('theme', 'light')
    const user = userEvent.setup()

    render(<ThemeToggle />)
    const button = await screen.findByRole('button', { name: /switch to dark mode/i })

    await user.click(button)

    expect(button).toHaveAttribute('aria-label', 'Switch to light mode')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.body.classList.contains('theme-dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('defaults to system preference when no stored value', () => {
    mockMatchMedia(true)
    render(<ThemeToggle />)

    const button = screen.getByRole('button', { name: /switch to light mode/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
