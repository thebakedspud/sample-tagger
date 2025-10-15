// src/features/import/adapters/mockAdapterUtils.js
// Utilities for building paginated mock adapters so the UI can exercise
// cursor-based importing before real provider APIs are wired up.

// @ts-check

const PAGE_SIZE = 10;
const TOTAL_TRACKS = 75;
const DELAY_MS = 120;

/**
 * Lightweight delay helper to simulate async fetches.
 * @param {number} ms
 */
function delay(ms = DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a deterministic mock dataset large enough to test pagination.
 * @param {string} provider
 * @param {Array<any>} baseTracks
 * @param {number} [totalCount]
 */
function buildDataset(provider, baseTracks, totalCount = TOTAL_TRACKS) {
  const seeds = Array.isArray(baseTracks) && baseTracks.length > 0 ? baseTracks : [
    { title: 'Untitled Track', artist: 'Unknown Artist' },
  ];

  const paddedProvider = provider || 'mock';
  const dataset = [];

  for (let i = 0; i < totalCount; i += 1) {
    const template = seeds[i % seeds.length] || {};
    const cycle = Math.floor(i / seeds.length);
    const index = i + 1;

    const title = template.title || `Track ${index}`;
    const artist = template.artist || `Mock Artist ${index}`;
    const cycleSuffix = cycle > 0 ? ` - mock set ${cycle + 1}` : '';

    dataset.push({
      ...template,
      id: `${paddedProvider}-mock-${index}`,
      providerTrackId: template.providerTrackId || `${paddedProvider}-raw-${index}`,
      title: `${title}${cycleSuffix}`,
      artist,
      sourceUrl: template.sourceUrl || `https://example.com/${paddedProvider}/track-${index}`,
    });
  }

  return dataset;
}

/**
 * Parse the simple cursor format we emit ("page:<number>").
 * @param {string | null | undefined} cursor
 */
function parseCursor(cursor) {
  if (!cursor) return 0;
  const match = /page:(\d+)/.exec(String(cursor));
  if (!match) return 0;
  const pageIndex = Number.parseInt(match[1], 10);
  return Number.isNaN(pageIndex) ? 0 : pageIndex;
}

/**
 * Create a paginated mock adapter implementation.
 * @param {Object} config
 * @param {import('./types.js').PlaylistProvider} config.provider
 * @param {string} config.title
 * @param {Array<any>} config.tracks
 * @param {number} [config.total]
 */
export function createPagedMockAdapter({ provider, title, tracks, total = TOTAL_TRACKS }) {
  const dataset = buildDataset(provider, tracks, total);
  const playlistId = `${provider}-mock-playlist`;
  const snapshotId = `${provider}-mock-snapshot-${dataset.length}`;

  /**
   * @param {{ url?: string, cursor?: string, signal?: AbortSignal }} [options]
   */
  async function importPlaylist(options = {}) {
    const { url = '', cursor, signal } = options;

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    await delay();

    const pageIndex = parseCursor(cursor);
    const start = pageIndex * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageTracks = dataset.slice(start, end).map((t) => ({ ...t }));

    const hasMore = end < dataset.length;
    const nextCursor = hasMore ? `page:${pageIndex + 1}` : null;

    return {
      provider,
      playlistId,
      snapshotId,
      title,
      sourceUrl: url,
      tracks: pageTracks,
      pageInfo: {
        cursor: nextCursor,
        hasMore,
      },
      totalTracks: dataset.length,
    };
  }

  return { importPlaylist };
}

export const MOCK_PAGE_SIZE = PAGE_SIZE;
