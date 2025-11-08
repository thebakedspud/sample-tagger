// src/features/account/__tests__/useDeviceRecovery.test.js
import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import useDeviceRecovery from '../useDeviceRecovery.js'

// Mock dependencies - must be before imports due to hoisting
vi.mock('../../../lib/apiClient.js', () => ({
  apiFetch: vi.fn(),
}))

vi.mock('../../../lib/deviceState.js', () => ({
  getDeviceId: vi.fn(() => null),
  setDeviceId: vi.fn(),
  getAnonId: vi.fn(() => null),
  setAnonId: vi.fn(),
  saveRecoveryCode: vi.fn(),
  getStoredRecoveryCode: vi.fn(() => null),
  getRecoveryAcknowledgement: vi.fn(() => null),
  hasAcknowledgedRecovery: vi.fn(() => false),
  markRecoveryAcknowledged: vi.fn(),
  clearRecoveryAcknowledgement: vi.fn(),
  ensureRecoveryCsrfToken: vi.fn(() => 'csrf-token-123'),
  clearRecoveryState: vi.fn(),
  clearDeviceContext: vi.fn(),
}))

// Import mocked modules
// @ts-ignore - Dynamic import of mocked module
const { apiFetch: apiFetchMock } = await import('../../../lib/apiClient.js')
// @ts-ignore - Dynamic import of mocked module
const deviceStateMocks = await import('../../../lib/deviceState.js')

// Test callbacks
const announceMock = vi.fn()
const onAppResetMock = vi.fn()

describe('useDeviceRecovery', () => {
  // Helper to reset all mocks
  function resetMocks() {
    vi.clearAllMocks()
    // @ts-ignore - Mock function type
    apiFetchMock.mockReset()
    // @ts-ignore - Mock function type
    announceMock.mockReset()
    // @ts-ignore - Mock function type
    onAppResetMock.mockReset()
    Object.values(deviceStateMocks).forEach((mock) => {
      // @ts-ignore - Mock function type
      if (typeof mock.mockReset === 'function') {
        // @ts-ignore - Mock function type
        mock.mockReset()
      }
    })

    // Reset to default return values
    // @ts-ignore - Mock function type
    deviceStateMocks.getDeviceId.mockReturnValue(null)
    // @ts-ignore - Mock function type
    deviceStateMocks.getAnonId.mockReturnValue(null)
    // @ts-ignore - Mock function type
    deviceStateMocks.getStoredRecoveryCode.mockReturnValue(null)
    // @ts-ignore - Mock function type
    deviceStateMocks.getRecoveryAcknowledgement.mockReturnValue(null)
    // @ts-ignore - Mock function type
    deviceStateMocks.hasAcknowledgedRecovery.mockReturnValue(false)
    // @ts-ignore - Mock function type
    deviceStateMocks.ensureRecoveryCsrfToken.mockReturnValue('csrf-token-123')

    // Default apiFetch mock (suppresses bootstrap calls)
    // @ts-ignore - Mock function type
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ anonId: 'test-anon', recoveryCode: 'TEST-CODE' }),
    })
  }

  beforeEach(() => {
    resetMocks()
  })

  async function renderDeviceRecovery(options = {}) {
    const rendered = renderHook(() =>
      useDeviceRecovery({ announce: announceMock, onAppReset: onAppResetMock, ...options })
    )
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    return rendered
  }

  describe('Bootstrap', () => {
    it('bootstraps device on mount and receives recovery code', async () => {
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['x-device-id', 'device-123']]),
        json: async () => ({
          anonId: 'anon-456',
          recoveryCode: 'AAAA-BBBB-CCCC-DDDD',
        }),
      })

      const { result } = await renderDeviceRecovery()

      // Wait for bootstrap to complete
      await waitFor(() => {
        expect(result.current.anonId).toBe('anon-456')
      })

      expect(apiFetchMock).toHaveBeenCalledWith('/api/anon/bootstrap', {
        method: 'POST',
      })
      expect(deviceStateMocks.setDeviceId).toHaveBeenCalledWith('device-123')
      expect(deviceStateMocks.setAnonId).toHaveBeenCalledWith('anon-456')
      expect(deviceStateMocks.saveRecoveryCode).toHaveBeenCalledWith('AAAA-BBBB-CCCC-DDDD')
      expect(result.current.recoveryCode).toBe('AAAA-BBBB-CCCC-DDDD')
      expect(result.current.showRecoveryModal).toBe(true)
      expect(result.current.bootstrapError).toBe(null)
    })

    it('handles 404 error and retries once after clearing context', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getDeviceId.mockReturnValue('old-device-id')

      // First call returns 404
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Map(),
        json: async () => ({ error: 'Device not found' }),
      })

      // Second call (retry) succeeds
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['x-device-id', 'new-device-id']]),
        json: async () => ({
          anonId: 'new-anon-id',
          recoveryCode: 'BBBB-CCCC-DDDD-EEEE',
        }),
      })

      const { result } = await renderDeviceRecovery()

      await waitFor(() => {
        expect(result.current.anonId).toBe('new-anon-id')
      })

      expect(apiFetchMock).toHaveBeenCalledTimes(2)
      expect(deviceStateMocks.clearDeviceContext).toHaveBeenCalled()
      expect(result.current.bootstrapError).toBe(null)
    })

    it('sets bootstrap error when API returns non-404 error', async () => {
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Map(),
        json: async () => ({ error: 'Internal server error' }),
      })

      const { result } = await renderDeviceRecovery()

      await waitFor(() => {
        expect(result.current.bootstrapError).toBe('Internal server error')
      })
    })
  })

  describe('Recovery Modal', () => {
    it('acknowledges recovery modal and updates state', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getStoredRecoveryCode.mockReturnValue('TEST-CODE-1234')
      // @ts-ignore - Mock function type
      deviceStateMocks.hasAcknowledgedRecovery.mockReturnValue(false)

      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'TEST-CODE-1234' }),
      })

      const { result } = await renderDeviceRecovery()

      expect(result.current.recoveryCode).toBe('TEST-CODE-1234')
      expect(result.current.showRecoveryModal).toBe(true)

      act(() => {
        result.current.acknowledgeRecoveryModal()
      })

      expect(deviceStateMocks.markRecoveryAcknowledged).toHaveBeenCalledWith('TEST-CODE-1234')
      expect(result.current.showRecoveryModal).toBe(false)
      expect(announceMock).toHaveBeenCalledWith('Recovery code saved. You can now continue.')
    })

    it('opens recovery modal when requested', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getStoredRecoveryCode.mockReturnValue('TEST-CODE-1234')
      // @ts-ignore - Mock function type
      deviceStateMocks.hasAcknowledgedRecovery.mockReturnValue(true)
      // @ts-ignore - Mock function type
      deviceStateMocks.getRecoveryAcknowledgement.mockReturnValue({
        code: 'TEST-CODE-1234',
        acknowledgedAt: Date.now(),
      })

      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'TEST-CODE-1234' }),
      })

      const { result } = await renderDeviceRecovery()

      // Initially closed (already acknowledged)
      expect(result.current.showRecoveryModal).toBe(false)

      act(() => {
        result.current.openRecoveryModal()
      })

      expect(result.current.showRecoveryModal).toBe(true)
      expect(announceMock).toHaveBeenCalledWith(
        'Recovery code ready. Choose how you want to back it up.'
      )
    })
  })

  describe('Copy Recovery Code', () => {
    const originalClipboard = globalThis.navigator?.clipboard
    const originalExecCommand = document.execCommand

    afterEach(() => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        writable: true,
        value: originalClipboard,
      })
      document.execCommand = originalExecCommand
    })

    it('uses modern clipboard API when available', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getStoredRecoveryCode.mockReturnValue('AAAA-BBBB-CCCC-DDDD')

      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'AAAA-BBBB-CCCC-DDDD' }),
      })

      Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        writable: true,
        value: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.copyRecoveryCode()
      })

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AAAA-BBBB-CCCC-DDDD')
      expect(announceMock).toHaveBeenCalledWith('Recovery code copied.')
    })

    it('falls back to execCommand when clipboard API unavailable', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getStoredRecoveryCode.mockReturnValue('BBBB-CCCC-DDDD-EEEE')

      Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        writable: true,
        value: undefined,
      })
      const originalExecCommand = document.execCommand
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        writable: true,
        // @ts-ignore - Overriding readonly property for test
        value: vi.fn().mockReturnValue(true),
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.copyRecoveryCode()
      })

      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(announceMock).toHaveBeenCalledWith('Recovery code copied.')

      if (originalExecCommand !== undefined) {
        Object.defineProperty(document, 'execCommand', {
          configurable: true,
          writable: true,
          value: originalExecCommand,
        })
      } else {
        Reflect.deleteProperty(document, 'execCommand')
      }
    })

    it('announces failure when both clipboard methods fail', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getStoredRecoveryCode.mockReturnValue('CCCC-DDDD-EEEE-FFFF')

      const originalClipboard = globalThis.navigator.clipboard
      const originalExecCommand = document.execCommand

      // Remove clipboard entirely
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        writable: true,
        value: document.execCommand ?? vi.fn(),
      })
      // @ts-ignore - execCommand exists on Document
      const execCommandSpy = vi
        .spyOn(document, 'execCommand')
        .mockImplementation(() => {
          throw new Error('copy unsupported')
        })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.copyRecoveryCode()
      })

      expect(announceMock).toHaveBeenCalledWith('Copy failed. Please copy the code manually.')

      // Restore
      if (originalClipboard !== undefined) {
        Object.defineProperty(globalThis.navigator, 'clipboard', {
          value: originalClipboard,
          writable: true,
          configurable: true,
        })
      }
      execCommandSpy.mockRestore()
      if (originalExecCommand !== undefined) {
        Object.defineProperty(document, 'execCommand', {
          configurable: true,
          writable: true,
          value: originalExecCommand,
        })
      } else {
        Reflect.deleteProperty(document, 'execCommand')
      }
    })
  })

  describe('Regenerate Recovery Code', () => {
    it('regenerates recovery code and shows modal', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getStoredRecoveryCode.mockReturnValue('OLD-CODE-1234')

      // Bootstrap call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'TEST' }),
      })

      // Regenerate call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({
          anonId: 'anon-789',
          recoveryCode: 'NEW-CODE-5678',
        }),
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.regenerateRecoveryCode()
      })

      await waitFor(() => {
        expect(result.current.recoveryCode).toBe('NEW-CODE-5678')
      })

      expect(deviceStateMocks.clearRecoveryAcknowledgement).toHaveBeenCalled()
      expect(deviceStateMocks.saveRecoveryCode).toHaveBeenCalledWith('NEW-CODE-5678')
      expect(result.current.showRecoveryModal).toBe(true)
      expect(result.current.showBackupReminder).toBe(true)
      expect(announceMock).toHaveBeenCalledWith(
        'Recovery code regenerated. You must save this new code.'
      )
    })

    it('handles regeneration error', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getStoredRecoveryCode.mockReturnValue('OLD-CODE-1234')

      // Bootstrap call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'TEST' }),
      })

      // Regenerate call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Map(),
        json: async () => ({ error: 'Server error' }),
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.regenerateRecoveryCode()
      })

      await waitFor(() => {
        expect(result.current.recoveryRotationError).toBe('Server error')
      })
      expect(announceMock).toHaveBeenCalledWith('Could not regenerate recovery code.')
    })
  })

  describe('Restore Dialog', () => {
    it('opens restore dialog', async () => {
      const { result } = await renderDeviceRecovery()

      act(() => {
        result.current.openRestoreDialog()
      })

      expect(result.current.restoreDialogOpen).toBe(true)
      expect(result.current.restoreError).toBe(null)
    })

    it('closes restore dialog when not busy', async () => {
      const { result } = await renderDeviceRecovery()

      act(() => {
        result.current.openRestoreDialog()
      })

      expect(result.current.restoreDialogOpen).toBe(true)

      act(() => {
        result.current.closeRestoreDialog()
      })

      expect(result.current.restoreDialogOpen).toBe(false)
    })

    it('submits restore successfully and calls onAppReset', async () => {
      // @ts-ignore - Mock function type
      deviceStateMocks.getDeviceId.mockReturnValue('current-device-id')

      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({
          anonId: 'restored-anon-id',
        }),
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.submitRestore('aaaa-bbbb-cccc-dddd')
      })

      expect(apiFetchMock).toHaveBeenCalledWith('/api/anon/restore', {
        method: 'POST',
        body: JSON.stringify({ recoveryCode: 'AAAA-BBBB-CCCC-DDDD' }),
      })
      expect(deviceStateMocks.saveRecoveryCode).toHaveBeenCalledWith('AAAA-BBBB-CCCC-DDDD')
      expect(deviceStateMocks.markRecoveryAcknowledged).toHaveBeenCalledWith(
        'AAAA-BBBB-CCCC-DDDD'
      )
      expect(result.current.restoreDialogOpen).toBe(false)
      expect(result.current.showRecoveryModal).toBe(false)

      expect(onAppResetMock).toHaveBeenCalledWith({
        reason: 'restore',
        announcement: 'Recovery successful. This device is now linked to your notes.',
        screenTarget: 'landing',
      })
    })

    it('handles 401 error (invalid code)', async () => {
      // Bootstrap call (background)
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'TEST' }),
      })

      // Restore call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map(),
        json: async () => ({ error: 'Invalid code' }),
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.submitRestore('INVALID-CODE')
      })

      await waitFor(() => {
        expect(result.current.restoreError).toBe('Recovery code was not recognised.')
      })
      expect(onAppResetMock).not.toHaveBeenCalled()
    })

    it('handles 410 error (rotated code)', async () => {
      const rotatedAt = new Date('2024-01-15T10:00:00Z').toISOString()

      // Bootstrap call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'TEST' }),
      })

      // Restore call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: false,
        status: 410,
        headers: new Map(),
        json: async () => ({
          error: 'Code rotated',
          rotatedAt,
        }),
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.submitRestore('ROTATED-CODE')
      })

      await waitFor(() => {
        expect(result.current.restoreError).toBeTruthy()
        expect(result.current.restoreError).toContain('Code was replaced on')
      })
      expect(onAppResetMock).not.toHaveBeenCalled()
    })

    it('handles 429 error (rate limited)', async () => {
      // Bootstrap call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ anonId: 'test', recoveryCode: 'TEST' }),
      })

      // Restore call
      // @ts-ignore - Mock function type
      apiFetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map(),
        json: async () => ({ error: 'Too many requests' }),
      })

      const { result } = await renderDeviceRecovery()

      await act(async () => {
        await result.current.submitRestore('ANY-CODE')
      })

      await waitFor(() => {
        expect(result.current.restoreError).toBe('Too many attempts. Wait a bit and try again.')
      })
      expect(onAppResetMock).not.toHaveBeenCalled()
    })
  })
})
