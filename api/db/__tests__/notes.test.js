import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAnonContextMock = vi.fn();
const touchLastActiveMock = vi.fn();
const withCorsMock = vi.fn((res) => res);

let hasConfig = true;
let adminClient;
let handler;
let notesSelectResponse;
let notesInsertResponse;
let notesInsertPayload;
let notesSelectQueries;
let notesInsertMock;

vi.mock('../../_lib/supabase.js', () => ({
  getAdminClient: () => adminClient,
  getAnonContext: getAnonContextMock,
  touchLastActive: touchLastActiveMock,
  withCors: withCorsMock,
  get hasSupabaseConfig() {
    return hasConfig;
  },
}));

function createSelectQuery() {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then(onFulfilled, onRejected) {
      return Promise.resolve(notesSelectResponse).then(onFulfilled, onRejected);
    },
  };
  notesSelectQueries.push(query);
  return query;
}

function createAdminClient() {
  notesInsertMock = vi.fn((payload) => {
    notesInsertPayload = payload;
    const single = vi.fn(() => Promise.resolve(notesInsertResponse));
    const select = vi.fn(() => ({ single }));
    return { select };
  });

  return {
    from: vi.fn((table) => {
      if (table === 'notes') {
        return {
          select: vi.fn(() => createSelectQuery()),
          insert: notesInsertMock,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status: vi.fn(function (code) {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(function (payload) {
      res.body = payload;
      return res;
    }),
    setHeader: vi.fn(function (key, value) {
      res.headers[key] = value;
      return res;
    }),
    end: vi.fn(() => res),
  };
  return res;
}

function createMockReq(overrides = {}) {
  return {
    method: 'GET',
    headers: {},
    query: {},
    body: undefined,
    url: '/api/db/notes',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  hasConfig = true;
  notesSelectResponse = { data: [], error: null };
  notesInsertResponse = {
    data: {
      id: 'note-1',
      track_id: 'track-9',
      body: 'hi',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    error: null,
  };
  notesInsertPayload = undefined;
  notesSelectQueries = [];
  getAnonContextMock.mockReset();
  touchLastActiveMock.mockReset();
  withCorsMock.mockClear();
  adminClient = createAdminClient();
  handler = (await import('../notes.js')).default;
});

describe('api/db/notes handler', () => {
  it('returns notes for authenticated device', async () => {
    getAnonContextMock.mockResolvedValueOnce({ anonId: 'anon-1' });
    notesSelectResponse = {
      data: [
        {
          id: 'row-1',
          track_id: 'track-7',
          body: 'hello',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:01Z',
        },
      ],
      error: null,
    };

    const req = createMockReq({
      method: 'GET',
      headers: { 'x-device-id': 'device-1' },
      query: { trackId: 'track-7' },
      url: '/api/db/notes?trackId=track-7',
    });
    const res = createMockRes();

    await handler(req, res);

    expect(withCorsMock).toHaveBeenCalledWith(res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      notes: [
        {
          id: 'row-1',
          trackId: 'track-7',
          body: 'hello',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:01Z',
        },
      ],
    });
    const [query] = notesSelectQueries;
    expect(query.eq).toHaveBeenCalledWith('anon_id', 'anon-1');
    expect(query.eq).toHaveBeenCalledWith('track_id', 'track-7');
    expect(touchLastActiveMock).toHaveBeenCalledWith(
      adminClient,
      'anon-1',
      'device-1',
    );
  });

  it('creates note on POST', async () => {
    getAnonContextMock.mockResolvedValueOnce({ anonId: 'anon-1' });

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-device-id': 'device-1' },
      body: { trackId: 'track-9', body: '  new note  ' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(notesInsertMock).toHaveBeenCalledTimes(1);
    expect(notesInsertPayload).toMatchObject({
      anon_id: 'anon-1',
      device_id: 'device-1',
      track_id: 'track-9',
      body: 'new note',
    });
    expect(typeof notesInsertPayload.last_active).toBe('string');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body).toEqual({
      note: {
        id: 'note-1',
        trackId: 'track-9',
        body: 'hi',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    });
    expect(touchLastActiveMock).toHaveBeenCalledWith(
      adminClient,
      'anon-1',
      'device-1',
    );
  });

  it('rejects missing device header', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Missing x-device-id header' });
    expect(getAnonContextMock).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown device context', async () => {
    getAnonContextMock.mockResolvedValueOnce(null);
    const req = createMockReq({
      method: 'GET',
      headers: { 'x-device-id': 'device-404' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual({ error: 'Unknown device' });
  });

  it('propagates supabase errors on GET', async () => {
    getAnonContextMock.mockResolvedValueOnce({ anonId: 'anon-1' });
    notesSelectResponse = { data: null, error: { message: 'nope' } };

    const req = createMockReq({
      method: 'GET',
      headers: { 'x-device-id': 'device-1' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Failed to load notes' });
    expect(touchLastActiveMock).not.toHaveBeenCalled();
  });

  it('handles OPTIONS preflight', async () => {
    const req = createMockReq({ method: 'OPTIONS' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 500 when Supabase config missing', async () => {
    hasConfig = false;
    const req = createMockReq({
      method: 'GET',
      headers: { 'x-device-id': 'device-1' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({
      error: 'Supabase configuration missing server-side',
    });
  });
});
