import {
  getAdminClient,
  getAnonContext,
  touchLastActive,
  hasSupabaseConfig,
  getDeviceIdFromRequest,
} from '../_lib/supabase.js';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  fingerprintRecoveryCode,
} from '../_lib/recovery.js';
import { isOriginAllowed } from '../spotify/originConfig.js';

const supabaseAdmin = getAdminClient();

const RATE_MAX_DEFAULT = 5;
const RATE_WINDOW_MS_DEFAULT = 60 * 60 * 1000;

const RATE_MAX = Number.parseInt(process.env.RECOVERY_ROTATE_MAX ?? '', 10) > 0
  ? Number.parseInt(process.env.RECOVERY_ROTATE_MAX, 10)
  : RATE_MAX_DEFAULT;
const RATE_WINDOW_MS =
  Number.parseInt(process.env.RECOVERY_ROTATE_WINDOW_MS ?? '', 10) > 0
    ? Number.parseInt(process.env.RECOVERY_ROTATE_WINDOW_MS, 10)
    : RATE_WINDOW_MS_DEFAULT;

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateState = new Map();

function parseCookies(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return {};
  return headerValue.split(';').reduce((acc, pair) => {
    const [rawKey, ...rest] = pair.split('=');
    if (!rawKey) return acc;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (key) {
      acc[key] = value;
    }
    return acc;
  }, /** @type {Record<string, string>} */ ({}));
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

function checkRateLimit(key) {
  const now = Date.now();
  const entry = rateState.get(key);
  if (!entry || entry.resetAt <= now) {
    rateState.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_MAX - 1, resetAt: now + RATE_WINDOW_MS };
  }
  if (entry.count >= RATE_MAX) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count += 1;
  rateState.set(key, entry);
  return { allowed: true, remaining: RATE_MAX - entry.count, resetAt: entry.resetAt };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

async function rotateRecoveryCode(adminClient, anonId, currentFingerprint, clientIp) {
  const rotatedAt = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const recoveryCode = generateRecoveryCode();
    const fingerprint = fingerprintRecoveryCode(recoveryCode);
    const recoveryHash = await hashRecoveryCode(recoveryCode);

    const { error } = await adminClient
      .from('anon_identities')
      .update({
        recovery_code_hash: recoveryHash,
        recovery_code_fingerprint: fingerprint,
        recovery_prev_fingerprint: currentFingerprint ?? null,
        recovery_rotated_at: rotatedAt,
        recovery_rotated_by_ip: clientIp ?? null,
      })
      .eq('anon_id', anonId);

    if (!error) {
      return { recoveryCode, rotatedAt };
    }

    if (error?.code !== '23505') {
      throw new Error(error?.message ?? 'Failed to update recovery code');
    }
  }

  const err = new Error('Failed to rotate recovery code after multiple attempts');
  /** @type {any} */ (err).code = 'collision_exhausted';
  throw err;
}

export default async function handler(req, res) {
  const originHeader = typeof req.headers?.origin === 'string' ? req.headers.origin : '';
  const originAllowed = isOriginAllowed(originHeader);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-device-id,x-recovery-csrf');
  if (originAllowed && originHeader) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!originAllowed) {
    sendJson(res, 403, { error: 'Origin not allowed' });
    return;
  }

  if (!hasSupabaseConfig || !supabaseAdmin) {
    sendJson(res, 500, { error: 'Supabase configuration missing server-side' });
    return;
  }

  const deviceId = getDeviceIdFromRequest(req);
  if (!deviceId) {
    sendJson(res, 401, { error: 'Missing device identity' });
    return;
  }

  const cookies = parseCookies(req.headers?.cookie);
  const csrfHeader = typeof req.headers?.['x-recovery-csrf'] === 'string'
    ? req.headers['x-recovery-csrf'].trim()
    : '';
  const csrfCookie = cookies?.sta_recovery_csrf ?? '';
  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    sendJson(res, 403, { error: 'CSRF token mismatch' });
    return;
  }

  const clientIp = getClientIp(req);
  const rateKey = `${deviceId}::${clientIp}`;
  const rate = checkRateLimit(rateKey);
  res.setHeader('X-RateLimit-Limit', String(RATE_MAX));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, rate.remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rate.resetAt / 1000)));

  if (!rate.allowed) {
    const retryAfter = Math.max(0, Math.ceil((rate.resetAt - Date.now()) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, 429, {
      error: 'Too many recovery code rotations. Try again in a little while.',
    });
    return;
  }

  const context = await getAnonContext(supabaseAdmin, deviceId);
  if (!context?.anonId) {
    sendJson(res, 404, { error: 'Unknown device' });
    return;
  }

  const { data: identity, error: identityError } = await supabaseAdmin
    .from('anon_identities')
    .select('recovery_code_fingerprint')
    .eq('anon_id', context.anonId)
    .single();

  if (identityError) {
    console.error('[recovery:rotate] lookup failed', identityError);
    sendJson(res, 500, { error: 'Recovery metadata unavailable' });
    return;
  }

  try {
    const { recoveryCode, rotatedAt } = await rotateRecoveryCode(
      supabaseAdmin,
      context.anonId,
      identity?.recovery_code_fingerprint ?? null,
      clientIp
    );
    await touchLastActive(supabaseAdmin, context.anonId, deviceId);
    sendJson(res, 200, {
      anonId: context.anonId,
      recoveryCode,
      rotatedAt,
    });
  } catch (err) {
    if (err?.code === 'collision_exhausted') {
      console.error('[recovery:rotate] collision exhaustion', err);
      sendJson(res, 503, {
        error: 'Could not generate a fresh recovery code. Please retry shortly.',
      });
      return;
    }
    console.error('[recovery:rotate] failed', err);
    sendJson(res, 500, { error: 'Failed to rotate recovery code' });
  }
}
