export const MOCK_STATUS_CODES = [200, 201, 400, 401, 403, 404, 422, 500];
export const MOCK_TTL_HOURS = [1, 6, 24];
export const MAX_MOCK_BYTES = 32 * 1024;
export const MAX_MOCK_REQUEST_BYTES = 64 * 1024;

export function validateMockInput(json, status = 200, ttlHours = 1) {
  if (typeof json !== 'string' || !json.trim()) return { error: 'INVALID_JSON' };
  if (new TextEncoder().encode(json).byteLength > MAX_MOCK_BYTES) return { error: 'PAYLOAD_TOO_LARGE' };
  if (!MOCK_STATUS_CODES.includes(status)) return { error: 'INVALID_STATUS' };
  if (!MOCK_TTL_HOURS.includes(ttlHours)) return { error: 'INVALID_EXPIRY' };
  try {
    const value = JSON.parse(json);
    const serialized = JSON.stringify(value);
    const bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > MAX_MOCK_BYTES) return { error: 'PAYLOAD_TOO_LARGE' };
    return { value, serialized, bytes, preview: JSON.stringify(value, null, 2) };
  } catch {
    return { error: 'INVALID_JSON' };
  }
}

export function mockCurlExample(url) {
  // Generated public URLs contain no shell metacharacters; also quote safely if
  // this helper is reused with a URL supplied by a user.
  const escapedUrl = String(url).replaceAll("'", "'\\''");
  return `curl -i '${escapedUrl}'`;
}

export function mockDeleteCurlExample(url, token) {
  const escapedUrl = String(url).replaceAll("'", "'\\''");
  const escapedToken = String(token).replaceAll("'", "'\\''");
  return `curl -X DELETE '${escapedUrl}' -H 'Authorization: Bearer ${escapedToken}'`;
}

export const MOCK_ERROR_KEYS = {
  INVALID_JSON: 'mock_error_json',
  INVALID_STATUS: 'mock_error_status',
  INVALID_EXPIRY: 'mock_error_expiry',
  PAYLOAD_TOO_LARGE: 'mock_error_size',
  INVALID_REQUEST: 'mock_error_request',
  FORBIDDEN: 'mock_error_forbidden',
  NOT_FOUND: 'mock_error_not_found',
  RATE_LIMITED: 'mock_error_rate',
  STORAGE_UNAVAILABLE: 'mock_error_storage',
  SERVICE_UNAVAILABLE: 'mock_error_service',
  METHOD_NOT_ALLOWED: 'mock_error_method',
};
