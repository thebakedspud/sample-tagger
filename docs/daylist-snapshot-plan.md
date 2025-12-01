# Daylist Snapshot Feature – Notes

## Problem / Motivation
- Spotify “daylist” is a per-user, rolling playlist. Standard client-credentials calls return 404; it requires the user’s OAuth token.
- Even when saved in Spotify, daylist auto-updates; users can’t keep a stable copy.
- Goal: let users capture a frozen snapshot of their current daylist and keep it static in our app (optional push to their Spotify account as a new playlist).

## Proposed Flow (High-Level)
1) Add Spotify account linking with `playlist-read-private` scope to fetch the user’s daylist using their token (not client credentials).
2) Provide a “Snapshot daylist” action:
   - Fetch the current daylist tracks once via user token.
   - Store as a static snapshot record in our app (tracks, title, cover, capturedAt, source playlistId).
   - Do NOT reimport the original daylist link for that snapshot; treat it as immutable.
   - Optional: create a new playlist in the user’s Spotify account with the captured tracks.
3) UI:
   - Show snapshots in Recents with a “Daylist Snapshot” badge and captured timestamp.
   - No “Reimport” on snapshots; instead offer “New snapshot” to capture a fresh version.

## Data / Behavior
- Snapshot record: { sourcePlaylistId, capturedAt, title, coverUrl, tracks[], kind: 'daylist-snapshot' }.
- Token use: user OAuth token (playlist-read-private); access/refresh handled securely; no tokens in logs.
- Reimport: disabled for snapshots; a new snapshot triggers a new one-shot fetch.

## Constraints / Compliance
- Handle user tokens as secrets (encrypt at rest, HTTPS in transit, avoid logging).
- Minimal data collection: tokens + snapshot data only; no extra profile fields unless required.
- Provide revoke/delete for tokens and snapshots; document collection/usage; comply with Spotify TOS and basic privacy expectations (GDPR/CCPA if applicable).

## Open Questions
- Do we also push snapshots back to the user’s Spotify account as new playlists?
- Storage limits/retention for snapshots (how many to keep per user?).
- How to surface failures (e.g., token expired, rate limit) in the snapshot UI.
