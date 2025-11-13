// src/features/playlist/usePlaylistContext.js

import { useContext } from 'react'
import { PlaylistStateContext, PlaylistDispatchContext, PlaylistSyncContext } from './contexts.js'
// eslint-disable-next-line no-unused-vars -- used in JSDoc types
import { initialPlaylistState } from './playlistReducer.js'

/**
 * Hook to access playlist dispatch function
 * @returns {import('react').Dispatch<any>}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistDispatch() {
  const dispatch = useContext(PlaylistDispatchContext)
  if (dispatch === null) {
    throw new Error('usePlaylistDispatch must be used within PlaylistStateProvider')
  }
  return dispatch
}

/**
 * Hook to access full playlist state (use sparingly - prefer narrow selectors)
 * @returns {typeof initialPlaylistState}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistState() {
  const state = useContext(PlaylistStateContext)
  if (state === null) {
    throw new Error('usePlaylistState must be used within PlaylistStateProvider')
  }
  return state
}

// ===== Narrow Selectors (prevent unnecessary re-renders) =====

/**
 * Hook to access tracks array
 * @returns {Array<any>}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistTracks() {
  const state = useContext(PlaylistStateContext)
  if (state === null) {
    throw new Error('usePlaylistTracks must be used within PlaylistStateProvider')
  }
  return state.tracks
}

/**
 * Hook to access notesByTrack map
 * @returns {Record<string, import('../../utils/notesTagsData.js').NoteEntry[]>}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistNotesByTrack() {
  const state = useContext(PlaylistStateContext)
  if (state === null) {
    throw new Error('usePlaylistNotesByTrack must be used within PlaylistStateProvider')
  }
  return state.notesByTrack
}

/**
 * Hook to access tagsByTrack map
 * @returns {Record<string, string[]>}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistTagsByTrack() {
  const state = useContext(PlaylistStateContext)
  if (state === null) {
    throw new Error('usePlaylistTagsByTrack must be used within PlaylistStateProvider')
  }
  return state.tagsByTrack
}

/**
 * Hook to access editing state
 * @returns {{ trackId: string | null, draft: string, error: string | null }}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistEditingState() {
  const state = useContext(PlaylistStateContext)
  if (state === null) {
    throw new Error('usePlaylistEditingState must be used within PlaylistStateProvider')
  }
  return state.editingState
}

/**
 * Hook to access derived state (hasLocalNotes, allCustomTags)
 * @returns {{ hasLocalNotes: boolean, allCustomTags: string[] }}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistDerived() {
  const state = useContext(PlaylistStateContext)
  if (state === null) {
    throw new Error('usePlaylistDerived must be used within PlaylistStateProvider')
  }
  return state._derived
}

/**
 * Hook to access playlist sync operations
 * @returns {{ syncTrackTags: (trackId: string, tags: string[]) => Promise<void> }}
 * @throws {Error} If used outside PlaylistStateProvider
 */
export function usePlaylistSync() {
  const sync = useContext(PlaylistSyncContext)
  if (sync === null) {
    throw new Error('usePlaylistSync must be used within PlaylistStateProvider')
  }
  return sync
}
