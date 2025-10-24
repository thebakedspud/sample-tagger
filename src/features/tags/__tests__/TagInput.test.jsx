import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TagInput from '../../tags/TagInput.jsx'
import { STOCK_TAGS } from '../../tags/constants.js'

function setup(props = {}) {
  const handleAdd = vi.fn().mockReturnValue(true)
  const handleCancel = vi.fn()
  render(
    <TagInput
      stockTags={STOCK_TAGS}
      customTags={['drone', 'dirty']}
      existingTags={[]}
      onAdd={handleAdd}
      onCancel={handleCancel}
      autoFocus
      {...props}
    />,
  )
  const input = screen.getByPlaceholderText(/add tag/i)
  return { input, handleAdd, handleCancel }
}

describe('TagInput', () => {
  it('suggests matching tags with stock entries first', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'dr' } })
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options.slice(0, 3)).toEqual(['drill', 'dreamy', 'drums'])
  })

  it('omits existing tags from the suggestion list', () => {
    const { input } = setup({ existingTags: ['drill'] })
    fireEvent.change(input, { target: { value: 'dr' } })
    const optionTexts = screen.getAllByRole('option').map((option) => option.textContent)
    expect(optionTexts).not.toContain('drill')
  })

  it('normalizes the selected tag before calling onAdd', () => {
    const { input, handleAdd } = setup()
    fireEvent.change(input, { target: { value: ' DrOnE ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handleAdd).toHaveBeenCalledWith('drone')
  })
})
