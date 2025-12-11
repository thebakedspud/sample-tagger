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

function normalizeTimestampPayload(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error('timestampMs must be a finite number');
    }
    if (parsed < 0) {
      throw new Error('timestampMs must be zero or greater');
    }
    return Math.trunc(parsed);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('timestampMs must be a finite number');
    }
    if (value < 0) {
      throw new Error('timestampMs must be zero or greater');
    }
    return Math.trunc(value);
  }
  throw new Error('timestampMs must be numeric');
}

export default async function handler(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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
        .select('id, track_id, body, tags, timestamp_ms, created_at, updated_at')
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
            timestampMs:
              typeof row.timestamp_ms === 'number' ? row.timestamp_ms : null,
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
      const timestampProvided =
        parsed != null &&
        (Object.prototype.hasOwnProperty.call(parsed, 'timestampMs') ||
          Object.prototype.hasOwnProperty.call(parsed, 'timestamp_ms'));
      let normalizedTimestamp;
      if (timestampProvided) {
        try {
          normalizedTimestamp = normalizeTimestampPayload(
            parsed?.timestampMs ?? parsed?.timestamp_ms ?? null,
          );
        } catch (err) {
          return res.status(400).json({
            error:
              err instanceof Error
                ? err.message
                : 'Invalid timestampMs value',
          });
        }
      }
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

      if (!noteBody && !tagsProvided) {
        return res
          .status(400)
          .json({ error: 'Missing note body or tags payload' });
      }

      // Phase 1: append-only notes. If a non-empty body is provided, always
      // create a new note row instead of overwriting any existing note.
      if (noteBody) {
        // Accept client-provided noteId for offline-first sync
        const clientNoteId =
          typeof parsed?.noteId === 'string' && parsed.noteId.trim()
            ? parsed.noteId.trim()
            : typeof parsed?.id === 'string' && parsed.id.trim()
              ? parsed.id.trim()
              : undefined;

        const insertPayload = {
          anon_id: anonContext.anonId,
          device_id: deviceId,
          track_id: trackId,
          body: noteBody,
          tags: normalizedTags ?? [],
          last_active: nowIso,
        };
        if (clientNoteId) {
          insertPayload.id = clientNoteId;
        }
        if (timestampProvided) {
          insertPayload.timestamp_ms =
            normalizedTimestamp == null ? null : normalizedTimestamp;
        }

        const { data, error } = await supabaseAdmin
          .from('notes')
          .insert(insertPayload)
          .select(
            'id, track_id, body, tags, timestamp_ms, created_at, updated_at',
          )
          .single();

        if (error) {
          console.error('[notes:post] supabase insert error', error);
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
            timestampMs:
              typeof data.timestamp_ms === 'number' ? data.timestamp_ms : null,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          },
        });
      }

      // Tags-only path (no note body). We still keep a single representative
      // row per (anonId, deviceId, trackId) for tags, creating it if needed.
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
        const insertPayload = {
          anon_id: anonContext.anonId,
          device_id: deviceId,
          track_id: trackId,
          body: '',
          tags: normalizedTags ?? [],
          last_active: nowIso,
        };
        if (timestampProvided) {
          insertPayload.timestamp_ms =
            normalizedTimestamp == null ? null : normalizedTimestamp;
        }

        const { data, error } = await supabaseAdmin
          .from('notes')
          .insert(insertPayload)
          .select(
            'id, track_id, body, tags, timestamp_ms, created_at, updated_at',
          )
          .single();

        if (error) {
          console.error('[notes:post] supabase insert error', error);
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
            timestampMs:
              typeof data.timestamp_ms === 'number' ? data.timestamp_ms : null,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          },
        });
      }

      const updatePayload = {
        last_active: nowIso,
        tags: normalizedTags ?? [],
      };
      if (timestampProvided) {
        updatePayload.timestamp_ms =
          normalizedTimestamp == null ? null : normalizedTimestamp;
      }

      const { data, error } = await supabaseAdmin
        .from('notes')
        .update(updatePayload)
        .eq('id', existingRow.id)
        .select(
          'id, track_id, body, tags, timestamp_ms, created_at, updated_at',
        )
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
          timestampMs:
            typeof data.timestamp_ms === 'number' ? data.timestamp_ms : null,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      });
    }

    if (req.method === 'DELETE') {
      const noteId = getTrackIdFromRequest(req)?.replace('noteId=', '') ||
        (typeof req.query?.noteId === 'string' ? req.query.noteId : null);
      
      if (!noteId) {
        return res.status(400).json({ error: 'Missing noteId parameter' });
      }

      // Security: only delete notes belonging to this user's anonId
      const { error } = await supabaseAdmin
        .from('notes')
        .delete()
        .eq('id', noteId)
        .eq('anon_id', anonContext.anonId);

      if (error) {
        console.error('[notes:delete] supabase error', error);
        return res.status(500).json({
          error: 'Failed to delete note',
          details: error.message,
        });
      }

      await touchLastActive(supabaseAdmin, anonContext.anonId, deviceId);

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'OPTIONS']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[notes handler] unexpected error', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
