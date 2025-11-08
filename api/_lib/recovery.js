import { randomUUID, createHash } from 'node:crypto';
import { getHasher, getVerifier } from './argon.js';

const ARGON_OPTIONS = {
  memoryCost: 8_192,
  timeCost: 1,
  parallelism: 1,
  hashLength: 32,
};

export function generateRecoveryCode() {
  const raw = randomUUID().replace(/-/g, '').toUpperCase();
  const short = raw.slice(0, 20);
  return short.match(/.{1,5}/g)?.join('-') ?? short;
}

export function normalizeRecoveryCode(code) {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

export function fingerprintRecoveryCode(code) {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex');
}

export async function hashRecoveryCode(code) {
  const normalized = normalizeRecoveryCode(code);
  const hash = await getHasher();
  return hash(normalized, ARGON_OPTIONS);
}

export async function verifyRecoveryCode(hashValue, code) {
  if (!hashValue) return false;
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return false;
  const verify = await getVerifier();
  return verify(hashValue, normalized, ARGON_OPTIONS).catch(() => false);
}
