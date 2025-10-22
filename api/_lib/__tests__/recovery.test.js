import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../argon.js', () => ({
  getHasher: vi.fn(async () => vi.fn(async (code, opts) => `${code}|hash|${opts.hashLength}`)),
  getVerifier: vi.fn(async () =>
    vi.fn(async (hashValue, code) => hashValue.startsWith(code)),
  ),
}));

const recovery = await import('../recovery.js');
const { getHasher, getVerifier } = await import('../argon.js');

describe('recovery helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates formatted recovery code', () => {
    const code = recovery.generateRecoveryCode();
    expect(code).toMatch(/^[A-Z0-9]{5}(?:-[A-Z0-9]{5}){3}$/);
    expect(code.length).toBe(23);
  });

  it('normalizes recovery code input', () => {
    expect(recovery.normalizeRecoveryCode('  abcd-efgh  ')).toBe('ABCD-EFGH');
    expect(recovery.normalizeRecoveryCode(null)).toBe('');
  });

  it('hashes and verifies recovery code using argon helpers', async () => {
    const code = 'AAAAA-BBBBB-CCCCC-DDDDD';
    const hash = await recovery.hashRecoveryCode(code);
    expect(hash).toContain('|hash|32');
    expect(getHasher).toHaveBeenCalledTimes(1);

    const verified = await recovery.verifyRecoveryCode(hash, code);
    expect(verified).toBe(true);
    expect(getVerifier).toHaveBeenCalledTimes(1);
  });

  it('returns fingerprint for normalized code', () => {
    const fp = recovery.fingerprintRecoveryCode('aaAAA-bbbbb-ccccc-ddddd');
    const fp2 = recovery.fingerprintRecoveryCode('AAAAA-BBBBB-CCCCC-DDDDD');
    expect(fp).toEqual(fp2);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
