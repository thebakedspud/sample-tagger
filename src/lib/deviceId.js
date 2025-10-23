const STORAGE_KEY = 'st:deviceId'

/**
 * Returns the existing device ID or creates a new one.
 * @returns {string}
 */
export function getOrCreateDeviceId() {
  if (typeof crypto === 'undefined' || typeof localStorage === 'undefined') {
    throw new Error('Device ID storage is unavailable in this environment.')
  }

  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

