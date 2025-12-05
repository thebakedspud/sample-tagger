# Landing Page Visual Refresh Plan

## Goals
- Communicate the product value within a single glance by updating the landing hero copy.
- Introduce a Feature Highlights row that emphasizes timestamps, tagging, and backups before users see recents.
- Keep execution lightweight (inline SVGs, existing design tokens) and conversion-focused.

## Key Files / Touchpoints
- `src/App.jsx` — replace current landing paragraph copy; import/render the upcoming `FeatureHighlights` component before `RecentPlaylists`; later remove the prototype footer copy.
- `src/components/FeatureHighlights.jsx` — new presentational component with three cards (timestamps, tags, backup) using inline SVGs and concise copy.
- `src/styles/app.css` — global styles for the highlight grid/cards, including responsive behavior and token usage.

## Implementation Steps
1. **Hero Copy Update**  
   Replace the existing paragraph in the `screen === 'landing'` section with:  
   “Add notes, tags, and timestamps to your favorite tracks. Paste a Spotify playlist or podcast episode URL to import and start annotating.”  
   Keep the same element structure so layout remains stable, and adjust the input placeholder to remove the YouTube/SoundCloud mention (e.g., `https://open.spotify.com/playlist/... (or show/episode link)` or “Paste Spotify playlist or podcast URL”).
2. **FeatureHighlights Component**  
   Create `FeatureHighlights.jsx` that renders a `<section>` with an accessible heading, three cards, and inline SVGs (timestamps, tags, backup). Ensure SVGs are `aria-hidden` and text remains concise.
3. **Styling**  
   Append styles under scoped selectors (e.g., `.feature-highlights`, `.feature-card`) in `src/styles/app.css`. Use existing CSS custom properties (`var(--card)`, `var(--muted)`, `var(--border)`) and add a media query to collapse from a three-column grid to one column on small viewports.
4. **Integrate Highlights**  
   Import `FeatureHighlights` in `src/App.jsx` and render it within the landing screen section before `<RecentPlaylists />`. Condition the rendering so it only appears on the landing view, ensuring returning users can still scroll directly to their recents.

## Verification / Follow-up
- Manual QA: confirm hero text updates, highlight cards show above “Previously imported,” and layout remains responsive.
- Accessibility: verify headings order, labels for the import field, and that decorative SVGs are hidden from screen readers.
- Future work (explicitly out of scope right now): gradients, hover/focus polish, additional icons (YouTube/SoundCloud), navigation or theme picker updates.
