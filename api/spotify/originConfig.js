// api/spotify/originConfig.js
// Shared origin allowlist utilities for the Spotify token handler and tests.

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'https://sample-tagger.vercel.app',
]);

const PREVIEW_HOST_SUFFIXES = Object.freeze(['.vercel.app']);

function parseOriginList(raw) {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAllowedOrigins() {
  const raw = process.env.SPOTIFY_TOKEN_ALLOWED_ORIGINS;
  if (!raw || !raw.trim()) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  const parsed = parseOriginList(raw);
  const merged = [...DEFAULT_ALLOWED_ORIGINS, ...parsed];
  // Preserve insertion order but remove duplicates.
  return Array.from(new Set(merged));
}

function isPreviewHost(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return PREVIEW_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin) {
  if (typeof origin !== 'string' || !origin.trim()) {
    return false;
  }
  const normalized = origin.trim();
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes(normalized)) {
    return true;
  }
  return isPreviewHost(normalized);
}

export function getDefaultAllowedOrigin() {
  const [first] = getAllowedOrigins();
  return first ?? 'http://localhost:5173';
}
