import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

const ENV_KEYS = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
];

function clearEnv() {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  clearEnv();
});

afterEach(() => {
  clearEnv();
});

describe('api/_lib/supabase helpers', () => {
  it('detects missing configuration', async () => {
    const mod = await import('../supabase.js');
    expect(mod.hasSupabaseConfig).toBe(false);
    expect(mod.getAdminClient()).toBeNull();
    expect(mod.getRlsClient('device-1')).toBeNull();
  });

  it('creates admin and RLS clients when env present', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE = 'service-role';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    const adminClient = { kind: 'admin' };
    const rlsClient = { kind: 'rls' };
    createClientMock
      .mockReturnValueOnce(adminClient)
      .mockReturnValue(rlsClient);

    const mod = await import('../supabase.js');

    expect(mod.hasSupabaseConfig).toBe(true);
    expect(mod.getAdminClient()).toBe(adminClient);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role',
    );

    const clientWithHeader = mod.getRlsClient('device-xyz');
    expect(clientWithHeader).toBe(rlsClient);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      {
        global: {
          headers: { 'x-device-id': 'device-xyz' },
        },
      },
    );

    const clientNoHeader = mod.getRlsClient();
    expect(clientNoHeader).toBe(rlsClient);
    expect(createClientMock).toHaveBeenLastCalledWith(
      'https://example.supabase.co',
      'anon-key',
      {
        global: {
          headers: undefined,
        },
      },
    );
  });

  it('returns anon context when device linked', async () => {
    const mod = await import('../supabase.js');

    const maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { anon_id: 'anon-1' }, error: null }),
    );
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ maybeSingle, eq }));
    const from = vi.fn(() => ({ select, eq }));
    const adminClient = { from };

    const context = await mod.getAnonContext(adminClient, 'device-1');
    expect(context).toEqual({ anonId: 'anon-1' });
    expect(from).toHaveBeenCalledWith('anon_device_links');
    expect(eq).toHaveBeenCalledWith('device_id', 'device-1');
  });

  it('returns null for missing anon context', async () => {
    const mod = await import('../supabase.js');

    const maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: 'no row' } }),
    );
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ maybeSingle, eq }));
    const from = vi.fn(() => ({ select, eq }));
    const adminClient = { from };

    const context = await mod.getAnonContext(adminClient, 'device-missing');
    expect(context).toBeNull();
  });

  it('updates last_active for anon and device', async () => {
    const mod = await import('../supabase.js');

    const deviceEqFinal = vi.fn(() => Promise.resolve({}));
    const deviceEq = vi.fn(() => ({ eq: deviceEqFinal }));
    const deviceUpdate = vi.fn(() => ({ eq: deviceEq }));
    const identityEq = vi.fn(() => Promise.resolve({}));
    const identityUpdate = vi.fn(() => ({ eq: identityEq }));
    const from = vi.fn((table) => {
      if (table === 'anon_identities') {
        return { update: identityUpdate };
      }
      if (table === 'anon_device_links') {
        return { update: deviceUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const adminClient = { from };

    await mod.touchLastActive(adminClient, 'anon-1', 'device-1');

    expect(identityUpdate).toHaveBeenCalled();
    expect(identityEq).toHaveBeenCalledWith('anon_id', 'anon-1');
    expect(deviceUpdate).toHaveBeenCalled();
    expect(deviceEq).toHaveBeenCalledWith('anon_id', 'anon-1');
    expect(deviceEqFinal).toHaveBeenCalledWith('device_id', 'device-1');
  });

  it('sets CORS headers', async () => {
    const mod = await import('../supabase.js');
    const res = {
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
      },
    };
    mod.withCors(res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('x-device-id');
    expect(res.headers['Access-Control-Allow-Methods']).toContain('GET');
  });
});
