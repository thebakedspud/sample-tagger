# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Playlist Notes** is an accessibility-first playlist annotator built with React + Vite. Users import public playlists from Spotify/YouTube/SoundCloud, add per-track notes and tags, and sync those annotations across devices via anonymous device IDs and recovery codes.

Key capabilities:
- Import playlists through adapter registry (Spotify, YouTube, SoundCloud)
- Per-track notes with inline undo (10-minute window)
- Tag management with debounced sync (350ms)
- Multi-device sync via anonymous device IDs and recovery codes
- localStorage persistence (versioned schema v6) with auto-migration
- Accessibility-first: ARIA live regions, keyboard shortcuts, focus management

---

## Development Commands

### Build & Development
```bash
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Testing
```bash
npm test             # Run all tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run test:ui      # Open Vitest UI
npm run test:ci      # CI mode with basic reporter
```

**Running Individual Tests:**
```bash
npx vitest run src/features/import/__tests__/useImportPlaylist.test.js
npx vitest watch src/components/__tests__/RestoreDialog.test.jsx
```

**Coverage Thresholds:**
- Statements: 60%
- Branches: 55%
- Functions: 70%
- Lines: 60%

---

## Architecture Overview

### Monolithic App Component Pattern

The core `src/App.jsx` (~2,160 lines) is intentionally monolithic, managing all application state:
- Playlist imports (tracks, metadata, pagination cursors)
- Notes and tags (notesByTrack, tagsByTrack maps)
- Recent playlists, undo history
- Device/recovery flows managed via useDeviceRecovery hook
- Screen routing (landing → playlist) without URL-based routing

**Rationale:** Single source of truth makes complex state interactions explicit; easier to trace data flows; avoids prop drilling through deep component trees.

### Feature-Module Organization

Code is organized by domain, not by file type:

```
src/features/
├── a11y/          # Accessibility (useAnnounce hook, LiveRegion)
├── account/       # Device recovery & identity management (useDeviceRecovery hook)
├── filter/        # Filtering utilities
├── import/        # Import orchestration + adapters
├── playlist/      # Playlist UI (PlaylistView, TrackCard)
├── recent/        # Recent playlists management
├── tags/          # Tag utilities, sync queue
└── undo/          # Inline undo with 10-minute timers
```

Each feature module contains:
- Hooks (e.g., `usePlaylistImportFlow`, `useInlineUndo`)
- UI components (JSX)
- Utilities (normalization, validation)
- Tests in `__tests__/` subdirectories

### Critical Data Flow: Import → Normalize → Persist → Tag

```
URL Input
  ↓
detectProvider() → Spotify/YouTube/SoundCloud detection
  ↓
useImportPlaylist() → adapter registry lookup (ADAPTER_REGISTRY)
  ↓
AdapterA.importPlaylist() → { provider, tracks[], meta, pageInfo }
  ↓
usePlaylistImportFlow (internal: buildTracks/buildMeta) → normalizes to { id, title, artist, notes[], tags[] }
  ↓
App.jsx applyImportResult() → attaches notesByTrack, tagsByTrack, routes to playlist screen
  ↓
saveAppState() → localStorage (LS_KEY: 'sta:v6')
  ↓
Tracks display with note/tag UI
```

### Adapter Pattern (Import Providers)

**Contract Definition:** `src/features/import/adapters/types.js`

```javascript
PlaylistAdapter(options) → Promise<PlaylistAdapterResult>

options: {
  url: string
  cursor?: string       // for pagination
  signal?: AbortSignal
  context?: Record<string, any>
  fetchClient?: Function
}

result: {
  provider: 'spotify' | 'youtube' | 'soundcloud'
  playlistId: string
  title: string
  tracks: NormalizedTrack[]
  pageInfo: { cursor, hasMore }
  total?: number
  coverUrl?: string
  snapshotId?: string   // Spotify-specific
}
```

**Adapter Registry:**
- Located in: `src/features/import/useImportPlaylist.js`
- Enable/disable providers by commenting out registry entries
- Falls back to mock data if adapter throws or is unavailable
- Each adapter in: `src/features/import/adapters/{spotifyAdapter,youtubeAdapter,soundcloudAdapter}.js`

**Error Handling:**
- Centralized error codes: `src/features/import/errors.js` (`ERR_UNSUPPORTED_URL`, `ERR_NOT_FOUND`, `ERR_PRIVATE_PLAYLIST`, etc.)
- `createAdapterError(code, details, cause)` creates standardized errors
- UI maps codes to friendly messages via `ERROR_MAP`

---

## API Structure (Serverless Functions)

All API routes are serverless functions deployed to Vercel:

### Anonymous Device Endpoints
- **POST /api/anon/bootstrap** → Returns deviceId (header), anonId, recoveryCode
- **POST /api/anon/restore** → Accepts recoveryCode, swaps device identity

### Database Endpoints
- **GET /api/db/notes** → Returns notes[], tags[] from Supabase
- **POST /api/db/notes** → Body: { trackId, body?, tags? } → Syncs to Supabase

### Spotify Proxy
- **POST /api/spotify/token** → Exchanges client credentials for Spotify access token (Vite proxies in dev)

**Device ID Propagation:**
- Every API request includes `x-device-id` header (via `apiFetch` in `src/lib/apiClient.js`)
- Response header `x-device-id` updates local device context
- Enables multi-device sync and recovery flows

---

## localStorage & Persistence

### Versioned Storage Schema (v6)

**Key:** `sta:v6`

**Shape:**
```javascript
{
  version: 6
  theme: 'dark' | 'light'
  playlistTitle: string
  importedAt: ISO timestamp | null
  lastImportUrl: string
  tracks: PersistedTrack[]
  importMeta: { provider, playlistId, snapshotId, cursor, hasMore, sourceUrl, debug }
  notesByTrack: Record<trackId, string[]>
  tagsByTrack: Record<trackId, string[]>
  recentPlaylists: RecentPlaylist[]  // max 8, deduplicated by ${provider}:${playlistId}
}
```

**Migration System (v5 → v6):**
1. On load, if old version detected, creates pending snapshot
2. Bootstraps device, then runs async migration
3. Fetches existing remote notes/tags from Supabase
4. Merges local snapshot with remote data
5. Uploads new notes/tags in parallel
6. Clears pending migration on success
7. Auto-backup written before upload (recovery from failures)

**Utilities:**
- `src/utils/storage.js` → `saveAppState`, `loadAppState`, `getPendingMigrationSnapshot`
- Normalization: `sanitizeTracks`, `sanitizeNotesMap`, `sanitizeTagsMap`
- Recents management: `upsertRecent`, `removeRecent`, `updateRecent`

---

## Undo System

### Inline Undo (10-Minute Window)

**Hook:** `src/features/undo/useInlineUndo.js`

```javascript
const { scheduleInlineUndo, undoInline, expireInline, isPending } = useInlineUndo({
  timeoutMs: 600000,  // 10 minutes
  onExpire: (id) => announce('Note deleted')
})

// On delete:
scheduleInlineUndo(trackId, { note: 'Original text', focusId: 'delete-btn' })

// Keyboard shortcut: Ctrl+Z calls undoInline()
// Auto-expires after 10 minutes, calls onExpire callback
```

**Implementation:**
- `pending: Map<id, meta>` tracks active undo slots
- Each entry has a 10-minute timeout
- Undo restores state + returns focus to original delete button
- Integrates with `notesByTrack` in App.jsx

---

## Accessibility Implementation

### Custom Accessibility Layer (`features/a11y/`)

**useAnnounce Hook:**
```javascript
const { announce } = useAnnounce({ debounceMs: 60 })
announce('Playlist imported. 42 tracks.')
```

- Debounced announcements (60ms) to avoid spam
- Writes to hidden `role="status" aria-live="polite"` region
- All user actions announce: imports, errors, tag/note operations

**Focus Management Pattern:**
```javascript
import { focusById } from '@/utils/focusById'
focusById('track-note-btn-0')  // Uses requestAnimationFrame
```

- After import → focus first track's "Add Note" button
- On error → focus input and select all
- On undo → restore focus to delete button

**Keyboard Shortcuts:**
- `Ctrl/Cmd+Z`: undo last note deletion
- Tab/Shift+Tab: navigate all interactive elements
- Enter/Space: activate buttons

---

## Important Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Monolithic App.jsx** | Single source of truth for complex state interactions; avoids prop drilling; easier to trace data flows |
| **Feature modules over routes** | Organizes code by domain (import, tags, undo); enables tree-shaking; colocates tests with implementation |
| **localStorage v5 versioning** | Smooth migrations with auto-fallback; pending snapshot approach preserves data across crashes |
| **Device ID propagation** | Enables multi-device sync; recovery codes tied to device identity (security); auto-discovery via bootstrap |
| **Adapter pattern + registry** | Decouples providers (Spotify/YouTube/SoundCloud); easy to mock or swap; centralized error handling |
| **Debounced tag sync (350ms)** | Batches rapid tag changes; reduces API load; 60ms announce debounce prevents announcement spam |
| **Inline undo (time-bounded)** | Simpler than redo stack; 10-minute auto-expire; no complex state branches; Ctrl+Z familiar to users |
| **Optimistic updates** | Responsive UI; rollback on error; combined with announce "Tag sync failed" if needed |
| **Accessibility-first** | useAnnounce for all feedback; keyboard-navigable; focus management; semantic HTML; ARIA labels |

---

## Key Code Locations

### Core Application Logic
- **src/App.jsx** → Main app component (screen routing, state management)
- **src/main.jsx** → Entry point (ThemeProvider wrapper)

### Features
- **src/features/import/usePlaylistImportFlow.js** → Import orchestration hook
- **src/features/import/useImportPlaylist.js** → Adapter registry + provider detection
- **src/features/import/adapters/** → Spotify/YouTube/SoundCloud adapters
- **src/features/import/normalizeTrack.js** → Track normalization
- **src/features/account/useDeviceRecovery.js** → Device identity & recovery management hook
- **src/features/tags/tagSyncQueue.js** → Debounced tag sync queue (exports createTagSyncScheduler)
- **src/features/undo/useInlineUndo.js** → Inline undo hook
- **src/features/a11y/useAnnounce.js** → Accessibility announcements

### Components
- **src/features/playlist/PlaylistView.jsx** → Main playlist display
- **src/features/playlist/TrackCard.jsx** → Individual track cards
- **src/features/recent/RecentPlaylists.jsx** → Recent playlists carousel
- **src/components/RestoreDialog.jsx** → Recovery code input dialog
- **src/components/RecoveryModal.jsx** → Display new recovery codes
- **src/components/UndoPlaceholder.jsx** → Inline undo toast
- **src/components/LiveRegion.jsx** → ARIA live region for announcements

### Utilities
- **src/utils/storage.js** → localStorage persistence + versioning
- **src/utils/focusById.js** → Focus management helper
- **src/lib/apiClient.js** → Fetch wrapper with device ID propagation
- **src/lib/deviceState.js** → Device context management
- **src/data/mockPlaylists.js** → Fallback mock data

### API
- **api/anon/bootstrap.js** → Device bootstrap endpoint
- **api/anon/restore.js** → Recovery code restore endpoint
- **api/db/notes.js** → Notes/tags sync endpoint
- **api/spotify/token.js** → Spotify token exchange

---

## Configuration Files

- **vite.config.js** → Vitest config + Spotify proxy in dev server
- **eslint.config.js** → Flat config with React + Hooks + A11y plugins
- **vercel.json** → Security headers (CSP, HSTS, X-Frame-Options)
- **jsconfig.json** → Path aliases (`@/` → `src/`)
- **vitest.setup.js** → Test environment setup

---

## Testing Strategy

### Test Organization (36 test files)
```
src/__tests__/              → Integration tests
src/features/**/__tests__/  → Feature-specific unit tests
src/components/__tests__/   → Component tests
api/**/__tests__/           → API endpoint tests
```

### Key Test Files
- **src/App.tagging.test.jsx** → End-to-end tagging integration test
- **src/features/import/__tests__/adapterContracts.test.js** → Validates all adapters follow contract
- **src/features/import/__tests__/usePlaylistImportFlow.test.js** → Import flow state machine
- **src/features/account/__tests__/useDeviceRecovery.test.js** → Device recovery hook behavior
- **src/features/undo/__tests__/useInlineUndo.test.js** → Undo timer behavior

### Testing Utilities
- **src/test/testHelpers.js** → Shared test utilities
- **vitest.setup.js** → Global test setup (jsdom, testing-library)

---

## Common Development Patterns

### Adding a New Playlist Adapter

1. Create adapter in `src/features/import/adapters/newAdapter.js`
2. Follow the adapter contract in `src/features/import/adapters/types.js`
3. Return `createAdapterError(code, details)` for known errors
4. Add to `ADAPTER_REGISTRY` in `src/features/import/useImportPlaylist.js`
5. Update `detectProvider` in `src/features/import/detectProvider.js`
6. Add test coverage in `src/features/import/adapters/__tests__/adapterContracts.test.js`

### Adding a New Feature Module

1. Create directory in `src/features/featureName/`
2. Add main hook (e.g., `useFeatureName.js`)
3. Add UI components if needed
4. Create `__tests__/` subdirectory
5. Export from feature module (optional index.js)
6. Wire into `App.jsx` if requires global state

### Modifying localStorage Schema

1. Increment `STORAGE_VERSION` in `src/utils/storage.js`
2. Update `PersistedState` type definition
3. Add migration logic in `loadAppState` (handle previous version)
4. Test migration path with `getPendingMigrationSnapshot`
5. Update `CLAUDE.md` schema documentation

### Adding API Endpoints

1. Create serverless function in `api/categoryName/endpoint.js`
2. Use `apiUtils` from `api/_lib/` for common patterns
3. Propagate `x-device-id` header for device-aware endpoints
4. Add error handling with structured responses
5. Update `src/lib/apiClient.js` if new fetch pattern needed
6. Add tests in `api/categoryName/__tests__/`

---

## Documentation Files

- **README.md** → User-facing overview + accessibility checklist
- **SECURITY.md** → Security policies and vulnerability reporting
- **SECURITY_REFERENCE.md** → Detailed security implementation guide
- **src/docs/ORIENTATION.md** → Import flow map (UI → code mapping)
- **src/AGENTS.MD** → AI agent guidelines for contributing

---

## Environment Variables (Vercel)

Required for Spotify integration:
- `SPOTIFY_CLIENT_ID` → Spotify app client ID
- `SPOTIFY_CLIENT_SECRET` → Spotify app client secret

Required for Supabase (notes/tags sync):
- `SUPABASE_URL` → Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` → Service role key for API access

No `.env` file in repo (secrets managed via Vercel dashboard).

---

## Common Gotchas

1. **Stale Request Race Conditions:** `usePlaylistImportFlow` uses request IDs to guard against race conditions between import/reimport/load-more. Always check if newer request has superseded the current one.

2. **Focus Management Timing:** Use `focusById()` (wraps `requestAnimationFrame`) instead of direct `element.focus()` to ensure DOM has settled after state updates.

3. **Undo Expiry Callbacks:** `useInlineUndo` expects `onExpire` to be stable (wrap with `useCallback`). Otherwise, timers may reference stale closures.

4. **Tag Normalization:** Tags are always lowercase, deduplicated, and capped at 32 per track. Sync queue batches changes with 350ms debounce.

5. **Device ID Propagation:** `x-device-id` header must be included in all API requests that touch notes/tags. Use `apiFetch` wrapper, not raw `fetch`.

6. **localStorage Versioning:** Always check `STORAGE_VERSION` before reading state. Auto-migration runs on load, but may fail if schema diverges too much.

7. **Adapter Contract:** All adapters must return `pageInfo: { cursor, hasMore }` even if they don't support pagination (use `null` cursor + `hasMore: false`).

8. **Announce Debouncing:** `useAnnounce` debounces by 60ms to prevent announcement spam. Rapid-fire calls will batch into single announcement.

---

## Related Documentation

For detailed import flow mapping (UI → code), see **src/docs/ORIENTATION.md**.
