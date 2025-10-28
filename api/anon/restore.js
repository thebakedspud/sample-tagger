import { randomUUID } from 'node:crypto';
import {
  getAdminClient,
  withCors,
  hasSupabaseConfig,
  touchLastActive,
  getDeviceIdFromRequest,
} from '../_lib/supabase.js';
import {
  fingerprintRecoveryCode,
  verifyRecoveryCode,
  normalizeRecoveryCode,
} from '../_lib/recovery.js';

const supabaseAdmin = getAdminClient();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

const rateLimitByIp = new Map();

function extractClientIp(req) {
  const header = req.headers?.['x-forwarded-for'];
  if (typeof header === 'string') {
    const [first] = header.split(',');
    if (first?.trim()) return first.trim();
  } else if (Array.isArray(header) && header.length > 0) {
    return header[0];
  }
  if (req.socket?.remoteAddress) return req.socket.remoteAddress;
  return 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateLimitByIp.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitByIp.set(ip, bucket);
  }
  if (bucket.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { limited: true, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { limited: false, bucket };
}

function resetBucket(bucket) {
  bucket.count = 0;
  bucket.resetAt = Date.now() + RATE_LIMIT_WINDOW_MS;
}

export default async function handler(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!hasSupabaseConfig || !supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase configuration missing server-side' });
  }

  const ip = extractClientIp(req);
  const rateStatus = checkRateLimit(ip);
  if (rateStatus.limited) {
    const retrySeconds = Math.max(1, Math.ceil(rateStatus.retryAfterMs / 1000));
    res.setHeader('Retry-After', String(retrySeconds));
    return res.status(429).json({ error: 'Too many attempts. Try later.' });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  const recoveryCode = normalizeRecoveryCode(payload?.recoveryCode);
  if (!recoveryCode) {
    return res.status(400).json({ error: 'recoveryCode is required' });
  }

  const fingerprint = fingerprintRecoveryCode(recoveryCode);
  if (!fingerprint) {
    return res.status(401).json({ error: 'Invalid recovery code' });
  }

  const { data, error } = await supabaseAdmin
    .from('anon_identities')
    .select('anon_id, recovery_code_hash, recovery_rotated_at')
    .eq('recovery_code_fingerprint', fingerprint)
    .maybeSingle();

  if (error) {
    console.error('[restore] lookup failed', error);
    return res.status(500).json({ error: 'Failed to verify recovery code' });
  }

  if (!data?.anon_id) {
    const { data: replaced } = await supabaseAdmin
      .from('anon_identities')
      .select('anon_id, recovery_rotated_at')
      .eq('recovery_prev_fingerprint', fingerprint)
      .maybeSingle();

    if (replaced?.anon_id) {
      return res.status(410).json({
        error: 'Recovery code was replaced.',
        rotatedAt: replaced.recovery_rotated_at ?? null,
      });
    }

    return res.status(401).json({ error: 'Invalid recovery code' });
  }

  const verified = await verifyRecoveryCode(
    data.recovery_code_hash,
    recoveryCode,
  );

  if (!verified) {
    return res.status(401).json({ error: 'Invalid recovery code' });
  }

  const deviceHeaderId = getDeviceIdFromRequest(req);
  const deviceId = deviceHeaderId ?? randomUUID();
  const nowIso = new Date().toISOString();

  const { error: linkError } = await supabaseAdmin
    .from('anon_device_links')
    .upsert(
      {
        device_id: deviceId,
        anon_id: data.anon_id,
        last_active: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'device_id' },
    );

  if (linkError) {
    console.error('[restore] failed to upsert device link', linkError);
    return res.status(500).json({ error: 'Failed to restore device' });
  }

  await touchLastActive(supabaseAdmin, data.anon_id, deviceId);

  if (!deviceHeaderId) {
    res.setHeader('x-device-id', deviceId);
  }

  if (rateStatus.bucket) {
    resetBucket(rateStatus.bucket);
  }

  return res.status(200).json({ anonId: data.anon_id });
}
