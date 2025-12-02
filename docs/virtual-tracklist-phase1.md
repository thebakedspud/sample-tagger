# Playlist Virtualization Phase 1 — Design & Implementation Sketch

> **Status:** Implemented (Nov 2025). PlaylistView now uses `@tanstack/react-virtual` by default (see `src/features/playlist/PlaylistView.jsx`). Keep this document as a historical design reference.

## Goals
- Replace the unbounded `<TrackCard />` map with a virtualized list that keeps DOM/React work roughly constant (≈20 rows) even for 10k tracks.
- Keep existing a11y/focus affordances functional (first-visible tracking, undo placeholders, tag interactions).
- Improve filtering responsiveness via debounced input + memoized results.
- Provide a rollback path (feature flag) and establish measurable performance budgets.

## Constraints & Edge Cases
1. **Variable row height** – TrackCard height changes due to expanded note editor, tag wrapping, inline undo placeholders. We must use `@tanstack/react-virtual` (headless, dynamic measurement) rather than fixed-size lists.
2. **Inline undo timers** – Placeholders live in parent state (`useInlineUndo`). Virtualization may unmount them when off-screen, so timers must remain in the hook, not the DOM instance. Tests must cover “delete → scroll away → timer expires”.
3. **Focus management** – Existing helpers assume the target element exists. We need a `focusTrack(index, focusId)` helper that:
   - Calls `virtualizer.scrollToIndex(index, { align: 'start' })`.
   - Waits for the virtualized row to mount (`requestAnimationFrame` + microtask).
   - Invokes `focusById(focusId)` (or falls back to element ref).
4. **Filtering scroll behavior** – For Phase 1 we reset scroll to top whenever filters change (Option A). Future phases can attempt context-preserving scroll.
5. **Tag autocomplete dropdown** – Ensure the combobox content portals outside the scroll container (Radix does by default; verify `portalled` prop).
6. **Background pagination** – Adding tracks updates `virtualizer.count`. We must batch append operations (already done) and add regression tests to ensure scroll position does not jump mid-scroll.
7. **Performance targets** – Define budgets now to guide implementation/testing (see below).
8. **Feature flag** – Allow opt-in/opt-out: env flag (`VITE_ENABLE_VIRTUALIZATION`), localStorage override (`ff:virtualization`), auto-enable for playlists >100 tracks. Keep legacy rendering for fallback.
9. **Memoization strategy** – `useTrackFilter` already debounces query (250ms) and memoizes filtered/sorted arrays. We will:
   - Switch to `useDeferredValue` for query debounce (React 18) or keep timer (if `useDeferredValue` not desired). Document dependency array: `[tracks, indexMap, deferredQuery, scope, selectedTags, hasNotesOnly, sort]`.
   - Memoize derived props (`pendingByTrack`, available tags) as inputs to virtual rows.
10. **Scroll container isolation** - Always attach the virtualizer to a dedicated playlist scroll wrapper (use `getScrollElement: () => parentRef.current`). Mobile Safari shrinks the visual viewport when the soft keyboard appears; `useWindowVirtualizer` interprets that resize as a scroll jump and momentarily reorders TrackCards.

## Performance Budgets
```js
export const PERFORMANCE_TARGETS = {
  initialRender: { 100: 50, 1000: 200, 10000: 500 }, // milliseconds
  scrollFrame: 16,        // max per-frame work to maintain ~60fps
  filterApply: 100,       // debounced filter recompute
  memoryMB: { 1000: 30, 10000: 100 },
};
```

## Implementation Sketch

### 1. Feature Flag & Virtualizer Setup
- Create `useVirtualizedTracks` (or inline in PlaylistView) that:
  - Reads `ENABLE_VIRTUALIZATION` from env/localStorage/track count.
  - Provides `virtualizer`, `parentRef`, `items`, and `scrollToIndex`.
- Replace `<ul>{filteredTracks.map(...)}</ul>` with:
  ```jsx
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => parentRef.current, // isolates playlist scroll from window/soft-keyboard resize
    estimateSize: () => 140, // heuristic
    overscan: 6,
    measureElement: (el) => el.getBoundingClientRect().height,
    scrollPaddingStart: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();
  ```
- Render:
  ```jsx
  <div ref={parentRef} className="track-virtual-scroll">
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualItems.map((item) => {
        const track = filteredTracks[item.index];
        return (
          <div
            key={track?.id ?? item.index}
            data-index={item.index}
            style={{
              position: 'absolute',
              top: item.start,
              width: '100%',
            }}
            ref={virtualizer.measureElement}
          >
            <TrackListItem track={track} index={item.index} />
          </div>
        );
      })}
    </div>
  </div>
  ```
- `TrackListItem` chooses between `<UndoPlaceholder>` and `<TrackCard>` based on existing pending state so virtualization stays agnostic.

### 2. Focus & Scroll Helpers
- New helper inside PlaylistView:
  ```js
  const focusTrack = useCallback((index, focusId) => {
    if (!virtualizer) return;
    virtualizer.scrollToIndex(index, { align: 'start' });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => focusById(focusId));
    });
  }, [virtualizer]);
  ```
- Update call sites:
  - Filter-aware focus effect: determine the target index via `filteredTracks.findIndex`; call `focusTrack`.
  - App-level focus after import/undo uses the same helper via a ref callback or exposing `scrollToTrackId`.
  - When `filteredTracks.length === 0`, still focus search input immediately (no virtualization needed).

### 3. Filter Scroll Reset
- When `filteredTracks` dependency changes due to query/scope/tags:
  - Track `prevFilterSignature` (string of query/scope/tags/hasNotesOnly). If signature changes, call `virtualizer.scrollToIndex(0)` (or `parentRef.current.scrollTop = 0` when virtualization disabled).
  - Document this behavior in the component docstring & tests.

### 4. Tag Autocomplete
- Audit `TagInput`/`TagAutocomplete`: ensure Radix `portalled` is true and container has `overflow: visible` if needed.
- Add regression test that verifies dropdown DOM node is appended to `document.body` (or portal root) even when parent has overflow hidden.

### 5. Background Pagination
- Virtualizer automatically recalculates `totalSize` on `count` change. Ensure state updates append tracks in a single reducer action (already true).
- Add integration test simulating `APPEND_TRACKS` while scrolled mid-list; assert `virtualizer.scrollOffset` stays within tolerance (mocked via jsdom? Instead, test `scrollTop` remains unchanged after React commit).

### 6. Memoization & Filtering
- Keep `useTrackFilter` as the single source of truth:
  - Replace manual `setTimeout` debounce with `useDeferredValue` (if acceptable) or leave as 250ms timer but note in design.
  - Memoize `pendingByTrack` with `useMemo([pending])` (already done) and pass stable references to `TrackCard`.
- For virtualization, compute `filteredTracks` once per dependency change, not per render.

### 7. Testing Plan (Phase 1 scope)
1. **Fixture generator** `src/test/fixtures/generateTracks.js`.
2. **PlaylistView tests**:
   - Renders only virtual window items (`virtualItems.length <= visible + overscan`) when virtualization enabled.
   - `focusTrack` scrolls + focuses an off-screen track (simulate by overriding `virtualizer.scrollToIndex` in tests).
   - Filtering resets scroll position (assert `parentRef.current.scrollTop === 0` after scope change).
   - Inline undo placeholder timer fires even when item unmounted (mock timers, advance time).
   - Background append keeps scroll offset stable (simulate by setting `parentRef.current.scrollTop`, append tracks, flush microtasks).
3. **Performance tests** (may live under `vitest.performance.test.jsx`):
   - Use `performance.mark/measure` around render with 1k/5k/10k tracks (skip for legacy list). Fail if duration exceeds `PERFORMANCE_TARGETS.initialRender[n]`.
4. **Tag autocomplete** – ensure dropdown is portalled (assert parent of dropdown is `document.body`).

### 8. Rollout
- Default to legacy list unless flag enabled. During development set env flag true.
- Provide devtools toggle via localStorage key for QA.
- Log a console warning if virtualization disabled but track count > threshold.

## Next Steps
1. Implement feature flag + skeleton virtualized list (behind flag) to validate measurement and focus helper.
2. Wire `focusTrack`, filter scroll reset, undo placeholder rendering to the virtualized rows.
3. Update tests + add fixtures + performance harness.
4. Iterate on styling/UX once core functionality validated, then flip flag for high-count playlists.
