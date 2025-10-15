# ORIENTATION – Import Flow Overview
_Last updated: 12 Oct 2025_

A 1-page map of what connects to what. Use this to re-anchor quickly after a break.

---

## 🧭 Visual → Code Map

| UI Element | File / Function |
|-------------|-----------------|
| **Header / Theme toggle** | `src/components/ThemeToggle.jsx` |
| **Playlist title + chip** | `App.jsx` – reads from `importMeta` |
| **Re-import / Clear / Back** | `App.jsx` – `handleReimport`, `handleClearAll`, `handleBack` |
| **Track list + “Add note”** | `App.jsx` / `src/components/TrackList.jsx` |
| **Undo placeholder** | `src/components/UndoPlaceholder.jsx` + `src/features/undo/usePendingDelete.js` |
| **“Load more” button** | `App.jsx` → `handleLoadMore()` |
| **Live announcements (screen reader)** | `src/components/LiveRegion.jsx` |
| **Focus helpers** | `src/utils/focusById.js` |

---

## 🔄 Data Flow

1. **App → useImportPlaylist**
   - `const { runImport, importNext, loading, error, pageInfo } = useImportPlaylist()`

2. **Provider detection**
   - `src/features/import/detectProvider.js`

3. **Adapter registry**
   - `src/features/import/useImportPlaylist.js`
   - ```js
     const ADAPTER_REGISTRY = { spotify, youtube, soundcloud }
     ```

4. **Adapters**
   - `src/features/import/adapters/{spotifyAdapter,youtubeAdapter,soundcloudAdapter}.js`
   - All use shared util `mockAdapterUtils.js` for pagination.
   - Page size controlled by `DEFAULT_PAGE_SIZE = 10`.

5. **Normalization**
   - `src/features/import/normalizeTrack.js` → creates stable `id/title/artist` etc.

6. **Persistence**
   - `src/utils/storage.js`
   - Saves:
     ```js
     {
       version: 3,
       importMeta: {
         provider, playlistId, title, snapshotId,
         cursor, hasMore, sourceUrl, importedAt, debug
       },
       tracks: [ { id, title, artist, ... } ]
     }
     ```
   - Restored on refresh to resume session.

---

## 🧩 Core Handlers (App.jsx)

| Handler | Purpose |
|----------|----------|
| `handleImport(url)` | Detect provider → runImport → save to storage |
| `handleReimport()` | Re-fetch same playlist; announces and refocuses |
| `handleLoadMore()` | Calls `importNext()` → appends tracks |
| `onAddNote / onSaveNote / onDeleteNote` | Standard note lifecycle |
| `onUndo` | Restores last deleted note (focus + announce) |

---

## ⚙️ Feature Flags & Knobs

| Flag | Location | Description |
|------|-----------|-------------|
| `DEFAULT_PAGE_SIZE` | `mockAdapterUtils.js` | Number of tracks per mock page |
| `ADAPTER_REGISTRY` | `useImportPlaylist.js` | Restrict active providers for focus |
| `DEV_DEBUG` | `App.jsx` | Show/hide debug chips |
| `focusById()` | `src/utils/focusById.js` | Moves focus after import/reimport/undo |

---

## 📣 Behavior Traces

| Event | Outcome |
|--------|----------|
| **Invalid URL** | Hook throws coded error → announce + select URL input |
| **Undo delete** | Temporary state (5s) → restore or expire + focus safety |
| **Load more** | Uses `pageInfo.cursor`; appends new page; keeps focus ring |
| **Theme toggle** | Updates `<html data-theme>` + localStorage |

---

## 🎯 What’s Stable vs. WIP

✅  Architecture (hooks, adapters, storage)  
✅  Accessibility flow (live region, focus)  
✅  Pagination mock pipeline  
🟡  Virtualized list (future)  
🟡  Test coverage (future)  

---

> 💡 **Remember:**  
> _App handles the flow,_  
> _the hook talks to the adapter,_  
> _the adapter returns normalized data,_  
> _storage remembers it all._

