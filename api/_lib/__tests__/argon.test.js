import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn(() => 'hashed'),
  verify: vi.fn(() => true),
}));

describe('argon helper loader', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads hash and verify functions lazily', async () => {
    const mod = await import('../argon.js');
    const hasher = await mod.getHasher();
    const verifier = await mod.getVerifier();
    expect(typeof hasher).toBe('function');
    expect(typeof verifier).toBe('function');

    const { hash, verify } = await import('@node-rs/argon2');
    expect(hash).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();

    const hasherAgain = await mod.getHasher();
    expect(hasherAgain).toBe(hasher);
  });

});
