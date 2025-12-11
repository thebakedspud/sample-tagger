# Recovery Code Sync Bug Analysis

## Issue Summary

**Reported:** December 11, 2025  
**Severity:** Critical (data loss)  
**Affected Flow:** Recovery code restore across devices, note backup/sync

### Symptoms
- User created ~10 notes across 3 songs on mobile device
- Used recovery code on desktop to sync notes
- Recovery code was accepted successfully
- Only ~1 note per track synced to desktop (instead of all notes)

### Expected Behavior
After entering a valid recovery code, ALL notes associated with that recovery code should be fetched from the server and displayed on the new device.

### Actual Behavior
Only the **last note saved per track** is recoverable. All previous notes for that track are lost if the original device is lost or localStorage is cleared.

---

## Root Cause Analysis

### Primary Bug: Server Only Stores One Note Per Track Per Device

**File:** `api/db/notes.js`

**This is a data model/architecture issue, not just a sync bug.**

```javascript
// Lines 217-226: Lookup finds ONE row per (anonId, deviceId, trackId)
const { data: existingRow } = await supabaseAdmin
  .from('notes')
  .select('id, body, tags')
  .eq('anon_id', anonContext.anonId)
  .eq('device_id', deviceId)
  .eq('track_id', trackId)
  .maybeSingle();  // ← Only ONE row can exist

// Lines 314-319: If row exists, it's OVERWRITTEN
const { data, error } = await supabaseAdmin
  .from('notes')
  .update(updatePayload)  // ← OVERWRITES body, timestamp, etc.
  .eq('id', existingRow.id)
```

**What this means:**
- The Supabase `notes` table has an implicit unique constraint on `(anon_id, device_id, track_id)`
- Every POST to `/api/db/notes` with a new note **overwrites** the previous note for that track
- On mobile, you saved 8 notes to Track A → only the 8th note exists in Supabase
- The first 7 notes were never backed up - they only exist in localStorage on the phone

**This is the actual data loss bug.** If you lose your phone or clear its storage, those 7 notes are gone forever.

### Why The Original Device Shows All Notes

On the **original device (phone)**:
- All 8 notes live in `localStorage` and in-memory `notesByTrack`
- When sync runs, remote only has 1 note (the last one)
- `mergeRemoteNotes` sees local already has notes → leaves them alone
- Result: You still see all 8 notes (from local storage)

On the **restored device (desktop)**:
- No local notes exist after restore
- Sync fetches from server → gets only 1 note per track (that's all that exists)
- `mergeRemoteNotes` populates those into state
- Result: Only 1 note per track visible

**The recovery code worked correctly.** The problem is the server never had more than 1 note per track to recover.

### Flow Diagram (Corrected)

```
Mobile Device                              Server (Supabase)
─────────────────                          ─────────────────
Create note 1 on Track A ───────POST────→  Row created: {body: "note 1"}
Create note 2 on Track A ───────POST────→  Row UPDATED: {body: "note 2"} ← note 1 LOST
Create note 3 on Track A ───────POST────→  Row UPDATED: {body: "note 3"} ← note 2 LOST
...
Create note 8 on Track A ───────POST────→  Row UPDATED: {body: "note 8"} ← notes 1-7 LOST
     │                                          │
     │                                          │ Server only has 1 row
     │                                          │ with body: "note 8"
     │                                          │
     │                                     Desktop Device
     │                                     ─────────────────
     │                                     Enter recovery code
     │                                          │
     │                                     GET /api/db/notes
     │                                     ← Returns: [{trackId: A, body: "note 8"}]
     │                                          │
     │                                     Only 1 note visible ✓
     │                                     (This is all that was ever backed up)
```

### Secondary Bugs (Still Worth Fixing)

These are real issues but they're **not the cause of the reported symptom**:

#### Secondary Bug A: `mergeRemoteNotes` Discards Remote When Local Exists

**File:** `src/utils/notesTagsData.js`

Once the primary bug is fixed and the server stores multiple notes per track, this merge logic would prevent proper union merging. Currently it's hidden because remote only ever has 1 note anyway.

#### Secondary Bug B: Sync Effect Missing `anonId` Dependency

**File:** `src/features/playlist/PlaylistProvider.jsx`

The sync effect should re-run when `anonId` changes (after restore). Currently only watches `deviceId`.

---

## Proposed Fix

### Part 1: Fix Server Note Model (PRIMARY - Required)

#### Target note row shape (example)

Each saved note should correspond to a distinct row, e.g.:

```sql
notes: {
  id           uuid,          -- unique per note
  anon_id      uuid,          -- recovered via device/recovery
  device_id    text,
  track_id     text,
  body         text,
  timestamp_ms bigint null,
  tags         text[] null,   -- or moved to a separate track_tags table
  created_at   timestamptz,
  updated_at   timestamptz
}


**File:** `api/db/notes.js`

The server must store **one row per note**, not one row per track per device.

#### Current Behavior (Broken)
```javascript
// Lookup by (anonId, deviceId, trackId) → at most 1 row
const { data: existingRow } = await supabaseAdmin
  .from('notes')
  .select('id, body, tags')
  .eq('anon_id', anonContext.anonId)
  .eq('device_id', deviceId)
  .eq('track_id', trackId)
  .maybeSingle();

// If exists → UPDATE (overwrite)
// If not → INSERT
```

#### Proposed Behavior
```javascript
// Always INSERT a new row for each note
// Generate unique note ID client-side or server-side
// Tags can be stored separately or on each note row

// For note creation:
const { data, error } = await supabaseAdmin
  .from('notes')
  .insert({
    id: noteId,  // unique per note, not per track
    anon_id: anonContext.anonId,
    device_id: deviceId,
    track_id: trackId,
    body: noteBody,
    timestamp_ms: normalizedTimestamp,
    // tags handled separately or included per-note
  })
  .select(...)
  .single();
```

#### Design Decisions Needed

1. **Note identity:** How to identify a specific note for updates/deletes?
   - Option A: Server-generated UUID per note (returned to client)
   - Option B: Client-generated ID (e.g., `crypto.randomUUID()`)
   - Option C: Composite key (trackId + timestamp + body hash)

2. **Tags storage:** Currently tags are stored on the single note row per track.
   - Option A: Move tags to a separate `track_tags` table
   - Option B: Store tags on every note row (denormalized)
   - Option C: Store tags on the "most recent" note row only

3. **Note updates:** How should editing an existing note work?
   - Need to pass note ID to identify which note to update
   - DELETE + INSERT vs UPDATE

4. **Migration:** What about existing data?
   - Existing rows have one note per track
   - May need migration script or gradual rollout

### Part 2: Fix `mergeRemoteNotes` Union Logic (IMPLEMENTED ✅)

**File:** `src/utils/notesTagsData.js`

Once the server returns multiple notes per track, the merge function needs to union them properly.

**Changes made:**

1. **Added `id` field to `NoteEntry` type** - Server-assigned UUID is now preserved
2. **Updated `normalizeNoteEntry`** - Preserves `id` field from server responses
3. **Updated `groupRemoteNotes`** - Passes `id` through when building note entries
4. **Implemented `getNoteSignature`** - Content-based deduplication using `body + createdAt + timestampMs`
5. **Rewrote `mergeRemoteNotes`** - Now performs union merge with deduplication

**Key implementation detail:** We use content-based signatures instead of ID-based deduplication because local notes don't have IDs until synced. The signature `body\0createdAt\0timestampMs` uniquely identifies a note's content.

**After (actual implementation):**
```javascript
function getNoteSignature(note) {
  const body = note.body || ''
  const createdAt = note.createdAt || 0
  const timestampMs = note.timestampMs ?? ''
  return `${body}\0${createdAt}\0${timestampMs}`
}

export function mergeRemoteNotes(localMap, remoteMap) {
  const merged = cloneNotesMap(localMap);
  Object.entries(remoteMap).forEach(([trackId, remoteNotes]) => {
    const cleanedRemote = normalizeNotesList(remoteNotes);
    if (cleanedRemote.length === 0) return;
    
    if (!hasOwn(merged, trackId) || merged[trackId].length === 0) {
      merged[trackId] = cleanedRemote;
    } else {
      const localNotes = merged[trackId];
      const seenSignatures = new Set(localNotes.map(getNoteSignature));
      const combined = [...localNotes];
      
      cleanedRemote.forEach((remoteNote) => {
        const sig = getNoteSignature(remoteNote);
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          combined.push(remoteNote);
        }
      });
      
      combined.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      merged[trackId] = combined;
    }
  });
  return merged;
}
```

### Part 3: Fix Sync Effect Dependencies (IMPLEMENTED ✅)

**File:** `src/features/playlist/PlaylistProvider.jsx`

Add `anonId` to effect dependencies so sync re-runs after restore.

```javascript
// Reset effect
useEffect(() => {
  initialSyncStatusRef.current = 'idle'
  syncAttemptedRef.current = false
}, [anonContext?.deviceId, anonContext?.anonId])  // Add anonId

// Sync effect (line 288)
}, [anonContext?.deviceId, anonContext?.anonId, initialState?.tracks, ...])  // Add anonId
```

### Part 2b: Remove `hasAnyLocalData` Guard (BLOCKER FIX)

**File:** `src/features/playlist/PlaylistProvider.jsx`

The sync effect had a guard that checked `initialState?.tracks` to skip sync when there were no local tracks. **Problem:** `initialState` is a prop frozen at mount time. After recovery restore, the user lands on a screen with no tracks, so this guard blocked sync entirely.

**Before (broken):**
```javascript
useEffect(() => {
  if (!anonContext?.deviceId || !anonContext?.anonId) return
  if (initialSyncStatusRef.current === 'complete') return
  if (syncAttemptedRef.current) return
  const hasAnyLocalData =
    Array.isArray(initialState?.tracks) && initialState.tracks.length > 0
  if (!hasAnyLocalData) {
    updateInitialSyncStatus({ status: 'complete', lastError: null })
    return  // ← Blocks sync after restore!
  }
  syncAttemptedRef.current = true
  // ...
```

**After (fixed):**
```javascript
useEffect(() => {
  if (!anonContext?.deviceId || !anonContext?.anonId) return
  if (initialSyncStatusRef.current === 'complete') return
  if (syncAttemptedRef.current) return
  // No hasAnyLocalData check - sync should run after restore even with no local tracks
  syncAttemptedRef.current = true
  // ...
```

**Rationale:** An extra API call when there's no data to merge is harmless. The `syncAnnotations` function in `usePlaylistImportController.js` handles syncing after import anyway, but removing this guard ensures the sync effect doesn't incorrectly mark itself "complete" before any data exists.

---

## Implementation Order

| Phase | Change | Priority | Risk | Status |
|-------|--------|----------|------|--------|
| **Phase 1** | Server append-only notes (INSERT not UPDATE) | Critical | Low | ✅ Committed |
| **Phase 2a** | Sync effect anonId dependencies | Medium | Low | ✅ Committed |
| **Phase 2b** | Remove hasAnyLocalData guard | Critical | Low | ✅ Committed |
| **Phase 3** | Update `mergeRemoteNotes` for union | High | Low | ✅ Uncommitted |
| **Phase 3b** | Update `mergeRemoteTags` for union | Medium | Low | ✅ Uncommitted |
| **Phase 3c** | Fix `groupRemoteNotes` to union tags from multiple rows | Medium | Low | ✅ Uncommitted |
| **Phase 4** | Client-side note ID for updates/deletes | Medium | Medium | ⬜ Pending |
| **Phase 5** | Migration for existing data | High | Medium | ⬜ Pending |

**Note:** Phases 4-5 are note-specific. Tags sync is complete with Phase 3b+3c.

**Note:** Phase 2b was a blocker discovered during testing - without it, the sync effect would skip sync entirely after restore.

---

## Testing Plan

### Manual Test Cases (After Fix)

1. **Multi-note sync:**
   - Create 5 notes on Track A on Device 1
   - Verify all 5 are stored server-side (check Supabase directly)
   - Enter recovery code on Device 2
   - Verify all 5 notes appear on Device 2

2. **Cross-device note creation:**
   - Create 3 notes on Device 1
   - Create 2 different notes on Device 2 (same track)
   - Sync both devices
   - Verify both devices show all 5 notes (union merge)

3. **Note deletion:**
   - Verify deleting a note removes only that note, not all notes for the track

### Automated Tests

```javascript
// api/db/__tests__/notes.test.js
describe('POST /api/db/notes', () => {
  it('creates separate rows for multiple notes on same track', async () => {
    await handler(createNoteRequest({ trackId: 'track-1', body: 'note 1' }), res);
    await handler(createNoteRequest({ trackId: 'track-1', body: 'note 2' }), res);
    
    // Verify 2 rows exist in database
    const { data } = await supabase.from('notes').select('*').eq('track_id', 'track-1');
    expect(data).toHaveLength(2);
  });
});
```

---

## Impact Assessment

### Risk: High
- Server-side data model change is a breaking change
- Existing clients expect single-note-per-track behavior
- Migration needed for existing data
- Tags storage needs redesign

### Scope

| File | Changes |
|------|---------|
| `api/db/notes.js` | Major refactor - insert-only for notes |
| `src/utils/notesTagsData.js` | Update merge logic |
| `src/features/playlist/PlaylistProvider.jsx` | Add anonId dependencies |
| Client-side note handlers | Add note ID generation/tracking |
| Database schema | May need new tables or constraints |

---

## Why This Is Not Scope Creep

The recovery code feature **promises** users their notes are backed up and recoverable. The current implementation:
- Only backs up the last note per track
- Silently discards all previous notes
- Creates false confidence that data is safe

This is a **data loss bug** in a feature marketed as a backup solution. Fixing it is essential to the feature's core promise.

---

## Related Files

| File | Role |
|------|------|
| `api/db/notes.js` | Server endpoint - **PRIMARY BUG LOCATION** |
| `src/utils/notesTagsData.js` | Client-side merge logic |
| `src/features/playlist/PlaylistProvider.jsx` | Sync effect |
| `src/features/notes/useNoteHandlers.js` | Client-side note CRUD |
| Supabase `notes` table | Database schema |

---

## Decision

- [ ] Proceed with full fix (all phases)
- [ ] Fix server model only (Phase 1) - minimum viable fix
- [ ] Fix secondary bugs only (Phases 3-4) - won't solve the real problem
- [ ] Need architecture review before proceeding
- [ ] Defer (document as known limitation)

