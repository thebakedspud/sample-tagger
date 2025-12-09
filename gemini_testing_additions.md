# Comprehensive Testing Plan

This document outlines a unified and comprehensive testing strategy for the Playlist Notes application. It synthesizes previous analyses, incorporates new testing dimensions, and provides a clear, prioritized roadmap for implementation. The goal is to ensure application robustness, data integrity, accessibility, and performance.

---

## 1. Core State & Logic

This section focuses on the central state management brain of the application.

### 1.1. `playlistReducer.js` (Unit Tests)

**Conclusion:** The reducer is the single source of truth for state transitions. Testing it in isolation is fast, efficient, and ensures the core business logic is flawless before it's used in components.

**Implementation:** Write direct unit tests for the reducer function, dispatching mock actions and asserting the output state.

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Rapid-fire Actions** | **GIVEN** a state with a track<br>**WHEN** "ADD_NOTE" and "DELETE_NOTE" actions for that track are dispatched in rapid succession<br>**THEN** the final state should be consistent and not enter a corrupted state. |
| **Invalid Payloads** | **GIVEN** an existing playlist state<br>**WHEN** an action is dispatched with a `null` or malformed payload (e.g., `UPDATE_NOTE` with no `note` object)<br>**THEN** the reducer should return the original state and not throw an error. |
| **State Consistency** | **GIVEN** a track with one note<br>**WHEN** a user adds a tag, then edits the note, then undoes the note edit<br>**THEN** the tag should remain associated with the track. |
| **Boundary Conditions** | **GIVEN** a track with the maximum allowed number of tags<br>**WHEN** an "ADD_TAG" action is dispatched<br>**THEN** the state should remain unchanged and not exceed the maximum. |

---

## 2. Data Persistence & Storage (`storage.js`)

**Conclusion:** This layer is critical for data durability. Failures here can lead to catastrophic data loss for the user.

**Implementation:** Use Vitest to test the storage functions, mocking `localStorage` to simulate various scenarios, including throwing errors.

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Migration Data Loss** | **GIVEN** localStorage contains data in a legacy format (e.g., `v4`)<br>**WHEN** the app bootstraps and triggers the migration to `v6`<br>**THEN** all notes and tags must be preserved in the new structure without data loss. |
| **Quota Exceeded** | **GIVEN** localStorage is almost full (e.g., 4.9MB used)<br>**WHEN** `saveAppState` is called with a large payload that exceeds the quota<br>**THEN** the operation should fail gracefully without crashing the app, and the previous state should remain intact. |
| **Concurrent Tab Writes**| **GIVEN** Tab A and Tab B have the same playlist loaded<br>**WHEN** Tab A saves "Note A" and Tab B simultaneously saves "Note B" to the same track<br>**THEN** the final state in localStorage should not be corrupted (e.g., a "last-write-wins" strategy should be consistent). |
| **Tag Sanitization** | **GIVEN** a user tries to save a tag<br>**WHEN** the tag is ` "  mixed CASE   " `, contains emojis, or is excessively long<br>**THEN** the `normalizeTagsArray` function should correctly trim, lowercase, reject invalid characters, and truncate the tag before saving. |

---

## 3. External API Integration (`spotifyAdapter.js`)

**Conclusion:** The adapter is a major failure point, as it depends on an external network and API with its own failure modes (rate limits, auth expiration).

**Implementation:** Use a library like `msw` (Mock Service Worker) to intercept and mock API calls, simulating various success and error responses from the Spotify API.

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Token Expiration** | **GIVEN** an API token is valid but expires in 1 second<br>**WHEN** a multi-request operation (e.g., fetch metadata, then tracks) is initiated that takes longer than 1 second<br>**THEN** the adapter should automatically refresh the token upon the first 401 response and successfully complete the operation on retry. |
| **Rate Limiting** | **GIVEN** the Spotify API returns a `429 Too Many Requests` error with a `Retry-After` header<br>**WHEN** a background sync is in progress<br>**THEN** the adapter should respect the cooldown period and automatically resume fetching after the specified delay. |
| **Region Restriction** | **GIVEN** a user attempts to import a podcast that is unavailable in their region<br>**WHEN** the API returns a `403` or `451` error<br>**THEN** the error should be correctly mapped to a user-friendly message explaining the restriction. |
| **Cursor Sanitization** | **GIVEN** a pagination cursor in localStorage has been maliciously modified to `https://evil.com`<br>**WHEN** a "load more" operation is triggered with this cursor<br>**THEN** the adapter must validate the origin and reject the request, preventing any calls to the malicious domain. |

---

## 4. UI, Component Flows, and UX

**Conclusion:** This covers the complex user-facing flows where state, UI, and user actions intersect.

**Implementation:** Use `React Testing Library` to render components and simulate user interactions, key presses, and focus changes.

### 4.1. `usePlaylistImportController.js` (Import Orchestration)

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Request Race Condition**| **GIVEN** a user rapidly clicks "Import" and then "Re-import"<br>**WHEN** the two import requests overlap<br>**THEN** only the result of the most recent request ("Re-import") should be applied to the state, and the stale request should be ignored. |
| **Cache Coherency** | **GIVEN** a playlist is loaded from the cache<br>**WHEN** a background refresh completes with new data (e.g., more tracks)<br>**THEN** the UI should update gracefully without losing the user's scroll position or focus. |

### 4.2. `App.jsx` (Global Orchestration)

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Migration Network Failure** | **GIVEN** a v4 to v6 data migration is in progress<br>**WHEN** the network connection fails halfway through uploading notes to the backend<br>**THEN** the migration should be checkpointed, and the next app load should retry uploading only the remaining notes. |
| **Undo Timer Expiration** | **GIVEN** a user deletes a note, and an "Undo" placeholder is shown<br>**WHEN** the 10-minute undo timer expires, and the user then clicks the Undo button<br>**THEN** the undo action should fail, and the UI should clearly indicate that the action has expired. |

### 4.3. `PlaylistView.jsx` (Virtualization & Filtering)

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Virtualization Threshold** | **GIVEN** the virtualization threshold is 100 tracks<br>**WHEN** a playlist with exactly 100 tracks is loaded<br>**THEN** virtualization should NOT be enabled. When a 101st track is added, virtualization should activate. |
| **Filter Focus Restoration** | **GIVEN** a user has scrolled down the playlist and is focused on a track<br>**WHEN** they type a filter query that results in 0 matches<br>**THEN** the focus should gracefully move back to the filter input field. |

### 4.4. `TrackCard.jsx` (Component-Level Interaction)

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Tag Keyboard Navigation** | **GIVEN** a track card has three tags<br>**WHEN** the user focuses the last tag and presses the Right Arrow key<br>**THEN** the focus must move to the "Add tag" button, creating a predictable navigation loop. |
| **Tag Error Clearing** | **GIVEN** a user tries to add a duplicate tag and receives an error message<br>**WHEN** they then successfully add a valid, different tag<br>**THEN** the original error message must be cleared. |

---

## 5. Cross-Cutting Concerns

These areas span multiple components and are critical for a high-quality user experience.

### 5.1. Accessibility (A11y)

**Conclusion:** Ensures the application is usable by everyone, including those who rely on assistive technologies.

**Implementation:**
- Integrate `axe-core` with `React Testing Library` (`jest-axe`) to run automated checks for A11y violations in every test.
- Write specific tests for focus management and announcement logic.

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Automated A11y Scan** | **GIVEN** any component is rendered in a test<br>**WHEN** the test runs<br>**THEN** it must have no critical accessibility violations reported by `axe-core`. |
| **Announcement Queue** | **GIVEN** five actions that trigger announcements happen in quick succession<br>**WHEN** the `LiveRegion` component processes them<br>**THEN** it should read them out in the correct order without dropping any. |
| **Modal Focus Trap** | **GIVEN** the Recovery Modal is open<br>**WHEN** the user repeatedly presses the Tab key<br>**THEN** the focus must remain trapped within the modal and not escape to the underlying page. |

### 5.2. Performance

**Conclusion:** Ensures the application remains responsive and usable, especially with large amounts of data.

**Implementation:** Create dedicated performance tests that render components with large datasets and measure render times.

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Large Playlist Render** | **GIVEN** a playlist with 5,000 tracks<br>**WHEN** the `PlaylistView` component is rendered<br>**THEN** the initial render time and time to become interactive should be within an acceptable threshold (e.g., < 500ms). |
| **Filter Performance** | **GIVEN** a playlist with 5,000 tracks and a complex filter is applied<br>**WHEN** the user types a character in the filter input<br>**THEN** the UI should update in near-real-time without noticeable lag. |

### 5.3. Security

**Conclusion:** Protects the user and the application from malicious input and vulnerabilities.

**Implementation:** Write tests that explicitly attempt to inject malicious data.

| Scenario | GIVEN / WHEN / THEN |
| :--- | :--- |
| **Note XSS Injection** | **GIVEN** a user enters a note containing `<script>alert('XSS')</script>`<br>**WHEN** the note is saved and rendered<br>**THEN** the script content must be sanitized and rendered as plain text, not executed. |
| **Tag XSS Injection** | **GIVEN** a user enters a tag containing HTML attributes like `onmouseover="alert(1)"`<br>**WHEN** the tag is saved and rendered as a chip<br>**THEN** the malicious attribute must be stripped, preventing the script from executing. |

---

## Prioritization Roadmap

1.  **High Priority (Critical for Data Integrity & Security):**
    *   `storage.js`: Migration and Quota tests.
    *   `spotifyAdapter.js`: Token Expiration and Cursor Sanitization tests.
    *   `playlistReducer.js`: All unit tests.
    *   Security: All XSS injection tests.

2.  **Medium Priority (Core UX & Stability):**
    *   `usePlaylistImportController.js`: Race Condition and Cache tests.
    *   `App.jsx`: Migration network failure and Undo tests.
    *   Accessibility: Modal Focus Trap and Automated `axe` checks.

3.  **Low Priority (UX Refinements & Performance):**
    *   `PlaylistView.jsx` & `TrackCard.jsx`: All UI interaction tests.
    *   Performance: All profiling tests.
    *   Accessibility: Announcement queue tests.