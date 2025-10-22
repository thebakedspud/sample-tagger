import {
  getAdminClient,
  getAnonContext,
  touchLastActive,
  withCors,
  hasSupabaseConfig,
  getDeviceIdFromRequest,
} from '../_lib/supabase.js';

const supabaseAdmin = getAdminClient();

function getTrackIdFromRequest(req) {
  const fromQuery =
    typeof req.query?.trackId === 'string' ? req.query.trackId : null;
  if (fromQuery) return fromQuery;

  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('trackId');
  } catch (_err) {
    return null;
  }
}

function parseBody(value) {
  if (value == null) return {};
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return null;
    }
  }
  return null;
}

export default async function handler(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    return res.status(204).end();
  }

  try {
    if (!hasSupabaseConfig || !supabaseAdmin) {
      return res
        .status(500)
        .json({ error: 'Supabase configuration missing server-side' });
    }

    const deviceId = getDeviceIdFromRequest(req);
    if (!deviceId) {
      return res.status(400).json({ error: 'Missing x-device-id header' });
    }

    const anonContext = await getAnonContext(supabaseAdmin, deviceId);
    if (!anonContext) {
      return res.status(404).json({ error: 'Unknown device' });
    }

    res.setHeader('x-device-id', deviceId);

    if (req.method === 'GET') {
      const trackId = getTrackIdFromRequest(req);

      let query = supabaseAdmin
        .from('notes')
        .select('id, track_id, body, created_at, updated_at')
        .eq('anon_id', anonContext.anonId)
        .order('created_at', { ascending: true });

      if (trackId) {
        query = query.eq('track_id', trackId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[notes:get] supabase error', error);
        return res
          .status(500)
          .json({ error: 'Failed to load notes', details: error.message });
      }

      await touchLastActive(supabaseAdmin, anonContext.anonId, deviceId);

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
      const parsed = parseBody(req.body);
      if (parsed === null) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      const trackId =
        typeof parsed?.track_id === 'string'
          ? parsed.track_id
          : typeof parsed?.trackId === 'string'
            ? parsed.trackId
            : '';
      const noteBody =
        typeof parsed?.body === 'string' ? parsed.body.trim() : '';

      if (!trackId || !noteBody) {
        return res
          .status(400)
          .json({ error: 'Missing trackId/track_id or body' });
      }

      const nowIso = new Date().toISOString();

      const insertPayload = {
        anon_id: anonContext.anonId,
        device_id: deviceId,
        track_id: trackId,
        body: noteBody,
        last_active: nowIso,
      };

      const { data, error } = await supabaseAdmin
        .from('notes')
        .insert(insertPayload)
        .select('id, track_id, body, created_at, updated_at')
        .single();

      if (error) {
        console.error('[notes:post] supabase error', error);
        return res.status(500).json({
          error: 'Failed to create note',
          details: error.message,
        });
      }

      await touchLastActive(supabaseAdmin, anonContext.anonId, deviceId);

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
  } catch (err) {
    console.error('[notes handler] unexpected error', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
