// src/features/import/mockImporter.js
import detectProvider from './detectProvider';

// Mock importer for MVP (replace with real proxy fetch later)
export async function importPlaylist(url) {
  const provider = detectProvider(url);
  if (!provider) {
    const err = /** @type {Error & { code?: string }} */ (
      new Error('UNSUPPORTED_OR_INVALID_URL')
    );
    err.code = 'UNSUPPORTED_OR_INVALID_URL';
    throw err;
  }

  // Simulate network/processing delay
  await new Promise((r) => setTimeout(r, 700));

  // Simple demo payload based on provider
  if (provider === 'spotify') {
    return {
      provider,
      title: 'Imported from Spotify',
      tracks: [
        { id: 'sp-1', title: 'Nautilus', artist: 'Bob James' },
        { id: 'sp-2', title: 'The Champ', artist: 'The Mohawks' },
        { id: 'sp-3', title: 'Electric Relaxation', artist: 'A Tribe Called Quest' },
      ],
    };
  }
  if (provider === 'youtube') {
    return {
      provider,
      title: 'Imported from YouTube',
      tracks: [
        { id: 'yt-1', title: 'Amen Break (Full)', artist: 'The Winstons' },
        { id: 'yt-2', title: 'Cissy Strut', artist: 'The Meters' },
        { id: 'yt-3', title: 'Apache', artist: 'Incredible Bongo Band' },
      ],
    };
  }

  // soundcloud
  return {
    provider,
    title: 'Imported from SoundCloud',
    tracks: [
      { id: 'sc-1', title: 'Soulful Loop 92bpm', artist: 'crate_digger' },
      { id: 'sc-2', title: 'Dusty Rhodes 84bpm', artist: 'vinyl_junkie' },
      { id: 'sc-3', title: 'Blue Smoke 78bpm', artist: 'midnight_sampler' },
    ],
  };
}

// ✅ Provide a default export too, so `import importPlaylist from ...` works
export default importPlaylist;
