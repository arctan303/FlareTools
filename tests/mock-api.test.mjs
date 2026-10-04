import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../worker/api/mock.js';
import { MAX_MOCK_BYTES, MAX_MOCK_REQUEST_BYTES, mockCurlExample, mockDeleteCurlExample, validateMockInput } from '../src/utils/mockApiTools.js';
import { MOCK_TRANSLATIONS } from '../src/locales/mockTranslations.js';

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE rooms_kv (key TEXT PRIMARY KEY, data TEXT, expires_at INTEGER); CREATE INDEX idx_expires_at ON rooms_kv(expires_at);');
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            all: async () => ({ results: statement.all(...args) }),
            run: async () => ({ success: true, meta: { changes: Number(statement.run(...args).changes) } }),
          };
        },
      };
    },
  };
}

async function callApi(action, { body, db, method = 'GET', headers = {}, rawBody } = {}) {
  const request = new Request(`https://example.com/api/mock/${action}`, {
    method,
    headers: { ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}), 'CF-Connecting-IP': '203.0.113.7', ...headers },
    body: body !== undefined ? JSON.stringify(body) : rawBody,
  });
  const response = await onRequest({ request, env: db ? { DB: db } : {}, params: { action: action.split('/') } });
  const text = await response.text();
  return { response, text, payload: text ? JSON.parse(text) : null };
}

async function publish(db, overrides = {}) {
  return callApi('create', { db, method: 'POST', body: { json: '{"message":"test","items":[1,2]}', status: 200, ttl_hours: 1, ...overrides } });
}

test('mock API publishes the exact JSON/status and keeps management secrets private', async (t) => {
  const db = createDatabase();
  t.after(() => db.sqlite.close());
  const result = await publish(db, { json: '{"message":"unauthorized"}', status: 401, ttl_hours: 6 });
  assert.equal(result.response.status, 201);
  assert.equal(result.payload.success, true);
  assert.match(result.payload.id, /^[a-f0-9]{32}$/);
  assert.match(result.payload.management_token, /^[a-f0-9]{64}$/);
  assert.equal(result.payload.url, `https://example.com/api/mock/${result.payload.id}`);
  assert.ok(Math.abs(result.payload.expires_at - (Math.floor(Date.now() / 1000) + 21600)) < 2);

  const stored = db.sqlite.prepare('SELECT data FROM rooms_kv WHERE key = ?').get(`mock:${result.payload.id}`).data;
  assert.ok(JSON.parse(stored).token_hash);
  assert.ok(!stored.includes(result.payload.management_token));
  const read = await callApi(result.payload.id, { db });
  assert.equal(read.response.status, 401);
  assert.deepEqual(read.payload, { message: 'unauthorized' });
  assert.equal(read.response.headers.get('Cache-Control'), 'no-store');
  assert.equal(read.response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(read.response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(!read.text.includes(result.payload.management_token));
  assert.ok(!read.text.includes(JSON.parse(stored).token_hash));

  const head = await callApi(result.payload.id, { db, method: 'HEAD' });
  assert.equal(head.response.status, 401);
  assert.equal(head.text, '');
});

test('mock API only permits deletion with the correct management token', async (t) => {
  const db = createDatabase();
  t.after(() => db.sqlite.close());
  const { payload: created } = await publish(db);
  const noToken = await callApi(created.id, { db, method: 'DELETE' });
  assert.equal(noToken.response.status, 403);
  const wrong = await callApi(created.id, { db, method: 'DELETE', headers: { Authorization: `Bearer ${'0'.repeat(64)}` } });
  assert.equal(wrong.response.status, 403);
  assert.equal((await callApi(created.id, { db })).response.status, 200);
  const deleted = await callApi(created.id, { db, method: 'DELETE', headers: { Authorization: `Bearer ${created.management_token}` } });
  assert.equal(deleted.response.status, 200);
  assert.deepEqual(deleted.payload, { success: true });
  assert.equal((await callApi(created.id, { db })).response.status, 404);
});

test('mock expiry is fixed and expired records cannot be read or deleted', async (t) => {
  const db = createDatabase();
  t.after(() => db.sqlite.close());
  const { payload: created } = await publish(db, { ttl_hours: 24 });
  await callApi(created.id, { db });
  const row = db.sqlite.prepare('SELECT expires_at FROM rooms_kv WHERE key = ?').get(`mock:${created.id}`);
  assert.equal(row.expires_at, created.expires_at);
  db.sqlite.prepare('UPDATE rooms_kv SET expires_at = ? WHERE key = ?').run(Math.floor(Date.now() / 1000), `mock:${created.id}`);
  const expired = await callApi(created.id, { db });
  assert.equal(expired.response.status, 404);
  assert.equal(expired.payload.code, 'NOT_FOUND');
  assert.equal(expired.response.headers.get('Access-Control-Allow-Origin'), '*');
  const headExpired = await callApi(created.id, { db, method: 'HEAD' });
  assert.equal(headExpired.response.status, 404);
  assert.equal(headExpired.response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(headExpired.text, '');
  const deleteExpired = await callApi(created.id, { db, method: 'DELETE', headers: { Authorization: `Bearer ${created.management_token}` } });
  assert.equal(deleteExpired.response.status, 404);
});

test('public Mock reads retain CORS for missing records and unavailable storage without opening management CORS', async (t) => {
  const db = createDatabase();
  t.after(() => db.sqlite.close());
  const id = 'a'.repeat(32);
  const brokenDb = { prepare() { throw new Error('private storage detail'); } };
  for (const method of ['GET', 'HEAD']) {
    for (const [storage, expectedStatus, code] of [
      [db, 404, 'NOT_FOUND'],
      [undefined, 503, 'STORAGE_UNAVAILABLE'],
      [brokenDb, 503, 'SERVICE_UNAVAILABLE'],
    ]) {
      const result = await callApi(id, { db: storage, method, headers: { Origin: 'https://foreign.example' } });
      assert.equal(result.response.status, expectedStatus);
      assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
      assert.equal(result.response.headers.get('X-Content-Type-Options'), 'nosniff');
      if (method === 'HEAD') assert.equal(result.text, '');
      else assert.deepEqual(result.payload, { success: false, code });
      assert.ok(!result.text.includes('private storage detail'));
    }
  }
  const created = await publish(db);
  assert.equal(created.response.headers.get('Access-Control-Allow-Origin'), null);
  const forbidden = await callApi(created.payload.id, { db, method: 'DELETE', headers: { Origin: 'https://foreign.example', Authorization: 'Bearer ' + created.payload.management_token } });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.response.headers.get('Access-Control-Allow-Origin'), null);
  const wrongToken = await callApi(created.payload.id, { db, method: 'DELETE' });
  assert.equal(wrongToken.response.headers.get('Access-Control-Allow-Origin'), null);
  const deleted = await callApi(created.payload.id, { db, method: 'DELETE', headers: { Authorization: 'Bearer ' + created.payload.management_token } });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.response.headers.get('Access-Control-Allow-Origin'), null);
});

test('mock API rejects malformed configuration and enforces both byte limits', async (t) => {
  const db = createDatabase();
  t.after(() => db.sqlite.close());
  for (const [body, code] of [
    [{ json: '{broken}' }, 'INVALID_JSON'],
    [{ json: { nested: true } }, 'INVALID_JSON'],
    [{ status: 204 }, 'INVALID_STATUS'],
    [{ status: '200' }, 'INVALID_STATUS'],
    [{ ttl_hours: 48 }, 'INVALID_EXPIRY'],
    [{ ttl_hours: '1' }, 'INVALID_EXPIRY'],
  ]) {
    const result = await publish(db, body);
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, code);
  }
  const unicodeTooLarge = await publish(db, { json: JSON.stringify('中'.repeat(MAX_MOCK_BYTES / 2)) });
  assert.equal(unicodeTooLarge.response.status, 413);
  assert.equal(unicodeTooLarge.payload.code, 'PAYLOAD_TOO_LARGE');
  const requestTooLarge = await callApi('create', { db, method: 'POST', rawBody: ' '.repeat(MAX_MOCK_REQUEST_BYTES + 1) });
  assert.equal(requestTooLarge.response.status, 413);
  const declaredTooLarge = await callApi('create', { db, method: 'POST', body: {}, headers: { 'Content-Length': String(MAX_MOCK_REQUEST_BYTES + 1) } });
  assert.equal(declaredTooLarge.response.status, 413);
  assert.equal((await callApi('create', { db, method: 'POST', rawBody: '[]' })).payload.code, 'INVALID_REQUEST');
  assert.equal((await callApi('create', { db, method: 'POST', rawBody: '{' })).payload.code, 'INVALID_REQUEST');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM rooms_kv WHERE key LIKE 'mock-rate:%'").get().count, 0);
});

test('atomic mock quota permits twenty concurrent publications per IP, resets after expiry and does not store raw IPs', async (t) => {
  const db = createDatabase();
  t.after(() => db.sqlite.close());
  const results = await Promise.all(Array.from({ length: 21 }, () => publish(db)));
  assert.equal(results.filter((item) => item.response.status === 201).length, 20);
  const blocked = results.find((item) => item.response.status === 429);
  assert.equal(blocked.payload.code, 'RATE_LIMITED');
  assert.ok(Number(blocked.response.headers.get('Retry-After')) > 0);
  const quotaRow = db.sqlite.prepare("SELECT key, data, expires_at FROM rooms_kv WHERE key LIKE 'mock-rate:%'").get();
  assert.equal(JSON.parse(quotaRow.data).count, 20);
  assert.ok(!JSON.stringify(quotaRow).includes('203.0.113.7'));
  assert.equal(new Set(results.filter((item) => item.payload.id).map((item) => item.payload.id)).size, 20);
  const get = await callApi(results[0].payload.id, { db });
  assert.equal(get.response.status, 200);
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT data FROM rooms_kv WHERE key = ?').get(quotaRow.key).data).count, 20);
  db.sqlite.prepare('UPDATE rooms_kv SET expires_at = ? WHERE key = ?').run(Math.floor(Date.now() / 1000) - 1, quotaRow.key);
  assert.equal((await publish(db)).response.status, 201);
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT data FROM rooms_kv WHERE key = ?').get(quotaRow.key).data).count, 1);
});

test('mock API has safe route/method/origin handling and a friendly unconfigured response', async (t) => {
  const db = createDatabase();
  t.after(() => db.sqlite.close());
  assert.equal((await callApi('not-an-id', { db })).response.status, 404);
  assert.equal((await callApi(`x/${'a'.repeat(32)}`, { db })).response.status, 404);
  assert.equal((await callApi('create', { db })).response.status, 405);
  assert.equal((await callApi('create', { db, method: 'POST', body: {}, headers: { Origin: 'https://foreign.example' } })).response.status, 403);
  const noDb = await callApi('create', { method: 'POST', body: {} });
  assert.equal(noDb.response.status, 503);
  assert.equal(noDb.payload.code, 'STORAGE_UNAVAILABLE');
  const wrongType = await callApi('create', { db, method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } });
  assert.equal(wrongType.response.status, 415);
  const { payload: created } = await publish(db);
  const cors = await callApi(created.id, { db, method: 'OPTIONS' });
  assert.equal(cors.response.status, 204);
  assert.equal(cors.response.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, OPTIONS');
  const crossDelete = await callApi(created.id, { db, method: 'DELETE', headers: { Origin: 'https://foreign.example', Authorization: `Bearer ${created.management_token}` } });
  assert.equal(crossDelete.response.status, 403);
});

test('mock local validation supports JSON primitives and shell examples quote data', () => {
  for (const input of ['null', 'true', '5', '"hello"', '[]', '{}']) assert.ok(!validateMockInput(input).error);
  assert.equal(validateMockInput(' ').error, 'INVALID_JSON');
  assert.equal(mockCurlExample('https://example.com/api/mock/test'), "curl -i 'https://example.com/api/mock/test'");
  assert.equal(mockDeleteCurlExample('https://example.com/a', 'token'), "curl -X DELETE 'https://example.com/a' -H 'Authorization: Bearer token'");
  assert.match(mockCurlExample("https://example.com/a'b"), /a'\\''b/);
  assert.deepEqual(Object.keys(MOCK_TRANSLATIONS.en).sort(), Object.keys(MOCK_TRANSLATIONS['zh-CN']).sort());
});
