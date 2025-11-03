# ORIENTATION - Import Flow Overview
_Last updated: 3 Nov 2025_

A quick map of how the import, notes, and recovery pieces currently fit together. Use this to re-anchor after a break.

---

## Visual + Code Map

| UI Element | File / Function |
|------------|-----------------|
| Header + theme toggle | `src/components/ThemeToggle.jsx` |
| Landing import form + provider chip | `src/App.jsx` (landing screen state) |
| Recent playlists grid | `src/features/recent/RecentPlaylists.jsx` |
| Playlist title, counters, action bar | `src/features/playlist/PlaylistView.jsx` |
| Track cards + note editor | `src/features/playlist/TrackCard.jsx` / `src/features/playlist/NoteList.jsx` |
| Inline undo toast | `src/components/UndoPlaceholder.jsx` + `src/features/undo/useInlineUndo.js` |
| Load more button | `PlaylistView.jsx` -> `onLoadMore` |
| Live announcements | `src/components/LiveRegion.jsx` |
| Notes backup / restore controls | `src/App.jsx` (`handleBackupNotes`, `handleRestoreNotesRequest`) + `src/components/RecoveryModal.jsx`, `src/components/RestoreDialog.jsx` |

---

## Data Flow

1. **App + usePlaylistImportFlow**  
   - `src/App.jsx` owns high-level state (screen routing, tracks, notes, recents, device context) and wires the import hook:  
     ```js
     const {
       status: importStatus,
       loading: importLoading,
       importInitial,
       reimport: reimportPlaylist,
       loadMore: loadMoreTracks,
       resetFlow: resetImportFlow,
     } = usePlaylistImportFlow()
     ```
   - App persists via `saveAppState`, announces status changes, and bridges to storage/device helpers.

2. **Provider detection and import hook**  
   - `src/features/import/useImportPlaylist.js` detects providers with `detectProvider.js`, resolves the adapter from `ADAPTER_REGISTRY`, normalizes `pageInfo`, dedupes IDs, and exposes `importPlaylist`, `importNext`, `tracks`, `pageInfo`, `loading`, `errorCode`, and `progress`.

3. **Adapter stack**  
   - `src/features/import/adapters/{spotifyAdapter,youtubeAdapter,soundcloudAdapter}.js` implement provider-specific fetch logic.  
   - `mockAdapterUtils.js` supplies deterministic paged mocks (`MOCK_PAGE_SIZE = 10`) and shared pagination helpers.  
   - `src/data/mockPlaylists.js` feeds fallback data for dev or offline flows.

4. **Track + meta normalization**  
   - `src/features/import/normalizeTrack.js` plus `usePlaylistImportFlow` utilities (`buildTracks`, `buildMeta`) enforce stable `id`, `title`, `artist`, optional `thumbnailUrl/sourceUrl/durationMs`, and structured meta `{ provider, playlistId, snapshotId, cursor, hasMore, sourceUrl, debug }`.

5. **Persistence, recents, backups**
   - `src/utils/storage.js` serializes `PersistedState` version 6 (`STORAGE_VERSION = 6`) under `sta:v6`, including theme, playlist title, `importMeta`, `tracks`, `notesByTrack`, `tagsByTrack`, and `recentPlaylists` (capped by `RECENT_DEFAULT_MAX = 8`).  
   - Migration helpers (`getPendingMigrationSnapshot`, `stashPendingMigrationSnapshot`, `writeAutoBackupSnapshot`) protect data between schema updates and auto-backups.

6. **Device + recovery context**
   - `src/lib/deviceState.js` caches anonymous device IDs, anon IDs, and recovery codes in `localStorage`.
   - `src/features/account/useDeviceRecovery.js` handles device bootstrap via `apiFetch('/api/anon/bootstrap')`, surfaces new recovery codes with `RecoveryModal`, and manages restore flow when the user submits the recovery code in `RestoreDialog`.
   - `src/App.jsx` consumes the hook and integrates device/recovery state into the application.

---

## Core Handlers (`src/App.jsx`)

| Handler | Purpose |
|---------|---------|
| `handleImport(e)` | Form submit handler that calls `importInitial` with URL from state, builds playlist state, persists to storage, updates recents, and focuses the first track. |
| `handleReimport()` | Reuses the stored URL/meta with `reimportPlaylist`, refreshes tracks and recents, and restores focus to the Re-import button. |
| `handleLoadMore()` | Invokes `loadMoreTracks`, appends deduped pages, and moves focus to the first newly loaded track. |
| `onAddNote / onSaveNote / onDeleteNote` | Manage per-track note drafts, persistence (`notesByTrack`), and inline undo metadata. |
| `undoInline / expireInline` | Provided by `useInlineUndo` (10 minute timeout) to restore or finalize deleted notes. |
| `handleBackupNotes()` | Exports notes JSON via the File System Access API when available, otherwise triggers a download. |
| `handleRestoreNotesRequest()` | Opens the hidden file input and merges imported notes into the current session. |
| `handleClearAll()` | Clears storage, resets device identifiers, wipes in-memory state. Bootstrap is handled automatically by useDeviceRecovery hook. |
| `handleBackToLanding()` | Returns to the landing screen and focuses the URL field for a fresh import. |

## Device & Recovery Handlers (from `useDeviceRecovery` hook)

| Handler | Purpose |
|---------|---------|
| `bootstrapDevice()` | Calls `/api/anon/bootstrap`, handles 404 retries, updates device/anon IDs, manages recovery code display. |
| `acknowledgeRecoveryModal()` | Marks recovery code as acknowledged, closes modal, updates localStorage. |
| `openRecoveryModal()` | Opens recovery modal to display recovery code. |
| `copyRecoveryCode()` | Copies recovery code to clipboard with fallback mechanisms. |
| `regenerateRecoveryCode()` | Calls `/api/anon/recovery` to generate new recovery code with CSRF protection. |
| `openRestoreDialog()` | Opens dialog for entering recovery code. |
| `closeRestoreDialog()` | Closes restore dialog if not busy. |
| `submitRestore(code)` | Posts recovery code to `/api/anon/restore`, updates device identity, triggers app reset. (From useDeviceRecovery hook) |

---

## Feature Toggles & Tunables

| Flag / Constant | Location | Description |
|-----------------|----------|-------------|
| `ADAPTER_REGISTRY` | `src/features/import/useImportPlaylist.js` | Enables or disables provider adapters. |
| `MOCK_PAGE_SIZE` | `src/features/import/adapters/mockAdapterUtils.js` | Number of tracks per mock page when simulating pagination. |
| `ImportFlowStatus` | `src/features/import/usePlaylistImportFlow.js` | Source of the UI busy states (`idle`, `importing`, `reimporting`, `loadingMore`). |
| `RECENT_DEFAULT_MAX` | `src/utils/storage.js` | Maximum saved entries in `recentPlaylists`. |
| `timeoutMs` option | `src/features/undo/useInlineUndo.js` | Controls the inline undo window (defaults to 600000 ms). |

---

## Behavior Traces

| Event | Outcome |
|-------|---------|
| Invalid URL or unsupported provider | `useImportPlaylist` throws a coded adapter error; App surfaces `importError`, announces the message, and re-focuses the URL input. |
| Successful import | `applyImportResult` normalizes tracks, persists state (`saveAppState`), updates recents, and routes to the playlist screen. |
| Re-import | Tracks are replaced with the latest payload, `importMeta` updates, and any new recovery code reopens `RecoveryModal`. |
| Load more | Uses `importMeta.cursor` and `loadMoreTracks`; deduped tracks append to the list, focus moves to the first new card. |
| Note delete | Schedules inline undo for up to 10 minutes; undo restores the note and focus, expiry announces deletion. |
| Clear all | Wipes storage, pending migrations, device IDs, and local notes, then reboots the anonymous context. |

---

## Stable vs. WIP

- Stable: hook -> adapter -> storage architecture, inline undo, accessibility flows.
- Stable: pagination mocks and recent playlist UX.
- WIP: virtualized list and richer analytics.
- WIP: recovery API contract; expect adjustments.

---

> Reminder: App orchestrates the flow, `usePlaylistImportFlow` brokers the hook and adapters, adapters return normalized data, and storage plus device helpers remember it all.
