/**
 * Tag validation constants
 * Shared across frontend tag processing logic
 *
 * NOTE: These constants are duplicated in api/db/notes.js for serverless functions.
 * Serverless functions cannot import from src/ directory (separate deployment).
 * If you change these values, update api/db/notes.js manually to keep in sync.
 *
 * @module features/tags/validation
 */

/** Maximum character length for a single tag */
export const MAX_TAG_LENGTH = 24;

/** Maximum number of tags allowed per track */
export const MAX_TAGS_PER_TRACK = 32;

/** Regex pattern for valid tag characters (lowercase alphanumeric, spaces, hyphens, underscores) */
export const TAG_ALLOWED_RE = /^[a-z0-9][a-z0-9\s\-_]*$/;
