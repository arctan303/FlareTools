import assert from 'node:assert/strict';

const REQUEST_TIMEOUT_MS = 20000;
const SOCKET_TIMEOUT_MS = 15000;
const ROOM_CODE = /^\d{6}$/;
const DEVICE_ID = /^[a-f0-9-]{36}$/;
const MOCK_ID = /^[a-f0-9]{32}$/;
const MOCK_TOKEN = /^[a-f0-9]{64}$/;

function testOrigin() {
  const url = new URL(process.env.WORKER_TEST_URL || 'http://127.0.0.1:8787');
  assert.ok(['http:', 'https:'].includes(url.protocol), 'The test URL must use HTTP or HTTPS.');
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Use only the Worker origin as WORKER_TEST_URL.');
  return url.origin;
}

async function main() {
  const base = testOrigin();
  const expectWafBlock = process.env.WORKER_TEST_WAF_BLOCKS_UNKNOWN_API === 'true';
  const resources = { room: null, mock: null };
  let connection;
  let testError;

  // Every request stays on the selected Worker, has a finite timeout and never
  // follows a redirect. Error messages omit URLs, bodies and credentials.
  const request = async (path, options = {}, label = 'Worker request') => {
    const target = new URL(path, base);
    assert.ok(target.origin === base, 'A test request attempted to leave the Worker origin.');
    try {
      return await fetch(target, { ...options, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new Error(label + ' failed or timed out.');
    }
  };
  const requestJson = async (path, options, label) => {
    const response = await request(path, options, label);
    let data;
    try { data = await response.json(); }
    catch { throw new Error(label + ' did not return JSON.'); }
    return { response, data };
  };
  const api = (action, body) => requestJson('/api/text-share/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, 'Text sharing request');

  const cleanup = async () => {
    const failures = [];
    if (connection) connection.close();
    if (resources.mock) {
      try {
        const result = await request('/api/mock/' + resources.mock.id, {
          method: 'DELETE', headers: { Authorization: 'Bearer ' + resources.mock.token },
        }, 'Mock cleanup');
        assert.ok([200, 404].includes(result.status), 'Mock cleanup was rejected.');
      } catch { failures.push('Mock API cleanup failed; the test endpoint may remain until its 1 hour expiry.'); }
    }
    if (resources.room) {
      try {
        // A join response may have failed before the test captured its token.
        // The room code is sufficient to make one best-effort cleanup join.
        let deviceId = resources.room.deviceId;
        if (!DEVICE_ID.test(deviceId || '')) {
          const joined = await api('join_room', { room_code: resources.room.code });
          if (joined.response.status === 404) return failures;
          assert.ok(joined.data.success && DEVICE_ID.test(joined.data.device_id || ''), 'Cleanup could not join the test room.');
          deviceId = joined.data.device_id;
        }
        const result = await api('destroy_room', { room_code: resources.room.code, device_id: deviceId });
        assert.ok([200, 404].includes(result.response.status), 'Room cleanup was rejected.');
      } catch { failures.push('Text room cleanup failed; the test room may remain until its 24 hour expiry.'); }
    }
    return failures;
  };

  try {
    const createdRoom = await api('create_room', {});
    if (ROOM_CODE.test(createdRoom.data.room_code || '')) resources.room = { code: createdRoom.data.room_code, deviceId: '' };
    assert.ok(createdRoom.response.status === 200 && createdRoom.data.success && resources.room, 'Creating the test room failed (check bindings, quota and optional Turnstile).');
    const code = resources.room.code;
    const firstResult = await api('join_room', { room_code: code });
    if (DEVICE_ID.test(firstResult.data.device_id || '')) resources.room.deviceId = firstResult.data.device_id;
    assert.ok(firstResult.response.status === 200 && firstResult.data.success && resources.room.deviceId, 'The first device could not join.');
    const first = firstResult.data;
    const secondResult = await api('join_room', { room_code: code });
    assert.ok(secondResult.response.status === 200 && secondResult.data.success && DEVICE_ID.test(secondResult.data.device_id || ''), 'The second device could not join.');
    const second = secondResult.data;
    assert.ok(first.device_id !== second.device_id, 'Different members received the same private credential.');
    assert.ok(!JSON.stringify(second.devices).includes(first.device_id), 'Public device metadata exposed a private credential.');
    connection = connect(base, code, second.device_id);
    await connection.ready;
    await connection.waitFor((data) => data.type === 'version' && data.version === 0);
    const saved = await api('update_text', { room_code: code, device_id: first.device_id, text_content: 'Runtime smoke: 你好 🌍', base_version: 0 });
    assert.ok(saved.response.status === 200 && saved.data.success, 'Saving text failed.');
    assert.equal(saved.data.expires_at, createdRoom.data.expires_at, 'Saving text extended the fixed expiry.');
    const notification = await connection.waitFor((data) => data.type === 'version' && data.version === 1);
    assert.ok(notification.content_updated_by === first.public_device_id, 'The notification author did not use the public device ID.');
    assert.ok(!JSON.stringify(notification).includes('Runtime smoke') && !JSON.stringify(notification).includes(first.device_id), 'The notification exposed private data.');
    const conflict = await api('update_text', { room_code: code, device_id: second.device_id, text_content: 'stale draft', base_version: 0 });
    assert.equal(conflict.response.status, 409, 'A stale edit was not rejected.');
    const query = new URLSearchParams({ room_code: code, device_id: second.device_id });
    const pulled = await requestJson('/api/text-share/get_room_status?' + query, {}, 'Room status');
    assert.ok(pulled.response.status === 200 && pulled.data.text_content === 'Runtime smoke: 你好 🌍', 'The saved text was not retrieved.');
    assert.equal((await api('destroy_room', { room_code: code, device_id: first.device_id })).response.status, 200, 'Room destruction failed.');
    await connection.waitFor((data) => data.type === 'room_closed' && data.reason === 'destroyed');
    assert.equal((await request('/api/text-share/get_room_status?' + query, {}, 'Destroyed room check')).status, 404, 'The destroyed room is still readable.');

    const createdMock = await requestJson('/api/mock/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: '{"runtime":"ok"}', status: 201, ttl_hours: 1 }),
    }, 'Mock creation');
    const mock = createdMock.data;
    if (MOCK_ID.test(mock.id || '') && MOCK_TOKEN.test(mock.management_token || '')) resources.mock = { id: mock.id, token: mock.management_token };
    assert.ok(createdMock.response.status === 201 && mock.success && resources.mock, 'Creating the Mock API failed.');
    let publicUrl;
    try { publicUrl = new URL(mock.url); }
    catch { throw new Error('Mock creation returned an invalid public URL.'); }
    assert.ok(publicUrl.origin === base && !publicUrl.username && !publicUrl.password &&
      publicUrl.pathname === '/api/mock/' + mock.id && !publicUrl.search && !publicUrl.hash,
    'Mock creation returned a public URL outside the expected endpoint.');
    const read = await requestJson(publicUrl.href, {}, 'Mock read');
    assert.equal(read.response.status, 201, 'The Mock status did not match its configuration.');
    assert.deepEqual(read.data, { runtime: 'ok' }, 'The Mock response was incorrect.');
    const deleted = await request('/api/mock/' + mock.id, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + mock.management_token },
    }, 'Mock deletion');
    assert.equal(deleted.status, 200, 'Mock deletion failed.');
    assert.equal((await request('/api/mock/' + mock.id, {}, 'Deleted Mock check')).status, 404, 'The deleted Mock remains readable.');

    // One request for each diagnostic. No retries or mutation of production
    // quotas, runtime clocks, alarms or stored expiry timestamps.
    const identity = await requestJson('/api/network?action=identity', {}, 'Network identity');
    assert.ok(identity.response.status === 200 && identity.data.success && Array.isArray(identity.data.allowedHosts), 'Network identity failed.');
    assert.ok(identity.data.allowedHosts.includes('example.com'), 'The HTTP diagnostic example is missing from the configured allowlist.');
    const dns = await requestJson('/api/network?action=dns&name=example.com&type=A', {}, 'DNS diagnostic');
    assert.ok(dns.response.status === 200 && dns.data.success && dns.data.dns?.status === 0 &&
      dns.data.dns.answers.some((record) => record.type === 1 && record.data),
    'The live DNS diagnostic returned no successful A record.');
    const http = await requestJson('/api/network?action=http', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/' }),
    }, 'HTTP diagnostic');
    assert.ok(http.response.status === 200 && http.data.success && Array.isArray(http.data.hops) && http.data.hops.length > 0, 'The live HTTP diagnostic failed.');
    assert.ok(http.data.stopped === null && http.data.hops.at(-1).status === 200, 'The HTTP diagnostic did not reach a successful response.');
    assert.ok(http.data.hops.every((hop) => identity.data.allowedHosts.includes(new URL(hop.url).hostname) &&
      Number.isFinite(hop.durationMs) && Array.isArray(hop.headers)), 'HTTP diagnostics returned invalid hop metadata.');
    const missing = await request('/api/missing', { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } }, 'Missing API route');
    if (expectWafBlock) {
      assert.equal(missing.status, 403, 'The unknown API route was not blocked by the configured WAF.');
      assert.equal(missing.headers.get('server'), 'cloudflare', 'The expected block did not come from Cloudflare.');
      assert.ok(missing.headers.get('cf-ray') && /html/.test(missing.headers.get('Content-Type') || ''), 'The WAF response is missing Cloudflare block metadata.');
      assert.match(await missing.text(), /<title>Attention Required! \| Cloudflare<\/title>/, 'The unknown API route did not return the expected Cloudflare block page.');
    } else {
      assert.equal(missing.status, 404, 'The unknown API route did not return the expected Worker 404.');
      assert.ok(/json/.test(missing.headers.get('Content-Type') || ''), 'The missing API route did not return JSON.');
    }
    const page = await request('/dev/network-inspector', { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } }, 'SPA route');
    assert.equal(page.status, 200, 'The SPA route failed.');
    assert.ok((await page.text()).includes('FlareTools'), 'The SPA route did not return the app.');
  } catch (error) {
    testError = error;
  } finally {
    const failures = await cleanup();
    for (const failure of failures) console.error(failure);
    if (failures.length && !testError) testError = new Error('Runtime smoke cleanup failed.');
  }
  if (testError) throw testError;
  console.log('Workers runtime smoke passed: SQLite DO rooms, WebSocket notifications, conflicts, fixed expiry metadata, destruction, D1 Mock API, live DNS/HTTP diagnostics, network identity and SPA/API routing. Test room and Mock endpoint were cleaned up; normal creation quotas remain consumed.');
}

function connect(base, code, deviceId) {
  const url = new URL('/api/text-share/connect', base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = new URLSearchParams({ room_code: code, device_id: deviceId });
  let socket;
  try { socket = new WebSocket(url); }
  catch { throw new Error('WebSocket construction failed.'); }
  const messages = [];
  const waiters = new Set();
  let failure;
  let readyResolve;
  let readyReject;
  let opened = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  // Mark it handled immediately, including errors before callers await ready.
  ready.catch(() => {});
  const fail = (message) => {
    if (!failure) failure = new Error(message);
    clearTimeout(handshakeTimer);
    readyReject(failure);
    for (const waiter of [...waiters]) waiter.reject(failure);
  };
  const handshakeTimer = setTimeout(() => {
    fail('WebSocket handshake timed out.');
    try { socket.close(); } catch { /* The connection may still be opening. */ }
  }, SOCKET_TIMEOUT_MS);
  socket.addEventListener('open', () => {
    opened = true;
    clearTimeout(handshakeTimer);
    readyResolve();
  });
  socket.addEventListener('error', () => fail(opened ? 'WebSocket connection failed.' : 'WebSocket handshake failed.'));
  socket.addEventListener('close', () => fail('WebSocket closed before the expected notification.'));
  socket.addEventListener('message', (event) => {
    let data;
    try { data = JSON.parse(event.data); }
    catch { fail('WebSocket returned invalid JSON.'); return; }
    messages.push(data);
    for (const waiter of [...waiters]) {
      try { if (waiter.matches(data)) waiter.resolve(data); }
      catch { waiter.reject(new Error('WebSocket notification validation failed.')); }
    }
  });
  return {
    ready,
    waitFor(matches) {
      const existing = messages.find(matches);
      if (existing) return Promise.resolve(existing);
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const finish = (callback, value) => { clearTimeout(timer); waiters.delete(waiter); callback(value); };
        const waiter = { matches, resolve: (data) => finish(resolve, data), reject: (error) => finish(reject, error) };
        const timer = setTimeout(() => waiter.reject(new Error('WebSocket notification timed out.')), SOCKET_TIMEOUT_MS);
        waiters.add(waiter);
      });
    },
    close() {
      fail('WebSocket test connection closed.');
      try { socket.close(); } catch { /* Close is best effort after failure. */ }
    },
  };
}

main().catch((error) => {
  // Avoid Node's assertion object dump: actual/expected may contain credentials.
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : error.message);
  process.exitCode = 1;
});
