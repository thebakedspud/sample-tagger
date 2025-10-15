// Keep as a NAMED export to match your hook import
export function normalizeTrack(t = {}, i, provider) {
  const safeTitle = (t?.title ?? '').toString().trim();
  const safeArtist = (t?.artist ?? '').toString().trim();

  return {
    // preserve any extra fields (duration, thumbnail, sourceUrl, etc.)
    ...t,
    id: t?.id ?? `${provider}-${i + 1}`,
    title: safeTitle || `Untitled Track ${i + 1}`,
    artist: safeArtist || 'Unknown Artist',
    provider: t?.provider ?? provider ?? undefined,
  };
}
