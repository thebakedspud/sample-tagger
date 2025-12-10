# Playlist Virtualization Phase 2 — Accessibility, Perf, and Validation

> **Status:** Partially implemented. Live-region messaging and virtualization rollout are complete; use this document to track the remaining UX/perf follow-ups (skip links, caching, instrumentation).

Phase 1 shipped the virtualized list skeleton (feature flag, focus helper, memoized filtering). Phase 2 finishes the job: accessibility polish, UX affordances, and guardrails that keep performance steady as the dataset grows.

## Goals
1. **Accessibility + UX**
   - Live-region messaging that announces the visible range, total count, and filter context (e.g., “Showing 18 of 1,247 tracks (Date added, newest first)”).
   - Skip-navigation controls: jump to first track, jump by 100s, focus search, etc., tied to `virtualizer.scrollToIndex`.
   - Preserve focus during virtualization (focus trap around add-note buttons / tag inputs).

2. **Filtering / Interaction polish**
   - Debounced `SearchFilterBar` input (React `useDeferredValue` or existing timer) with loading affordance when filtering large sets.
   - Memoize `filterTracks` output per filters to prevent redundant work; cache tag-filter combinations where possible.
   - Optional: inline skeleton/loader while filters apply on large lists.

3. **Performance instrumentation**
   - Define and enforce budgets (from Phase 1 doc): render < 200 ms for 1k tracks, < 500 ms for 10k; filter updates < 100 ms; memory < 30 MB at 1k.
   - Add benchmark helpers/scripts to run in CI or on demand.

4. **Regression tests**
   - Large dataset fixtures (1k/5k/10k) verifying DOM node counts, virtualization window size, focus restoration, undo placeholders, background pagination stability.
   - Accessibility tests: live-region content, skip links working, tag autocomplete portal still accessible.


### Visual viewport guardrail
- Keep the playlist virtualizer scoped to its own scroll container instead of `window`. When iOS Safari shows the soft keyboard it shrinks the visual viewport and fires `resize`/`scroll` events; if the virtualizer listens to `window` it treats that as user scroll, causing cards to jump.
- Codify this expectation in code comments/tests (e.g., assert `getScrollElement` returns the playlist wrapper) so refactors do not regress to `useWindowVirtualizer`.
- When adding skip links or jump controls, call `virtualizer.scrollToIndex` on the playlist container, not `window.scrollTo`, to keep keyboard/mouse behavior aligned across devices.

## Implementation Sketch

### 1. Accessibility Enhancements
1. Live region:
   - Create `aria-live="polite"` region near the filter summary (or reuse existing `liveSummary` from `useTrackFilter`).
   - Populate with `summaryText` (“Showing N of M tracks…”) and announce on virtualization window changes.
2. Skip controls:
   - Add visually-hidden but keyboard-focusable buttons/links: “Jump to top”, “Jump +100”, “Jump -100”.
   - Use the existing `focusTrackButton` helper plus new `scrollToIndex` wrappers.
3. Focus persistence:
   - When virtualization unmounts a row, ensure focus falls back to search input or the next/prev Add Note button (extend `focusTrackButton` or add `focusFallback()` logic).

### 2. Filtering & Interaction
1. Debounced search:
   - Replace manual 250 ms timeout in `useTrackFilter` with `useDeferredValue` (React 18) or keep timer but expose “isFiltering” state.
   - Show spinner/skeleton when filtering > 200 tracks to indicate work in progress.
2. Memoization:
   - Cache filter results keyed by `tracksVersion + filterSignature` to avoid recompute when toggling virtualization or minor UI changes.
3. Tag filter experience:
   - Keep portal check for tag autocomplete; add test verifying dropdown still overlays the virtualized list.

### 3. Testing & Tooling
1. Fixture generator (already added) – expand to include tags, notes, placeholders; use in tests.
2. Add Vitest suites:
   - `PlaylistView.virtual.test.jsx`: ensures virtualization renders <= window+overscan rows, focus restoration works after scroll, undo placeholders still expire off-screen.
   - `PlaylistView.perf.test.jsx`: uses `performance.now()` to assert render/filter times under budgets (allow opt-out via env).
3. Introduce `scripts/bench-virtualized-list.mjs` to render headless 10k dataset and log metrics locally.

### 4. Feature Flag / Rollout
1. Add telemetry/logging when virtualization disabled due to flag so we can track adoption.
2. Provide QA toggle UI (maybe under devtools panel) to flip virtualization + log virtualization stats (virtual window size, DOM nodes).

## Next Steps
1. Implement live-region + skip controls (wire to `focusTrackButton`).
2. Add debounced filtering indicator + caching.
3. Layer in tests/benchmarks (fixtures, virtualization suite, performance assertions).
4. Document rollout/flag strategy in README or Ops runbook.

