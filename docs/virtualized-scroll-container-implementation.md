# Playlist Virtualizer Scroll-Container Implementation Plan

_Last updated: 3 Dec 2025_

## Background

- **Bug:** On iOS Safari, tapping “Add note” expands the TrackCard textarea, forces the soft keyboard to appear, and shrinks the visual viewport. Because the playlist uses `useWindowVirtualizer`, any viewport resize looks like a scroll event, so the virtualizer momentarily repositions rows and the list “jumps”.
- **Root cause:** The list’s scroll context is coupled to `window`. Focus helpers call `focusById(...)`, which triggers browser-native scroll-into-view, amplifying the jump.
- **Goal:** Move PlaylistView (and any future long lists) onto a dedicated scroll container that is immune to window viewport changes, and update focus/scroll plumbing accordingly.

## Scope

- **In scope**
  - PlaylistView rendering path (virtualizer selection, focus helpers, load-more button placement).
  - Layout shell (`AppInner` + top-level CSS) so that Playlist screens keep scrolling when `body` overflow is disabled.
  - Shared ScrollArea primitive to reuse between Playlist, Landing, and Account views.
  - Styling adjustments to use dynamic viewport units (`dvh`) when creating full-height containers.
- **Out of scope (for this change)**
  - Major refactors of Landing/Account UI; we only ensure they continue to scroll by wrapping their content.
  - Additional virtualization optimizations (perf telemetry, caching) already tracked in `virtual-tracklist-phase2.md`.

## Implementation Steps (Phased)

To limit blast radius, we’ll proceed in phases:

- **Phase 0 (ship first):** Keep the current window-scoped virtualizer but add a VisualViewport-based lock and `focus({ preventScroll: true })` so iOS Safari can’t yank the list when the keyboard appears. Ship/verify this quickly.
- **Phase 1 (playlist-only container):** If Phase 0 doesn’t fully solve the jitter, convert PlaylistView to a dedicated ScrollArea (no global CSS change) so TanStack Virtual only listens to that container. Scroll persistence becomes mandatory here.
- **Phase 2 (app-wide shell):** Only if other screens need the same treatment, generalize ScrollArea/global styles across Landing/Account.

The remaining sections describe Phase 1/2 in detail; note where Phase 0 diverges.

### Phase 0: Targeted Fix (Ship First)

1. **Update `focusById` / `focusElement`:** In `src/utils/focusById.js`, add `preventScroll: true` (with try/catch fallback) so the browser doesn’t auto-scroll when we focus the textarea. This lands before any structural work so all callers benefit.
2. **VisualViewport lock effect:** Add the following to `PlaylistView.jsx` to freeze the virtualizer offset while iOS shrinks the viewport:
   ```js
   useEffect(() => {
     if (!virtualizationEnabled || !virtualizer) return;
     const vv = window.visualViewport;
     if (!vv) return;
     let frozenOffset = null;
     const handleResize = () => {
       if (frozenOffset === null) frozenOffset = virtualizer.scrollOffset;
     };
     const handleScroll = () => {
       if (frozenOffset !== null) {
         const target = frozenOffset;
         frozenOffset = null;
         requestAnimationFrame(() => {
           virtualizer.scrollToOffset(target, { align: 'start' });
         });
       }
     };
     vv.addEventListener('resize', handleResize);
     vv.addEventListener('scroll', handleScroll);
     return () => {
       vv.removeEventListener('resize', handleResize);
       vv.removeEventListener('scroll', handleScroll);
     };
   }, [virtualizationEnabled, virtualizer]);
   ```
3. **Phase 0→Phase 1 gate:** If iOS Safari testing shows any residual jitter (visible jump > ~10px) after shipping this, proceed to Phase 1. If the jump is eliminated, stop here and monitor telemetry/user reports for one week before closing the bug.

### 1. App Layout & Scroll Scaffolding

1. Add a lightweight `ScrollArea` component (e.g., `src/components/ScrollArea.jsx`) that:
   - Renders a single scrollable `<div>` with `height: 100%`, `overflow-y: auto`, and `display: flex; flex-direction: column;`.
   - Forwards its ref so PlaylistView can pass it directly to `useVirtualizer` (no nested scroll divs).
   - Optionally accepts a `saveKey` prop that persists `scrollTop` (keyed by playlist ID or route) to `sessionStorage`. Keep this optional so the virtualization fix can ship even if persistence proves flaky on iOS.
2. Convert the playlist shell (`#root`, `.app`) to use `min-height: 100dvh` (fallback `min-height: 100vh`) and `display: flex; flex-direction: column;`.
3. **Phase choice:** For Phase 1, scope `overflow: hidden` and ScrollArea usage to the playlist screen only (keep window scroll elsewhere; add `overscroll-behavior: contain` on the playlist ScrollArea to tame pull-to-refresh). In Phase 2, disable body scroll globally and wrap Landing/Account the same way once we’re confident.
4. Use one `ScrollArea` per Playlist screen (`flex: 1`) as the sole vertical scroll context during Phase 1. Keep the header/filter bar outside (`flex: 0`). In PlaylistView this means:
   ```jsx
   <PlaylistView>
     <SearchFilterBar ... />      {/* non-scrolling */}
     <ScrollArea ref={listScrollRef}>
       <VirtualizedList ... />
       <LoadMore ... />
     </ScrollArea>
   </PlaylistView>
   ```
   Only duplicate this pattern to other screens in Phase 2.

### 2. PlaylistView Conversion

1. Receive the ScrollArea ref as `listScrollRef` inside PlaylistView (or create it and pass via `forwardRef`).
2. Replace `useWindowVirtualizer` with `useVirtualizer`, keeping the feature flag:
  ```js
  const virtualizationEnabled = shouldVirtualize && filteredTracks.length > 0;

  const virtualizer = useVirtualizer({
    enabled: virtualizationEnabled,
    count: virtualizationEnabled ? filteredTracks.length : 0,
    getScrollElement: () => listScrollRef.current,
    estimateSize: estimateTrackSize,
    overscan: 10,
  });
  ```
3. Render the virtualized stack directly inside the ScrollArea (the ScrollArea is the scroll container). Attach `ref={virtualizer.measureElement}` to each row as before.
4. Move the “Load more” section **inside** the ScrollArea, after the list, so it scrolls naturally with the content. If we’re using `IntersectionObserver` for load-more detection, re-root the observer to `listScrollRef.current`.
5. Save/restore scroll on mount/unmount using the `saveKey` support (or a dedicated ref) and include playlist identity in the key (e.g., `playlist:${playlistId}`) so different playlists do not overwrite one another. This persistence is required before shipping Phase 1.

### 3. Scroll/Focus Helpers

1. Update the filter-change effect to call `virtualizer.scrollToIndex(0, { align: 'start' })` when virtualization is enabled; fall back to `listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })` when disabled.
2. Rework `focusTrackButton` (Phase 0 already updated `focusById` with `preventScroll`; keep using the same helper):
   - Find the track index (`filteredTracks.findIndex`).
   - Call `virtualizer.scrollToIndex(targetIndex, { align: 'start' })`.
   - Perform a single double-`requestAnimationFrame` wrapper before calling `focusById`, and ensure `focusById` attempts `element.focus({ preventScroll: true })` inside a try/catch (fallback to `element.focus()` when options aren’t supported) so the browser doesn’t scroll the wrong container.
   - Guard against missing refs (e.g., when virtualization disabled).
3. For non-virtualized mode (short lists), continue to manipulate the `<ul>` scroll container using the same ref.
4. Optionally expose a `scrollToTrackId` helper (wrapping the logic above) so `useNoteHandlers` can invoke it before focusing the textarea. This keeps all scroll management centralized inside PlaylistView.
5. Provide a `focusAfterPaint` helper: double-RAF with a max wait (e.g., 150 ms) so we avoid infinite waits if the component unmounts mid-animation. This can wrap `focusById` for Phase 0 and beyond.

### 4. Styles & Viewport Units

1. Add CSS utility (e.g., `.app-shell`) that sets `min-height: 100dvh` with `@supports (height: 100dvh)` fallback to `min-height: 100vh`.
2. Apply `.app-shell` to the playlist screen wrapper and to the ScrollArea so the bottom of the list stays visible when the Safari URL bar is present (Phase 1 scope). Extend to other screens only in Phase 2.
3. Ensure `Load more` spacing/padding still matches existing design when rendered inside the scroll region (PlaylistView currently uses `paddingBottom: 128` to clear the fixed footer—carry this into the ScrollArea so the last card isn’t hidden behind the footer).
4. Verify only one vertical scroll container exists per screen to avoid nested scrollbars on small devices.

### 5. Testing & Verification

- **Manual**
  - Phase 0: On iOS Safari, confirm the VisualViewport lock + `preventScroll` eliminate the jump without altering layout.
  - Phase 1+: Reproduce on iOS Safari (or simulator) to confirm no jump occurs when “Add note” opens/closes repeatedly.
  - Verify Landing and Account screens still scroll when wrapped in ScrollArea (Phase 2 only).
  - Scroll mid-list, tap “Add note”, then “Cancel”; focus should return to the correct button without repositioning.
  - Rotate the device while a textarea is focused; confirm layout stays stable.
- **Automated**
  - Update PlaylistView tests to mock the scroll container ref and confirm `scrollToIndex` calls.
  - Add regression test ensuring `renderTrackRow` still receives consistent props when virtualization toggles.
  - Add a unit test asserting `getScrollElement` returns the playlist scroll div (not `window`) when virtualization is enabled.

### 6. Rollout Notes

- Keep the existing feature flag (`ff:virtualization`) functional by storing the scroll-container ref even when virtualization is disabled.
- Document the new ScrollArea contract in `docs/virtual-tracklist-phase1.md` (already updated with the guardrail language).
- Monitor analytics/error logs for any unexpected focus/scroll regressions after deployment.
- If subtle jitter remains on iOS Safari after Phase 1, be prepared to ship a fallback that auto-disables virtualization on that platform while preserving the manual override flag.

---

Use this checklist when implementing the fix so we cover both the PlaylistView changes and the app-level layout adjustments required to support a dedicated scroll container. Once the above prep work is in place, we can proceed with the code changes.
