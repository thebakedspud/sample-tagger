import { describe, it, expect, vi, beforeEach } from 'vitest';

const hashMock = vi.fn(async () => 'hashed-code');
const getAnonContextMock = vi.fn();
const touchLastActiveMock = vi.fn();
const withCorsMock = vi.fn((res) => res);

let adminClient;
let handler;
let anonInsertResult;
let deviceInsertResult;
let anonInsertPayload;
let deviceInsertPayload;
let identityInsertMock;
let deviceInsertMock;

vi.mock('@node-rs/argon2', () => ({
  hash: hashMock,
}));

vi.mock('../../_lib/supabase.js', () => ({
  getAdminClient: () => adminClient,
  getAnonContext: getAnonContextMock,
  touchLastActive: touchLastActiveMock,
  withCors: withCorsMock,
  hasSupabaseConfig: true,
}));

function createAdminClient() {
  const single = vi.fn(() => Promise.resolve(anonInsertResult));
  const select = vi.fn(() => ({ single }));

  identityInsertMock = vi.fn((payload) => {
    anonInsertPayload = payload;
    return { select };
  });

  deviceInsertMock = vi.fn((payload) => {
    deviceInsertPayload = payload;
    return Promise.resolve(deviceInsertResult);
  });

  return {
    from: vi.fn((table) => {
      if (table === 'anon_identities') {
        return {
          insert: identityInsertMock,
        };
      }
      if (table === 'anon_device_links') {
        return {
          insert: deviceInsertMock,
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
    method: 'POST',
    headers: {},
    body: undefined,
    url: '/api/anon/bootstrap',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  hashMock.mockClear();
  getAnonContextMock.mockReset();
  touchLastActiveMock.mockReset();
  withCorsMock.mockClear();
  anonInsertResult = { data: { anon_id: 'anon-123' }, error: null };
  deviceInsertResult = { error: null };
  anonInsertPayload = undefined;
  deviceInsertPayload = undefined;
  adminClient = createAdminClient();
  handler = (await import('../bootstrap.js')).default;
});

describe('api/anon/bootstrap', () => {
  it('provisions anon identity when header missing', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(withCorsMock).toHaveBeenCalledWith(res);
    expect(identityInsertMock).toHaveBeenCalledTimes(1);
    expect(deviceInsertMock).toHaveBeenCalledTimes(1);
    expect(anonInsertPayload).toMatchObject({
      recovery_code_hash: 'hashed-code',
    });
    expect(deviceInsertPayload).toMatchObject({
      anon_id: 'anon-123',
    });
    expect(deviceInsertPayload.device_id).toBe(res.headers['x-device-id']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.headers['x-device-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.body.anonId).toEqual('anon-123');
    expect(res.body.recoveryCode).toMatch(/^[A-Z0-9]{5}(?:-[A-Z0-9]{5}){3}$/);
    expect(getAnonContextMock).not.toHaveBeenCalled();
    expect(touchLastActiveMock).not.toHaveBeenCalled();
  });

  it('returns existing anon context when header present', async () => {
    getAnonContextMock.mockResolvedValueOnce({ anonId: 'anon-xyz' });

    const req = createMockReq({
      headers: { 'x-device-id': 'device-9' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(withCorsMock).toHaveBeenCalledWith(res);
    expect(identityInsertMock).not.toHaveBeenCalled();
    expect(deviceInsertMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.headers['x-device-id']).toEqual('device-9');
    expect(res.body).toEqual({ anonId: 'anon-xyz' });
    expect(touchLastActiveMock).toHaveBeenCalledWith(
      adminClient,
      'anon-xyz',
      'device-9',
    );
  });

  it('returns 404 for unknown device header', async () => {
    getAnonContextMock.mockResolvedValueOnce(null);

    const req = createMockReq({
      headers: { 'x-device-id': 'missing-device' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual({ error: 'Unknown device' });
    expect(touchLastActiveMock).not.toHaveBeenCalled();
  });

  it('returns 500 when provisioning fails', async () => {
    anonInsertResult = { data: null, error: { message: 'db failed' } };

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Failed to bootstrap device' });
  });
});
