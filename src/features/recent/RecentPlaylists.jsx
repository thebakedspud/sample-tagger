import { useMemo, useRef } from 'react'
import ErrorMessage from '../../components/ErrorMessage.jsx'

const PROVIDER_LABELS = {
  spotify: 'Spotify',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
}

function resolveProvider(provider) {
  if (!provider) return 'Playlist'
  return PROVIDER_LABELS[provider] ?? provider
}

function coerceMillis(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (value instanceof Date) {
    const parsed = value.getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function describeRecency(importedAt, lastUsedAt) {
  const timestamp = coerceMillis(lastUsedAt ?? importedAt)
  if (timestamp == null) return null
  const now = Date.now()
  const diff = Math.max(0, now - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  let label = 'Updated just now'
  if (diff < minute) {
    label = 'Updated just now'
  } else if (diff < hour) {
    const value = Math.round(diff / minute)
    label = `Updated ${value} minute${value === 1 ? '' : 's'} ago`
  } else if (diff < day) {
    const value = Math.round(diff / hour)
    label = `Updated ${value} hour${value === 1 ? '' : 's'} ago`
  } else if (diff < week) {
    const value = Math.round(diff / day)
    label = `Updated ${value} day${value === 1 ? '' : 's'} ago`
  } else {
    const value = Math.round(diff / week)
    label = `Updated ${value} week${value === 1 ? '' : 's'} ago`
  }

  return {
    label,
    title: new Date(timestamp).toLocaleString(),
  }
}

/**
 * @param {object} props
 * @param {Array<any>} props.items - Array of recent playlist items
 * @param {(item: any) => Promise<any>} props.onSelect - Callback when a playlist is selected
 * @param {Record<string, any>} [props.cardState] - State for individual playlist cards (loading, error)
 * @param {boolean} [props.disabled] - Whether all cards are disabled
 * @param {string|null} [props.refreshingId] - ID of the playlist currently being refreshed
 * @param {boolean} [props.isRefreshing] - Whether a refresh operation is in progress
 */
export default function RecentPlaylists({
  items,
  onSelect,
  cardState = {},
  disabled = false,
  refreshingId = null,
  isRefreshing = false,
}) {
  const buttonsRef = useRef(new Map())

  const sorted = useMemo(
    () => (Array.isArray(items) ? items.slice(0) : []),
    [items],
  )

  if (!sorted.length) return null

  const handleSelect = async (item) => {
    if (!onSelect) return
    try {
      const result = await onSelect(item)
      if (!result?.ok && buttonsRef.current?.has(item.id)) {
        const btn = buttonsRef.current.get(item.id)
        requestAnimationFrame(() => btn?.focus())
      }
    } catch {
      if (buttonsRef.current?.has(item.id)) {
        const btn = buttonsRef.current.get(item.id)
        requestAnimationFrame(() => btn?.focus())
      }
    }
  }

  return (
    <section aria-labelledby="recent-heading" className="recent-section">
      <div className="recent-header">
        <h2 id="recent-heading">Previously imported</h2>
      </div>
      <ul className="recent-grid" role="list">
        {sorted.map((item) => {
          const state = cardState[item.id] ?? {}
          const isLoading = Boolean(state.loading)
          const rawError = state.error
          const errorMessage = rawError && typeof rawError === 'object' ? rawError.message : typeof rawError === 'string' ? rawError : null
          const errorType = rawError && typeof rawError === 'object' ? rawError.type : 'error'
          const isRefreshingCard = Boolean(
            isRefreshing && refreshingId && refreshingId === item.id,
          )
          const disableCard = disabled || isLoading
          const recency = describeRecency(item.importedAt, item.lastUsedAt)
          const providerLabel = resolveProvider(item.provider)
          const displayTitle =
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : 'Untitled playlist'
          const totalLabel =
            typeof item.total === 'number' && item.total >= 0
              ? `${item.total} track${item.total === 1 ? '' : 's'}`
              : null
          const ariaDescribedBy = errorMessage ? `recent-error-${item.id}` : undefined

          return (
            <li key={item.id} className="recent-card">
              <button
                type="button"
                ref={(node) => {
                  if (node) {
                    buttonsRef.current.set(item.id, node)
                  } else {
                    buttonsRef.current.delete(item.id)
                  }
                }}
                onClick={() => handleSelect(item)}
                className="recent-card__button"
                disabled={disableCard}
                aria-busy={isLoading || isRefreshingCard ? 'true' : 'false'}
                aria-describedby={ariaDescribedBy}
                aria-label={`Load playlist "${displayTitle}" from ${providerLabel}${
                  totalLabel ? `, ${totalLabel}` : ''
                }`}
              >
                <div className="recent-card__media" aria-hidden="true">
                  {item.coverUrl ? (
                    <img
                      src={item.coverUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={56}
                      height={56}
                    />
                  ) : (
                    <div className="recent-card__fallback">
                      <span aria-hidden="true">
                        {displayTitle ? displayTitle[0].toUpperCase() : '*'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="recent-card__body">
                  <p className="recent-card__title" title={displayTitle}>
                    {displayTitle}
                  </p>
                  <p className="recent-card__meta">
                    <span className="recent-card__provider">{providerLabel}</span>
                    {totalLabel ? <span> - {totalLabel}</span> : null}
                  </p>
                  {recency ? (
                    <p className="recent-card__recency" title={recency.title}>
                      {recency.label}
                    </p>
                  ) : null}
                  {isLoading ? (
                    <span className="recent-card__loading">Loading...</span>
                  ) : null}
                  {isRefreshingCard ? (
                    <span className="recent-card__refresh" aria-live="polite">
                      Refreshing latest data…
                    </span>
                  ) : null}
                </div>
              </button>
              <ErrorMessage id={`recent-error-${item.id}`} className="recent-card__error" data-type={errorType}>
                {errorMessage}
              </ErrorMessage>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
