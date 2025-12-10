# LandingScreen Extraction Plan

## Overview

Extract the landing/import screen from `App.jsx` into a standalone `LandingScreen.jsx` component. This is the first step in modularizing App.jsx into logical screen components.

**Goal:** Remove ~100 lines of inline JSX from App.jsx and establish a clean pattern for future screen extractions.

**Success criteria:** App.jsx renders `<LandingScreen />` when `screen === 'landing'`, and all existing functionality works identically.

---

## Pre-work

- [ ] Run the existing test suite to establish a baseline: `npm test`
- [ ] Read through the current landing screen JSX in App.jsx (search for `screen === 'landing'`)
- [ ] Verify the landing screen JSX boundaries — starts at `<section aria-labelledby="landing-title">` and ends before `{screen === 'playlist' && ...}`
- [ ] Identify all props/state the landing screen currently accesses by reading the actual source (do not assume)

---

## Phase 1: Identify Dependencies

The landing screen currently uses these values from App.jsx scope. **Verify each against the actual source code.**

**From `usePlaylistImportController()` hook:**
- [ ] `importUrl` — controlled input value
- [ ] `importError` — `{ message: string, type: 'error' | 'cancel' | 'rateLimit' } | null`
- [ ] `providerChip` — detected provider label (string or null)
- [ ] `isAnyImportBusy` — disables form during import
- [ ] `showInitialSpinner` — loading state for button
- [ ] `handleImport` — form submit handler
- [ ] `isRefreshingCachedData` — refresh loading state for cached data

**From `useRecentPlaylists()` hook:**
- [ ] `recentPlaylists` — array for RecentPlaylists component
- [ ] `recentCardState` — per-card loading/error state (see shape in Phase 3)

**Local state in AppInner:**
- [ ] `refreshingRecentId` — which recent item is refreshing (useState in App.jsx)

**Refs (defined in App.jsx):**
- [ ] `importInputRef` — ref for focus management on URL input (attached to `<input id="playlist-url">`)

**Handlers (defined in App.jsx):**
- [ ] `handleImportUrlChange` — named function (search for `function handleImportUrlChange`), calls `setImportUrl` + `setImportError`
- [ ] `handleSelectRecent` — callback for RecentPlaylists

**NOT used in landing screen (do not include as props):**
- `landingTitleRef` — attached to header button (search for `ref={landingTitleRef}`), NOT in landing section
- `announce()` — not called; error feedback is declarative via ARIA attributes
- `PODCASTS_ENABLED`, `STOCK_TAGS` — affect other parts of the app only

**Verification step:**
- [ ] Confirm `RecentPlaylists` component signature matches expected props (check `src/features/recent/RecentPlaylists.jsx`):
  ```jsx
  export default function RecentPlaylists({
    items,
    onSelect,
    cardState = {},
    disabled = false,
    refreshingId = null,
    isRefreshing = false,
  })
  ```

---

## Phase 2: Create the Component File

- [ ] Create new file: `src/features/landing/LandingScreen.jsx`
- [ ] Use **default export** (this is the codebase pattern — no named exports for components)
- [ ] Import child components:
  - `ErrorMessage` from `../../components/ErrorMessage.jsx`
  - `RecentPlaylists` from `../recent/RecentPlaylists.jsx`

**Note on React imports:** This codebase uses the new JSX transform — no `import React from 'react'` needed. Only import specific hooks if used (e.g., `import { useState } from 'react'`). LandingScreen is purely presentational with no hooks, so no React import is needed.

**Note:** This codebase does not use barrel exports (index.js files). Import directly from the `.jsx` file.

---

## Phase 3: Define the Props Interface

- [ ] Create JSDoc typedef for props
- [ ] Props should include all items from Phase 1
- [ ] Recommendation: Start with flat props for clarity, refactor later if needed

Expected prop list (13 props):
```
importUrl
onImportUrlChange
importError
providerChip
isAnyImportBusy
showInitialSpinner
importInputRef
onImport
recentPlaylists
recentCardState
onSelectRecent
refreshingRecentId
isRefreshingCachedData
```

**`recentCardState` shape:**
```javascript
// Record<string, { loading?: boolean, error?: string | { message, type } }>
{
  'spotify:abc123': { loading: true },
  'youtube:xyz789': { error: { message: 'Rate limited', type: 'rateLimit' } }
}
```
- Keys are playlist IDs (e.g., `'spotify:abc123'`)
- `loading` (boolean) — shows spinner on card
- `error` — can be string (legacy) or `{ message: string, type: 'error' | 'cancel' | 'rateLimit' }`
- Empty object `{}` or missing key = idle state

---

## Phase 4: Move the JSX

- [ ] Copy the `<section aria-labelledby="landing-title">` block from App.jsx
- [ ] Paste into LandingScreen component return statement
- [ ] Update all direct state/handler references to use props instead
- [ ] `handleImportUrlChange` becomes `onImportUrlChange` prop
- [ ] `handleSelectRecent` becomes `onSelectRecent` prop

**Key transformations:**
- `importUrl` → `importUrl` (destructured from props)
- `handleImport` → `onImport`
- `importInputRef` → `importInputRef`
- `importError` → `importError`
- `providerChip` → `providerChip`
- `isAnyImportBusy` → `isAnyImportBusy`
- `showInitialSpinner` → `showInitialSpinner`
- `recentPlaylists` → `recentPlaylists`
- `handleSelectRecent` → `onSelectRecent`

**IMPORTANT: Preserve the `void` wrapper on form submit:**

The current JSX uses `void` to intentionally ignore the returned promise:
```jsx
onSubmit={(event) => {
  void handleImport(event)
}}
```

In LandingScreen, preserve this pattern to avoid unhandled promise lint warnings:
```jsx
onSubmit={(event) => {
  void onImport(event)
}}
```

Do NOT simplify to `onSubmit={onImport}` — that would change the return behavior.

**CRITICAL: Preserve these accessibility attributes exactly:**

The following IDs and ARIA bindings must remain unchanged — they link error messages to form controls:

```jsx
// Section
<section aria-labelledby="landing-title">

// Heading
<h2 id="landing-title" ...>

// Form (NOTE: has its own aria-describedby, separate from input)
<form
  onSubmit={...}
  aria-describedby={importError?.message ? 'import-error' : undefined}
>

// Input (also has aria-describedby — both form AND input reference the error)
<input
  id="playlist-url"
  ref={importInputRef}
  aria-invalid={!!importError?.message}
  aria-describedby={importError?.message ? 'import-error' : undefined}
  ...
/>

// ErrorMessage
<ErrorMessage id="import-error" data-type={importError?.type}>

// Button
<button
  type="submit"
  disabled={isAnyImportBusy}
  aria-busy={showInitialSpinner ? 'true' : 'false'}
>
```

**A11y verification checklist:**
- [ ] `id="landing-title"` is on the h2
- [ ] `id="playlist-url"` is on the input
- [ ] `id="import-error"` is on the ErrorMessage
- [ ] `aria-describedby` on **form** references `"import-error"` when error exists
- [ ] `aria-describedby` on **input** references `"import-error"` when error exists
- [ ] `aria-invalid` on input is bound to `!!importError?.message`
- [ ] `aria-busy` on button is bound to `showInitialSpinner`

---

## Phase 5: Handle the Input onChange

`handleImportUrlChange` is already a **named function** in App.jsx (search for `function handleImportUrlChange`):
```js
function handleImportUrlChange(e) { setImportUrl(e.target.value); setImportError(null) }
```

This is NOT an inline arrow function in JSX — it's a stable reference in App.jsx's function scope.

**Decision:** Pass it as the `onImportUrlChange` prop. This:
- Keeps state management in App.jsx
- Keeps LandingScreen presentational
- Does NOT change function identity (it's already a named function, not recreated on each render)

No changes needed to the handler itself — just pass it through.

---

## Phase 6: Update App.jsx

- [ ] Add import for LandingScreen at top of file:
```jsx
import LandingScreen from './features/landing/LandingScreen.jsx'
```
- [ ] Replace the inline `{screen === 'landing' && (...)}` block with:
```jsx
{screen === 'landing' && (
  <LandingScreen
    importUrl={importUrl}
    onImportUrlChange={handleImportUrlChange}
    importError={importError}
    providerChip={providerChip}
    isAnyImportBusy={isAnyImportBusy}
    showInitialSpinner={showInitialSpinner}
    importInputRef={importInputRef}
    onImport={handleImport}
    recentPlaylists={recentPlaylists}
    recentCardState={recentCardState}
    onSelectRecent={handleSelectRecent}
    refreshingRecentId={refreshingRecentId}
    isRefreshingCachedData={isRefreshingCachedData}
  />
)}
```
- [ ] Remove the old inline JSX (the `<section aria-labelledby="landing-title">` block)
- [ ] Remove orphaned imports from App.jsx:
  - `ErrorMessage` — now imported by LandingScreen, not App.jsx
  - `RecentPlaylists` — now imported by LandingScreen, not App.jsx

---

## Phase 7: Verify Functionality

**Happy path testing:**
- [ ] Landing screen renders correctly on app load
- [ ] Import URL input accepts text
- [ ] Provider chip appears when valid Spotify/YouTube URL is typed
- [ ] Provider chip shows "no match" for invalid URLs
- [ ] Import button triggers import flow
- [ ] Recent playlists carousel displays (if any exist in localStorage)
- [ ] Clicking a recent playlist triggers import
- [ ] Refresh indicator shows on recent playlist cards during refresh

**Edge case testing:**
- [ ] Empty `recentPlaylists` array — carousel section should not render (not crash)
- [ ] Import with invalid URL — error message displays below input
- [ ] Button disabled state — button is disabled when `isAnyImportBusy` is true
- [ ] Spinner state — button shows "Importing..." when `showInitialSpinner` is true
- [ ] Error + disabled combo — error message visible while button is disabled

**Focus management testing:**
- [ ] After import error, input should receive focus (verify `importInputRef` works)
- [ ] Tab order: input → button → recent playlist cards (if present)

**Accessibility verification:**
- [ ] Error message is linked to input via `aria-describedby="import-error"`
- [ ] Input has `aria-invalid="true"` when error is present
- [ ] Button has `aria-busy="true"` during import
- [ ] Screen reader announces error message (test with VoiceOver/NVDA if possible)

**Global keybindings (NOT affected by this extraction, but verify no regression):**
- [ ] Ctrl/Cmd+Z still triggers undo (if undo is available)
- [ ] "Playlist Notes" header button still focusable via global shortcut

---

## Phase 8: Code Quality

- [ ] Run existing tests — ensure no regressions: `npm test`
- [ ] Run linter — fix any new warnings: `npm run lint`
- [ ] Check for console errors in browser DevTools
- [ ] Create smoke test: `src/features/landing/__tests__/LandingScreen.test.jsx`

**Test file — follow existing patterns from `RecentPlaylists.test.jsx`:**

```jsx
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LandingScreen from '../LandingScreen.jsx'

// Stub requestAnimationFrame (matches existing test patterns)
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => cb())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const createDefaultProps = () => ({
  importUrl: '',
  onImportUrlChange: vi.fn(),
  importError: null,
  providerChip: null,
  isAnyImportBusy: false,
  showInitialSpinner: false,
  importInputRef: { current: null },
  onImport: vi.fn(),
  recentPlaylists: [],
  recentCardState: {},
  onSelectRecent: vi.fn(),
  refreshingRecentId: null,
  isRefreshingCachedData: false,
})

describe('LandingScreen', () => {
  it('renders import form with URL input', () => {
    render(<LandingScreen {...createDefaultProps()} />)
    expect(screen.getByRole('textbox', { name: /playlist url/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import playlist/i })).toBeInTheDocument()
  })

  it('shows error message with correct aria bindings on input and form', () => {
    const props = {
      ...createDefaultProps(),
      importError: { message: 'Invalid URL', type: 'error' },
    }
    render(<LandingScreen {...props} />)

    // Input should have aria-invalid and aria-describedby
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'import-error')

    // Form should also have aria-describedby (both elements reference the error)
    const form = input.closest('form')
    expect(form).toHaveAttribute('aria-describedby', 'import-error')

    expect(screen.getByText('Invalid URL')).toBeInTheDocument()
  })

  it('disables button when import is busy', () => {
    const props = {
      ...createDefaultProps(),
      isAnyImportBusy: true,
    }
    render(<LandingScreen {...props} />)
    expect(screen.getByRole('button', { name: /import playlist/i })).toBeDisabled()
  })

  it('does not render recent playlists section when list is empty', () => {
    render(<LandingScreen {...createDefaultProps()} />)
    expect(screen.queryByText('Previously imported')).not.toBeInTheDocument()
  })
})
```

**Note:** No providers (router, theme, etc.) are needed — both `ErrorMessage` and `RecentPlaylists` are simple presentational components without context dependencies.

---

## Phase 9: Optional Cleanup (Future Work)

These are **not required** for this PR — note as future improvements only:

- [ ] Consider extracting ImportForm as a sub-component
- [ ] Consider moving inline styles to CSS classes (landing screen uses significant inline styles — keep as-is for this extraction to avoid scope creep)
- [ ] Consider creating a `LandingScreen.css` file if styles grow

**Note:** This codebase does not use barrel exports (index.js files), so do not add one.

---

## Commit Message Template

```
refactor(app): extract LandingScreen into standalone component

Move the landing/import screen JSX from App.jsx into a dedicated
LandingScreen component under src/features/landing/

- Create LandingScreen.jsx with props for all import and recent state
- Update App.jsx to render LandingScreen when screen === 'landing'
- No functional changes; all existing behavior preserved

Part of ongoing App.jsx modularization effort.
```

---

## IMPORTANT: Do Not Commit

**Leave all changes uncommitted.** The user will manually review the changes before committing.

- [ ] Verify all changes are staged but NOT committed
- [ ] Provide a summary of files changed when complete
- [ ] Wait for user approval before any git commit

---

## Notes for Agent

1. **Do not** refactor other parts of App.jsx in this PR — scope creep is why previous attempts failed
2. **Do not** change the state management approach — just move JSX and wire up props
3. **Do not** rename existing handlers or state variables in App.jsx
4. **Do not** add TODO comments for "future improvements" — if something needs changing, note it in the PR description instead
5. **Test frequently** — run the app after each phase to catch issues early
6. **Verify against source** — always confirm assumptions by reading the actual code, not guessing

---

## Checklist Summary

```
[ ] Pre-work: Baseline tests pass, source reviewed
[ ] Phase 1: Dependencies verified against source code
[ ] Phase 2: Component file created with default export
[ ] Phase 3: Props interface defined (13 props)
[ ] Phase 4: JSX moved with a11y attributes preserved
[ ] Phase 5: onChange handler passed as prop
[ ] Phase 6: App.jsx updated, old JSX removed
[ ] Phase 7: Manual testing passed (happy path + edge cases + a11y)
[ ] Phase 8: Automated tests pass, smoke test added
[ ] Phase 9: Optional cleanup — skip for this PR
[ ] Changes staged but NOT committed (user will review first)
```