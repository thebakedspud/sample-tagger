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

export function normalizeTrack(t = {}, i, provider) {
  const safeTitle = sanitizeText(t?.title ?? '');
  const safeArtist = sanitizeText(t?.artist ?? '');
  const normalized = {
    ...t,
    id: t?.id ?? `${provider}-${i + 1}`,
    title: safeTitle || `Untitled Track ${i + 1}`,
    artist: safeArtist || 'Unknown Artist',
    provider: t?.provider ?? provider ?? undefined,
  };

  const album = sanitizeText(t?.album ?? '');
  if (album) {
    normalized.album = album;
  } else {
    delete normalized.album;
  }

  const normalizedDate = coerceIsoString(t?.dateAdded ?? t?.addedAt);
  if (normalizedDate) {
    normalized.dateAdded = normalizedDate;
  } else {
    delete normalized.dateAdded;
  }

  if ('addedAt' in normalized) {
    delete normalized.addedAt;
  }

  return normalized;
}
