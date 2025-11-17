/**
 * Playlist bootstrap builder
 *
 * Centralises the logic for transforming bootstrapped storage state into the
 * initial playlist reducer state consumed by the application. This keeps App.jsx
 * lean while preserving the pure data transformation pipeline.
 *
 * @module features/playlist/buildInitialPlaylistState
 */

import {
  createInitialNotesMap,
  createInitialTagsMap,
  ensureNotesEntries,
  ensureTagsEntries,
} from '../../utils/notesTagsData.js';
import { attachNotesToTracks } from '../../utils/trackProcessing.js';
import { initialPlaylistState } from './playlistReducer.js';
import { computeHasLocalNotes, computeAllCustomTags } from './helpers.js';

/**
 * @typedef {Object} PlaylistBootstrapState
 * @property {any} persisted
 * @property {any} pendingMigrationSnapshot
 * @property {any[]} initialRecents
 * @property {any[]} persistedTracks
 * @property {string} initialScreen
 */

/**
 * Builds the initial playlist state from bootstrapped storage data.
 *
 * @param {PlaylistBootstrapState} bootstrapState Bootstrapped storage state returned by bootstrapStorageState().
 * @returns {{
 *   bootstrapState: PlaylistBootstrapState,
 *   initialNotesMap: ReturnType<typeof createInitialNotesMap>,
 *   initialTagsMap: ReturnType<typeof createInitialTagsMap>,
 *   initialPlaylistStateWithData: typeof initialPlaylistState,
 * }} Prepared initial playlist state maps and reducer shape.
 */
export function buildInitialPlaylistState(bootstrapState) {
  const { persisted, persistedTracks } = bootstrapState;

  const initialNotesMap = createInitialNotesMap(persisted);
  const initialTagsMap = createInitialTagsMap(persisted);

  const notesMap = /** @type {import('../../utils/notesTagsData.js').NotesByTrack} */ (
    ensureNotesEntries(initialNotesMap, persistedTracks)
  );
  const tagsMap = ensureTagsEntries(initialTagsMap, persistedTracks);

  const tracksWithNotes = attachNotesToTracks(
    persistedTracks,
    notesMap,
    tagsMap,
    persistedTracks,
    { importStamp: persisted?.importedAt ?? null },
  );

  const initialPlaylistStateWithData = {
    ...initialPlaylistState,
    tracks: tracksWithNotes,
    notesByTrack: notesMap,
    tagsByTrack: tagsMap,
    _derived: {
      hasLocalNotes: computeHasLocalNotes(notesMap, tagsMap),
      allCustomTags: computeAllCustomTags(tagsMap),
    },
  };

  return {
    bootstrapState,
    initialNotesMap,
    initialTagsMap,
    initialPlaylistStateWithData,
  };
}

export default buildInitialPlaylistState;
