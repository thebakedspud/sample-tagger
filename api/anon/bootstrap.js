import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import {
  getAdminClient,
  getAnonContext,
  touchLastActive,
  withCors,
  hasSupabaseConfig,
} from '../_lib/supabase.js';

const supabaseAdmin = getAdminClient();

function getDeviceId(req) {
  const raw = req.headers['x-device-id'];
  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === 'string') return raw.trim();
  return null;
}

function generateRecoveryCode() {
  const raw = randomUUID().replace(/-/g, '').toUpperCase();
  const short = raw.slice(0, 20);
  return short.match(/.{1,5}/g)?.join('-') ?? short;
}

async function provisionIdentity(adminClient) {
  const recoveryCode = generateRecoveryCode();
  const nowIso = new Date().toISOString();

  const recoveryHash = await hash(recoveryCode, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });

  const { data, error } = await adminClient
    .from('anon_identities')
    .insert({
      recovery_code_hash: recoveryHash,
      last_active: nowIso,
    })
    .select('anon_id')
    .single();

  if (error || !data?.anon_id) {
    throw new Error(error?.message ?? 'Failed to create anon identity');
  }

  const deviceId = randomUUID();
  const { error: linkError } = await adminClient
    .from('anon_device_links')
    .insert({
      device_id: deviceId,
      anon_id: data.anon_id,
      last_active: nowIso,
    });

  if (linkError) {
    console.error('[bootstrap] failed to create device link', linkError);
    throw new Error('Failed to create device link');
  }

  return {
    anonId: data.anon_id,
    deviceId,
    recoveryCode,
  };
}

export default async function handler(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
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

  const deviceId = getDeviceId(req);

  if (!deviceId) {
    try {
      const context = await provisionIdentity(supabaseAdmin);
      res.setHeader('x-device-id', context.deviceId);
      return res.status(201).json({
        anonId: context.anonId,
        recoveryCode: context.recoveryCode,
      });
    } catch (err) {
      console.error('[bootstrap] provision error', err);
      return res.status(500).json({ error: 'Failed to bootstrap device' });
    }
  }

  const context = await getAnonContext(supabaseAdmin, deviceId);
  if (!context) {
    return res.status(404).json({ error: 'Unknown device' });
  }

  await touchLastActive(supabaseAdmin, context.anonId, deviceId);
  res.setHeader('x-device-id', deviceId);

  return res.status(200).json({ anonId: context.anonId });
}
