import {
  getAdminClient,
  getAnonContext,
  touchLastActive,
  withCors,
  hasSupabaseConfig,
  getDeviceIdFromRequest,
} from '../_lib/supabase.js';

const supabaseAdmin = getAdminClient();

function getTrackId(req) {
  const fromQuery =
    typeof req.query?.trackId === 'string' ? req.query.trackId : null;
  if (fromQuery) return fromQuery;

  try {
    const url = new URL(req.url, 'http://localhost');
    const param = url.searchParams.get('trackId');
    return param ?? null;
  } catch (_err) {
    return null;
  }
}

export default async function handler(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!hasSupabaseConfig || !supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase configuration missing server-side' });
  }

  const deviceId = getDeviceIdFromRequest(req);
  if (!deviceId) {
    return res.status(400).json({ error: 'Missing x-device-id header' });
  }

  const context = await getAnonContext(supabaseAdmin, deviceId);
  if (!context) {
    return res.status(404).json({ error: 'Unknown device' });
  }

  if (req.method === 'GET') {
    const trackId = getTrackId(req);

    let builder = supabaseAdmin
      .from('notes')
      .select('id, track_id, body, created_at, updated_at')
      .eq('anon_id', context.anonId)
      .order('created_at', { ascending: true });

    if (trackId) {
      builder = builder.eq('track_id', trackId);
    }

    const { data, error } = await builder;

    if (error) {
      console.error('[notes:get] supabase error', error);
      return res.status(500).json({ error: 'Failed to load notes' });
    }

    await touchLastActive(supabaseAdmin, context.anonId, deviceId);

    return res.status(200).json({
      notes:
        data?.map((row) => ({
          id: row.id,
          trackId: row.track_id,
          body: row.body,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })) ?? [],
    });
  }

  if (req.method === 'POST') {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_err) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
    }

    const trackId = typeof payload?.trackId === 'string' ? payload.trackId : '';
    const body = typeof payload?.body === 'string' ? payload.body.trim() : '';

    if (!trackId || !body) {
      return res.status(400).json({ error: 'Missing trackId or body' });
    }

    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('notes')
      .insert({
        anon_id: context.anonId,
        device_id: deviceId,
        track_id: trackId,
        body,
        last_active: nowIso,
      })
      .select('id, track_id, body, created_at, updated_at')
      .single();

    if (error) {
      console.error('[notes:post] supabase error', error);
      return res.status(500).json({ error: 'Failed to create note' });
    }

    await touchLastActive(supabaseAdmin, context.anonId, deviceId);

    return res.status(201).json({
      note: {
        id: data.id,
        trackId: data.track_id,
        body: data.body,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return res.status(405).json({ error: 'Method not allowed' });
}
