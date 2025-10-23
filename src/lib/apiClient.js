import { getDeviceId, setDeviceId } from './deviceState.js';

export async function apiFetch(input, init = {}) {
  const deviceId = getDeviceId();
  const headers = new Headers(init.headers ?? {});
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (deviceId) {
    headers.set('x-device-id', deviceId);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  const headerDeviceId = response.headers.get('x-device-id');
  if (headerDeviceId && headerDeviceId !== deviceId) {
    setDeviceId(headerDeviceId);
  }

  return response;
}
