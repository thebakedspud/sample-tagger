# Playlist Notes (Prototype)

A minimal, accessibility-first playlist annotator built with React + Vite.

[![Tests](https://github.com/thebakedspud/sample-tagger/actions/workflows/test.yml/badge.svg)](https://github.com/thebakedspud/sample-tagger/actions/workflows/test.yml)

Playlist Notes helps you import a playlist, annotate tracks, and keep those notes accessible across sessions. It started as a UX accessibility exercise and now includes recovery, recents, and backup tooling.

Current capabilities:

- Import public playlists from Spotify, YouTube, or SoundCloud through the adapter registry.
- Normalize tracks, attach per-track notes, and undo accidental deletes inline.
- Resume previous sessions via localStorage and a recent-playlists carousel.
- Bootstrap anonymous device IDs and recovery codes with `/api/anon/bootstrap`, then restore notes on other browsers through `/api/anon/restore`.
- Export/import JSON backups so notes survive outside the browser.

> 22-10-2025: First Lighthouse run to hit 100 on the accessibility score.

---

## Accessibility Checklist

We aim to follow WCAG principles and inclusive design practices.

### Page Structure
- Use landmarks (`header`, `main`, `footer`) so assistive tech users can jump quickly.
- Keep a single `<h1>` for the app title; rely on semantic headings for sections.

### Lists & Content
- Represent tracks and notes with real lists (`<ul><li>`) so counts and positions are announced.

### Buttons & Controls
- All actions use `<button>` elements with visible focus treatment.
- Each control has a clear accessible name (`aria-label` for icon-only buttons).
- The top-left “Playlist Notes” title is also a button so mouse users always have a predictable route back to the import screen.

### Keyboard Use
- Everything is reachable with Tab/Shift+Tab and activatable with Enter/Space.
- New inputs (e.g., “Add note”) receive focus automatically.
- After actions complete, focus returns to a sensible place (often the invoking control).
- Pressing `Home` (outside text inputs) jumps focus to the Playlist Notes title and returns you to the import screen—the same action the title button performs for mouse users.

### Feedback
- A hidden `role="status"` live region announces updates (“Imported 3 tracks”, “Note added”).
- Color is never the only signal; we pair it with text or icons.

### Visuals
- Contrast targets ≥ 4.5:1 for body text and ≥ 3:1 for large text/controls.
- Interactive targets stay roughly 44 × 44 px for comfortable activation.

For a detailed architectural map, see ORIENTATION.md.

---

## Type Checking

This project keeps type safety in plain JavaScript by relying on JSDoc plus the TypeScript compiler. `jsconfig.json` enables `"checkJs": true`, so `tsc` can analyze `.js`/`.jsx` files, surface errors, and power editor IntelliSense without a wholesale migration to `.ts`.

### Available Scripts

- `npm run check:tsc` &mdash; runs `tsc --noEmit` using `tsconfig.json` (which extends `jsconfig`). Run this before sending a PR or when touching any code that might affect types.
- `npm run check:types:overlap` &mdash; a custom guard that scans `types/**/*.d.ts` plus our `prop-types` path remaps to ensure each module is declared once. We ship bespoke `prop-types` definitions (see `jsconfig.json` paths) to patch gaps in DefinitelyTyped, so this script keeps those declarations consistent.

The CI workflow runs `check:tsc` on every push/PR; consider adding the overlap check locally to catch duplicate declarations early.

### Example Type Error

Type checking often catches null/undefined paths before they hit runtime. For example, accessing a track before verifying it exists will fail `npm run check:tsc`:

```js
/** @param {{ tracks?: import('./types.js').NormalizedTrack[] }} playlist */
function describeFirstTrack(playlist) {
  return playlist.tracks[0].title.toLowerCase();
}
```

```
Property '0' does not exist on type 'NormalizedTrack[] | undefined'.
```

Fixing it is as simple as guarding the access:

```js
function describeFirstTrack(playlist) {
  const first = playlist.tracks?.[0];
  return first ? first.title.toLowerCase() : 'No tracks';
}
```

---

## Running Log

- 23-10-2025: Notes backup/export and recovery flows integrated into the app.
- 15-10-2025: Spotify integration live via serverless token exchange and Web API — import public playlists directly.

_This README evolves alongside the app. Update it whenever onboarding expectations or user-facing behavior change._
