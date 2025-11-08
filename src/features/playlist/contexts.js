// src/features/playlist/contexts.js

import { createContext } from 'react'

/**
 * Context for playlist state (read-only access)
 * @type {import('react').Context<any | null>}
 */
export const PlaylistStateContext = createContext(null)

/**
 * Context for playlist dispatch (write access)
 * @type {import('react').Context<import('react').Dispatch<any> | null>}
 */
export const PlaylistDispatchContext = createContext(null)

/**
 * Context for playlist sync operations
 * @type {import('react').Context<{ syncTrackTags: (trackId: string, tags: string[]) => Promise<void> } | null>}
 */
export const PlaylistSyncContext = createContext(null)

