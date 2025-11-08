// src/features/account/useDeviceRecovery.js
import { useState, useRef, useCallback, useEffect } from 'react'
import { apiFetch } from '../../lib/apiClient.js'
import {
  getDeviceId,
  setDeviceId,
  getAnonId,
  setAnonId,
  saveRecoveryCode,
  getStoredRecoveryCode,
  hasAcknowledgedRecovery,
  markRecoveryAcknowledged,
  getRecoveryAcknowledgement,
  clearRecoveryAcknowledgement,
  clearDeviceContext,
  ensureRecoveryCsrfToken,
} from '../../lib/deviceState.js'

/**
 * @typedef {Object} AppResetPayload
 * @property {'restore' | 'logout' | 'clear'} reason - Why reset was triggered
 * @property {string} [announcement] - Optional accessibility announcement
 * @property {'landing' | 'playlist' | 'account'} [screenTarget] - Optional target screen
 * @property {Object} [extraState] - Optional additional reset metadata
 */

/**
 * Manages device identity, recovery codes, and multi-device sync.
 *
 * Handles:
 * - Device bootstrap (anonymous device ID + recovery code generation)
 * - Recovery modal flow (acknowledge, copy, regenerate)
 * - Restore dialog flow (submit recovery code to link device)
 * - CSRF token management for recovery operations
 *
 * @param {Object} options
 * @param {Function} options.announce - Accessibility announcement callback
 * @param {(payload: AppResetPayload) => void | Promise<void>} options.onAppReset - App state reset callback
 * @returns {Object} Device recovery state and handlers
 */
export default function useDeviceRecovery({ announce, onAppReset }) {
  // Initialize state from localStorage
  const initialRecoveryCode = getStoredRecoveryCode()
  const initialRecoveryMeta = getRecoveryAcknowledgement()
  const initialRecoveryAcknowledged = initialRecoveryCode
    ? hasAcknowledgedRecovery(initialRecoveryCode)
    : false

  // Identity state
  const [anonContext, setAnonContext] = useState(() => ({
    deviceId: getDeviceId(),
    anonId: getAnonId(),
  }))

  const [recoveryCode, setRecoveryCode] = useState(initialRecoveryCode)

  const [recoveryAckMeta, setRecoveryAckMeta] = useState(() => {
    if (!initialRecoveryCode || !initialRecoveryMeta) return null
    return initialRecoveryMeta.code === initialRecoveryCode
      ? initialRecoveryMeta
      : null
  })

  // UI state
  const [showRecoveryModal, setShowRecoveryModal] = useState(
    Boolean(initialRecoveryCode) && !initialRecoveryAcknowledged
  )

  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [showBackupReminder, setShowBackupReminder] = useState(false)

  // Operation state
  const [bootstrapError, setBootstrapError] = useState(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState(null)
  const [regeneratingRecovery, setRegeneratingRecovery] = useState(false)
  const [recoveryRotationError, setRecoveryRotationError] = useState(null)
  const [recoveryCsrfToken, setRecoveryCsrfToken] = useState(() => ensureRecoveryCsrfToken())

  // Refs
  const recoveryCopyButtonRef = useRef(null)

  // ===== Bootstrap Handler =====
  const bootstrapDevice = useCallback(async (allowRetry = true) => {
    const existingDeviceId = getDeviceId()
    try {
      const response = await apiFetch('/api/anon/bootstrap', {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({}))

      // Handle 404: device not found, retry once after clearing context
      if (response.status === 404 && existingDeviceId && allowRetry) {
        clearDeviceContext()
        setAnonContext({ deviceId: null, anonId: null })
        setRecoveryCode(null)
        setShowRecoveryModal(false)
        return bootstrapDevice(false)
      }

      if (!response.ok) {
        setBootstrapError(payload?.error ?? 'Failed to bootstrap device')
        return
      }

      // Update device ID from response header
      const headerDeviceId = response.headers.get('x-device-id')
      if (headerDeviceId) {
        setDeviceId(headerDeviceId)
      }

      // Update anon ID
      if (payload?.anonId) {
        setAnonId(payload.anonId)
      }

      // Handle recovery code
      if (payload?.recoveryCode) {
        const normalizedCode = payload.recoveryCode
        saveRecoveryCode(normalizedCode)
        setRecoveryCode(normalizedCode)

        const ackMeta = getRecoveryAcknowledgement()
        if (ackMeta?.code === normalizedCode && hasAcknowledgedRecovery(normalizedCode)) {
          setRecoveryAckMeta(ackMeta)
          setShowRecoveryModal(false)
        } else {
          setRecoveryAckMeta(null)
          setShowRecoveryModal(true)
        }
      }

      setAnonContext({
        deviceId: getDeviceId(),
        anonId: payload?.anonId ?? getAnonId(),
      })
      setBootstrapError(null)
    } catch (err) {
      console.error('[bootstrap] error', err)
      setBootstrapError('Failed to reach bootstrap endpoint')
    }
  }, [])

  // ===== Recovery Modal Handlers =====
  const acknowledgeRecoveryModal = useCallback(() => {
    if (!recoveryCode) return
    markRecoveryAcknowledged(recoveryCode)
    setRecoveryAckMeta({
      code: recoveryCode,
      acknowledgedAt: Date.now(),
    })
    setShowRecoveryModal(false)
    announce('Recovery code saved. You can now continue.')
    setShowBackupReminder(false)
  }, [announce, recoveryCode])

  const openRecoveryModal = useCallback(() => {
    if (!recoveryCode) return
    setShowRecoveryModal(true)
    announce('Recovery code ready. Choose how you want to back it up.')
  }, [announce, recoveryCode])

  const copyRecoveryCode = useCallback(async () => {
    if (!recoveryCode) return
    const value = recoveryCode

    try {
      // Try modern clipboard API first
      if (
        typeof navigator !== 'undefined' &&
        navigator?.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(value)
        announce('Recovery code copied.')
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch (_err) {
      // Fallback to execCommand
      try {
        if (typeof document !== 'undefined') {
          const textarea = document.createElement('textarea')
          textarea.value = value
          textarea.setAttribute('readonly', '')
          textarea.style.position = 'absolute'
          textarea.style.left = '-9999px'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
          announce('Recovery code copied.')
          return
        }
      } catch (_err) {
        // fall through to failure
      }
    }
    announce('Copy failed. Please copy the code manually.')
  }, [announce, recoveryCode])

  const regenerateRecoveryCode = useCallback(async () => {
    if (regeneratingRecovery) return
    setRegeneratingRecovery(true)
    setRecoveryRotationError(null)

    try {
      const headers = recoveryCsrfToken
        ? { 'x-recovery-csrf': recoveryCsrfToken }
        : undefined

      const response = await apiFetch('/api/anon/recovery', {
        method: 'POST',
        headers,
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = payload?.error ?? 'Unable to regenerate recovery code.'
        setRecoveryRotationError(message)
        announce('Could not regenerate recovery code.')
        return
      }

      const nextCode =
        typeof payload?.recoveryCode === 'string'
          ? payload.recoveryCode.trim().toUpperCase()
          : ''

      if (payload?.anonId) {
        setAnonId(payload.anonId)
        setAnonContext((prev) => ({
          deviceId: prev?.deviceId ?? getDeviceId(),
          anonId: payload.anonId,
        }))
      }

      if (nextCode) {
        clearRecoveryAcknowledgement()
        saveRecoveryCode(nextCode)
        setRecoveryCode(nextCode)
        setRecoveryAckMeta(null)
        setShowRecoveryModal(true)
        setShowBackupReminder(true)
        announce('Recovery code regenerated. You must save this new code.')

        // Focus copy button after modal opens
        requestAnimationFrame(() => {
          if (recoveryCopyButtonRef.current) {
            recoveryCopyButtonRef.current.focus()
          }
        })
      } else {
        announce('Recovery code updated, but no code returned.')
      }
    } catch (err) {
      console.error('[recovery:regenerate] request failed', err)
      const message =
        typeof err?.message === 'string'
          ? err.message
          : 'Failed to regenerate recovery code. Please try again.'
      setRecoveryRotationError(message)
      announce('Could not regenerate recovery code.')
    } finally {
      setRegeneratingRecovery(false)
    }
  }, [announce, recoveryCsrfToken, regeneratingRecovery])

  // ===== Restore Dialog Handlers =====
  const openRestoreDialog = useCallback(() => {
    setRestoreError(null)
    setRestoreDialogOpen(true)
  }, [])

  const closeRestoreDialog = useCallback(() => {
    if (restoreBusy) return
    setRestoreDialogOpen(false)
    setRestoreError(null)
  }, [restoreBusy])

  const submitRestore = useCallback(
    async (rawCode) => {
      const normalized = rawCode?.trim().toUpperCase()
      if (!normalized) return

      setRestoreBusy(true)
      setRestoreError(null)

      try {
        const response = await apiFetch('/api/anon/restore', {
          method: 'POST',
          body: JSON.stringify({ recoveryCode: normalized }),
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          let message = payload?.error ?? 'Restore failed. Please try again.'

          if (response.status === 401) {
            message = 'Recovery code was not recognised.'
          } else if (response.status === 429) {
            message = 'Too many attempts. Wait a bit and try again.'
          } else if (response.status === 410) {
            const rotatedAt = payload?.rotatedAt
            if (rotatedAt) {
              const formatted = new Date(rotatedAt).toLocaleString()
              message = `Code was replaced on ${formatted}.`
            } else {
              message = 'That recovery code was replaced on another device.'
            }
          }

          setRestoreError(message)
          return
        }

        // Update device context
        const latestDeviceId = getDeviceId()
        setAnonId(payload?.anonId ?? '')
        setAnonContext({
          deviceId: latestDeviceId,
          anonId: payload?.anonId ?? null,
        })

        // Save recovery code
        saveRecoveryCode(normalized)
        markRecoveryAcknowledged(normalized)
        setRecoveryAckMeta({
          code: normalized,
          acknowledgedAt: Date.now(),
        })
        setRecoveryCode(normalized)
        setShowRecoveryModal(false)
        setShowBackupReminder(false)

        // Close dialog
        setRestoreDialogOpen(false)
        setRestoreError(null)

        // Trigger app state reset via callback
        if (onAppReset) {
          await onAppReset({
            reason: 'restore',
            announcement: 'Recovery successful. This device is now linked to your notes.',
            screenTarget: 'landing',
          })
        }
      } catch (err) {
        console.error('[restore] request failed', err)
        setRestoreError('Restore failed. Check your connection and try again.')
      } finally {
        setRestoreBusy(false)
      }
    },
    [onAppReset]
  )

  // ===== Effects =====

  // Bootstrap device on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    bootstrapDevice()
  }, [bootstrapDevice])

  // Initialize CSRF token on mount
  useEffect(() => {
    if (typeof document === 'undefined') return
    const token = ensureRecoveryCsrfToken()
    setRecoveryCsrfToken(token)
  }, [])

  // ===== Return API =====
  return {
    // Identity state
    deviceId: anonContext?.deviceId ?? null,
    anonId: anonContext?.anonId ?? null,
    recoveryCode,
    recoveryAcknowledgedAt: recoveryAckMeta?.acknowledgedAt ?? null,

    // UI state
    showRecoveryModal,
    restoreDialogOpen,
    showBackupReminder,

    // Operation state
    bootstrapError,
    restoreBusy,
    restoreError,
    regeneratingRecovery,
    recoveryRotationError,

    // Handlers
    bootstrapDevice,
    acknowledgeRecoveryModal,
    openRecoveryModal,
    copyRecoveryCode,
    regenerateRecoveryCode,
    openRestoreDialog,
    closeRestoreDialog,
    submitRestore,

    // Ref
    recoveryCopyButtonRef,
  }
}
