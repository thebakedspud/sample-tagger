import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getAllowedOrigins } from '../originConfig.js';

/**
 * @typedef {import('../token.js').VercelRequest} VercelRequest
 * @typedef {import('../token.js').VercelResponse} VercelResponse
 * @typedef {VercelResponse & { ended: boolean, json(): any }} TestResponse
 */

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function createResponse(body, init) {
  return new Response(body ?? '', init);
}

/**
 * Build a minimal Vercel-style request for the handler.
 * @param {object} [options]
 * @returns {VercelRequest}
 */
function createReq(options = {}) {
  const allowedOrigins = getAllowedOrigins();
  const defaultOrigin = allowedOrigins[0] ?? 'http://localhost:5173';
  const clientIp = options.ip ?? '127.0.0.1';

  const headers = { ...(options.headers ?? {}) };

  let originValue;
  if (Object.prototype.hasOwnProperty.call(options, 'origin')) {
    originValue = options.origin;
  } else if (Object.prototype.hasOwnProperty.call(headers, 'origin')) {
    originValue = headers.origin;
  } else {
    originValue = defaultOrigin;
  }

  if (originValue === null) {
    delete headers.origin;
  } else if (originValue !== undefined) {
    headers.origin = originValue;
  }

  if (!headers['x-forwarded-for']) {
    headers['x-forwarded-for'] = clientIp;
  }

  const socket = options.socket ?? { remoteAddress: clientIp };

  return /** @type {VercelRequest} */ (
    /** @type {unknown} */ ({
      method: options.method ?? 'GET',
      headers,
      socket,
    })
  );
}

/**
 * Build a minimal Vercel-style response for the handler.
 * @returns {TestResponse}
 */
function createRes() {
  let body = '';
  const headers = new Map();
  const response = {
    statusCode: 0,
    ended: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk = '') {
      response.ended = true;
      body += chunk;
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    json() {
      return body ? JSON.parse(body) : null;
    },
  };
  return /** @type {TestResponse} */ (/** @type {unknown} */ (response));
}

async function loadHandler() {
  const mod = await import('../token.js');
  return mod;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
  process.env.SPOTIFY_CLIENT_ID = 'id';
  process.env.SPOTIFY_CLIENT_SECRET = 'secret';
  process.env.SPOTIFY_TOKEN_ALLOWED_ORIGINS = 'http://localhost:5173,https://playlist-notes.vercel.app';
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.useRealTimers();
  Object.keys(process.env).forEach((key) => {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('api/spotify/token', () => {
  it('returns cached token on subsequent requests', async () => {
    let now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const payload = {
      access_token: 'token-A',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createResponse(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res1 = createRes();
    await handler(createReq(), res1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res1.json()).toMatchObject({ access_token: 'token-A', token_type: 'Bearer' });

    now += 1_000; // still before expiry
    const res2 = createRes();
    await handler(createReq(), res2);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body2 = res2.json();
    expect(body2.access_token).toBe('token-A');
    expect(body2.expires_in).toBeGreaterThan(0);

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });

  it('emits cache headers and expires_at when issuing a token', async () => {
    const payload = {
      access_token: 'token-header',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createResponse(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res = createRes();
    await handler(createReq(), res);

    const cacheHeader = res.getHeader('cache-control');
    expect(cacheHeader).toMatch(/no-store/i);

    const body = res.json();
    expect(body).toMatchObject({
      access_token: 'token-header',
      token_type: 'Bearer',
    });
    expect(typeof body.expires_at).toBe('number');
    expect(body.expires_at).toBeGreaterThan(Date.now());

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });

  it('rejects requests from disallowed origins', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res = createRes();
    await handler(createReq({ origin: 'https://evil.example.com' }), res);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'origin_not_allowed' });
    expect(res.getHeader('access-control-allow-origin')).toBeUndefined();
    expect(res.getHeader('vary')).toBe('Origin');

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });

  it('allows loopback origins even if the port is not explicitly allowlisted', async () => {
    const payload = {
      access_token: 'token-loopback',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res = createRes();
    await handler(createReq({ origin: 'http://localhost:4173' }), res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('access-control-allow-origin')).toBe('http://localhost:4173');

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });

  it('allows the production playlistnotes.app domain', async () => {
    const payload = {
      access_token: 'token-prod',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const fetchMock = vi.fn().mockResolvedValue(
      createResponse(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res = createRes();
    await handler(createReq({ origin: 'https://playlistnotes.app' }), res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('access-control-allow-origin')).toBe('https://playlistnotes.app');

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });

  it('dedupes concurrent requests while fetching a fresh token', async () => {
    const payload = {
      access_token: 'token-concurrent',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    /** @type {() => void} */
    let resolveFetch = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve(
              createResponse(JSON.stringify(payload), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            );
        })
    );

    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const resA = createRes();
    const resB = createRes();

    const promiseA = handler(createReq(), resA);
    const promiseB = handler(createReq(), resB);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch();
    await Promise.all([promiseA, promiseB]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resA.json().access_token).toBe('token-concurrent');
    expect(resB.json().access_token).toBe('token-concurrent');

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });

  it('enforces rate limiting per IP address', async () => {
    process.env.SPOTIFY_TOKEN_RATE_LIMIT_MAX = '2';
    process.env.SPOTIFY_TOKEN_RATE_LIMIT_WINDOW_MS = '1000';

    const payload = {
      access_token: 'token-limited',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createResponse(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const ip = '203.0.113.42';

    const res1 = createRes();
    await handler(createReq({ ip }), res1);
    expect(res1.statusCode).toBe(200);

    const res2 = createRes();
    await handler(createReq({ ip }), res2);
    expect(res2.statusCode).toBe(200);

    const res3 = createRes();
    await handler(createReq({ ip }), res3);
    expect(res3.statusCode).toBe(429);
    expect(res3.json()).toMatchObject({ error: 'rate_limited' });
    expect(res3.getHeader('retry-after')).toBeDefined();
    expect(res3.getHeader('x-ratelimit-limit')).toBe('2');
    expect(res3.getHeader('x-ratelimit-remaining')).toBe('0');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });

  it('retries once on 429 with retry-after seconds', async () => {
    vi.useFakeTimers();

    const payload = {
      access_token: 'token-retry',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(JSON.stringify({ error: 'rate_limited' }), {
          status: 429,
          headers: { 'Retry-After': '3' },
        })
      )
      .mockResolvedValueOnce(
        createResponse(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res = createRes();
    const promise = handler(createReq(), res);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.json().access_token).toBe('token-retry');

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
    vi.useRealTimers();
  });

  it('clamps retry-after HTTP date headers to 5 seconds', async () => {
    vi.useFakeTimers();
    const base = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(base);

    const payload = {
      access_token: 'token-clamp',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    const retryDate = new Date(base.getTime() + 20_000).toUTCString();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse('', {
          status: 429,
          headers: { 'Retry-After': retryDate },
        })
      )
      .mockResolvedValueOnce(
        createResponse(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res = createRes();
    const promise = handler(createReq(), res);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Should clamp to 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.json().access_token).toBe('token-clamp');

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
    vi.useRealTimers();
  });

  it('refreshes token once it expires', async () => {
    let now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const payload = (token) => ({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 61,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(JSON.stringify(payload('token-old')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        createResponse(JSON.stringify(payload('token-new')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    global.fetch = fetchMock;

    const {
      default: handler,
      __resetTokenCacheForTests,
      __resetRateLimitStateForTests,
    } = await loadHandler();

    const res1 = createRes();
    await handler(createReq(), res1);
    expect(res1.json().access_token).toBe('token-old');

    // Advance beyond skew-adjusted minimum expiry (skew yields 5s floor)
    now += 6_000;

    const res2 = createRes();
    await handler(createReq(), res2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res2.json().access_token).toBe('token-new');

    __resetTokenCacheForTests();
    __resetRateLimitStateForTests();
  });
});
