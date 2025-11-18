import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { isOriginAllowed } from '../originConfig.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SPOTIFY_TOKEN_ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.SPOTIFY_TOKEN_ALLOWED_SUFFIXES = '.vercel.app';
});

afterEach(() => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('originConfig loopback allowlist', () => {
  it('rejects hostnames that merely start with 127 but are not IP literals', () => {
    expect(isOriginAllowed('https://127.attacker.io')).toBe(false);
    expect(isOriginAllowed('https://127.0.0.1.evil.dev')).toBe(false);
  });

  it('allows actual loopback IP literals', () => {
    expect(isOriginAllowed('http://127.0.0.1')).toBe(true);
    expect(isOriginAllowed('https://127.123.0.5')).toBe(true);
  });
});
