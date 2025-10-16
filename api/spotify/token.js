// api/spotify/token.js
// Vercel serverless function that exchanges client credentials for a Spotify access token.

/* eslint-env node */

/**
 * @typedef {import('http').IncomingMessage & { method?: string }} VercelRequest
 * @typedef {import('http').ServerResponse} VercelResponse
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const EXPIRY_SKEW_SECONDS = 60;
const MIN_EXPIRES_SECONDS = 5;
const RETRY_AFTER_MAX_MS = 5000;
const isDevRuntime = process.env.NODE_ENV !== 'production';
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://sample-tagger.vercel.app',
];

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateLimitState = new Map();

/** @type {{ access_token: string, token_type: string, expires_at: number, fetched_at: number } | null} */
let cachedToken = null;
/** @type {Promise<{ access_token: string, token_type: string, expires_at: number, fetched_at: number }> | null} */
let inFlightToken = null;

/**
 * Attach shared CORS headers.
 * @param {VercelResponse} res
 */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.vercel.app')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function buildCorsHeaders(origin) {
  const allowed = isAllowedOrigin(origin);
  const headers = {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  return { headers, allowed };
}

/**
 * @param {VercelResponse} res
 * @param {Record<string, string>} headers
 */
function applyHeaders(res, headers) {
  Object.entries(headers).forEach(([key, value]) => {
    if (value === '') return;
    res.setHeader(key, value);
  });
}

/**
 * Respond with JSON.
 * @param {VercelResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} body
 */
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

function getClientIp(req) {
  const header = req.headers?.['x-forwarded-for'];
  if (typeof header === 'string' && header.length > 0) {
    return header.split(',')[0].trim() || 'unknown';
  }
  if (Array.isArray(header) && header.length > 0) {
    return header[0].split(',')[0].trim() || 'unknown';
  }
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitState.get(ip);

  if (!entry || entry.resetAt <= now) {
    rateLimitState.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  rateLimitState.set(ip, entry);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}

/**
 * @param {{ access_token: string, token_type: string, expires_at: number, fetched_at: number } | null} token
 */
function isTokenValid(token) {
  return Boolean(token && Date.now() < token.expires_at);
}

/**
 * @param {string | null} header
 * @returns {number | null}
 */
function parseRetryAfter(header) {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;

  const seconds = Number.parseFloat(trimmed);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, Math.min(seconds * 1000, RETRY_AFTER_MAX_MS));
  }

  const retryDate = Date.parse(trimmed);
  if (!Number.isNaN(retryDate)) {
    const delta = retryDate - Date.now();
    if (delta <= 0) return 0;
    return Math.min(delta, RETRY_AFTER_MAX_MS);
  }
  return null;
}

/**
 * @param {number} ms
 */
async function delay(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} clientId
 * @param {string} clientSecret
 */
async function fetchSpotifyToken(clientId, clientSecret) {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const makeRequest = async () =>
    fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

  let attempt = 0;
  let lastError = null;

  while (attempt < 2) {
    attempt += 1;
    const response = await makeRequest();

    if (response.ok) {
      const data = await response.json();
      const rawExpiresIn = typeof data?.expires_in === 'number' ? data.expires_in : 0;
      const expiresInSeconds = Math.max(
        MIN_EXPIRES_SECONDS,
        rawExpiresIn - EXPIRY_SKEW_SECONDS
      );
      const now = Date.now();
      const expiresAt = now + expiresInSeconds * 1000;

      return {
        access_token: data.access_token,
        token_type: typeof data?.token_type === 'string' ? data.token_type : 'Bearer',
        expires_at: expiresAt,
        fetched_at: now,
      };
    }

    if (response.status === 429 && attempt < 2) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      if (retryAfter !== null) {
        await delay(retryAfter);
        continue;
      }
    }

    let errorPayload = null;
    try {
      errorPayload = await response.json();
    } catch {
      // noop
    }

    lastError = {
      status: response.status,
      error: errorPayload?.error || 'spotify_error',
    };
    break;
  }

  if (lastError) {
    throw Object.assign(new Error('spotify_error'), lastError);
  }
  throw new Error('spotify_error');
}

/**
 * Vercel handler entry point.
 * @param {VercelRequest} req
 * @param {VercelResponse} res
 */
export default async function handler(req, res) {
  const originHeader = typeof req.headers?.origin === 'string' ? req.headers.origin : '';
  const { headers: corsHeaders, allowed: originAllowed } = buildCorsHeaders(originHeader);
  applyHeaders(res, corsHeaders);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!originAllowed) {
    sendJson(res, 403, { error: 'origin_not_allowed' });
    return;
  }

  const clientIp = getClientIp(req);
  const rate = checkRateLimit(clientIp);

  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, rate.remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rate.resetAt / 1000)));

  if (!rate.allowed) {
    const retryAfter = Math.max(0, Math.ceil((rate.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, 429, { error: 'rate_limited' });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    sendJson(res, 500, { error: 'missing_credentials' });
    return;
  }

  try {
    if (!isTokenValid(cachedToken)) {
      if (!inFlightToken) {
        inFlightToken = fetchSpotifyToken(clientId, clientSecret).then((token) => {
          cachedToken = {
            access_token: token.access_token,
            token_type: token.token_type,
            expires_at: token.expires_at,
            fetched_at: token.fetched_at,
          };
          return cachedToken;
        }).finally(() => {
          inFlightToken = null;
        });
      }
      await inFlightToken;
    }

    const token = cachedToken;
    if (!token) {
      throw new Error('token_unavailable');
    }

    if (isDevRuntime) {
      console.debug('[spotify][token]', {
        cacheHit: isTokenValid(cachedToken),
        expiresAt: cachedToken?.expires_at ?? null,
      });
    }

    const expiresIn = Math.max(
      0,
      Math.round((token.expires_at - Date.now()) / 1000)
    );

    sendJson(res, 200, {
      access_token: token.access_token,
      token_type: token.token_type,
      expires_in: expiresIn,
      expires_at: token.expires_at,
    });
  } catch (err) {
    const anyErr = /** @type {any} */ (err);
    const status = anyErr?.status === 429 ? 503 : 503;
    sendJson(res, status, {
      error: anyErr?.error || 'spotify_unavailable',
      status: anyErr?.status ?? 503,
    });
  }
}

export function __resetTokenCacheForTests() {
  cachedToken = null;
  inFlightToken = null;
}
