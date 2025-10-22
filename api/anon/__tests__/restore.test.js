import { describe, it, expect, vi, beforeEach } from 'vitest';

const fingerprintRecoveryCodeMock = vi.fn(() => 'fp');
const verifyRecoveryCodeMock = vi.fn(async () => true);
const normalizeRecoveryCodeMock = vi.fn((value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '',
);
const withCorsMock = vi.fn((res) => res);
const touchLastActiveMock = vi.fn();
const getDeviceIdFromRequestMock = vi.fn(() => 'device-1');

let adminClient;
let handler;
let identitySelectResult;
let upsertResult;

vi.mock('../../_lib/recovery.js', () => ({
  fingerprintRecoveryCode: fingerprintRecoveryCodeMock,
  verifyRecoveryCode: verifyRecoveryCodeMock,
  normalizeRecoveryCode: normalizeRecoveryCodeMock,
}));

vi.mock('../../_lib/supabase.js', () => ({
  getAdminClient: () => adminClient,
  withCors: withCorsMock,
  hasSupabaseConfig: true,
  touchLastActive: touchLastActiveMock,
  getDeviceIdFromRequest: getDeviceIdFromRequestMock,
}));

function createAdminClient() {
  return {
    from: vi.fn((table) => {
      if (table === 'anon_identities') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: () => Promise.resolve(identitySelectResult),
            })),
            maybeSingle: () => Promise.resolve(identitySelectResult),
          })),
        };
      }
      if (table === 'anon_device_links') {
        return {
          upsert: vi.fn(() => Promise.resolve(upsertResult)),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function createRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    end() {
      return this;
    },
  };
  vi.spyOn(res, 'status');
  vi.spyOn(res, 'json');
  vi.spyOn(res, 'setHeader');
  vi.spyOn(res, 'end');
  return res;
}

function createReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {},
    body: { recoveryCode: 'aaaaa-bbbbb-ccccc-ddddd' },
    socket: {},
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  fingerprintRecoveryCodeMock.mockClear();
  verifyRecoveryCodeMock.mockClear();
  normalizeRecoveryCodeMock.mockClear();
  withCorsMock.mockClear();
  touchLastActiveMock.mockClear();
  getDeviceIdFromRequestMock.mockReset();
  getDeviceIdFromRequestMock.mockReturnValue('device-1');
  identitySelectResult = {
    data: { anon_id: 'anon-123', recovery_code_hash: 'hash' },
    error: null,
  };
  upsertResult = { error: null };
  adminClient = createAdminClient();
  handler = (await import('../restore.js')).default;
});

describe('api/anon/restore', () => {
  it('restores anon context and reuses existing device id', async () => {
    const req = createReq({
      headers: { 'x-forwarded-for': '1.1.1.1', 'x-device-id': 'device-1' },
    });
    const res = createRes();

    await handler(req, res);

    expect(withCorsMock).toHaveBeenCalledWith(res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ anonId: 'anon-123' });
    expect(res.setHeader).not.toHaveBeenCalledWith('x-device-id', expect.anything());
    expect(touchLastActiveMock).toHaveBeenCalledWith(
      adminClient,
      'anon-123',
      'device-1',
    );
  });

  it('returns new device id when header missing', async () => {
    getDeviceIdFromRequestMock.mockReturnValue(null);
    const req = createReq({ headers: { 'x-forwarded-for': '2.2.2.2' } });
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.headers['x-device-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('returns 401 when recovery code not found', async () => {
    identitySelectResult = { data: null, error: null };
    const req = createReq({ headers: { 'x-forwarded-for': '3.3.3.3' } });
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when verification fails', async () => {
    verifyRecoveryCodeMock.mockResolvedValueOnce(false);
    const req = createReq({ headers: { 'x-forwarded-for': '4.4.4.4' } });
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('enforces rate limiting', async () => {
    verifyRecoveryCodeMock.mockResolvedValue(false);
    const ipReq = () => createReq({ headers: { 'x-forwarded-for': '5.5.5.5' } });

    for (let i = 0; i < 10; i += 1) {
      const res = createRes();
      await handler(ipReq(), res);
      expect(res.statusCode).toBe(401);
    }

    const res = createRes();
    await handler(ipReq(), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.headers['Retry-After']).toBeDefined();
  });

  it('returns 400 for missing recoveryCode', async () => {
    const req = createReq({ body: {}, headers: { 'x-forwarded-for': '6.6.6.6' } });
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
