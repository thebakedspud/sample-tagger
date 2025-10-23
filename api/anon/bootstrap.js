import { randomUUID } from 'node:crypto';
import {
  getAdminClient,
  getAnonContext,
  touchLastActive,
  withCors,
  hasSupabaseConfig,
  getDeviceIdFromRequest,
} from '../_lib/supabase.js';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  fingerprintRecoveryCode,
} from '../_lib/recovery.js';

const supabaseAdmin = getAdminClient();

async function provisionIdentity(adminClient) {
  const nowIso = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const recoveryCode = generateRecoveryCode();
    const fingerprint = fingerprintRecoveryCode(recoveryCode);
    const recoveryHash = await hashRecoveryCode(recoveryCode);

    const { data, error } = await adminClient
      .from('anon_identities')
      .insert({
        recovery_code_hash: recoveryHash,
        recovery_code_fingerprint: fingerprint,
        last_active: nowIso,
      })
      .select('anon_id')
      .single();

    if (error || !data?.anon_id) {
      if (error?.code === '23505') {
        // Collision on fingerprint; retry with a fresh code.
        continue;
      }
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

  throw new Error('Failed to mint recovery code after multiple attempts');
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

  const deviceId = getDeviceIdFromRequest(req);

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
