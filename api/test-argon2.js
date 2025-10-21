import { hash } from '@node-rs/argon2';

export default async function handler(req, res) {
  const start = Date.now();

  const testHash = await hash('TEST-1234-5678-9012', {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });

  const duration = Date.now() - start;

  return res.json({
    duration: `${duration}ms`,
    ok: duration < 1000,
    hash: `${testHash.substring(0, 20)}...`,
  });
}
