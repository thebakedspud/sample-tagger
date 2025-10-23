// src/utils/isDev.js
// Shared helper to guard dev-only telemetry without duplicating logic.

export function isDev() {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    // Fallback for environments where import.meta isn't available.
    return false;
  }
}

