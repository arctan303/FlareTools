import { MAX_MOCK_REQUEST_BYTES, validateMockInput } from '../../src/utils/mockApiTools.js';

const DAY_SECONDS = 86400;
const DAILY_CREATIONS = 20;
const ID_PATTERN = /^[a-f0-9]{32}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const PUBLIC_READ_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Type' };

function reply(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...BASE_HEADERS, ...headers } });
}

function failure(code, status, headers) {
  return reply({ success: false, code }, status, headers);
}

function publicReadResponse(response, method) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(PUBLIC_READ_HEADERS)) headers.set(name, value);
  return new Response(method === 'HEAD' ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readBody(request) {
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return { error: 'INVALID_REQUEST', status: 415 };
  const declaredSize = Number(request.headers.get('Content-Length'));
  if (declaredSize > MAX_MOCK_REQUEST_BYTES) return { error: 'PAYLOAD_TOO_LARGE', status: 413 };
  if (!request.body) return { error: 'INVALID_REQUEST', status: 400 };
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MOCK_REQUEST_BYTES) {
        await reader.cancel();
        return { error: 'PAYLOAD_TOO_LARGE', status: 413 };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'INVALID_REQUEST', status: 400 };
    return { body };
  } catch {
    await reader.cancel().catch(() => {});
    return { error: 'INVALID_REQUEST', status: 400 };
  } finally {
    reader.releaseLock();
  }
}

async function takeCreationQuota(db, request, now) {
  // CF supplies this header at its edge. Hashing keeps raw IP addresses out of
  // stored records; a missing header shares one local-development quota.
  const ipHash = await sha256(request.headers.get('CF-Connecting-IP') || 'local');
  const resetsAt = (Math.floor(now / DAY_SECONDS) + 1) * DAY_SECONDS;
  const result = await db.prepare(
    `INSERT INTO rooms_kv (key, data, expires_at) VALUES (?, '{"count":1}', ?)
     ON CONFLICT(key) DO UPDATE SET
       data = json_object('count', CASE WHEN rooms_kv.expires_at <= ? THEN 1 ELSE COALESCE(json_extract(rooms_kv.data, '$.count'), 0) + 1 END),
       expires_at = excluded.expires_at
     WHERE rooms_kv.expires_at <= ? OR COALESCE(json_extract(rooms_kv.data, '$.count'), 0) < ?`
  ).bind(`mock-rate:${ipHash}`, resetsAt, now, now, DAILY_CREATIONS).run();
  return { allowed: result.meta?.changes === 1, resetsAt };
}

async function createMock(request, db, now) {
  const parsed = await readBody(request);
  if (parsed.error) return failure(parsed.error, parsed.status);
  const { json, status = 200, ttl_hours: ttlHours = 1 } = parsed.body;
  const validated = validateMockInput(json, status, ttlHours);
  if (validated.error) return failure(validated.error, validated.error === 'PAYLOAD_TOO_LARGE' ? 413 : 400);

  const quota = await takeCreationQuota(db, request, now);
  if (!quota.allowed) return failure('RATE_LIMITED', 429, { 'Retry-After': String(quota.resetsAt - now) });
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const expiresAt = now + ttlHours * 3600;
  const record = JSON.stringify({ json: validated.serialized, status, token_hash: tokenHash });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomHex(16);
    const inserted = await db.prepare(
      'INSERT INTO rooms_kv (key, data, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING'
    ).bind(`mock:${id}`, record, expiresAt).run();
    if (inserted.meta?.changes === 1) {
      return reply({ success: true, id, url: `${new URL(request.url).origin}/api/mock/${id}`, management_token: token, expires_at: expiresAt, status }, 201);
    }
  }
  return failure('SERVICE_UNAVAILABLE', 503);
}

async function accessMock(request, db, id, now) {
  const result = await db.prepare('SELECT data, expires_at FROM rooms_kv WHERE key = ? AND expires_at > ?')
    .bind(`mock:${id}`, now).all();
  const row = result.results?.[0];
  if (!row) return failure('NOT_FOUND', 404);
  const record = JSON.parse(row.data);

  if (request.method === 'DELETE') {
    const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token || !TOKEN_PATTERN.test(token)) return failure('FORBIDDEN', 403);
    const tokenHash = await sha256(token);
    if (tokenHash !== record.token_hash) return failure('FORBIDDEN', 403);
    const deleted = await db.prepare('DELETE FROM rooms_kv WHERE key = ? AND data = ? AND expires_at > ?')
      .bind(`mock:${id}`, row.data, now).run();
    return deleted.meta?.changes === 1 ? reply({ success: true }) : failure('NOT_FOUND', 404);
  }

  // The public endpoint returns only the configured JSON. Its management
  // record, expiry and token hash are never mixed into the response body.
  return new Response(request.method === 'HEAD' ? null : record.json, {
    status: record.status,
    headers: { ...BASE_HEADERS, ...PUBLIC_READ_HEADERS },
  });
}

export async function onRequest({ request, env, params }) {
  const segments = Array.isArray(params.action) ? params.action : [params.action];
  const action = segments.length === 1 ? segments[0] : '';
  const isPublic = ID_PATTERN.test(action);
  const respond = (response) => isPublic && ['GET', 'HEAD'].includes(request.method) ? publicReadResponse(response, request.method) : response;
  if (action !== 'create' && !isPublic) return failure('NOT_FOUND', 404);
  if (request.method === 'OPTIONS' && isPublic) {
    return new Response(null, { status: 204, headers: { ...BASE_HEADERS, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Max-Age': '600' } });
  }
  const allowed = action === 'create' ? ['POST'] : ['GET', 'HEAD', 'DELETE'];
  if (!allowed.includes(request.method)) return failure('METHOD_NOT_ALLOWED', 405, { Allow: allowed.join(', ') });
  if (['POST', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return failure('FORBIDDEN', 403);
  }
  if (!env.DB?.prepare) return respond(failure('STORAGE_UNAVAILABLE', 503));
  try {
    const now = Math.floor(Date.now() / 1000);
    return respond(action === 'create' ? await createMock(request, env.DB, now) : await accessMock(request, env.DB, action, now));
  } catch {
    return respond(failure('SERVICE_UNAVAILABLE', 503));
  }
}
