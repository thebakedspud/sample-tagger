import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TagChip from '../../tags/TagChip.jsx'

describe('TagChip', () => {
  it('renders a pressed button for the provided tag', () => {
    render(<TagChip tag="drill" />)
    const button = screen.getByRole('button', { name: /remove tag drill/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('invokes filter and remove callbacks when clicked', () => {
    const onFilter = vi.fn()
    const onRemove = vi.fn()
    render(<TagChip tag="drill" onFilter={onFilter} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove tag drill/i }))
    expect(onFilter).toHaveBeenCalledWith('drill')
    expect(onRemove).toHaveBeenCalledWith('drill')
  })

  it('respects onClick handlers that prevent default behavior', () => {
    const onFilter = vi.fn()
    const onRemove = vi.fn()
    const onClick = vi.fn((event) => event.preventDefault())

    render(<TagChip tag="ambient" onFilter={onFilter} onRemove={onRemove} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /remove tag ambient/i }))

    expect(onClick).toHaveBeenCalled()
    expect(onFilter).not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('handles remove-only chips', () => {
    const onRemove = vi.fn()
    render(<TagChip tag="solo" onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove tag solo/i }))
    expect(onRemove).toHaveBeenCalledWith('solo')
  })
})
