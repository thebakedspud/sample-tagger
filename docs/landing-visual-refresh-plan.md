# Landing Page Visual Refresh Plan

**Status:** Implementation complete, pending commit

## Background

User testing revealed several key insights that inform this work:

1. **Timestamps are the strongest value signal** — one user said timestamps were the only reason they'd return.
2. **Purpose is unclear** — users asked "Is the purpose of it to make notes?" suggesting the landing doesn't communicate value.
3. **Visual hierarchy is weak** — multiple users struggled with colour, contrast, and UI differentiation.
4. **Navigation expectations** — users expected clicking the logo to return to import (already addressed in codebase).

## Goals

- Communicate the product's core value (timestamped notes) within a single glance.
- Lead with the differentiator — timestamps — rather than treating it as one feature among many.
- Keep execution minimal to stay focused on the 3-month MVP timeline.

## Scope

### In Scope
- [x] Hero copy update (lead with timestamps as the value prop)
- [x] Input placeholder simplification (Spotify-focused)
- [x] Remove prototype footer copy

### Parked for Later
- **FeatureHighlights component** — originally planned as a three-card section (timestamps, tags, backup). Parked because:
  - Users who don't understand the purpose may not read marketing content before acting
  - Timestamps are already prompted contextually in the add-note UI
  - Conditional rendering logic (show only for first-timers / users who haven't discovered features) adds complexity
  - Can revisit post-MVP if conversion data suggests it's needed
- Conditional feature discovery tracking expansion

## Key Files / Touchpoints

- `src/App.jsx` — update landing paragraph copy and placeholder; remove prototype footer copy

## Implementation Steps

### 1. Hero Copy Update — DONE

Replaced the heading and paragraph in the `screen === 'landing'` section.

**Heading:**
Before: "Get started"
After: "Timestamp Your Playlists"

**Subheading:**
Before: "Paste a Spotify playlist or podcast episode URL to import and start adding notes."
After: "Turn your Spotify library into a searchable notebook."

### 2. Input Placeholder Simplification — DONE

Updated the placeholder to be Spotify-focused since YouTube/SoundCloud return mock data only.

Before (conditional on PODCASTS_ENABLED):
> `https://open.spotify.com/playlist/... (or show/episode link)`

After:
> `Paste a Spotify playlist or episode link`

### 3. Remove Prototype Footer — DONE

Deleted the footer element containing: "Prototype - Keyboard-first, accessible-by-default"

## Verification

- [ ] Manual QA: confirm hero text reads clearly, placeholder is updated, footer is removed
- [ ] Accessibility: ensure the paragraph remains associated with the form context
- [ ] Screen reader test: verify the value prop is announced when landing on the page

## Future Considerations

If post-launch data shows users still don't understand the purpose:
- Revisit the FeatureHighlights component with conditional rendering (only for users with zero recents or who haven't discovered timestamp feature)
- Consider a micro-onboarding tooltip after first import
- A/B test different value prop framings

## Related Work

- **Visual hierarchy improvements** — addresses insight #3 (weak colour/contrast). See `docs/visual-hierarchy-improvements-plan.md`.
