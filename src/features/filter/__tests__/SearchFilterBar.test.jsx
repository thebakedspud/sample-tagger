import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchFilterBar from '../SearchFilterBar.jsx'
import { SEARCH_SCOPE, SORT_DIRECTION, SORT_KEY } from '../filterTracks.js'

function renderBar(overrides = {}) {
  const props = {
    query: '',
    onQueryChange: () => {},
    scope: SEARCH_SCOPE.BOTH,
    onScopeChange: () => {},
    sort: { key: SORT_KEY.DATE, direction: SORT_DIRECTION.DESC },
    onSortChange: () => {},
    hasNotesOnly: false,
    onHasNotesToggle: () => {},
    selectedTags: [],
    onToggleTag: () => {},
    availableTags: [],
    hasActiveFilters: false,
    onClearFilters: () => {},
    summaryText: 'Showing 3 of 3 tracks',
    filteredCount: 3,
    totalCount: 3,
    searchInputRef: { current: null },
    ...overrides,
  }

  return render(<SearchFilterBar {...props} />)
}

describe('SearchFilterBar segmented scope control', () => {
  it('moves between options with arrow keys', async () => {
    const onScopeChange = vi.fn()
    renderBar({ onScopeChange })

    const scopeButtons = screen.getAllByRole('radio')
    expect(scopeButtons).toHaveLength(3)

    scopeButtons[0].focus()
    expect(scopeButtons[0]).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(onScopeChange).toHaveBeenLastCalledWith(SEARCH_SCOPE.TRACK)

    await userEvent.keyboard('{ArrowRight}')
    expect(onScopeChange).toHaveBeenLastCalledWith(SEARCH_SCOPE.NOTES)

    await userEvent.keyboard('{Home}')
    expect(onScopeChange).toHaveBeenLastCalledWith(SEARCH_SCOPE.BOTH)
  })

  it('updates focus when clicking options', async () => {
    const user = userEvent.setup()
    const handleScopeChange = vi.fn()
    renderBar({ onScopeChange: handleScopeChange })

    const notesButton = screen.getByRole('radio', { name: /notes/i })
    await user.click(notesButton)
    expect(handleScopeChange).toHaveBeenLastCalledWith(SEARCH_SCOPE.NOTES)
  })
})
