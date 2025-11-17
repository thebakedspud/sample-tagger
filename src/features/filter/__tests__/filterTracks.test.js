import { describe, expect, it } from 'vitest'
import {
  SEARCH_SCOPE,
  SORT_DIRECTION,
  SORT_KEY,
  buildIndexMap,
  filterTracks,
  sortTracks,
} from '../filterTracks.js'
import { makeNote } from '../../../test-utils/noteHelpers.js'

const MOCK_TRACKS = [
  {
    id: 't-1',
    title: 'Blue Monk',
    artist: 'Thelonious Monk',
    album: 'Genius of Modern Music',
    notes: [makeNote('Swing feel, open solo section')],
    tags: ['jazz', 'swing'],
    dateAdded: '2024-01-05T12:00:00Z',
    importedAt: '2024-01-06T09:00:00Z',
    originalIndex: 0,
  },
  {
    id: 't-2',
    title: 'Giant Steps',
    artist: 'John Coltrane',
    album: 'Giant Steps',
    notes: [makeNote('Practice at 120 BPM'), makeNote('Focus on changes')],
    tags: ['jazz', 'practice'],
    dateAdded: '2024-02-01T08:30:00Z',
    importedAt: '2024-02-01T09:00:00Z',
    originalIndex: 1,
  },
  {
    id: 't-3',
    title: 'Night Poem',
    artist: 'Nils Frahm',
    album: 'All Melody',
    notes: [makeNote('Note: consider for meditation playlist')],
    tags: ['ambient'],
    dateAdded: '2023-12-12T07:00:00Z',
    importedAt: '2024-02-15T10:00:00Z',
    originalIndex: 2,
  },
  {
    id: 't-4',
    title: 'Untitled Sketch',
    artist: 'Unknown Artist',
    notes: [],
    tags: ['draft'],
    // Missing dateAdded to exercise importedAt fallback.
    importedAt: '2024-02-20T10:30:00Z',
    originalIndex: 3,
  },
]

describe('filterTracks', () => {
  const index = buildIndexMap(MOCK_TRACKS)

  it('filters by track title (case-insensitive)', () => {
    const results = filterTracks(MOCK_TRACKS, index, { query: 'blue', scope: SEARCH_SCOPE.BOTH })
    expect(results.map((t) => t.id)).toEqual(['t-1'])
  })

  it('filters by artist name', () => {
    const results = filterTracks(MOCK_TRACKS, index, {
      query: 'coltrane',
      scope: SEARCH_SCOPE.TRACK,
    })
    expect(results.map((t) => t.id)).toEqual(['t-2'])
  })

  it('filters by notes content', () => {
    const results = filterTracks(MOCK_TRACKS, index, {
      query: 'meditation',
      scope: SEARCH_SCOPE.NOTES,
    })
    expect(results.map((t) => t.id)).toEqual(['t-3'])
  })

  it('includes both track metadata and notes when scope is "both"', () => {
    const results = filterTracks(MOCK_TRACKS, index, {
      query: 'practice',
      scope: SEARCH_SCOPE.BOTH,
    })
    expect(results.map((t) => t.id)).toEqual(['t-2'])
  })

  it('returns all tracks when query is empty', () => {
    const results = filterTracks(MOCK_TRACKS, index, { query: '', scope: SEARCH_SCOPE.BOTH })
    expect(results.length).toBe(MOCK_TRACKS.length)
  })

  it('handles tracks with no notes gracefully', () => {
    const results = filterTracks(MOCK_TRACKS, index, {
      query: 'sketch',
      scope: SEARCH_SCOPE.TRACK,
    })
    expect(results.map((t) => t.id)).toEqual(['t-4'])
  })

  it('filters by selected tags (must include every tag)', () => {
    const results = filterTracks(MOCK_TRACKS, index, {
      selectedTags: ['jazz', 'practice'],
    })
    expect(results.map((t) => t.id)).toEqual(['t-2'])
  })

  it('filters by "has notes" flag', () => {
    const results = filterTracks(MOCK_TRACKS, index, {
      hasNotesOnly: true,
    })
    expect(results.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3'])
  })

  it('matches diacritics agnostic query text', () => {
    const augmented = [
      ...MOCK_TRACKS,
      {
        id: 't-5',
        title: 'Águas de Março',
        artist: 'Elis Regina',
        notes: [makeNote('Classic bossa nova')],
        tags: ['bossa'],
        dateAdded: '2024-03-02T09:00:00Z',
        importedAt: '2024-03-03T09:00:00Z',
        originalIndex: 4,
      },
    ]
    const augmentedIndex = buildIndexMap(augmented)
    const results = filterTracks(augmented, augmentedIndex, {
      query: 'aguas',
      scope: SEARCH_SCOPE.BOTH,
    })
    expect(results.map((t) => t.id)).toContain('t-5')
  })
})

describe('sortTracks', () => {
  it('sorts by title ascending', () => {
    const sorted = sortTracks(MOCK_TRACKS, { key: SORT_KEY.TITLE, direction: SORT_DIRECTION.ASC })
    expect(sorted.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3', 't-4'])
  })

  it('sorts by title descending', () => {
    const sorted = sortTracks(MOCK_TRACKS, { key: SORT_KEY.TITLE, direction: SORT_DIRECTION.DESC })
    expect(sorted.map((t) => t.id)).toEqual(['t-4', 't-3', 't-2', 't-1'])
  })

  it('sorts by date added newest first with importedAt fallback', () => {
    const sorted = sortTracks(MOCK_TRACKS, { key: SORT_KEY.DATE, direction: SORT_DIRECTION.DESC })
    expect(sorted.map((t) => t.id)).toEqual(['t-4', 't-2', 't-1', 't-3'])
  })

  it('maintains originalIndex for stable ties', () => {
    const duplicateTitles = [
      { ...MOCK_TRACKS[0], title: 'Repeat', originalIndex: 0 },
      { ...MOCK_TRACKS[1], title: 'Repeat', originalIndex: 1 },
    ]
    const sorted = sortTracks(duplicateTitles, {
      key: SORT_KEY.TITLE,
      direction: SORT_DIRECTION.ASC,
    })
    expect(sorted.map((t) => t.id)).toEqual(['t-1', 't-2'])
  })
})
