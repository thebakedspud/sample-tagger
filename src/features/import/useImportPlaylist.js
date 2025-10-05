// src/features/import/useImportPlaylist.js
import detectProvider from './detectProvider'

export default function useImportPlaylist() {
  async function importPlaylist(url) {
    const provider = detectProvider(url)
    if (!provider) {
      const err = new Error('UNSUPPORTED_OR_INVALID_URL')
      err.code = 'UNSUPPORTED_OR_INVALID_URL'
      throw err
    }

    // Mocked response structure expected by App.jsx
    return {
      provider,                   // 'spotify' | 'youtube' | 'soundcloud'
      title: 'Imported Playlist', // mock title
      tracks: [
        { id: `${provider}-1`, title: 'Mock Track One',   artist: 'Artist A' },
        { id: `${provider}-2`, title: 'Mock Track Two',   artist: 'Artist B' },
        { id: `${provider}-3`, title: 'Mock Track Three', artist: 'Artist C' },
      ],
    }
  }

  return { importPlaylist }
}
