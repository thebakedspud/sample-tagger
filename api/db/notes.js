import {
  getAdminClient,
  getAnonContext,
  touchLastActive,
  withCors,
  hasSupabaseConfig,
  getDeviceIdFromRequest,
} from '../_lib/supabase.js';

// Conflict policy: server state is treated as canonical (union/merge planned in Phase 2).

// NOTE: These constants are duplicated from src/features/tags/validation.js
// Serverless functions cannot import from src/ directory (separate deployment).
// Keep in sync manually or create shared package in future.
// Current values: MAX_TAG_LENGTH=24, MAX_TAGS_PER_TRACK=32, TAG_ALLOWED_RE=/^[a-z0-9][a-z0-9\s\-_]*$/
const MAX_TAGS_PER_TRACK = 32;
const MAX_TAG_LENGTH = 24;
const TAG_ALLOWED_RE = /^[a-z0-9][a-z0-9\s\-_]*$/;

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

function normalizeTagsInput(value) {
  if (!Array.isArray(value)) return null;
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  value.forEach((tag) => {
    if (typeof tag !== 'string') return;
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return;
    if (normalized.length > MAX_TAG_LENGTH) {
      throw new Error(`Tags must be ${MAX_TAG_LENGTH} characters or fewer.`);
    }
    if (!TAG_ALLOWED_RE.test(normalized)) {
      throw new Error('Tags can only contain letters, numbers, spaces, hyphen, or underscore.');
    }
    if (seen.has(normalized)) return;
    if (out.length >= MAX_TAGS_PER_TRACK) {
      throw new Error(`A track may have at most ${MAX_TAGS_PER_TRACK} tags.`);
    }
    out.push(normalized);
    seen.add(normalized);
  });
  out.sort();
  return out;
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
        .select('id, track_id, body, tags, created_at, updated_at')
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
            tags: Array.isArray(row.tags) ? [...row.tags].sort() : [],
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
      const hasBodyField = typeof parsed?.body === 'string';
      const noteBody = hasBodyField ? parsed.body.trim() : '';
      const tagsProvided = Array.isArray(parsed?.tags);
      let normalizedTags = null;
      if (tagsProvided) {
        try {
          normalizedTags = normalizeTagsInput(parsed.tags);
        } catch (err) {
          return res.status(400).json({ error: err.message || 'Invalid tags' });
        }
      }

      if (!trackId) {
        return res
          .status(400)
          .json({ error: 'Missing trackId/track_id' });
      }

      const nowIso = new Date().toISOString();
      const {
        data: existingRow,
        error: existingError,
      } = await supabaseAdmin
        .from('notes')
        .select('id, body, tags')
        .eq('anon_id', anonContext.anonId)
        .eq('device_id', deviceId)
        .eq('track_id', trackId)
        .maybeSingle();

      if (existingError) {
        console.error('[notes:post] lookup error', existingError);
        return res.status(500).json({
          error: 'Failed to look up existing note',
          details: existingError.message,
        });
      }

      if (!existingRow) {
        if (!noteBody && !tagsProvided) {
          return res
            .status(400)
            .json({ error: 'Missing note body or tags payload' });
        }
        if (hasBodyField && !noteBody && !tagsProvided) {
          return res
            .status(400)
            .json({ error: 'Note body cannot be empty' });
        }

        const insertPayload = {
          anon_id: anonContext.anonId,
          device_id: deviceId,
          track_id: trackId,
          body: noteBody || '',
          tags: normalizedTags ?? [],
          last_active: nowIso,
        };

        const { data, error } = await supabaseAdmin
          .from('notes')
          .insert(insertPayload)
          .select('id, track_id, body, tags, created_at, updated_at')
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
            tags: Array.isArray(data.tags) ? data.tags : [],
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          },
        });
      }

      if (!hasBodyField && !tagsProvided) {
        return res
          .status(400)
          .json({ error: 'No updates provided' });
      }
      if (hasBodyField && !noteBody) {
        return res
          .status(400)
          .json({ error: 'Note body cannot be empty' });
      }

      const updatePayload = {
        last_active: nowIso,
      };
      if (hasBodyField) {
        updatePayload.body = noteBody;
      }
      if (tagsProvided) {
        updatePayload.tags = normalizedTags ?? [];
      }

      const { data, error } = await supabaseAdmin
        .from('notes')
        .update(updatePayload)
        .eq('id', existingRow.id)
        .select('id, track_id, body, tags, created_at, updated_at')
        .single();

      if (error) {
        console.error('[notes:post] supabase update error', error);
        return res.status(500).json({
          error: 'Failed to update note',
          details: error.message,
        });
      }

      await touchLastActive(supabaseAdmin, anonContext.anonId, deviceId);

      return res.status(200).json({
        note: {
          id: data.id,
          trackId: data.track_id,
          body: data.body,
          tags: Array.isArray(data.tags) ? [...data.tags].sort() : [],
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
