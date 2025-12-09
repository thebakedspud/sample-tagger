# Spotify Podcast Import Implementation Plan

## Goals
- Add Spotify shows/episodes via the existing importer with `provider: 'spotify'`.
- Keep notes, accessibility, and UI behavior consistent; minimize new files/LOC by reusing the current adapter/store.
- Ship safely behind a flag, with clear behavior for single episodes and very long shows.

## 1) Detection & Routing
- Detect content type (playlist | show | episode) while keeping `provider: 'spotify'`.
- Extend ID extraction to canonical, intl, embed, and URI formats for shows/episodes (`open.spotify.com/show/{id}`, `/intl-au/episode/{id}`, `/embed/show/{id}`, `spotify:show:{id}`, `spotify:episode:{id}`, with tracking params).
- Tests: playlist/show/episode URL fixtures across those variants.
- Import entry sets content type and `kind` on normalized items.

## 2) Adapter Structure
- Single Spotify adapter with internal routing:
  - `fetchPlaylistItems` (existing).
  - `fetchShowEpisodes(id)` -> `/v1/shows/{id}/episodes` (max 50/page, configurable page size).
  - `fetchEpisode(id)` -> `/v1/episodes/{id}` (single item, treated as a one-item playlist).
- Remove the episode-skip guard; branch normalization: `track.type === 'track'` -> music path; `track.type === 'episode'` -> podcast path.

## 3) Spotify API Integration
- Field constant sets for shows/episodes mirroring `PLAYLIST_FIELDS`.
- Honor existing rate-limit/backoff; for very large shows (e.g., 500+ episodes) still full-fetch, but surface a warning/flag that import may be slow.
- No new OAuth scopes (client credentials covers podcast endpoints).

## 4) Normalization & Types
- `NormalizedTrack` gains `kind: 'music' | 'podcast'` (default `'music'` when missing for legacy data); add optional `showId`, `showName`, `publisher`, `description`.
- Mapping for episodes:
  - `title` <- episode title.
  - `artist` <- show name (publisher stored separately).
  - `album` <- show name.
  - `durationMs` <- episode duration.
  - Images: prefer `episode.images[0]`, fallback `show.images[0]`.
- IDs: keep raw Spotify IDs to preserve dedupe/cache; document assumption that track and episode ID spaces do not collide. Add regression test to confirm cross-content-type dedupe.
- Tests: normalized shapes for music/podcast, defaults for missing `kind`.

## 5) Notes & State Verification
- Reuse playlist reducer and `notesByTrack`; podcast IDs must round-trip through add/edit/delete (optimistic flows unchanged).
- Default `kind` to `'music'` for legacy normalized entries in storage; consider storage version bump if needed, or document implicit schema change.

## 6) UI & Accessibility
- V1: URL-driven Import flow. Copy updates when `kind === 'podcast'` (supported show/episode URLs). Optional V2: top-right "Podcasts" pill beside Import/Playlist/Account using current tab semantics and live-region announcements.
- Single-episode imports are treated as a one-item playlist; title uses the episode name, with show name available in metadata.
- Reuse list components; branch only for podcast presentation (description truncation, missing preview audio, show art fallback). Ensure podcast descriptions with timestamps do not conflict with any timestamp-detection in notes.
- Status/error messages use live region; announce podcast successes ("Imported 10 podcast episodes"). Provide keyboard-activated "Show more" for long descriptions.

## 7) Feature Flag
- Add `VITE_ENABLE_PODCASTS` (or similar) checked in detection, adapter routing, and any UI affordances; default off in prod, on in dev/staging.
- No telemetry infra: defer analytics; optional dev logging for podcast imports.

## 8) Error Handling
- Add podcast-specific errors (e.g., `ERR_EPISODE_UNAVAILABLE`, `ERR_SHOW_EMPTY`, `ERR_PODCAST_CONTENT`) and map to UI copy.
- For long-show warnings, surface a non-blocking notice when expected pages exceed a threshold (e.g., 500 episodes).

## 9) Testing Checklist
- Detection: playlist/show/episode URLs (canonical, intl, embed, URI, tracking params).
- Adapter: mocked `/v1/shows/{id}/episodes` (multi-page 300+, zero episodes, region-restricted), `/v1/episodes/{id}` (region-restricted/removed).
- Normalization: podcast metadata mapping, image fallback, `kind` defaulting to `'music'`.
- Notes reducer: podcast IDs through add/edit/delete and optimistic flows.
- Dedupe: cross-content-type (import show, then single episode from same show) to verify ID handling.
- Storage: migration behavior for v6 data without `kind`; importMeta round-trip for playlist/show/episode.
- Accessibility: keyboard navigation, live-region announcements with podcast-specific copy, high-contrast validation on podcast path.

## 10) importMeta & Recent Items
- Shows: store show ID in importMeta (playlistId equivalent), cursor for pagination if applicable; no snapshot semantics.
- Episodes: store episode ID as container/track; treated as a one-item playlist for display and recents.
- Recent items dedupe: continue `${provider}:${playlistId}`; document how single-episode imports appear (one entry per episode). Add regression test for show import followed by an episode import from the same show.

## 11) Rollout Steps
1) Land type change (`kind` with default) and detection updates behind the podcasts flag.
2) Add adapter routing (show/episode fetch, pagination, normalization) and remove episode skip; keep flag off in prod.
3) Validate normalization/dedupe/notes/storage in staging with real high-episode-count shows and mocked URLs; run accessibility pass. Log long-show warnings.
4) Optional: enable Podcasts pill in staging; otherwise remain URL-driven.
5) Gradually enable the podcasts flag in prod; monitor logs for import errors, rate limits, long-show warnings, and single-episode UX.
