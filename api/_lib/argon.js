let argonModulePromise = null;

async function loadArgon() {
  if (argonModulePromise) return argonModulePromise;

  argonModulePromise = import('@node-rs/argon2').catch((err) => {
    argonModulePromise = null;
    console.error('[argon] failed to load module', err);
    throw err;
  });

  return argonModulePromise;
}

export async function getHasher() {
  const mod = await loadArgon();
  return mod.hash;
}

export async function getVerifier() {
  const mod = await loadArgon();
  return mod.verify;
}
