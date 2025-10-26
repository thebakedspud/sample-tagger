# Sample Tagger (Prototype)

A minimal, accessibility-first playlist annotator built with React + Vite.

[![Tests](https://github.com/thebakedspud/sample-tagger/actions/workflows/test.yml/badge.svg)](https://github.com/thebakedspud/sample-tagger/actions/workflows/test.yml)

Sample Tagger helps you import a playlist, annotate tracks, and keep those notes accessible across sessions. It started as a UX accessibility exercise and now includes recovery, recents, and backup tooling.

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

### Keyboard Use
- Everything is reachable with Tab/Shift+Tab and activatable with Enter/Space.
- New inputs (e.g., “Add note”) receive focus automatically.
- After actions complete, focus returns to a sensible place (often the invoking control).

### Feedback
- A hidden `role="status"` live region announces updates (“Imported 3 tracks”, “Note added”).
- Color is never the only signal; we pair it with text or icons.

### Visuals
- Contrast targets ≥ 4.5:1 for body text and ≥ 3:1 for large text/controls.
- Interactive targets stay roughly 44 × 44 px for comfortable activation.

For a detailed architectural map, see ORIENTATION.md.

---

## Running Log

- 23-10-2025: Notes backup/export and recovery flows integrated into the app.
- 15-10-2025: Spotify integration live via serverless token exchange and Web API — import public playlists directly.

_This README evolves alongside the app. Update it whenever onboarding expectations or user-facing behavior change._
