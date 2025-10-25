// src/features/tags/tagSyncQueue.js
// Debounce/queue helper for tag sync requests.

/**
 * @param {(trackId: string, tags: string[]) => Promise<void>} sendFn
 * @param {number} [delayMs=350]
 */
export function createTagSyncScheduler(sendFn, delayMs = 350) {
  /** @type {Map<string, { tags: string[], timer: any, resolvers: Array<() => void>, rejecters: Array<(err: any) => void> }>} */
  const pending = new Map();

  const flush = async (trackId) => {
    const entry = pending.get(trackId);
    if (!entry) return;
    pending.delete(trackId);
    try {
      await sendFn(trackId, entry.tags);
      entry.resolvers.forEach((fn) => fn());
    } catch (err) {
      entry.rejecters.forEach((fn) => fn(err));
    }
  };

  const schedule = (trackId, tags) => {
    if (!trackId) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = pending.get(trackId);
      if (existing) {
        clearTimeout(existing.timer);
        existing.tags = tags;
        existing.resolvers.push(resolve);
        existing.rejecters.push(reject);
        existing.timer = setTimeout(() => flush(trackId), delayMs);
        return;
      }
      const timer = setTimeout(() => flush(trackId), delayMs);
      pending.set(trackId, {
        tags,
        timer,
        resolvers: [resolve],
        rejecters: [reject],
      });
    });
  };

  const clear = () => {
    pending.forEach((entry) => clearTimeout(entry.timer));
    pending.clear();
  };

  return { schedule, clear };
}

