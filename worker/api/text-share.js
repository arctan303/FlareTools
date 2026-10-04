// Room state lives exclusively in SQLite-backed Durable Objects.
import { RESPONSE_CODES as RC } from '../text-share/responseCodes.js';
export { MAX_TEXT_LENGTH } from '../text-share/room.js';

const BODY_LIMIT = 128 * 1024;
const METHODS = { create_room: 'POST', join_room: 'POST', update_text: 'POST', leave_room: 'POST', destroy_room: 'POST', get_room_status: 'GET', connect: 'GET' };
const recentRequests = new Map();

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function readBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > BODY_LIMIT) { await reader.cancel(); throw new Error('size'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body');
  return body;
}

async function ipKey(ip) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(token, secret, ip) {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(5000),
    });
    return response.ok && (await response.json()).success === true;
  } catch { return false; }
}

function randomRoomCode() {
  const values = new Uint32Array(1);
  do { crypto.getRandomValues(values); } while (values[0] >= 4294800000);
  return String(100000 + values[0] % 900000);
}

export async function onRequest({ request, env, params }) {
  const action = params.action?.length === 1 ? params.action[0] : '';
  if (!Object.hasOwn(METHODS, action)) return json({ success: false, code: RC.UNKNOWN_ACTION }, 400);
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin && origin !== env.ALLOWED_ORIGIN) return json({ success: false, code: RC.FORBIDDEN }, 403);
  if (request.method !== METHODS[action]) return json({ success: false, code: RC.METHOD_NOT_ALLOWED }, 405);
  if (!env.TEXT_ROOMS || !env.TEXT_QUOTAS) return json({ success: false, code: RC.SERVICE_UNAVAILABLE }, 503);

  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now();
  if (recentRequests.size > 1000) for (const [key, entry] of recentRequests) if (entry.until <= now) recentRequests.delete(key);
  const entry = recentRequests.get(ip);
  const counter = !entry || entry.until <= now ? { count: 0, until: now + 10000 } : entry;
  counter.count += 1;
  recentRequests.set(ip, counter);
  if (counter.count > 30) return json({ success: false, code: RC.RATE_LIMITED }, 429);

  try {
    const body = request.method === 'POST' ? await readBody(request) : Object.fromEntries(url.searchParams);
    if (action === 'create_room') {
      const enabled = env.ENABLE_TURNSTILE !== 'false' && Boolean(env.TURNSTILE_SECRET_KEY);
      const token = body['cf-turnstile-response'];
      const verified = enabled && token ? await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, ip) : false;
      if (enabled && token && !verified) return json({ success: false, code: RC.CAPTCHA_FAILED }, 400);
      const quota = env.TEXT_QUOTAS.get(env.TEXT_QUOTAS.idFromName(await ipKey(ip)));
      const quotaResponse = await quota.fetch(new Request('https://quota.internal/create', { method: 'POST', body: JSON.stringify({ verified, turnstile_enabled: enabled }) }));
      if (!quotaResponse.ok) return quotaResponse;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = randomRoomCode();
        const stub = env.TEXT_ROOMS.get(env.TEXT_ROOMS.idFromName(code));
        const response = await stub.fetch(new Request('https://room.internal/create_room', { method: 'POST', body: JSON.stringify({ room_code: code }) }));
        if (response.status !== 409) return response;
      }
      return json({ success: false, code: RC.ROOM_CODE_GENERATION_FAILED }, 503);
    }

    if (typeof body.room_code !== 'string' || !/^\d{6}$/.test(body.room_code)) return json({ success: false, code: RC.INVALID_ROOM_CODE }, 400);
    if (body.device_id !== undefined && (typeof body.device_id !== 'string' || body.device_id.length > 64)) return json({ success: false, code: RC.MISSING_PARAMETERS }, 400);
    const stub = env.TEXT_ROOMS.get(env.TEXT_ROOMS.idFromName(body.room_code));
    if (request.method === 'POST') return await stub.fetch(new Request(`https://room.internal/${action}`, { method: 'POST', body: JSON.stringify(body) }));
    const forwarded = new URL(`https://room.internal/${action}`);
    forwarded.search = url.search;
    return await stub.fetch(new Request(forwarded, request));
  } catch (error) {
    if (error.message === 'size') return json({ success: false, code: RC.TEXT_TOO_LONG }, 413);
    if (error.message === 'body' || error instanceof SyntaxError) return json({ success: false, code: RC.MISSING_PARAMETERS }, 400);
    console.error('Text share gateway failed', error);
    return json({ success: false, code: RC.INTERNAL_ERROR }, 500);
  }
}
