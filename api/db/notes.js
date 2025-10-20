import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Use POST' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin client not configured' })
  }

  let payload
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' })
  }

  const deviceId = payload?.deviceId
  const trackId = payload?.trackId
  const body = payload?.body

  if (!deviceId || !trackId || !body) {
    return res.status(400).json({ error: 'Missing fields' })
  }

  const { data, error } = await supabaseAdmin
    .from('notes')
    .insert({
      device_id: deviceId,
      track_id: trackId,
      body,
    })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ note: data })
}

