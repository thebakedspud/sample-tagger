import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ErrorMessage from '../ErrorMessage.jsx'

describe('ErrorMessage', () => {
  it('renders error message with role="alert"', () => {
    render(<ErrorMessage id="error-message">Something went wrong</ErrorMessage>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
  })

  it('accepts id prop for aria-describedby linkage', () => {
    render(<ErrorMessage id="test-error">Error text</ErrorMessage>)

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'test-error')
  })

  it('accepts custom className', () => {
    render(
      <ErrorMessage id="custom-error" className="custom-error">
        Error
      </ErrorMessage>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('error-message')
    expect(alert).toHaveClass('custom-error')
  })

  it('returns null when children is empty', () => {
    const { container } = render(
      <ErrorMessage id="null-children">{null}</ErrorMessage>,
    )

    expect(container.firstChild).toBeNull()
  })

  it('returns null when children is undefined', () => {
    const { container } = render(
      <ErrorMessage id="undefined-children">{undefined}</ErrorMessage>,
    )

    expect(container.firstChild).toBeNull()
  })

  it('returns null when children is empty string', () => {
    const { container } = render(
      <ErrorMessage id="empty-string">{''}</ErrorMessage>,
    )

    expect(container.firstChild).toBeNull()
  })
})
