import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  '';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  '';

export const hasSupabaseConfig =
  Boolean(SUPABASE_URL) &&
  Boolean(SERVICE_ROLE_KEY) &&
  Boolean(SUPABASE_ANON_KEY);

export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

export function getRlsClient(deviceId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const headers =
    deviceId && typeof deviceId === 'string'
      ? { 'x-device-id': deviceId }
      : undefined;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers },
  });
}

export async function getAnonContext(adminClient, deviceId) {
  if (!adminClient || !deviceId) return null;
  const { data, error } = await adminClient
    .from('anon_device_links')
    .select('anon_id')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error || !data?.anon_id) return null;
  return { anonId: data.anon_id };
}

export async function touchLastActive(adminClient, anonId, deviceId) {
  if (!adminClient || !anonId) return;
  const nowIso = new Date().toISOString();

  await adminClient
    .from('anon_identities')
    .update({ last_active: nowIso })
    .eq('anon_id', anonId);

  if (deviceId) {
    await adminClient
      .from('anon_device_links')
      .update({ last_active: nowIso })
      .eq('anon_id', anonId)
      .eq('device_id', deviceId);
  }
}

export function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'x-device-id, content-type, authorization'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  return res;
}
