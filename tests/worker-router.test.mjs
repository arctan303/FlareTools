import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import toml from '@iarna/toml';
import worker from '../worker/router.js';

const ctx = { waitUntil() {} };

test('unknown API paths return JSON 404 even for browser navigation and never fall through to SPA assets', async () => {
  let assetRequests = 0;
  const env = { ASSETS: { fetch() { assetRequests += 1; return new Response('<html>SPA</html>'); } } };
  for (const path of ['/api', '/api/', '/api/unknown', '/api/network/extra', '/api/mock/create/extra', '/api/text-share/connect/extra']) {
    const response = await worker.fetch(new Request(`https://tools.arcinks.com${path}`, { headers: { 'sec-fetch-mode': 'navigate' } }), env, ctx);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { success: false, code: 'UNKNOWN_ACTION' });
  }
  assert.equal(assetRequests, 0);
});

test('network identity routing preserves the original Cloudflare request metadata', async () => {
  const request = new Request('https://tools.arcinks.com/api/network?action=identity', { headers: { 'cf-connecting-ip': '1.1.1.1' } });
  Object.defineProperty(request, 'cf', { value: { asn: 13335, asOrganization: 'Cloudflare', country: 'SG', colo: 'SIN' } });
  const response = await worker.fetch(request, {}, ctx);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.deepEqual(payload.identity, { ip: '1.1.1.1', asn: 13335, organization: 'Cloudflare', country: 'SG', colo: 'SIN' });
});

test('non-API requests delegate their original request and response to the assets binding', async () => {
  for (const path of ['/', '/dev/network-inspector', '/assets/app.js', '/api-documentation']) {
    const request = new Request(`https://tools.arcinks.com${path}`);
    const assetResponse = new Response('asset contents', { status: 200, headers: { 'x-asset': 'unchanged' } });
    let forwarded;
    const env = { ASSETS: { async fetch(value) { forwarded = value; return assetResponse; } } };
    assert.equal(await worker.fetch(request, env, ctx), assetResponse);
    assert.equal(forwarded, request);
  }
});

test('the periodic D1 cleanup deletes a fixed batch of the oldest 1000 expired rows using the expiry index', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const insert = sqlite.prepare('INSERT INTO rooms_kv (key, data, expires_at) VALUES (?, ?, ?)');
  sqlite.exec('BEGIN');
  for (let index = 0; index < 1205; index += 1) insert.run(`mock:expired-${index}`, '{}', now - 1205 + index);
  insert.run('mock:boundary', '{}', now);
  insert.run('mock:live', '{"valid":true}', now + 3600);
  sqlite.exec('COMMIT');
  const runs = [];
  const env = { DB: {
    prepare(query) {
      const statement = sqlite.prepare(query);
      return { bind(...args) {
        return { async run() {
          const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...args);
          const result = statement.run(...args);
          runs.push({ query, args, plan, changes: Number(result.changes) });
          return { success: true, meta: { changes: Number(result.changes) } };
        } };
      } };
    },
  } };

  await worker.scheduled({}, env, ctx);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].changes, 1000);
  assert.match(runs[0].query, /ORDER BY expires_at LIMIT 1000/i);
  assert.ok(runs[0].args[0] >= now && runs[0].args[0] <= now + 2);
  assert.ok(runs[0].plan.some((entry) => /USING (?:COVERING )?INDEX idx_expires_at/.test(entry.detail)), JSON.stringify(runs[0].plan));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM rooms_kv WHERE expires_at <= ?').get(now).total, 206);
  assert.equal(sqlite.prepare('SELECT key FROM rooms_kv WHERE key = ?').get('mock:expired-999'), undefined);
  assert.equal(sqlite.prepare('SELECT key FROM rooms_kv WHERE key = ?').get('mock:expired-1000').key, 'mock:expired-1000');
  assert.equal(sqlite.prepare('SELECT data FROM rooms_kv WHERE key = ?').get('mock:live').data, '{"valid":true}');

  await worker.scheduled({}, env, ctx);
  assert.equal(runs[1].changes, 206);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM rooms_kv').get().total, 1);
  await worker.scheduled({}, env, ctx);
  assert.equal(runs[2].changes, 0);
});

test('scheduled cleanup remains optional when D1 is not configured', async () => {
  await assert.doesNotReject(() => worker.scheduled({}, {}, ctx));
});

test('production and example config serve the SPA as assets and always route the API to the Worker first', () => {
  for (const name of ['wrangler.toml', 'wrangler.toml.example']) {
    const config = toml.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
    assert.equal(config.main, 'worker/index.js');
    assert.equal(config.assets.directory, './dist');
    assert.equal(config.assets.binding, 'ASSETS');
    assert.equal(config.assets.not_found_handling, 'single-page-application');
    assert.deepEqual(config.assets.run_worker_first, ['/api', '/api/*']);
  }
});
