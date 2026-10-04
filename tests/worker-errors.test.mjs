import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ERROR_RESPONSE_CODES, RESPONSE_CODES as RC } from '../worker/text-share/responseCodes.js';
import { MAX_TEXT_LENGTH, ROOM_TTL_SECONDS, TextQuotaHandler, TextRoomHandler } from '../worker/text-share/room.js';
import { onRequest } from '../worker/api/text-share.js';

function context(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const ctx = { sqlite, sockets: [], alarms: [], alarmDeleted: false, storageDeleted: 0, writes: [] };
  ctx.storage = {
    sql: { exec(sql, ...args) {
      const statement = sqlite.prepare(sql);
      if (/^\s*SELECT\b/i.test(sql)) return { toArray: () => statement.all(...args) };
      ctx.writes.push(sql);
      statement.run(...args);
      return { toArray: () => [] };
    } },
    setAlarm: async (timestamp) => { ctx.alarms.push(timestamp); },
    deleteAlarm: async () => { ctx.alarmDeleted = true; },
    // Model SQLite deleteAll(), which drops user tables rather than only rows,
    // and also deletes alarms with the Worker's current compatibility date.
    deleteAll: async () => {
      for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
        sqlite.exec('DROP TABLE "' + name.replaceAll('"', '""') + '"');
      }
      ctx.storageDeleted += 1;
      ctx.alarmDeleted = true;
    },
  };
  ctx.getWebSockets = () => ctx.sockets.filter((socket) => !socket.closed);
  ctx.acceptWebSocket = (socket) => ctx.sockets.push(socket);
  return ctx;
}

function tables(ctx) {
  return ctx.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((item) => item.name);
}

function socket(ctx, deviceId, brokenClose = false) {
  const peer = {
    messages: [], closed: false, attachment: { deviceId },
    deserializeAttachment() { return this.attachment; },
    serializeAttachment(value) { this.attachment = value; },
    send(message) { this.messages.push(JSON.parse(message)); },
    close(code, reason) { if (brokenClose) throw new Error('closed'); this.closed = true; this.closeCode = code; this.closeReason = reason; },
  };
  ctx.acceptWebSocket(peer);
  return peer;
}

async function callRoom(handler, action, body = {}, method = 'POST') {
  const url = new URL('https://room.internal/' + action);
  if (method === 'GET') for (const [key, value] of Object.entries(body)) url.searchParams.set(key, value);
  const response = await handler.fetch(new Request(url, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  return { response, payload: await response.json() };
}

async function room(handler, options = {}) {
  const created = await callRoom(handler, 'create_room', { room_code: '123456' });
  assert.equal(created.payload.code, RC.ROOM_CREATED);
  const joined = await callRoom(handler, 'join_room', options);
  assert.equal(joined.payload.code, RC.ROOM_JOINED);
  return { created: created.payload, joined: joined.payload };
}

let gatewaySequence = 0;
async function gateway(action, { body, rawBody, env = {}, method = 'GET', headers = {}, query = '' } = {}) {
  gatewaySequence += 1;
  const request = new Request('https://example.com/api/text-share/' + action + (query ? '?' + query : ''), {
    method,
    headers: { 'CF-Connecting-IP': '198.51.100.' + gatewaySequence, ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : rawBody,
  });
  const response = await onRequest({ request, env, params: { action: action.split('/') } });
  return { response, payload: await response.json() };
}

function namespaces(t) {
  const rooms = new Map();
  const quotas = new Map();
  function namespace(map, Handler) {
    return { idFromName: (name) => name, get(name) {
      if (!map.has(name)) map.set(name, new Handler(context(t)));
      return { fetch: (request) => map.get(name).fetch(request) };
    } };
  }
  return { TEXT_ROOMS: namespace(rooms, TextRoomHandler), TEXT_QUOTAS: namespace(quotas, TextQuotaHandler), rooms, quotas };
}

test('Worker codes remain unique and declare all errors', () => {
  const codes = Object.values(RC);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of ERROR_RESPONSE_CODES) assert.ok(codes.includes(code));
});

test('DO nonexistent room queries stay read-only and competing first creates claim one room', async (t) => {
  const ctx = context(t);
  const handler = new TextRoomHandler(ctx);
  assert.deepEqual(tables(ctx), []);
  for (const action of ['join_room', 'get_room_status', 'destroy_room']) {
    assert.equal((await callRoom(handler, action, { device_id: 'unknown' })).response.status, 404);
  }
  await handler.alarm();
  assert.deepEqual(tables(ctx), []);
  assert.deepEqual(ctx.writes, []);
  assert.deepEqual(ctx.alarms, []);
  assert.equal(ctx.storageDeleted, 0);
  const created = await Promise.all([0, 1].map(() => callRoom(handler, 'create_room', { room_code: '123456' })));
  assert.deepEqual(created.map((result) => result.response.status).sort(), [200, 409]);
  assert.deepEqual(tables(ctx), ['room']);
});

test('DO missing-room access reclaims an empty database left by an older constructor', async (t) => {
  const ctx = context(t);
  ctx.sqlite.exec('CREATE TABLE room (id INTEGER PRIMARY KEY, data TEXT, expires_at INTEGER)');
  const handler = new TextRoomHandler(ctx);
  assert.equal((await callRoom(handler, 'get_room_status', {}, 'GET')).response.status, 404);
  assert.deepEqual(tables(ctx), []);
  assert.equal(ctx.storageDeleted, 1);
});

test('DO join issues unpredictable private credentials and public labels cannot impersonate members', async (t) => {
  const handler = new TextRoomHandler(context(t));
  const { joined } = await room(handler, { device_id: 'attacker-chosen-id' });
  assert.match(joined.device_id, /^[a-f0-9-]{36}$/);
  assert.match(joined.public_device_id, /^[a-f0-9-]{36}$/);
  assert.notEqual(joined.device_id, 'attacker-chosen-id');
  assert.notEqual(joined.device_id, joined.public_device_id);
  assert.ok(joined.devices[joined.public_device_id]);
  assert.ok(!Object.hasOwn(joined.devices, joined.device_id));
  const resumed = await callRoom(handler, 'join_room', { device_id: joined.device_id });
  assert.equal(resumed.payload.device_id, joined.device_id);
  assert.equal(Object.keys(resumed.payload.devices).length, 1);
  const impostor = await callRoom(handler, 'join_room', { device_id: joined.public_device_id });
  assert.notEqual(impostor.payload.device_id, joined.device_id);
  assert.notEqual(impostor.payload.public_device_id, joined.public_device_id);
  const denied = await callRoom(handler, 'update_text', { device_id: joined.public_device_id, text_content: 'impersonation', base_version: 0 });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.payload.code, RC.DEVICE_NOT_IN_ROOM);
});

test('DO membership caps at ten and leaving releases a slot', async (t) => {
  const handler = new TextRoomHandler(context(t));
  const { joined } = await room(handler);
  for (let index = 1; index < 10; index += 1) assert.equal((await callRoom(handler, 'join_room')).payload.code, RC.ROOM_JOINED);
  assert.equal((await callRoom(handler, 'join_room')).payload.code, RC.ROOM_FULL);
  assert.equal(Object.keys(handler.read().devices).length, 10);
  assert.equal((await callRoom(handler, 'join_room', { device_id: joined.device_id })).payload.code, RC.ROOM_JOINED);
  assert.equal((await callRoom(handler, 'leave_room', { device_id: joined.device_id })).payload.code, RC.ROOM_LEFT);
  assert.equal((await callRoom(handler, 'get_room_status', { device_id: joined.device_id }, 'GET')).response.status, 403);
  assert.equal((await callRoom(handler, 'join_room')).payload.code, RC.ROOM_JOINED);
});

test('DO expiry is fixed for 24 hours and reads, joins and saves cannot renew it', async (t) => {
  const ctx = context(t);
  const handler = new TextRoomHandler(ctx);
  const before = Date.now();
  const { created, joined } = await room(handler);
  const expiresAt = handler.read().expires_at;
  assert.ok(expiresAt >= before + ROOM_TTL_SECONDS * 1000 && expiresAt <= Date.now() + ROOM_TTL_SECONDS * 1000);
  assert.equal(created.expires_at, Math.floor(expiresAt / 1000));
  await callRoom(handler, 'join_room');
  await callRoom(handler, 'get_room_status', { device_id: joined.device_id }, 'GET');
  await callRoom(handler, 'update_text', { device_id: joined.device_id, text_content: 'saved', base_version: 0 });
  assert.equal(handler.read().expires_at, expiresAt);
  assert.deepEqual(ctx.alarms, [expiresAt]);
  assert.equal((await callRoom(handler, 'create_room', { room_code: '123456' })).response.status, 409);
  assert.equal(handler.read().text_content, 'saved');
});

test('DO concurrent saves based on one revision commit exactly one edit', async (t) => {
  const handler = new TextRoomHandler(context(t));
  const { joined } = await room(handler);
  const save = (text) => callRoom(handler, 'update_text', { device_id: joined.device_id, text_content: text, base_version: 0 });
  const results = await Promise.all([save('first'), save('second')]);
  assert.deepEqual(results.map((item) => item.response.status).sort(), [200, 409]);
  const winner = results.find((item) => item.payload.success);
  const loser = results.find((item) => !item.payload.success);
  assert.equal(winner.payload.version, 1);
  assert.equal(winner.payload.content_updated_by, joined.public_device_id);
  assert.equal(loser.payload.code, RC.VERSION_CONFLICT);
  assert.equal(loser.payload.current_version, 1);
  assert.equal(loser.payload.text_content, handler.read().text_content);
  assert.equal(handler.read().version, 1);
  assert.equal((await callRoom(handler, 'update_text', { device_id: joined.device_id, text_content: 'no revision' })).payload.code, RC.MISSING_PARAMETERS);
  assert.equal((await callRoom(handler, 'update_text', { device_id: joined.device_id, text_content: 'x'.repeat(MAX_TEXT_LENGTH + 1), base_version: 1 })).payload.code, RC.TEXT_TOO_LONG);
});

test('DO broadcasts only metadata, without text or private membership credentials', async (t) => {
  const ctx = context(t);
  const handler = new TextRoomHandler(ctx);
  const { joined } = await room(handler);
  const peer = socket(ctx, joined.device_id);
  await callRoom(handler, 'join_room');
  await callRoom(handler, 'update_text', { device_id: joined.device_id, text_content: 'SECRET-ROOM-TEXT', base_version: 0 });
  assert.ok(peer.messages.some((item) => item.type === 'devices'));
  assert.ok(peer.messages.some((item) => item.type === 'version'));
  const serialized = JSON.stringify(peer.messages);
  assert.ok(!serialized.includes('SECRET-ROOM-TEXT'));
  assert.ok(!serialized.includes(joined.device_id));
  assert.ok(serialized.includes(joined.public_device_id));
  assert.equal(peer.messages.at(-1).devices[joined.public_device_id].connected, true);
  handler.webSocketMessage(peer, 'forbidden data');
  assert.equal(peer.closeCode, 1008);
});

test('DO reconstruction restores persisted state and safely migrates legacy public metadata', async (t) => {
  const ctx = context(t);
  const handler = new TextRoomHandler(ctx);
  const { joined } = await room(handler);
  await callRoom(handler, 'update_text', { device_id: joined.device_id, text_content: 'persisted', base_version: 0 });
  const restored = new TextRoomHandler(ctx);
  const result = await callRoom(restored, 'get_room_status', { device_id: joined.device_id }, 'GET');
  assert.equal(result.payload.text_content, 'persisted');
  assert.equal(result.payload.version, 1);
  const legacy = restored.read();
  delete legacy.devices[joined.device_id].public_id;
  legacy.content_updated_by = joined.device_id;
  restored.write(legacy);
  const migrated = new TextRoomHandler(ctx);
  const status = await callRoom(migrated, 'get_room_status', { device_id: joined.device_id }, 'GET');
  assert.ok(!JSON.stringify(status.payload).includes(joined.device_id));
  assert.ok(status.payload.devices[status.payload.content_updated_by]);
});

test('DO expiry clears the whole database on access or alarm and closes peers despite one broken socket', async (t) => {
  const ctx = context(t);
  const handler = new TextRoomHandler(ctx);
  const { joined } = await room(handler);
  socket(ctx, 'broken-peer', true);
  const peer = socket(ctx, joined.device_id);
  ctx.sqlite.prepare('UPDATE room SET expires_at = ? WHERE id = 1').run(Date.now() - 1);
  const missing = await callRoom(handler, 'get_room_status', { device_id: joined.device_id }, 'GET');
  assert.equal(missing.response.status, 404);
  assert.equal(missing.payload.code, RC.ROOM_NOT_FOUND);
  assert.deepEqual(tables(ctx), []);
  assert.equal(ctx.storageDeleted, 1);
  await handler.alarm();
  assert.equal(ctx.storageDeleted, 1);
  assert.equal(peer.closeCode, 4001);
  assert.deepEqual(peer.messages.at(-1), { type: 'room_closed', reason: 'expired' });
  // The same in-memory handler must recreate schema after deleteAll(), and an
  // alarm with no intervening API read must release that new database as well.
  const recreated = await room(handler);
  const nextPeer = socket(ctx, recreated.joined.device_id);
  ctx.sqlite.prepare('UPDATE room SET expires_at = ? WHERE id = 1').run(Date.now() - 1);
  await handler.alarm();
  assert.deepEqual(tables(ctx), []);
  assert.equal(ctx.storageDeleted, 2);
  assert.equal(nextPeer.closeCode, 4001);
  assert.deepEqual(nextPeer.messages.at(-1), { type: 'room_closed', reason: 'expired' });
});

test('DO early alarms reschedule expiry and only private membership credentials permit destruction', async (t) => {
  const ctx = context(t);
  const handler = new TextRoomHandler(ctx);
  const { joined } = await room(handler);
  await handler.alarm();
  assert.equal(ctx.alarms.at(-1), handler.read().expires_at);
  assert.equal((await callRoom(handler, 'destroy_room', { device_id: 'SYSTEM_KEEPER' })).response.status, 403);
  assert.equal((await callRoom(handler, 'destroy_room', { device_id: joined.public_device_id })).response.status, 403);
  const peer = socket(ctx, joined.device_id);
  assert.equal((await callRoom(handler, 'destroy_room', { device_id: joined.device_id })).payload.code, RC.ROOM_DESTROYED);
  assert.equal(handler.read(), null);
  assert.equal(ctx.alarmDeleted, true);
  assert.equal(ctx.storageDeleted, 1);
  assert.deepEqual(tables(ctx), []);
  assert.equal(peer.closed, true);
  const recreated = await room(handler);
  assert.notEqual(recreated.joined.device_id, joined.device_id);
  assert.equal((await callRoom(handler, 'get_room_status', { device_id: joined.device_id }, 'GET')).response.status, 403);
});

async function quota(handler, body) {
  const response = await handler.fetch(new Request('https://quota.internal/create', { method: 'POST', body: JSON.stringify(body) }));
  return { response, payload: await response.json() };
}

test('DO quota requires captcha after two creations and caps verified requests at twenty per UTC day', async (t) => {
  const ctx = context(t);
  const handler = new TextQuotaHandler(ctx);
  for (let index = 0; index < 2; index += 1) assert.equal((await quota(handler, { turnstile_enabled: true, verified: false })).response.status, 200);
  const captcha = await quota(handler, { turnstile_enabled: true, verified: false });
  assert.equal(captcha.response.status, 403);
  assert.equal(captcha.payload.code, RC.CAPTCHA_REQUIRED);
  assert.equal(captcha.payload.require_captcha, true);
  assert.equal(ctx.sqlite.prepare('SELECT count FROM quota').get().count, 2);
  const restored = new TextQuotaHandler(ctx);
  for (let index = 2; index < 20; index += 1) assert.equal((await quota(restored, { turnstile_enabled: true, verified: true })).response.status, 200);
  assert.equal((await quota(restored, { turnstile_enabled: true, verified: true })).payload.code, RC.RATE_LIMITED);
  assert.equal(ctx.sqlite.prepare('SELECT count FROM quota').get().count, 20);
});

test('DO quota serializes concurrent creations and resets stale days on the next request or alarm', async (t) => {
  const ctx = context(t);
  const handler = new TextQuotaHandler(ctx);
  const results = await Promise.all(Array.from({ length: 21 }, () => quota(handler, { turnstile_enabled: false, verified: false })));
  assert.equal(results.filter((item) => item.response.status === 200).length, 20);
  assert.equal(results.filter((item) => item.response.status === 429).length, 1);
  ctx.sqlite.prepare("UPDATE quota SET day = '2000-01-01'").run();
  assert.equal((await quota(handler, { turnstile_enabled: false })).response.status, 200);
  assert.equal(ctx.sqlite.prepare('SELECT count FROM quota').get().count, 1);
  ctx.sqlite.prepare("UPDATE quota SET day = '2000-01-01'").run();
  await handler.alarm();
  assert.deepEqual(tables(ctx), []);
  assert.equal(ctx.storageDeleted, 1);
  assert.equal(ctx.alarmDeleted, true);
  assert.equal((await quota(handler, { turnstile_enabled: false })).response.status, 200);
  assert.equal(ctx.sqlite.prepare('SELECT count FROM quota').get().count, 1);
});

test('gateway validates actions, methods, origin, content type, body formats, byte limits and bindings', async (t) => {
  const env = namespaces(t);
  assert.equal((await gateway('future_action')).payload.code, RC.UNKNOWN_ACTION);
  assert.equal((await gateway('join_room/extra', { env, method: 'POST', body: {} })).payload.code, RC.UNKNOWN_ACTION);
  assert.equal((await gateway('join_room')).response.status, 405);
  assert.equal((await gateway('join_room', { method: 'POST', body: {} })).response.status, 503);
  assert.equal((await gateway('join_room', { env, method: 'POST', body: {}, headers: { Origin: 'https://foreign.example' } })).response.status, 403);
  for (const rawBody of ['{', '[]', 'null', '1']) assert.equal((await gateway('join_room', { env, method: 'POST', rawBody })).payload.code, RC.MISSING_PARAMETERS);
  assert.equal((await gateway('create_room', { env, method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } })).payload.code, RC.MISSING_PARAMETERS);
  assert.equal((await gateway('create_room', { env, method: 'POST', body: {}, headers: { 'Content-Type': 'application/json-malicious' } })).payload.code, RC.MISSING_PARAMETERS);
  assert.equal((await gateway('join_room', { env, method: 'POST', body: { room_code: '1' } })).payload.code, RC.INVALID_ROOM_CODE);
  assert.equal((await gateway('join_room', { env, method: 'POST', body: { room_code: '123456', device_id: 'x'.repeat(65) } })).payload.code, RC.MISSING_PARAMETERS);
  const oversized = await gateway('update_text', { env, method: 'POST', rawBody: ' '.repeat(128 * 1024 + 1) });
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.payload.code, RC.TEXT_TOO_LONG);
});

test('gateway delegates the complete authenticated lifecycle to durable room state', async (t) => {
  const env = namespaces(t);
  const created = await gateway('create_room', { env, method: 'POST', body: {} });
  assert.equal(created.payload.code, RC.ROOM_CREATED);
  assert.match(created.payload.room_code, /^\d{6}$/);
  const roomCode = created.payload.room_code;
  const joined = await gateway('join_room', { env, method: 'POST', body: { room_code: roomCode, device_id: 'client-id' } });
  const deviceId = joined.payload.device_id;
  assert.notEqual(deviceId, 'client-id');
  assert.equal((await gateway('update_text', { env, method: 'POST', body: { room_code: roomCode, device_id: deviceId, text_content: 'saved', base_version: 0 } })).payload.code, RC.TEXT_UPDATED);
  assert.equal((await gateway('get_room_status', { env, query: 'room_code=' + roomCode + '&device_id=' + deviceId })).payload.text_content, 'saved');
  assert.equal((await gateway('destroy_room', { env, method: 'POST', body: { room_code: roomCode, device_id: deviceId } })).payload.code, RC.ROOM_DESTROYED);
  assert.equal((await gateway('join_room', { env, method: 'POST', body: { room_code: roomCode } })).response.status, 404);
});

test('gateway retries collisions and fails cleanly when all ten random codes are occupied', async () => {
  const attempts = [];
  let collisionCount = 2;
  const env = {
    TEXT_QUOTAS: { idFromName: (id) => id, get: () => ({ fetch: async () => Response.json({ success: true, code: RC.OK }) }) },
    TEXT_ROOMS: { idFromName: (code) => code, get: (code) => ({ fetch: async () => {
      attempts.push(code);
      if (collisionCount > 0) { collisionCount -= 1; return Response.json({ success: false, code: RC.ROOM_BUSY }, { status: 409 }); }
      return Response.json({ success: true, code: RC.ROOM_CREATED, room_code: code });
    } }) },
  };
  assert.equal((await gateway('create_room', { env, method: 'POST', body: {} })).payload.code, RC.ROOM_CREATED);
  assert.equal(attempts.length, 3);
  for (const code of attempts) assert.match(code, /^\d{6}$/);
  attempts.length = 0;
  collisionCount = 20;
  const exhausted = await gateway('create_room', { env, method: 'POST', body: {} });
  assert.equal(exhausted.response.status, 503);
  assert.equal(exhausted.payload.code, RC.ROOM_CODE_GENERATION_FAILED);
  assert.equal(attempts.length, 10);
});

test('gateway only accepts successful Turnstile verification above the durable captcha threshold', async (t) => {
  const env = { ...namespaces(t), TURNSTILE_SECRET_KEY: 'test-secret' };
  const headers = { 'CF-Connecting-IP': '203.0.113.88' };
  for (let index = 0; index < 2; index += 1) assert.equal((await gateway('create_room', { env, method: 'POST', body: {}, headers })).payload.code, RC.ROOM_CREATED);
  assert.equal((await gateway('create_room', { env, method: 'POST', body: {}, headers })).payload.code, RC.CAPTCHA_REQUIRED);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ success: false });
  assert.equal((await gateway('create_room', { env, method: 'POST', body: { 'cf-turnstile-response': 'invalid' }, headers })).payload.code, RC.CAPTCHA_FAILED);
  globalThis.fetch = async () => Response.json({ success: true });
  assert.equal((await gateway('create_room', { env, method: 'POST', body: { 'cf-turnstile-response': 'solved' }, headers })).payload.code, RC.ROOM_CREATED);
});
