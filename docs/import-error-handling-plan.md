# Import Error Handling — Refined Plan

Compact plan to surface cancel/rate-limit states during imports without a full error-system refactor.

## Scope
- Cover initial import, reimport, and cached-recent load flows.
- Keep existing UI; only add a tiny error typing flag and announcements.
- No timers or countdown UI; static retry text only.

## Error Model
- Single state object: `importError = null | { message: string, type: 'cancel' | 'rateLimit' | 'error' }`.
- Use the type to style tone via the `ErrorMessage` component (className or data attribute):
  - `cancel` -> Neutral tone (e.g., `var(--muted)`).
  - `rateLimit` -> Warning tone (e.g., orange/yellow).
  - `error` (default) -> Critical/Red (existing behavior).
- Announce each message once when set.

## Messaging Rules
- **Abort/Cancel:** On `AbortError`, set `{ type: 'cancel', message: 'Import canceled.' }`, announce once, let existing loading flags drop so CTA re-enables.
- **Rate limit:** Reuse retry-after parsing; when present, set `{ type: 'rateLimit', message: 'Too many requests. Try again in N seconds.' }`, announce once. No per-second countdown or auto-clear timers.
- **Other errors:** Keep current behavior, but set type `'error'`.

## Touchpoints to Update
### 1. Components & Styles
- **`src/components/ErrorMessage.jsx`**: Update to spread `...rest` props to the underlying `div` (to support data/class hooks).
- **`src/styles/app.css`**: Add CSS selectors for `.error-message.cancel`, `.error-message.rateLimit`, and default `.error-message.error` (or data-attribute equivalents).

### 2. Logic (`usePlaylistImportController.js`)
- Add `importError` as `null | { message, type }`.
- **Initial Import:**
  - Catch `AbortError`: Set type `cancel`.
  - Catch Rate Limit (429): Set type `rateLimit`.
  - Catch Other: Set type `error`.
- **Reimport:** Same logic as Initial Import.
- **Recent Playlist Load (include for consistency):**
  - Update `handleSelectRecent` to pass error object (message + type) into `recentCardState`.
  - Update `RecentPlaylists.jsx` to accept `errorType` in `cardState` and pass it to `ErrorMessage`.

### 3. UI Integration (`App.jsx`)
- Pass `importError?.type` (e.g., as className or data attribute) and `importError?.message` to the landing page `ErrorMessage` component.

## Out of Scope (for now)
- No new components or global error system.
- No live countdown timers (avoid SR spam) and no auto-clear timers for rate-limit messages.
