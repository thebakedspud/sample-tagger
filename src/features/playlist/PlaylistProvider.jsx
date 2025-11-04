// src/features/playlist/PlaylistProvider.jsx

import { createContext, useReducer } from 'react'
// eslint-disable-next-line no-unused-vars -- used in JSDoc types
import { playlistReducer, initialPlaylistState } from './playlistReducer.js'

/**
 * Context for playlist state (read-only access)
 * @type {import('react').Context<typeof initialPlaylistState | null>}
 */
export const PlaylistStateContext = createContext(null)

/**
 * Context for playlist dispatch (write access)
 * @type {import('react').Context<import('react').Dispatch<any> | null>}
 */
export const PlaylistDispatchContext = createContext(null)

/**
 * Provider component that manages playlist state via reducer
 * 
 * @param {Object} props
 * @param {typeof initialPlaylistState} props.initialState - Initial state for the reducer
 * @param {import('react').ReactNode} props.children - Child components
 */
export function PlaylistStateProvider({ initialState, children }) {
  const [state, dispatch] = useReducer(playlistReducer, initialState)

  return (
    <PlaylistStateContext.Provider value={state}>
      <PlaylistDispatchContext.Provider value={dispatch}>
        {children}
      </PlaylistDispatchContext.Provider>
    </PlaylistStateContext.Provider>
  )
}

