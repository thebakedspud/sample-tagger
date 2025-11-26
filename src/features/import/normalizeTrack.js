/** @typedef {import('./adapters/types.js').NormalizedTrack} NormalizedTrack */
/** @typedef {import('./adapters/types.js').PlaylistProvider} PlaylistProvider */

// Keep as a NAMED export to match your hook import
function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function coerceIsoString(value) {
  if (value == null) return undefined;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Math.trunc(value)).toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return undefined;
    return new Date(parsed).toISOString();
  }
  return undefined;
}

/**
 * @param {(Partial<NormalizedTrack> & { addedAt?: string | number | Date | null | undefined }) | undefined} t
 * @param {number} i
 * @param {PlaylistProvider | null | undefined} provider
 * @returns {NormalizedTrack}
 */
export function normalizeTrack(t = {}, i, provider) {
  const source = /** @type {Partial<NormalizedTrack> & { addedAt?: string | number | Date | null | undefined }} */ (t ?? {});
  const safeTitle = sanitizeText(source?.title ?? '');
  const safeArtist = sanitizeText(source?.artist ?? '');
  const resolvedKind =
    source?.kind === 'podcast' || source?.kind === 'music' ? source.kind : 'music';

  const normalized = /** @type {NormalizedTrack} */ ({
    ...source,
    id: source?.id ?? `${provider ?? 'track'}-${i + 1}`,
    title: safeTitle || `Untitled Track ${i + 1}`,
    artist: safeArtist || 'Unknown Artist',
    provider: source?.provider ?? provider ?? undefined,
    kind: resolvedKind,
  });

  const album = sanitizeText(source?.album ?? '');
  if (album) {
    normalized.album = album;
  } else if ('album' in normalized) {
    delete normalized.album;
  }

  const normalizedDate = coerceIsoString(source?.dateAdded ?? source?.addedAt);
  if (normalizedDate) {
    normalized.dateAdded = normalizedDate;
  } else if ('dateAdded' in normalized) {
    delete normalized.dateAdded;
  }

  if ('addedAt' in normalized) {
    delete normalized.addedAt;
  }

  return normalized;
}
