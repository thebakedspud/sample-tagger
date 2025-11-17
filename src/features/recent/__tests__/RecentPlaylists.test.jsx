import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecentPlaylists from '../RecentPlaylists.jsx'

describe('RecentPlaylists', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2023-01-01T00:00:00.000Z').getTime())
    vi.stubGlobal('requestAnimationFrame', (cb) => cb())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns null when there are no items', () => {
    const { container } = render(<RecentPlaylists items={[]} onSelect={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders playlist details with fallback artwork and recency label', () => {
    const items = [
      {
        id: 'spotify:abc123',
        provider: 'spotify',
        playlistId: 'abc123',
        title: 'Focus Mix',
        sourceUrl: 'https://example.com/focus',
        importedAt: Date.now() - 2 * 60 * 1000,
        lastUsedAt: Date.now() - 2 * 60 * 1000,
        total: 3,
      },
    ]

    render(<RecentPlaylists items={items} onSelect={vi.fn()} />)

    expect(
      screen.getByRole('button', {
        name: 'Load playlist "Focus Mix" from Spotify, 3 tracks',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Updated 2 minutes ago')).toBeInTheDocument()
    expect(screen.getByText('F', { selector: '.recent-card__fallback span' })).toBeInTheDocument()
  })

  it('shows loading state and restores focus when selection fails', async () => {
    const user = userEvent.setup()
    const items = [
      {
        id: 'spotify:xyz',
        provider: 'spotify',
        playlistId: 'xyz',
        title: 'Chill Hits',
        sourceUrl: 'https://example.com/chill',
        importedAt: Date.now(),
        lastUsedAt: Date.now(),
        total: 10,
      },
    ]
    const onSelect = vi.fn().mockResolvedValue({ ok: false, error: 'nope' })

    const { rerender } = render(
      <RecentPlaylists
        items={items}
        onSelect={onSelect}
        cardState={{ 'spotify:xyz': { loading: true } }}
      />,
    )

    const disabledButton = screen.getByRole('button', {
      name: 'Load playlist "Chill Hits" from Spotify, 10 tracks',
    })
    expect(disabledButton).toBeDisabled()
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    rerender(
      <RecentPlaylists
        items={items}
        onSelect={onSelect}
        cardState={{ 'spotify:xyz': { loading: false } }}
      />,
    )

    const actionableButton = screen.getByRole('button', {
      name: 'Load playlist "Chill Hits" from Spotify, 10 tracks',
    })

    await user.click(actionableButton)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(actionableButton).toHaveFocus()
  })

  it('shows refreshing indicator when a cached refresh is running', () => {
    const items = [
      {
        id: 'spotify:xyz',
        provider: 'spotify',
        playlistId: 'xyz',
        title: 'Chill Hits',
        sourceUrl: 'https://example.com/chill',
        importedAt: Date.now(),
        lastUsedAt: Date.now(),
        total: 10,
      },
    ]

    render(
      <RecentPlaylists
        items={items}
        onSelect={vi.fn()}
        refreshingId="spotify:xyz"
        isRefreshing
      />,
    )

    expect(screen.getByText('Refreshing latest data…')).toBeInTheDocument()
    const button = screen.getByRole('button', {
      name: 'Load playlist "Chill Hits" from Spotify, 10 tracks',
    })
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})
