## Current Issues Overview

- **Branch**: `dev`
- **Date**: 2025-11-04
- **Author**: GPT-5 Codex review

---

## High Priority

### Monolithic `App.jsx`

- **Location**: `src/App.jsx`
- **Issue**: Core application logic, persistence, device recovery, pagination, and background sync all live inside a 2k+ line component. The concentration of state and orchestration makes onboarding difficult and raises regression risk.
- **Impact**: High maintainability and testing burden; brittle focus management and background-sync interactions.
- **Recommendation**: Extract domain-specific controllers/hooks (import flow, storage sync, device recovery, playlist UI). Add targeted unit/integration tests for the extracted logic.

### Non-virtualized Playlist Rendering

- **Location**: `src/features/playlist/PlaylistView.jsx`
- **Issue**: `filteredTracks.map` renders every `TrackCard`, each with heavy focus-handling logic. Large playlists cause layout thrash and slow updates.
- **Impact**: Significant performance degradation with large imports; potential accessibility regressions during re-render spikes.
- **Recommendation**: Introduce list virtualization (e.g., `@tanstack/react-virtual`) and move focus/accessibility rules into the virtualization boundary.

### Missing Error Boundaries

- **Location**: `src/App.jsx` (and major feature components)
- **Issue**: No error boundary components to catch rendering errors. Single crash in any component brings down entire app.
- **Impact**: Poor production resilience; localStorage corruption or API errors could brick the application.
- **Recommendation**: Wrap major sections (PlaylistView, AccountView, import flow) in error boundaries with fallback UI. Consider integration with error telemetry (Sentry).

## Medium Priority

### Inefficient State Persistence

- **Location**: `src/utils/storage.js`
- **Issue**: `saveAppState` rehydrates existing state, re-sanitizes every field, and writes the entire payload on each change.
- **Impact**: Elevated GC pressure, risk of clobbering concurrent writes, added latency during rapid edits.
- **Recommendation**: Cache last-saved snapshots, debounce writes, and/or apply granular diffs before persisting.

### Legacy Filter Storage Prefix

- **Location**: `src/features/filter/useTrackFilter.js`
- **Issue**: Filter state persists under the `sta:v5:filters` key while the main schema is v6.
- **Impact**: Future migrations must remember to include this legacy prefix; recovery tooling becomes harder to reason about.
- **Recommendation**: Migrate prefix to v6 (or version-neutral) and document alongside storage contracts.

### Untested Background Pagination

- **Location**: `src/App.jsx`
- **Issue**: Complex refs/timers for `pagerFlights`, cooldowns, and background sync lack automated tests.
- **Impact**: Concurrency regressions could slip through CI; difficult to refactor safely.
- **Recommendation**: Extract pagination state management into a testable module and add Vitest coverage for cooldown/resume/error flows.

### Unmemoized TrackCard Components

- **Location**: `src/features/playlist/TrackCard.jsx`
- **Issue**: TrackCard re-renders on any App state change despite no prop changes. With 500+ tracks, this causes significant unnecessary work.
- **Impact**: Sluggish UI during tag edits, note operations, or filter changes.
- **Recommendation**: Wrap TrackCard in React.memo() with custom comparison function. Quick win before virtualization work.

### Inconsistent TypeScript Adoption

- **Location**: Project-wide
- **Issue**: Recent TS setup with JSDoc, but no clear migration path. Mix of prop-types and TypeScript creates maintenance burden. No strict mode enabled.
- **Impact**: Type safety benefits unrealized; team unsure whether to write JSDoc or full TS; IDE experience inconsistent across files.
- **Recommendation**: **Decision required**: Full `.tsx` migration (2-3 weeks) OR commit to JSDoc with `tsc --checkJs`. Document choice in CLAUDE.md for team alignment.

### Missing Development Tooling

- **Location**: Project root
- **Issue**: No Prettier, Husky, lint-staged, or commitlint. With multiple developers, code style will drift and commit quality varies.
- **Impact**: Merge conflicts from formatting differences; inconsistent commit messages; manual linting step often skipped.
- **Recommendation**: Add pre-commit hooks with `husky` + `lint-staged` to auto-format and lint only changed files. Add `commitlint` to enforce conventional commits.

## Low Priority

### Bundle Optimization Opportunities

- **Location**: `src/main.jsx`, `src/App.jsx`
- **Issue**: No code splitting or lazy loading. All routes/screens load upfront.
- **Impact**: Larger initial bundle; slower time-to-interactive on slow connections.
- **Recommendation**: Lazy load AccountView and PlaylistView with `React.lazy()`. Consider route-based code splitting if app grows beyond current 3 screens.

### Accessibility Enhancements

- **Location**: Various components
- **Issue**: Missing skip links, inconsistent loading states (`aria-busy`), errors use `aria-live="polite"` instead of `role="alert"`.
- **Impact**: Minor accessibility gaps; screen reader users may miss critical error announcements.
- **Recommendation**: Add skip-to-content link, ensure loading spinners have `role="status"`, critical errors get `role="alert"` for immediate announcement.

---

## Strength Highlights

- Feature-oriented folder structure with detailed orientation docs (`src/docs/ORIENTATION.md`) accelerates new contributor ramp-up.
- Accessibility receives first-class treatment (live region via `useAnnounce`, ARIA patterns in `SearchFilterBar` and `TrackCard`).
- Adapters/import flow enjoy thorough unit tests (`usePlaylistImportFlow.test.js`), giving confidence in concurrency handling.

---

## Next Steps

1. Scope refactor spikes to split `App.jsx` into domain hooks/controllers and add integration coverage.
2. Prototype virtualized playlist rendering against large mock data sets and monitor focus behavior.
3. Rework persistence layer to batch writes and update storage key documentation.
4. Add targeted Vitest suites for background pagination/cooldown logic.

