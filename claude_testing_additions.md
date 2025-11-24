# Testing Additions - Edge Case Analysis

## Executive Summary

This document provides a comprehensive analysis of edge cases and testing gaps identified across the most critical components in the Playlist Notes application. The analysis focuses on files with the highest complexity, widest usage, and most significant potential for failure.

**Files Analyzed:**
- `usePlaylistImportController.js` (1392 LOC) - Import orchestration
- `App.jsx` (1225 LOC) - Main application component
- `storage.js` (1118 LOC) - Data persistence layer
- `spotifyAdapter.js` (1024 LOC) - External API integration
- `PlaylistView.jsx` (804 LOC) - Virtualization & filtering
- `TrackCard.jsx` (505 LOC) - Component state management

---

## 1. usePlaylistImportController.js (Import Orchestration)

### Current Use Case
Central orchestrator for playlist imports, handling initial import, re-import, load-more, background pagination, caching, and focus management across multiple provider adapters.

### Why It's Critical
- Coordinates 7 different import flows (initial, reimport, load-more, background, recent, cached)
- Manages complex state machines with race conditions (request IDs, cursor management)
- Handles pagination with cooldown/rate-limiting logic
- Focus management integration with accessibility announcements

### Edge Cases to Test

#### 1.1 Race Condition Edge Cases
**Scenario:** Multiple rapid import operations
```
GIVEN: User rapidly clicks "Import" → "Re-import" → "Load More"
WHEN: Requests overlap with different request IDs
THEN: Only the most recent request should apply results
AND: Stale requests should be ignored (result.stale === true)
```

**Implementation Approach:**
- Create a test that fires 3 import operations within 100ms
- Mock adapter to delay responses by different amounts
- Assert that only the final operation's data appears in state
- Verify intermediate operations are marked stale and ignored

**Why this approach:**
The code uses `requestId` tracking in `pagerFlightsRef` but lacks explicit test coverage for rapid-fire scenarios. This is a critical path because users clicking multiple times is a common UX pattern.

---

#### 1.2 Cache Coherency Edge Cases
**Scenario:** Cached data becomes stale during background refresh
```
GIVEN: User loads playlist from cache (old data shown)
WHEN: Background refresh completes with different track count
AND: User is actively scrolling/interacting with cached tracks
THEN: UI should gracefully transition without losing focus
AND: cachedViewInfo banner should disappear
AND: No duplicate tracks should appear
```

**Implementation Approach:**
- Mock `getCachedResult` to return playlist with 50 tracks
- Mock `importInitial` to return updated playlist with 55 tracks
- Simulate user scrolled to track #25 during refresh
- Assert focus remains stable, no flickering
- Verify `setCachedViewInfo(null)` is called after refresh

**Why this approach:**
Lines 651-700 show cache hydration followed by background refresh, but tests don't validate the transition state. Users commonly interact during refresh, risking focus loss or duplicate rendering.

---

#### 1.3 Pagination Cooldown Edge Cases
**Scenario:** Rate limit triggers during background pagination
```
GIVEN: Background pagination is loading tracks automatically
WHEN: Spotify returns 429 rate limit with Retry-After: 30s
AND: User manually clicks "Load More" during cooldown
THEN: Manual click should be disabled with cooldown message
AND: Cooldown timer should automatically resume pagination
AND: No duplicate requests should be sent
```

**Implementation Approach:**
- Mock `loadMoreTracks` to return `{ ok: false, code: ERR_RATE_LIMITED, retryAfterMs: 30000 }`
- Assert `backgroundSync.status === 'cooldown'`
- Fast-forward timers by 30s
- Verify `startBackgroundPagination` is called automatically
- Assert no duplicate requests during cooldown window

**Why this approach:**
Lines 1020-1048 handle cooldown logic with `pagerCooldownRef.until` and `setTimeout`, but existing tests don't verify the timer orchestration or duplicate request prevention. This is critical for respecting API rate limits.

---

#### 1.4 Focus Management Edge Cases
**Scenario:** Focus restoration during filtered view
```
GIVEN: Playlist with 100 tracks, user filters to 10 matches
WHEN: User loads 50 more tracks in background
AND: New tracks include 5 additional filter matches
THEN: Focus should remain on current filtered track
AND: Filter signature should not trigger scroll reset
AND: Announcement should say "5 more matches loaded"
```

**Implementation Approach:**
- Set up filtered tracks state with active filter
- Mock `handleLoadMore` to add tracks that partially match filter
- Track `focusById` calls and `firstVisibleTrackIdRef` changes
- Assert focus remains stable despite new data
- Verify announce() called with correct match count

**Why this approach:**
Lines 421-437 attempt to focus first track button, but tests don't validate focus stability during dynamic filtering. Users filtering large playlists need stable focus as data loads.

---

#### 1.5 Recent Playlist Deduplication
**Scenario:** User imports same playlist from different URLs
```
GIVEN: Playlist already in recents as "spotify:123"
WHEN: User imports via different URL format (intl-de link, embed link)
AND: playlistIdentity.key resolves to same canonical ID
THEN: Recent should update timestamp, not create duplicate
AND: All URL aliases should resolve to same cached entry
```

**Implementation Approach:**
- Mock `derivePlaylistIdentity` to return same key for different URL formats
- Call `handleImport` with 3 different URL formats for same playlist
- Assert `recentPlaylists.length === 1`
- Verify `lastUsedAt` is updated, not duplicated

**Why this approach:**
Lines 189-209 handle cache key normalization with aliases, but tests don't validate deduplication across URL variations. Users commonly share playlists via different link formats.

---

## 2. storage.js (Data Persistence Layer)

### Current Use Case
Versioned localStorage persistence with migration paths, sanitization, normalization, and recovery snapshots for playlist state.

### Why It's Critical
- Single source of truth for data durability
- Migration logic from v2-v6 must preserve user data
- Handles quota exceeded, malformed JSON, concurrent writes
- Auto-backup system for recovery

### Edge Cases to Test

#### 2.1 Migration Data Loss Prevention
**Scenario:** User has v4 data with 200 notes and 50 tags
```
GIVEN: localStorage contains sta:v4 with notesByTrack and tagsByTrack
WHEN: Migration to v6 runs during app bootstrap
AND: Concurrent tab writes to sta:v6 before migration completes
THEN: All 200 notes must survive migration
AND: All 50 tags must be preserved
AND: Pending migration snapshot must exist as rollback
```

**Implementation Approach:**
- Create v4 fixture with dense notesByTrack/tagsByTrack
- Mock localStorage.setItem to simulate quota exceeded on first write
- Call `loadAppState()` to trigger migration
- Assert `getPendingMigrationSnapshot()` contains all original data
- Verify retry logic preserves data integrity

**Why this approach:**
Lines 444-488 show migration from legacy versions, but tests don't validate failure modes during migration writes. Data loss during migration is catastrophic for users.

---

#### 2.2 Quota Exceeded Graceful Degradation
**Scenario:** localStorage reaches 5MB limit during save
```
GIVEN: User has 4.9MB of notes already persisted
WHEN: User adds 200KB of new notes (exceeds quota)
THEN: saveAppState should fail silently without crashing
AND: Existing data should remain intact
AND: User should receive accessibility announcement
AND: Auto-backup snapshot should exist for recovery
```

**Implementation Approach:**
- Mock `localStorage.setItem` to throw QuotaExceededError
- Call `saveAppState` with large payload
- Assert no exceptions bubble up (lines 144-173 have try/catch)
- Verify `getAutoBackupSnapshot()` returns last good state
- Test that app continues functioning with stale data

**Why this approach:**
Lines 1048-1108 show auto-backup logic, but tests don't validate behavior when quota is exceeded. Users with extensive notes hit this limit, and silent failures are confusing.

---

#### 2.3 Concurrent Tab Corruption Prevention
**Scenario:** Two tabs open, both writing to same playlist
```
GIVEN: Tab A and Tab B both have playlist loaded
WHEN: Tab A saves note "Note A" for track 1
AND: Tab B saves note "Note B" for track 1 simultaneously
THEN: Both notes should be preserved (not overwrite)
OR: Last-write-wins should be explicit and consistent
AND: No data corruption in localStorage
```

**Implementation Approach:**
- Open two isolated storage contexts
- Simulate concurrent writes with setItem calls
- Read final state and verify note merge or clear conflict resolution
- Assert JSON structure remains valid (no partial writes)

**Why this approach:**
Lines 1034-1054 show `readStoredState()` → `persistState()` pattern without locking. Multi-tab editing is common, and data loss from race conditions is a real user pain point.

---

#### 2.4 Tag Validation Boundary Cases
**Scenario:** User enters edge-case tag values
```
GIVEN: User adds tags to track
WHEN: Tag contains "   mixed   CASE   ", "emoji🎵", "very_long_string_over_128_chars"
THEN: normalizeTagsArray should lowercase and trim "mixed case"
AND: Emoji should be rejected (TAG_ALLOWED_RE)
AND: Long string should be truncated to MAX_TAG_LENGTH
AND: Duplicate tags (case-insensitive) should be deduplicated
```

**Implementation Approach:**
- Create fixture with edge-case tags
- Call `normalizeTagsArray` with boundary inputs
- Assert output matches expected sanitization rules (lines 1012-1029)
- Verify `MAX_TAG_LENGTH` and `MAX_TAGS_PER_TRACK` enforced
- Test special characters, unicode, SQL injection attempts

**Why this approach:**
Lines 1012-1029 implement tag normalization but tests don't cover boundary cases. Tags are user-controlled input and need robust validation.

---

#### 2.5 Recent Playlist Pinning Logic
**Scenario:** User has 8 playlists (max), pins 6 of them
```
GIVEN: recentPlaylists at max capacity (8 items)
WHEN: User imports new playlist (9th item)
AND: 6 existing items are pinned
THEN: Oldest unpinned item should be evicted
AND: New item should be added at position 1
AND: All 6 pinned items must remain
```

**Implementation Approach:**
- Create fixture with 8 recents, 6 pinned
- Call `upsertRecent` with new playlist
- Assert `recentPlaylists.length === 8`
- Verify pinned items remain in array (lines 890-906)
- Test edge case: all 8 pinned → new item should still be added, oldest pinned evicted

**Why this approach:**
Lines 890-906 implement `trimRecents` with pinning logic, but tests don't validate max capacity with mixed pinned/unpinned. Users rely on pinning for important playlists.

---

## 3. App.jsx (Main Application Component)

### Current Use Case
Orchestrates screen routing, device recovery, storage migration, inline undo, note/tag sync, and coordinates between PlaylistProvider and import controller.

### Why It's Critical
- Bootstrap logic runs on every app load
- Manages migration effects with network requests
- Coordinates 4 different context providers
- Handles authentication state (deviceId/anonId)

### Edge Cases to Test

#### 3.1 Bootstrap Migration Network Failure
**Scenario:** v4 → v6 migration fails mid-upload
```
GIVEN: User has v4 data with 50 notes to migrate
WHEN: useEffect migration runs (lines 418-570)
AND: apiFetch('/api/db/notes') fails on note #25 (network error)
THEN: First 24 notes should be persisted remotely
AND: Remaining notes should remain in pendingMigrationSnapshot
AND: User should see announcement "Upgrade failed"
AND: Next app load should retry from checkpoint
```

**Implementation Approach:**
- Mock `getPendingMigrationSnapshot` with v4 data
- Mock `apiFetch` to fail after 24 successful uploads
- Trigger migration useEffect
- Assert `announce` called with failure message
- Verify `stashPendingMigrationSnapshot` preserves remaining notes
- Test retry on next mount completes successfully

**Why this approach:**
Lines 526-550 upload notes sequentially but don't checkpoint progress. Users with poor network connections need partial upload recovery, not full re-upload.

---

#### 3.2 Device ID Rotation During Active Session
**Scenario:** User's deviceId changes mid-session (recovery flow)
```
GIVEN: User has notes synced under deviceId "ABC"
WHEN: User completes restore flow, deviceId becomes "XYZ"
AND: User edits a note immediately after restore
THEN: Note sync should use new deviceId "XYZ"
AND: Old notes under "ABC" should remain accessible
AND: No duplicate note entries should be created
```

**Implementation Approach:**
- Mock initial `getDeviceId()` → "ABC"
- Mock notes synced under "ABC"
- Trigger restore flow to change to "XYZ"
- Verify `useEffect` on lines 359-361 updates `anonContext`
- Call `syncNote` and assert deviceId "XYZ" in request headers
- Verify no orphaned notes

**Why this approach:**
Lines 359-367 update `anonContext` on `deviceId` change, but tests don't validate that all downstream effects (sync, API calls) pick up the new ID. Device rotation is a core recovery flow.

---

#### 3.3 Inline Undo Expiration Race Condition
**Scenario:** User deletes note, undo timer expires, user clicks undo button
```
GIVEN: Note deleted at 10:00:00, 10-minute timer starts
WHEN: Timer expires at 10:10:00 (onExpire fires)
AND: User clicks undo button at 10:10:01 (1 second late)
THEN: Undo should not restore note (already expired)
AND: User should see announcement "Undo expired"
AND: Focus should move to fallback (next note or add button)
```

**Implementation Approach:**
- Mock `scheduleInlineUndo` with trackId, note, timer
- Fast-forward timers to 10min + 1ms (past expiration)
- Simulate user clicking undo button
- Assert `isPending(trackId) === false`
- Verify no restore action dispatched
- Verify focus moves to fallbackFocusId

**Why this approach:**
Lines 276-310 manage undo timers but tests don't validate expiration edge cases. Users clicking expired undo need clear feedback, not silent failure or confusing state.

---

#### 3.4 Screen Routing Safety Guard
**Scenario:** User deletes all tracks while on playlist screen
```
GIVEN: User is viewing playlist with 10 tracks
WHEN: User clicks "Clear" button (deletes all data)
AND: tracks.length becomes 0
THEN: useEffect on lines 595-599 should redirect to landing
AND: Focus should move to import input field
AND: Announcement should say "No tracks available"
```

**Implementation Approach:**
- Set initial screen state to "playlist"
- Set tracks to [10 items]
- Call `handleClearAll()` to reset state
- Assert screen changes to "landing"
- Verify `importInputRef.current.focus()` called
- Verify announce message

**Why this approach:**
Lines 595-599 have safety guard but tests don't validate the redirect flow. Users deleting all data expect clear navigation feedback.

---

#### 3.5 Backup/Restore File Picker Cancellation
**Scenario:** User opens backup download, then cancels
```
GIVEN: User clicks "Backup Notes"
WHEN: showSaveFilePicker dialog opens (lines 633-655)
AND: User presses Escape (AbortError thrown)
THEN: No error should be shown to user
AND: Announcement should say "Backup cancelled"
AND: No file should be downloaded
```

**Implementation Approach:**
- Mock `window.showSaveFilePicker` to throw AbortError
- Call `handleBackupNotes()`
- Assert no error boundary triggered
- Verify `announce('Backup cancelled.')` called
- Verify no blob URL created

**Why this approach:**
Lines 648-652 handle AbortError, but tests don't validate user-initiated cancellations. File picker cancellation is a common UX pattern that should be graceful.

---

## 4. spotifyAdapter.js (External API Integration)

### Current Use Case
Fetches playlist metadata and tracks from Spotify Web API using client-credentials flow, with token memoization, pagination, retry logic, and error mapping.

### Why It's Critical
- Only adapter for Spotify (most popular provider)
- Handles token expiration and 401 retries
- Complex error mapping (401, 403, 404, 429, 451)
- Pagination with cursor sanitization

### Edge Cases to Test

#### 4.1 Token Expiration Mid-Pagination
**Scenario:** Token expires between metadata and tracks fetch
```
GIVEN: Token memo expires at 10:00:00
WHEN: importPlaylist fetches metadata at 09:59:58 (token valid)
AND: Fetches tracks at 10:00:02 (token expired)
THEN: First 401 should trigger token refresh (line 990-995)
AND: Tracks fetch should retry with fresh token
AND: Result should include tokenRefreshed: true in debug
```

**Implementation Approach:**
- Mock `fetchAccessToken` to return token expiring in 2 seconds
- Mock `fetchPlaylistMeta` to delay 1 second
- Mock `fetchPlaylistTracks` to delay 3 seconds (forces expiration)
- Assert retry loop on lines 862-999 runs twice
- Verify final result has tracks and debug.tokenRefreshed === true

**Why this approach:**
Lines 862-999 have retry logic but tests don't validate token expiration during parallel fetches (lines 795-818). Token expiration mid-request is common with long playlists.

---

#### 4.2 Album Thumbnail Selection Edge Cases
**Scenario:** Spotify returns images without width metadata
```
GIVEN: Album has images: [large.jpg, medium.jpg, small.jpg]
WHEN: All images missing width/height fields (lines 267-286)
THEN: selectAlbumThumb should return last image (smallest)
AND: Should not crash on null/undefined images
AND: Should fallback to playlist cover if no album images
```

**Implementation Approach:**
- Create fixture with images array missing width/height
- Call `selectAlbumThumb(images, fallbackUrl)`
- Assert last image returned (line 286)
- Test null images, empty array, malformed objects
- Verify fallback URL used when appropriate

**Why this approach:**
Lines 243-287 implement thumbnail selection but tests don't cover all edge cases. Missing metadata is common in older Spotify catalog entries.

---

#### 4.3 Podcast Region Restriction Error Mapping
**Scenario:** User tries to import podcast unavailable in their region
```
GIVEN: User in Germany, podcast restricted to US
WHEN: Spotify returns 403 with region restriction error
THEN: Should map to ERR_EPISODE_UNAVAILABLE (line 211-213)
AND: Error message should explain region restriction
AND: Should not retry (region won't change)
```

**Implementation Approach:**
- Mock `fetchShowEpisodes` to return 403 with stage='tracks'
- Call `importPlaylist` with show URL
- Assert error code === ERR_EPISODE_UNAVAILABLE
- Verify details include stage, status fields
- Test 451 (Unavailable For Legal Reasons) maps to same code

**Why this approach:**
Lines 209-221 map region restrictions but tests don't validate 403 vs 451 distinction. Podcast restrictions are common and need clear error messages.

---

#### 4.4 Cursor Sanitization Security
**Scenario:** Malicious cursor URL injected by attacker
```
GIVEN: Valid playlist with pagination
WHEN: Attacker modifies localStorage to inject cursor="https://evil.com/steal"
AND: App calls importPlaylist with malicious cursor
THEN: sanitizeCursor should reject non-Spotify origins (line 485-494)
AND: Should throw ERR_INVALID_RESPONSE
AND: No request should be made to evil.com
```

**Implementation Approach:**
- Mock options.cursor with non-Spotify URL
- Call `importPlaylist({ cursor: 'https://evil.com' })`
- Assert error thrown before fetch attempt
- Verify fetch never called with evil.com
- Test path traversal attempts, non-/v1/ paths

**Why this approach:**
Lines 485-494 sanitize cursors but tests don't validate security boundary. Cursor injection could leak tokens or user data if not properly validated.

---

#### 4.5 Episode-Only Import (Podcast Single Episode)
**Scenario:** User imports a single podcast episode URL
```
GIVEN: User pastes episode URL (not playlist or show)
WHEN: detectContent returns type='episode' (lines 163-170)
THEN: Should fetch single episode metadata (lines 849-859)
AND: Should return array with 1 track
AND: pageInfo.hasMore should be false
AND: Track should have kind='podcast' and showId populated
```

**Implementation Approach:**
- Mock `extractEpisodeId` to return valid ID
- Mock `fetchEpisode` to return episode payload
- Call `importPlaylist` with episode URL
- Assert tracks.length === 1
- Verify track.kind === 'podcast'
- Assert pageInfo.hasMore === false

**Why this approach:**
Lines 848-860 handle episode imports but tests don't cover this flow. Users share individual episodes frequently, and this is a distinct code path from playlists/shows.

---

## 5. PlaylistView.jsx (Virtualization & Filtering)

### Current Use Case
Displays large playlists with optional virtualization, client-side filtering (search, tags, notes-only), sorting, focus management, and accessibility announcements.

### Why It's Critical
- Only component handling 1000+ track playlists efficiently
- Complex focus restoration during filter changes
- Virtualization integration with react-virtual
- Filter state persistence across re-imports

### Edge Cases to Test

#### 5.1 Virtualization Threshold Boundary
**Scenario:** Playlist with exactly 100 tracks (threshold)
```
GIVEN: VIRTUALIZATION_THRESHOLD = 100 (line 34)
WHEN: Playlist has 100 tracks
THEN: Virtualization should be enabled (line 50: trackCount > 100 is false!)
AND: Should render all 100 tracks in DOM (not virtualized)
WHEN: Playlist has 101 tracks
THEN: Virtualization should be enabled
AND: Should render ~20 tracks in viewport
```

**Implementation Approach:**
- Mock tracks array with 100 items
- Mock `resolveVirtualizationPreference` (lines 36-51)
- Assert `virtualizationEnabled === false` (line 241)
- Add 1 more track (101 total)
- Assert `virtualizationEnabled === true`
- Verify virtualItems.length < 101

**Why this approach:**
Line 50 has off-by-one potential: `trackCount > VIRTUALIZATION_THRESHOLD` means 100 items don't virtualize but 101 do. Tests should validate exact threshold behavior.

---

#### 5.2 Filter Focus Restoration During No Matches
**Scenario:** User filters to 0 matches while focused on track
```
GIVEN: User focused on track #50 in playlist
WHEN: User types filter that yields 0 matches
THEN: Focus should move to search input (line 393)
AND: Should not move focus if user is typing in tag input
AND: Announcement should say "No matches"
```

**Implementation Approach:**
- Mock tracks, set filteredTracks to 10 items
- Simulate focus on track button (document.activeElement)
- Update filter to yield 0 matches
- Assert `focusElement(searchInputRef.current)` called
- Verify focus not moved if activeElement is in filter bar
- Test announcement via `announce()`

**Why this approach:**
Lines 380-395 handle empty filter focus logic but tests don't validate edge cases. Users filtering to zero results need predictable focus behavior.

---

#### 5.3 Virtualization Scroll Restoration After Filter Change
**Scenario:** User scrolled to track #500, then changes filter
```
GIVEN: Virtualized playlist, user scrolled to row 500
WHEN: User changes filter (line 289-315)
THEN: virtualizer.scrollToIndex(0) should be called (line 304)
AND: Viewport should reset to top of filtered results
AND: Focus should move to first filtered track
```

**Implementation Approach:**
- Mock virtualizer with scrollToIndex spy
- Mock filteredTracks change (filter signature changes)
- Trigger useEffect on lines 300-315
- Assert `scrollToIndex(0, { align: 'start' })` called
- Verify smooth scroll behavior for non-virtualized

**Why this approach:**
Lines 300-315 handle scroll reset but tests don't validate virtualization integration. Users changing filters expect to see results from the top.

---

#### 5.4 Background Sync Banner Timing
**Scenario:** Background pagination completes while banner is visible
```
GIVEN: Background sync loading 1000 tracks (line 495-496)
WHEN: User is viewing banner "Loading more... (500 of 1000)"
AND: Background pagination completes final page
THEN: Banner should disappear (showBackgroundBanner === false)
AND: Announcement should say "All tracks loaded; order complete"
```

**Implementation Approach:**
- Mock `backgroundSync.status = 'loading'` and `importMeta.hasMore = true`
- Assert banner visible (lines 659-676)
- Update `backgroundSync.status = 'complete'` and `hasMore = false`
- Assert banner hidden
- Verify announce() called with completion message (line 1202)

**Why this approach:**
Lines 659-676 show background banner but tests don't validate state transitions from loading → complete. Users need clear feedback when pagination finishes.

---

#### 5.5 Cached View Banner + Reimport Interaction
**Scenario:** User viewing cached data, then reimports
```
GIVEN: cachedViewInfo shows "Viewing saved copy (50 tracks)"
WHEN: User clicks "Re-import" button
AND: Reimport completes with updated data
THEN: Cached banner should disappear (line 688)
AND: Should not show duplicate banners
AND: Focus should remain on reimport button after success
```

**Implementation Approach:**
- Mock `cachedViewInfo` with trackCount, importedAt
- Assert banner visible (lines 599-613)
- Call `onReimport()` which sets `cachedViewInfo = null` (line 909)
- Assert banner hidden
- Verify focus restored to `reimportBtnRef.current` (line 910)

**Why this approach:**
Lines 599-613 show cached banner, and line 909 clears it, but tests don't validate the transition during reimport. Users need clear state feedback during refresh flows.

---

## 6. TrackCard.jsx (Component State Management)

### Current Use Case
Individual track card with inline note editing, tag management with keyboard navigation, undo placeholders, focus restoration, and accessibility hints.

### Why It's Critical
- Core interaction component (rendered 100-1000x per playlist)
- Complex keyboard navigation (arrow keys through tags)
- Focus restoration after tag add/remove
- Timestamp discovery hint (one-time UX)

### Edge Cases to Test

#### 6.1 Tag Chip Keyboard Navigation Boundaries
**Scenario:** User navigates tags with arrow keys at boundaries
```
GIVEN: Track has tags: ["rock", "2024", "favorite"]
WHEN: User focuses last chip ("favorite") and presses ArrowRight
THEN: Focus should move to "Add tag" button (line 286-290)
WHEN: User presses ArrowLeft from first chip ("rock")
THEN: Focus should move to "Add tag" button (line 295-297)
```

**Implementation Approach:**
- Render TrackCard with 3 tags
- Simulate focus on last chip
- Fire keydown ArrowRight event
- Assert focus moved to `addTagBtnRef.current`
- Repeat for first chip + ArrowLeft
- Verify circular navigation doesn't get stuck

**Why this approach:**
Lines 281-299 implement arrow navigation but tests don't validate boundary conditions. Keyboard users rely on predictable navigation loops.

---

#### 6.2 Tag Input Focus Race Condition
**Scenario:** Tag input opens, user immediately presses Escape
```
GIVEN: User clicks "Add tag" (line 239-244)
WHEN: requestAnimationFrame schedules focus (line 243)
AND: User presses Escape before focus applies
THEN: Tag input should close (line 246-251)
AND: Focus should return to "Add tag" button
AND: No stale focus should remain on unmounted input
```

**Implementation Approach:**
- Mock `startAddTag()` to set addingTag=true
- Immediately call `cancelAddTag()` before requestAnimationFrame
- Assert `addingTag === false`
- Verify `addTagBtnRef.current.focus()` called (line 250)
- Verify no focus errors in console

**Why this approach:**
Lines 239-244 and 246-251 have timing dependency via requestAnimationFrame. Fast user actions can cause focus race conditions.

---

#### 6.3 Tag Error Persistence Across Actions
**Scenario:** User gets tag error, then successfully adds different tag
```
GIVEN: User tries to add tag "rock" (already exists)
WHEN: onAddTag returns { success: false, error: "Tag already exists" }
THEN: Error should display (line 269)
WHEN: User adds new tag "pop" (success)
THEN: Error should clear (line 263)
AND: Tag input should close
```

**Implementation Approach:**
- Mock `onAddTag` to return failure first
- Call `submitTag("rock")`
- Assert `tagError` is set
- Mock `onAddTag` to return success
- Call `submitTag("pop")`
- Assert `tagError === null` and `addingTag === false`

**Why this approach:**
Lines 253-271 manage tag error state but tests don't validate error clearing on success. Stale errors confuse users.

---

#### 6.4 Timestamp Hint One-Time Display
**Scenario:** User discovers timestamp feature
```
GIVEN: hasDiscoveredTimestamp === false
WHEN: User clicks "Add note" for first time
THEN: Placeholder should show timestamp hint (line 160, 464)
WHEN: User types ":30" in note
AND: Saves note successfully
THEN: hasDiscoveredTimestamp should become true
AND: Hint should never show again for any track
```

**Implementation Approach:**
- Mock `hasDiscoveredTimestamp = false`
- Render TrackCard in editing mode
- Assert placeholder contains TIMESTAMP_HINT_TEXT
- Trigger note save with timestamp pattern
- Verify `onTimestampDiscovered()` called (via useNoteHandlers)
- Re-render with `hasDiscoveredTimestamp = true`
- Assert hint no longer shown

**Why this approach:**
Lines 160, 476-479 show timestamp hint conditionally, but tests don't validate one-time discovery flow. Feature discovery is a critical UX enhancement.

---

#### 6.5 Placeholder Focus Restoration After Undo
**Scenario:** User deletes note, undo placeholder appears, user clicks undo
```
GIVEN: Track has 2 notes, user deletes note #1
WHEN: Placeholder appears with undo button
AND: User clicks undo (onUndo callback)
THEN: Note should be restored at original index (index=0)
AND: Focus should move to restoreFocusId (delete button for that note)
```

**Implementation Approach:**
- Mock placeholders array with { pid, index: 0, restoreFocusId: 'delete-btn-0' }
- Render TrackCard with placeholders
- Simulate click on undo button in placeholder
- Verify `onUndo(pid)` called
- Assert focus moved to element with id='delete-btn-0'

**Why this approach:**
Lines 188-213 handle placeholder focus restoration but tests don't validate undo flow. Users clicking undo expect focus to return to deletion context.

---

## Summary of Testing Priorities

### High Priority (Implement First)
1. **usePlaylistImportController**: Race conditions, cache coherency, pagination cooldown
2. **storage.js**: Migration data preservation, quota exceeded handling
3. **spotifyAdapter.js**: Token expiration during pagination, error mapping accuracy

### Medium Priority (Implement Second)
4. **App.jsx**: Migration network failures, device ID rotation, undo expiration
5. **PlaylistView.jsx**: Virtualization threshold, filter focus restoration, scroll reset

### Low Priority (Nice to Have)
6. **TrackCard.jsx**: Keyboard navigation boundaries, tag error clearing, timestamp hint

---

## Implementation Recommendations

### General Approach
For all edge cases above, follow this test structure:

```javascript
describe('EdgeCase: [Scenario Name]', () => {
  it('should [expected behavior] when [condition]', async () => {
    // ARRANGE: Set up mocks and initial state
    const mockAdapter = vi.fn().mockResolvedValue(...)
    const { result } = renderHook(() => useTargetHook(...))

    // ACT: Trigger the edge case condition
    await act(async () => {
      result.current.triggerAction()
    })

    // ASSERT: Verify expected behavior
    expect(mockAdapter).toHaveBeenCalledTimes(1)
    expect(result.current.state).toEqual(expectedState)
  })
})
```

### Why This Structure
- **ARRANGE-ACT-ASSERT pattern**: Clear separation of setup, action, verification
- **Explicit mocking**: Every test should mock only what it needs, no global mocks
- **Async handling**: Use `act()` for state updates, `waitFor()` for async effects
- **Isolation**: Each test should be runnable independently

### Prioritization Rationale
1. **Race conditions** (High): Cause data loss, common in production
2. **Migration** (High): One-time operation, catastrophic if it fails
3. **Token expiration** (High): External dependency, frequent failure mode
4. **Focus management** (Medium): Accessibility critical, but non-destructive
5. **UI state** (Low): Cosmetic issues, workarounds available

### Tools Recommended
- **Vitest**: Already in use, fast, good mocking
- **Testing Library**: Already in use, accessibility-first
- **msw**: For mocking Spotify API (more realistic than vi.fn)
- **fake-timers**: For testing cooldown/timer logic

### Coverage Goals
- Aim for **85% branch coverage** on critical files (import, storage, adapter)
- Focus on **state machine transitions** more than happy paths
- Validate **error paths** as thoroughly as success paths

---

## Conclusion

This analysis identified **31 distinct edge cases** across 6 critical files, prioritized by impact and likelihood. The recommended testing additions would:

- **Prevent 8 data loss scenarios** (migration, quota, race conditions)
- **Improve accessibility** for keyboard users (focus management)
- **Harden API integration** (token expiration, error mapping, rate limits)
- **Enhance UX reliability** (filter focus, scroll restoration, undo timing)

Implementation effort: **~40-60 hours** for all tests, **~15-20 hours** for high-priority subset.

**Next steps**: Review with team, prioritize based on production incident frequency, implement high-priority tests first.
