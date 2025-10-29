/* global describe, it, expect */
import { render, screen } from '@testing-library/react'
import ErrorMessage from '../ErrorMessage.jsx'

describe('ErrorMessage', () => {
  it('renders error message with role="alert"', () => {
    render(<ErrorMessage>Something went wrong</ErrorMessage>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
  })

  it('accepts id prop for aria-describedby linkage', () => {
    render(<ErrorMessage id="test-error">Error text</ErrorMessage>)

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'test-error')
  })

  it('accepts custom className', () => {
    render(<ErrorMessage className="custom-error">Error</ErrorMessage>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('error-message')
    expect(alert).toHaveClass('custom-error')
  })

  it('returns null when children is empty', () => {
    const { container } = render(<ErrorMessage>{null}</ErrorMessage>)

    expect(container.firstChild).toBeNull()
  })

  it('returns null when children is undefined', () => {
    const { container } = render(<ErrorMessage>{undefined}</ErrorMessage>)

    expect(container.firstChild).toBeNull()
  })

  it('returns null when children is empty string', () => {
    const { container } = render(<ErrorMessage>{''}</ErrorMessage>)

    expect(container.firstChild).toBeNull()
  })
})
