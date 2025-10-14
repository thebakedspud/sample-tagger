// src/utils/fetchClient.js
// Thin wrapper so adapters/tests can swap fetch implementations easily.

// @ts-check

/**
 * Create a fetch client with a simple JSON helper.
 * @param {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>} [fetchImpl]
 */
export function makeFetchClient(fetchImpl = globalThis.fetch) {
  if (!fetchImpl) {
    throw new Error('A fetch implementation is required');
  }

  return {
    /**
     * Perform a GET request and return JSON or throw with an HTTP_* code.
     * @param {string} url
     * @param {RequestInit} [init]
     */
    async getJson(url, init) {
      const res = await fetchImpl(url, init);
      if (!res.ok) {
        const err = new Error(`HTTP_${res.status}`);
        const anyErr = /** @type {any} */ (err);
        anyErr.code = `HTTP_${res.status}`;
        anyErr.details = { url, status: res.status };
        throw err;
      }
      return res.json();
    },
  };
}

export const defaultFetchClient = makeFetchClient();
