import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function createResponse(body, init) {
  return new Response(body ?? '', init);
}

function createRes() {
  let body = '';
  const headers = new Map();
  return {
    statusCode: 0,
    ended: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk = '') {
      this.ended = true;
      body += chunk;
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    json() {
      return body ? JSON.parse(body) : null;
    },
  };
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
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.useRealTimers();
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

    const { default: handler, __resetTokenCacheForTests } = await loadHandler();

    const res1 = createRes();
    await handler({ method: 'GET' }, res1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res1.json()).toMatchObject({ access_token: 'token-A', token_type: 'Bearer' });

    now += 1_000; // still before expiry
    const res2 = createRes();
    await handler({ method: 'GET' }, res2);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body2 = res2.json();
    expect(body2.access_token).toBe('token-A');
    expect(body2.expires_in).toBeGreaterThan(0);

    __resetTokenCacheForTests();
  });

  it('dedupes concurrent requests while fetching a fresh token', async () => {
    const payload = {
      access_token: 'token-concurrent',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    let resolveFetch;
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

    const { default: handler, __resetTokenCacheForTests } = await loadHandler();

    const resA = createRes();
    const resB = createRes();

    const promiseA = handler({ method: 'GET' }, resA);
    const promiseB = handler({ method: 'GET' }, resB);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch();
    await Promise.all([promiseA, promiseB]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resA.json().access_token).toBe('token-concurrent');
    expect(resB.json().access_token).toBe('token-concurrent');

    __resetTokenCacheForTests();
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

    const { default: handler, __resetTokenCacheForTests } = await loadHandler();

    const res = createRes();
    const promise = handler({ method: 'GET' }, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.json().access_token).toBe('token-retry');

    __resetTokenCacheForTests();
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

    const { default: handler, __resetTokenCacheForTests } = await loadHandler();

    const res = createRes();
    const promise = handler({ method: 'GET' }, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Should clamp to 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.json().access_token).toBe('token-clamp');

    __resetTokenCacheForTests();
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

    const { default: handler, __resetTokenCacheForTests } = await loadHandler();

    const res1 = createRes();
    await handler({ method: 'GET' }, res1);
    expect(res1.json().access_token).toBe('token-old');

    // Advance beyond skew-adjusted minimum expiry (skew yields 5s floor)
    now += 6_000;

    const res2 = createRes();
    await handler({ method: 'GET' }, res2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res2.json().access_token).toBe('token-new');

    __resetTokenCacheForTests();
  });
});
