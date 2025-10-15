// api/spotify/token.js
// Vercel serverless function that exchanges client credentials for a Spotify access token.

/* eslint-env node */

/**
 * @typedef {import('http').IncomingMessage & { method?: string }} VercelRequest
 * @typedef {import('http').ServerResponse} VercelResponse
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Attach shared CORS headers.
 * @param {VercelResponse} res
 */
function applyCors(res) {
  Object.entries(CORS_HEADERS).forEach(([name, value]) => {
    res.setHeader(name, value);
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
  res.end(JSON.stringify(body));
}

/**
 * Vercel handler entry point.
 * @param {VercelRequest} req
 * @param {VercelResponse} res
 */
export default async function handler(req, res) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    sendJson(res, 500, { error: 'missing_credentials' });
    return;
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const status = response.status === 429 ? 503 : 502;
      let errorPayload = null;
      try {
        errorPayload = await response.json();
      } catch {
        // ignore JSON parse issues
      }

      sendJson(res, status, {
        error: errorPayload?.error || 'spotify_error',
        status: response.status,
      });
      return;
    }

    const data = await response.json();
    sendJson(res, 200, {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type ?? 'Bearer',
    });
  } catch (err) {
    console.error('[spotify][token] fetch failed', err);
    sendJson(res, 503, { error: 'spotify_unavailable' });
  }
}
