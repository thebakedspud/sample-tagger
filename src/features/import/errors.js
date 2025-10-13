// src/features/import/errors.js
// @ts-check
import { CODES } from './adapters/types.js';

/** @type {Record<string, string>} */
export const ERROR_MAP = {
  [CODES.ERR_UNSUPPORTED_URL]: "That URL doesn't look like a Spotify, YouTube, or SoundCloud playlist.",
  [CODES.ERR_PRIVATE_PLAYLIST]: 'This playlist is private or unavailable.',
  [CODES.ERR_RATE_LIMITED]: 'Too many requests \\u2014 please try again shortly.',
  [CODES.ERR_TOKEN_EXPIRED]: 'Session expired \\u2014 please re-authenticate.',
  [CODES.ERR_NETWORK]: 'Network problem \\u2014 check your connection and retry.',
  [CODES.ERR_INVALID_RESPONSE]: 'The service returned an unexpected response.',
  [CODES.ERR_ABORTED]: 'Import was cancelled.',
  [CODES.ERR_NOT_FOUND]: 'Playlist not found.',
  [CODES.ERR_UNKNOWN]: 'Something went wrong. Please try again.',
};

export default ERROR_MAP;
