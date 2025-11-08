import { describe, expect, it, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import AccountView from '../AccountView.jsx'

vi.mock('../../../components/ThemeToggle.jsx', () => ({
  default: () => <div data-testid="theme-toggle" />,
}))

vi.mock('../../../components/display/FontSettings.jsx', () => ({
  default: () => <div data-testid="font-settings" />,
}))

const baseProps = {
  recoveryCode: 'ABCD-EFGH',
  recoveryAcknowledgedAt: '2024-01-01T00:00:00Z',
  recoveryCopyButtonRef: { current: null },
  onConfirmRegenerate: vi.fn(),
  onCopyRecoveryCode: vi.fn(),
  onOpenRestoreDialog: vi.fn(),
  onRequestRecoveryModal: vi.fn(),
  showBackupPrompt: false,
}

describe('AccountView', () => {
  it('reveals recovery code, auto-remasks after timeout, and toggles aria state', async () => {
    vi.useFakeTimers()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AccountView {...baseProps} />)

    expect(screen.getByText('****-**GH')).toBeInTheDocument()

    const toggleButton = screen.getByRole('button', { name: /reveal code/i })
    fireEvent.click(toggleButton)

    expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument()
    expect(toggleButton).toHaveAttribute('aria-pressed', 'true')

    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.getByText('****-**GH')).toBeInTheDocument()
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false')
    confirmSpy.mockRestore()
    vi.useRealTimers()
  })

  it('requires confirmation before regenerating recovery code', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onConfirmRegenerate = vi.fn()

    render(<AccountView {...baseProps} onConfirmRegenerate={onConfirmRegenerate} />)

    const regenerateButton = screen.getByRole('button', { name: /regenerate/i })
    fireEvent.click(regenerateButton)
    expect(onConfirmRegenerate).not.toHaveBeenCalled()

    confirmSpy.mockReturnValueOnce(true)
    fireEvent.click(regenerateButton)
    expect(onConfirmRegenerate).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('exposes backup prompt actions', async () => {
    const onRequestRecoveryModal = vi.fn()
    render(<AccountView {...baseProps} showBackupPrompt onRequestRecoveryModal={onRequestRecoveryModal} />)

    fireEvent.click(screen.getByRole('button', { name: /backup options/i }))
    expect(onRequestRecoveryModal).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /back up now/i }))
    expect(onRequestRecoveryModal).toHaveBeenCalledTimes(2)
  })
})
