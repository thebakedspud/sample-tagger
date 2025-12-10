# ORIENTATION - Import Flow Overview
_Last updated: 5 Nov 2025 (Refactored playlist state management)_

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

1. **App Architecture (Refactored Nov 2025)**  
   - **Outer `App`**: Bootstraps storage state, computes initial playlist state, wraps app in `PlaylistStateProvider`
   - **`AppWithDeviceContext`**: Middle layer managing device context propagation to the provider
   - **Inner `AppInner`**: Consumes context, manages UI state (screen routing, import flow, recents)
   - **`PlaylistStateProvider`**: Centralizes playlist state management via `useReducer`, exposes narrow selector hooks, handles remote sync and tag scheduling
   
   Playlist state consumed via hooks:
   ```js
   const dispatch = usePlaylistDispatch()
   const tracks = usePlaylistTracks()
   const notesByTrack = usePlaylistNotesByTrack()
   const tagsByTrack = usePlaylistTagsByTrack()
   const editingState = usePlaylistEditingState()
   const { hasLocalNotes, allCustomTags } = usePlaylistDerived()
   const { syncTrackTags } = usePlaylistSync()
   ```
   
   Import flow managed via `usePlaylistImportFlow`:
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
   
   - `AppInner` persists via `saveAppState`, announces status changes, and bridges to storage/device helpers
   - State updates dispatched via validated action creators (`playlistActions.addNote`, `playlistActions.addTag`, etc.)

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

## Core Handlers (`src/App.jsx` - `AppInner` component)

> **Refactor (Nov 2025)**: Import orchestration (`handleImport`, `handleSelectRecent`, `handleReimport`, `handleLoadMore`) now lives in `usePlaylistImportController`. AppInner only wires the hook and keeps UI-facing handlers.

| Handler | Purpose | Location |
|---------|---------|----------|
| `handleImport(e)` | Submits the import form, normalises the payload, persists state, updates recents, and restores focus. | `usePlaylistImportController.js` |
| `handleSelectRecent(recent)` | Hydrates the cached playlist from Recents, kicks off lightweight annotation sync, and only re-imports if the cache is missing. | `usePlaylistImportController.js` |
| `handleReimport()` | Reuses the stored URL/meta with `reimportPlaylist`, refreshes tracks/recents, and preserves button focus on completion. | `usePlaylistImportController.js` |
| `handleLoadMore()` | Invokes `loadMore`, dedupes new pages, updates derived state, and manages manual/background focus flows. | `usePlaylistImportController.js` |
| `onAddNote / onSaveNote / onDeleteNote` | Dispatch actions via `playlistActions` to manage per-track note drafts, update provider state, and schedule inline undo metadata. | `App.jsx` |
| `handleAddTag / handleRemoveTag` | Validate and dispatch tag actions (`playlistActions.addTag`, `playlistActions.removeTag`), then sync to remote via `syncTrackTags()`. | `App.jsx` |
| `undoInline / expireInline` | Provided by `useInlineUndo` (10 minute timeout) to restore or finalize deleted notes. | `useInlineUndo.js` |
| `handleBackupNotes()` | Exports notes JSON via the File System Access API when available, otherwise triggers a download. | `App.jsx` |
| `handleRestoreNotesRequest()` | Opens the hidden file input and merges imported notes into the current session. | `App.jsx` |
| `handleClearAll()` | Clears storage, resets device identifiers, wipes in-memory state. Bootstrap is handled automatically by useDeviceRecovery hook. | `App.jsx` |
| `handleBackToLanding()` | Returns to the landing screen and focuses the URL field for a fresh import. | `App.jsx` |

### Import Flow Matrix

| User Action | Track Data Source | Notes/Tags Source | Cache Updated? | Default Focus Target |
|-------------|------------------|-------------------|----------------|----------------------|
| New URL import | Network adapter (`importInitial`) | Included in adapter result | ✅ Yes (canonical key + aliases) | First track’s “Add note” button |
| Recent playlist click | Local cache (`hydrateFromCache`) | Background sync via `/api/db/notes` | ❌ No (read-only) | Playlist heading |
| Reimport button | Network adapter (`reimportPlaylist`) | Included in adapter result | ✅ Yes + updates `lastRefreshedAt` | Reimport button |
| Load more | Network adapter (`loadMore`) | Appends to existing notes/tags map | ✅ Yes (append only) | First newly added track |

**Key behaviors**
- Cache keys follow `${provider}:${playlistId}` while alias lookups cover URL variants.
- Cache-miss when selecting a recent playlist automatically falls back to the “New URL import” flow.
- Annotation sync failures are logged but currently silent (UI continues showing cached notes).

## Import Controller Hook (`src/features/import/usePlaylistImportController.js`)

**Purpose**: Encapsulates the playlist import lifecycle (initial import, selecting recents, re-import, manual/background pagination) while delegating adapter work to `usePlaylistImportFlow`.

**Dependencies (passed as a parameter object)**:
- Playlist context hooks: `dispatch`, `tracks`, `notesByTrack`, `tagsByTrack`, `tracksRef`
- UI integration: `announce`, `setScreen`, `setPlaylistTitle`, `setImportedAt`, `setLastImportUrl`, `setSkipPlaylistFocusManagement`, `markTrackFocusContext`, focus refs
- Persistence helpers: `pushRecentPlaylist`, `updateRecentCardState`
- Bootstrap inputs: `initialImportMeta`, `initialPersistedTrackCount`, `screen`, `lastImportUrl`

**Returns**:
- Import state: `importUrl`, `importError` (object `{ message, type }` or `null`), provider chip, `importMeta`, derived busy/spinner flags, `backgroundSync`
- Handlers: `handleImport`, `handleSelectRecent`, `handleReimport`, `handleLoadMore`, `cancelBackgroundPagination`, `resetImportFlow`

Hook consumers (currently `AppInner`) simply destructure the API and wire it into forms/components, keeping the component surface lean.

## Playlist State Management (`src/features/playlist/`)

| Module | Purpose |
|--------|---------|
| `PlaylistProvider.jsx` | Context provider wrapping `useReducer`, managing remote sync, tag scheduling, and exposing state/dispatch/sync contexts. |
| `playlistReducer.js` | Pure reducer handling all playlist state transitions (notes, tags, tracks, editing state) with co-located derived state. |
| `actions.js` | Validated action creators with built-in input validation (exports `playlistActions` namespace). |
| `helpers.js` | Pure helper functions for state computations (`computeHasLocalNotes`, `validateTag`, etc.). |
| `usePlaylistContext.js` | Consumer hooks (`usePlaylistDispatch`, `usePlaylistTracks`, `usePlaylistNotesByTrack`, etc.) with error guards. |
| `contexts.js` | Context definitions (`PlaylistStateContext`, `PlaylistDispatchContext`, `PlaylistSyncContext`). |

### Multi-device note syncing

- **Notes** are local-first: remote notes only merge if the local entry is empty. If two devices both have local notes for the same track, they will not auto-merge—users must explicitly reimport to pull the latest server snapshot.
- **Tags** are remote-first: the server is canonical and always overwrites local tag lists when remote data is fetched.

This strategy avoids duplicate notes without maintaining per-note timestamps. Future refinements (timestamp conflict resolution or additive merge) can be layered on later.

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
| Invalid URL or unsupported provider | `useImportPlaylist` throws a coded adapter error; App surfaces `importError.message` (styled via `importError.type`), announces the message, and re-focuses the URL input. |
| Successful import | `applyImportResult` normalizes tracks, persists state (`saveAppState`), updates recents, and routes to the playlist screen. |
| Re-import | Tracks are replaced with the latest payload, `importMeta` updates, and any new recovery code reopens `RecoveryModal`. |
| Load more | Uses `importMeta.cursor` and `loadMoreTracks`; deduped tracks append to the list, focus moves to the first new card. |
| Note delete | Schedules inline undo for up to 10 minutes; undo restores the note and focus, expiry announces deletion. |
| Clear all | Wipes storage, pending migrations, device IDs, and local notes, then reboots the anonymous context. |

---

## Stable vs. WIP

- Stable: hook -> adapter -> storage architecture, inline undo, accessibility flows.
- Stable: pagination mocks and recent playlist UX.
- Stable: playlist state management via `PlaylistStateProvider` with reducer pattern (refactored Nov 2025).
- Stable: remote sync and tag scheduling centralized in provider.
- WIP: richer analytics and reporting.
- WIP: recovery API contract; expect adjustments.

---

> Reminder: `App` bootstraps state and wraps the provider, `PlaylistStateProvider` manages playlist state via reducer, `AppInner` orchestrates UI flow, `usePlaylistImportFlow` brokers import adapters, adapters return normalized data, and storage plus device helpers remember it all.

---

## TypeScript & Testing Notes

- Run `npm run check:tsc` (tsc `--noEmit`) alongside tests; CI should fail fast if type drift is introduced.
- Keep `jsconfig.json` types aligned: browser code relies on `vite/client` while server utilities lean on Node types. Add new frameworks explicitly so globals stay discoverable.
- When a test needs to feed invalid data deliberately, annotate it with `// @ts-expect-error` or a targeted `/** @type {any} */` cast to make the intent obvious.
- Wrap mocked imports with `vi.mocked(...)` before calling helpers like `mockResolvedValue` so TS sees the Vitest `Mock` shape the same way the runtime does.
