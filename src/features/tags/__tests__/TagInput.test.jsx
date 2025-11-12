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
    expect(options.slice(0, 3)).toEqual(['drums', 'dreamy', 'drone'])
  })

  it('omits existing tags from the suggestion list', () => {
    const { input } = setup({ existingTags: ['drums'] })
    fireEvent.change(input, { target: { value: 'dr' } })
    const optionTexts = screen.getAllByRole('option').map((option) => option.textContent)
    expect(optionTexts).not.toContain('drums')
  })

  it('normalizes the selected tag before calling onAdd', () => {
    const { input, handleAdd } = setup()
    fireEvent.change(input, { target: { value: ' DrOnE ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handleAdd).toHaveBeenCalledWith('drone')
  })

  it('invokes onAdd with highlighted suggestion when pressing Enter', () => {
    const { input, handleAdd } = setup()
    fireEvent.change(input, { target: { value: 'dr' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handleAdd).toHaveBeenCalledWith('drums')
  })

  it('retains query when onAdd returns false (duplicate)', () => {
    const duplicateAdd = vi.fn().mockReturnValue(false)
    const { input } = setup({ onAdd: duplicateAdd })
    fireEvent.change(input, { target: { value: 'drone' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(duplicateAdd).toHaveBeenCalledWith('drone')
    expect(/** @type {HTMLInputElement} */ (input).value).toBe('drone')
  })

  it('clears query and calls onCancel when Escape pressed', () => {
    const { input, handleCancel } = setup()
    fireEvent.change(input, { target: { value: 'ambient' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(handleCancel).toHaveBeenCalled()
    expect(/** @type {HTMLInputElement} */ (input).value).toBe('')
  })
})
