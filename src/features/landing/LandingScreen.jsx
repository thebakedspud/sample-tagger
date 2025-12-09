// src/features/landing/LandingScreen.jsx
import ErrorMessage from '../../components/ErrorMessage.jsx'
import RecentPlaylists from '../recent/RecentPlaylists.jsx'

/**
 * @typedef {Object} LandingScreenProps
 * @property {string} importUrl - Controlled input value for playlist URL
 * @property {(e: import('react').ChangeEvent<HTMLInputElement>) => void} onImportUrlChange - Handler for URL input changes
 * @property {{ message: string, type: 'error' | 'cancel' | 'rateLimit' } | null} importError - Import error state
 * @property {string | null} providerChip - Detected provider label
 * @property {boolean} isAnyImportBusy - Whether any import operation is in progress
 * @property {boolean} showInitialSpinner - Whether to show loading state on button
 * @property {import('react').RefObject<HTMLInputElement>} importInputRef - Ref for focus management
 * @property {(event: import('react').FormEvent) => Promise<void>} onImport - Form submit handler
 * @property {Array<any>} recentPlaylists - Array of recent playlist items
 * @property {Record<string, { loading?: boolean, error?: string | { message: string, type: 'error' | 'cancel' | 'rateLimit' } }>} recentCardState - Per-card state
 * @property {(item: any) => Promise<any>} onSelectRecent - Handler for selecting a recent playlist
 * @property {string | null} refreshingRecentId - ID of playlist currently refreshing
 * @property {boolean} isRefreshingCachedData - Whether cached data refresh is in progress
 */

/**
 * Landing screen component for playlist import
 * @param {LandingScreenProps} props
 */
export default function LandingScreen({
    importUrl,
    onImportUrlChange,
    importError,
    providerChip,
    isAnyImportBusy,
    showInitialSpinner,
    importInputRef,
    onImport,
    recentPlaylists,
    recentCardState,
    onSelectRecent,
    refreshingRecentId,
    isRefreshingCachedData,
}) {
    return (
        <section aria-labelledby="landing-title">
            <h2 id="landing-title" className="section-title" style={{ marginTop: 0 }}>Turn your Spotify library into<br />a searchable notebook</h2>
            <p style={{ color: 'var(--muted)' }}>
                Add timestamped notes so you can jump back to any moment.
            </p>

            <div className="import-form-card">
                <form
                    onSubmit={(event) => {
                        void onImport(event)
                    }}
                    aria-describedby={importError?.message ? 'import-error' : undefined}
                >
                    <div style={{ display: 'grid', gap: 8, alignItems: 'start', gridTemplateColumns: '1fr auto', minWidth: 0 }}>
                        <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
                            <label htmlFor="playlist-url" className="sr-only">Playlist URL</label>
                            <input
                                id="playlist-url"
                                className="import-url-input"
                                ref={importInputRef}
                                type="url"
                                inputMode="url"
                                placeholder="Paste a Spotify playlist or episode link"
                                autoComplete="off"
                                value={importUrl}
                                onChange={onImportUrlChange}
                                aria-invalid={!!importError?.message}
                                aria-describedby={importError?.message ? 'import-error' : undefined}
                            />
                            <ErrorMessage id="import-error" data-type={importError?.type}>
                                {importError?.message}
                            </ErrorMessage>
                        </div>

                        {importUrl.trim() && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="chip">
                                    <span className="chip-dot" style={{ background: providerChip ? 'var(--accent, #4caf50)' : 'var(--border)' }} />
                                    {providerChip ? providerChip : 'no match'}
                                </span>
                            </div>
                        )}

                        <div style={{ justifySelf: 'end' }}>
                            <button
                                type="submit"
                                className="btn primary"
                                disabled={isAnyImportBusy}
                                aria-busy={showInitialSpinner ? 'true' : 'false'}
                            >
                                {showInitialSpinner ? 'Importing...' : 'Import playlist'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <RecentPlaylists
                items={recentPlaylists}
                onSelect={onSelectRecent}
                cardState={recentCardState}
                disabled={isAnyImportBusy}
                refreshingId={refreshingRecentId}
                isRefreshing={isRefreshingCachedData}
            />
        </section>
    )
}
