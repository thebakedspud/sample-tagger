// src/features/import/adapters/types.js
// Document the contract so tests can assert it
// All adapters resolve to this shape or throw a coded error
{
  provider: 'spotify'|'youtube'|'soundcloud',
  playlistId: string,
  title: string,
  snapshotId?: string,
  sourceUrl: string,
  tracks: Array<NormalizedTrack>, // from normalizeTrack()
  pageInfo?: { cursor?: string, hasMore?: boolean }
}
