// src/features/playlist/__tests__/buildInitialPlaylistState.test.js

import { describe, it, expect } from 'vitest'
import buildInitialPlaylistState from '../buildInitialPlaylistState.js'
import { initialPlaylistState } from '../playlistReducer.js'

describe('buildInitialPlaylistState', () => {
  it('builds hydrated playlist state when persisted data is available', () => {
    const bootstrapState = {
      persisted: {
        tracks: [
          {
            id: 'track-1',
            title: 'Track 1',
            notes: ['persisted note', '  '],
            tags: ['Rock ', 'pop'],
            importedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'track-3',
            title: 'Track 3',
            notes: ['dangling note'],
            tags: ['Metal'],
          },
        ],
        notesByTrack: {
          'track-1': ['stored note', ''],
        },
        tagsByTrack: {
          'track-2': [' ambient ', 'Ambient'],
          'track-4': ['lofi'],
        },
        importedAt: '2024-01-05T08:00:00.000Z',
      },
      pendingMigrationSnapshot: null,
      initialRecents: [],
      persistedTracks: [
        {
          id: 'track-1',
          title: 'Track 1',
          notes: ['old note'],
          tags: ['old-tag'],
          importedAt: '2024-01-02T00:00:00.000Z',
          originalIndex: 1,
        },
        {
          id: 'track-2',
          title: 'Track 2',
          notes: ['should be replaced'],
          tags: ['should-be-replaced'],
          importedAt: null,
        },
      ],
      initialScreen: 'playlist',
    }

    const result = buildInitialPlaylistState(bootstrapState)

    expect(result.bootstrapState).toBe(bootstrapState)
    expect(result.initialNotesMap).toEqual({
      'track-1': ['stored note'],
      'track-3': ['dangling note'],
    });
    expect(result.initialTagsMap).toEqual({
      'track-2': ['ambient'],
      'track-4': ['lofi'],
      'track-1': ['pop', 'rock'],
      'track-3': ['metal'],
    });
    expect(result.initialPlaylistStateWithData).not.toBe(initialPlaylistState);
    expect(result.initialPlaylistStateWithData).toEqual({
      ...initialPlaylistState,
      tracks: [
        {
          id: 'track-1',
          title: 'Track 1',
          notes: ['stored note'],
          tags: ['pop', 'rock'],
          importedAt: '2024-01-02T00:00:00.000Z',
          originalIndex: 1,
        },
        {
          id: 'track-2',
          title: 'Track 2',
          notes: [],
          tags: ['ambient'],
          importedAt: '2024-01-05T08:00:00.000Z',
          originalIndex: 2,
        },
      ],
      notesByTrack: {
        'track-1': ['stored note'],
        'track-3': ['dangling note'],
        'track-2': [],
      },
      tagsByTrack: {
        'track-2': ['ambient'],
        'track-4': ['lofi'],
        'track-1': ['pop', 'rock'],
        'track-3': ['metal'],
      },
      _derived: {
        hasLocalNotes: true,
        allCustomTags: ['ambient', 'lofi', 'metal', 'pop', 'rock'],
      },
    })
  })

  it('falls back to empty maps and derived defaults when notes/tags are missing', () => {
    const bootstrapState = {
      persisted: {
        importedAt: '2023-12-01T00:00:00.000Z',
      },
      pendingMigrationSnapshot: null,
      initialRecents: [],
      persistedTracks: [
        {
          id: 'song-1',
          title: 'Song 1',
          importedAt: '2023-11-01T00:00:00.000Z',
          originalIndex: 0,
        },
        {
          id: 'song-2',
          title: 'Song 2',
          importedAt: '2023-11-02T00:00:00.000Z',
          originalIndex: 1,
        },
      ],
      initialScreen: 'playlist',
    }

    const result = buildInitialPlaylistState(bootstrapState)

    expect(result.bootstrapState).toBe(bootstrapState)
    expect(result.initialNotesMap).toEqual({})
    expect(result.initialTagsMap).toEqual({})
    expect(result.initialPlaylistStateWithData).toEqual({
      ...initialPlaylistState,
      tracks: [
        {
          id: 'song-1',
          title: 'Song 1',
          notes: [],
          tags: [],
          importedAt: '2023-11-01T00:00:00.000Z',
          originalIndex: 0,
        },
        {
          id: 'song-2',
          title: 'Song 2',
          notes: [],
          tags: [],
          importedAt: '2023-11-02T00:00:00.000Z',
          originalIndex: 1,
        },
      ],
      notesByTrack: {
        'song-1': [],
        'song-2': [],
      },
      tagsByTrack: {
        'song-1': [],
        'song-2': [],
      },
      _derived: {
        hasLocalNotes: false,
        allCustomTags: [],
      },
    })
  })
})
