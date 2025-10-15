# Sample Tagger (Prototype)

[![Tests](https://github.com/thebakedspud/sample-tagger/actions/workflows/test.yml/badge.svg)](https://github.com/thebakedspud/sample-tagger/actions/workflows/test.yml)

Bare-bones prototype for importing a playlist and adding notes.

As part of my UX/UI design course, I’ve been learning about accessibility, inclusion, and inclusive design.  
This app is an attempt to deepen that understanding and put those principles into practice.

Below is a checklist of guidelines that have shaped development so far.  
It will continue to evolve as the project grows.

---

## ♿ Accessibility Checklist

We aim to follow **WCAG principles** and good inclusive practices as we build.

### Page Structure
- Use landmarks (`header`, `main`, `footer`) so assistive tech users can jump around quickly.
- Have **one `<h1>`** for the app title; use `<h2>`, `<h3>` for section headings to show hierarchy.

### Lists & Content
- Use real lists (`<ul><li>`) for tracks and notes so users know how many items there are and where they are in the list.

### Buttons & Controls
- All actions are real `<button>` elements, not hidden right-clicks.  
- Every button has a clear label or an accessible name (`aria-label` if icon-only).  
- Keep focus visible (don’t remove outlines).

### Keyboard Use
- Everything can be reached with **Tab** and activated with **Enter/Space**.  
- When new inputs appear (like “Add note”), focus moves straight into them.  
- When actions complete, focus returns to a sensible place (e.g., back to the triggering button).

### Feedback
- Use a hidden **live region** (`role="status"`) to announce changes (e.g., “Imported 3 tracks”, “Note added”).  
- Don’t rely on color alone — pair it with text or icons.

### Visuals
- Text contrast: **≥ 4.5 : 1** for body text, **≥ 3 : 1** for large text and UI controls.  
- Clickable areas are large enough (around 44 × 44 px).

---

_This checklist is a living document and part of the project’s ongoing accessibility focus._
14/10/2025 test






---
Running Log
15-10-2025 Spotify integration now live via serverless token exchange and Web API — import public playlists directly.