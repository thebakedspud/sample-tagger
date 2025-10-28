// api/spotify/originConfig.js
// Shared origin allowlist utilities for the Spotify token handler and tests.

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'https://playlist-notes.vercel.app',
]);

// Allow all Vercel previews and the Vercel feedback overlay by default.
const DEFAULT_ALLOWED_SUFFIXES = Object.freeze(['.vercel.app', '.vercel.live']);

/**
 * Parse a comma-separated env string into a trimmed string array.
 * Returns [] for empty/undefined input.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
function parseCsv(raw) {
  return (raw || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Build the final list of exact allowed origins (scheme + host [+ optional port]).
 * Defaults to localhost + production domain, and merges with env overrides.
 * @returns {string[]}
 */
export function getAllowedOrigins() {
  const extra = parseCsv(process.env.SPOTIFY_TOKEN_ALLOWED_ORIGINS);
  const merged = [...DEFAULT_ALLOWED_ORIGINS, ...extra];
  // Preserve insertion order but remove duplicates.
  return Array.from(new Set(merged));
}

/**
 * Build the final list of allowed hostname suffixes (e.g., ".vercel.app").
 * Defaults to Vercel preview/feedback suffixes, merge with env overrides.
 * @returns {string[]}
 */
export function getAllowedSuffixes() {
  const extra = parseCsv(process.env.SPOTIFY_TOKEN_ALLOWED_SUFFIXES);
  const merged = [...DEFAULT_ALLOWED_SUFFIXES, ...extra];
  return Array.from(new Set(merged.map((s) => s.toLowerCase())));
}

/**
 * Normalize an origin string to "protocol://host[:port]" (lowercased protocol/host).
 * Returns null if not a valid URL.
 * @param {string} origin
 * @returns {{ origin: string, protocol: string, hostname: string } | null}
 */
function normalizeOrigin(origin) {
  try {
    const u = new URL(origin);
    // Keep the full origin (protocol + // + host[:port]).
    return {
      origin: u.origin,
      protocol: u.protocol.toLowerCase(),
      hostname: u.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Main allow check used by the token handler.
 * Rules:
 *  - If there's no Origin header, ALLOW (server-to-server or direct tab open).
 *  - If origin matches an exact entry in the allowlist, ALLOW.
 *  - If hostname ends with any allowed suffix (e.g., ".vercel.app"), ALLOW.
 *  - Otherwise, DENY.
 * @param {string} origin
 * @returns {boolean}
 */
export function isOriginAllowed(origin) {
  if (typeof origin !== 'string' || !origin.trim()) {
    // No Origin header: allow. The handler can still decide
    // whether to emit ACAO based on presence of origin.
    return true;
  }

  const norm = normalizeOrigin(origin);
  if (!norm) return false;

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes(norm.origin)) {
    return true;
  }

  const suffixes = getAllowedSuffixes();
  if (suffixes.some((sfx) => norm.hostname.endsWith(sfx))) {
    return true;
  }

  return false;
}

/**
 * Default origin to use in dev tooling/tests when an origin is needed.
 * @returns {string}
 */
export function getDefaultAllowedOrigin() {
  const [first] = getAllowedOrigins();
  return first ?? 'http://localhost:5173';
}
