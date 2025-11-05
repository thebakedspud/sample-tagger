// src/features/playlist/__tests__/usePlaylistContext.test.jsx

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { PlaylistStateProvider } from '../PlaylistProvider.jsx'
import {
  usePlaylistDispatch,
  usePlaylistState,
  usePlaylistTracks,
  usePlaylistNotesByTrack,
  usePlaylistTagsByTrack,
  usePlaylistEditingState,
  usePlaylistDerived,
  usePlaylistSync,
} from '../usePlaylistContext.js'
import { initialPlaylistState } from '../playlistReducer.js'

// Mock dependencies for provider
import { vi } from 'vitest'

vi.mock('../../../lib/apiClient.js', () => ({
  apiFetch: vi.fn()
}))

vi.mock('../../../utils/notesTagsData.js', () => ({
  groupRemoteNotes: vi.fn()
}))

vi.mock('../../tags/tagSyncQueue.js', () => ({
  createTagSyncScheduler: vi.fn()
}))

describe('usePlaylistContext hooks', () => {
  const wrapper = ({ children }) => (
    <PlaylistStateProvider 
      initialState={initialPlaylistState} 
      anonContext={{ deviceId: null, anonId: null }}
    >
      {children}
    </PlaylistStateProvider>
  )

  describe('Error Guards - Outside Provider', () => {
    it('usePlaylistDispatch throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistDispatch())
      }).toThrow('usePlaylistDispatch must be used within PlaylistStateProvider')
    })

    it('usePlaylistState throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistState())
      }).toThrow('usePlaylistState must be used within PlaylistStateProvider')
    })

    it('usePlaylistTracks throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistTracks())
      }).toThrow('usePlaylistTracks must be used within PlaylistStateProvider')
    })

    it('usePlaylistNotesByTrack throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistNotesByTrack())
      }).toThrow('usePlaylistNotesByTrack must be used within PlaylistStateProvider')
    })

    it('usePlaylistTagsByTrack throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistTagsByTrack())
      }).toThrow('usePlaylistTagsByTrack must be used within PlaylistStateProvider')
    })

    it('usePlaylistEditingState throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistEditingState())
      }).toThrow('usePlaylistEditingState must be used within PlaylistStateProvider')
    })

    it('usePlaylistDerived throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistDerived())
      }).toThrow('usePlaylistDerived must be used within PlaylistStateProvider')
    })

    it('usePlaylistSync throws when used outside provider', () => {
      expect(() => {
        renderHook(() => usePlaylistSync())
      }).toThrow('usePlaylistSync must be used within PlaylistStateProvider')
    })
  })

  describe('Happy Path - Inside Provider', () => {
    it('usePlaylistDispatch returns dispatch function', () => {
      const { result } = renderHook(() => usePlaylistDispatch(), { wrapper })
      
      expect(typeof result.current).toBe('function')
    })

    it('usePlaylistState returns full state', () => {
      const { result } = renderHook(() => usePlaylistState(), { wrapper })
      
      expect(result.current).toHaveProperty('tracks')
      expect(result.current).toHaveProperty('notesByTrack')
      expect(result.current).toHaveProperty('tagsByTrack')
      expect(result.current).toHaveProperty('editingState')
      expect(result.current).toHaveProperty('_derived')
    })

    it('usePlaylistTracks returns tracks array', () => {
      const { result } = renderHook(() => usePlaylistTracks(), { wrapper })
      
      expect(Array.isArray(result.current)).toBe(true)
    })

    it('usePlaylistNotesByTrack returns notesByTrack object', () => {
      const { result } = renderHook(() => usePlaylistNotesByTrack(), { wrapper })
      
      expect(typeof result.current).toBe('object')
    })

    it('usePlaylistTagsByTrack returns tagsByTrack object', () => {
      const { result } = renderHook(() => usePlaylistTagsByTrack(), { wrapper })
      
      expect(typeof result.current).toBe('object')
    })

    it('usePlaylistEditingState returns editing state', () => {
      const { result } = renderHook(() => usePlaylistEditingState(), { wrapper })
      
      expect(result.current).toHaveProperty('trackId')
      expect(result.current).toHaveProperty('draft')
      expect(result.current).toHaveProperty('error')
    })

    it('usePlaylistDerived returns derived state', () => {
      const { result } = renderHook(() => usePlaylistDerived(), { wrapper })
      
      expect(result.current).toHaveProperty('hasLocalNotes')
      expect(result.current).toHaveProperty('allCustomTags')
    })

    it('usePlaylistSync returns sync object with syncTrackTags', () => {
      const { result } = renderHook(() => usePlaylistSync(), { wrapper })
      
      expect(result.current).toHaveProperty('syncTrackTags')
      expect(typeof result.current.syncTrackTags).toBe('function')
    })
  })

  describe('Correct Values', () => {
    it('usePlaylistTracks returns correct initial tracks', () => {
      const { result } = renderHook(() => usePlaylistTracks(), { wrapper })
      
      expect(result.current).toEqual([])
    })

    it('usePlaylistDerived returns correct initial derived state', () => {
      const { result } = renderHook(() => usePlaylistDerived(), { wrapper })
      
      expect(result.current.hasLocalNotes).toBe(false)
      expect(result.current.allCustomTags).toEqual([])
    })

    it('usePlaylistEditingState returns correct initial editing state', () => {
      const { result } = renderHook(() => usePlaylistEditingState(), { wrapper })
      
      expect(result.current.trackId).toBeNull()
      expect(result.current.draft).toBe('')
      expect(result.current.error).toBeNull()
    })
  })

  describe('Custom Initial State', () => {
    it('hooks return values from custom initial state', () => {
      const customState = {
        ...initialPlaylistState,
        tracks: [{ id: 't1', title: 'Track 1', notes: ['note1'], tags: ['tag1'] }],
        notesByTrack: { t1: ['note1'] },
        tagsByTrack: { t1: ['tag1'] },
        _derived: {
          hasLocalNotes: true,
          allCustomTags: ['tag1']
        }
      }

      const customWrapper = ({ children }) => (
        <PlaylistStateProvider 
          initialState={customState} 
          anonContext={{ deviceId: null, anonId: null }}
        >
          {children}
        </PlaylistStateProvider>
      )

      const { result: tracksResult } = renderHook(() => usePlaylistTracks(), { wrapper: customWrapper })
      const { result: notesResult } = renderHook(() => usePlaylistNotesByTrack(), { wrapper: customWrapper })
      const { result: tagsResult } = renderHook(() => usePlaylistTagsByTrack(), { wrapper: customWrapper })
      const { result: derivedResult } = renderHook(() => usePlaylistDerived(), { wrapper: customWrapper })

      expect(tracksResult.current).toHaveLength(1)
      expect(tracksResult.current[0].id).toBe('t1')
      expect(notesResult.current.t1).toEqual(['note1'])
      expect(tagsResult.current.t1).toEqual(['tag1'])
      expect(derivedResult.current.hasLocalNotes).toBe(true)
      expect(derivedResult.current.allCustomTags).toEqual(['tag1'])
    })
  })
})

