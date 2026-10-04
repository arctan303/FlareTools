import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedNetworkHosts, isPublicIp, normalizeDnsName, normalizeHttpTarget } from '../src/utils/networkTools.js';
import { createNetworkHandler } from '../worker/api/network.js';
import { NETWORK_TRANSLATIONS } from '../src/locales/networkTranslations.js';

const responseJson = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

async function call(handler, { action = 'http', method = 'POST', body = { url: 'https://example.com/' }, headers = {}, query = '', env = {}, cf } = {}) {
  const request = new Request(`https://tools.arcinks.com/api/network?action=${action}${query}`, {
    method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...headers },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  if (cf) Object.defineProperty(request, 'cf', { value: cf });
  const response = await handler({ request, env });
  return { response, payload: await response.json() };
}

function mockedNetwork({ resolve, inspect } = {}) {
  const calls = [];
  const fetcher = async (source, options) => {
    const url = new URL(source);
    calls.push({ url, options });
    if (url.hostname === '1.1.1.1') {
      if (resolve) return resolve(url, options);
      return responseJson({ Status: 0, AD: true, Answer: url.searchParams.get('type') === 'A' ? [{ name: `${url.searchParams.get('name')}.`, type: 1, TTL: 300, data: '104.18.27.120' }] : [] });
    }
    return inspect ? inspect(url, options) : new Response(null, { headers: { server: 'test', 'set-cookie': 'private=value', 'www-authenticate': 'secret' } });
  };
  return { calls, handler: createNetworkHandler({ fetcher }) };
}

test('public IP check rejects private, shared, link-local, documentation, mapped and reserved addresses', () => {
  for (const ip of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '100.64.1.2', '169.254.169.254', '172.31.2.3', '192.168.1.1', '192.0.0.1', '192.0.2.8', '198.18.1.1', '198.51.100.1', '203.0.113.9', '224.0.0.1', '255.255.255.255', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2001:db8::1', '2002:7f00:1::', '3fff::1', 'not-an-ip']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '104.18.27.120', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicIp(ip), true, ip);
});

test('URLs reject ambiguous private IP forms, non-HTTP protocols, user credentials and custom ports', () => {
  for (const url of ['http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://[::ffff:127.0.0.1]/', 'http://localhost/', 'http://local.internal/', 'http://example.com:8080/', 'https://user:secret@example.com/', 'file:///etc/passwd', 'https://example.com\n.evil.org/', 'https://example.com\\@127.0.0.1/']) {
    assert.throws(() => normalizeHttpTarget(url), undefined, url);
  }
  assert.equal(normalizeHttpTarget('https://EXAMPLE.COM./path#fragment').href, 'https://example.com/path');
});

test('DNS queries accept public IDN and underscore labels but do not accept internal names or URL input', () => {
  assert.equal(normalizeDnsName('_dmarc.Example.COM.'), '_dmarc.example.com');
  assert.equal(normalizeDnsName('例子.com'), 'xn--fsqu00a.com');
  for (const name of ['localhost', 'my.server.local', 'service.test', '192.168.1.1', 'https://example.com', 'a..com', '-bad.com', 'bad-.com', 'example.com@evil.com']) assert.throws(() => normalizeDnsName(name), undefined, name);
  assert.throws(() => normalizeDnsName('_dmarc.example.com', { allowUnderscore: false }));
});

test('configured HTTP hosts are exact names and never patterns, URLs, private names or IPs', () => {
  const hosts = allowedNetworkHosts('safe.domain.com, *.example.com,https://other.com,localhost,127.0.0.1');
  assert.ok(hosts.includes('safe.domain.com'));
  assert.ok(hosts.includes('example.com'));
  assert.ok(!hosts.includes('*.example.com'));
  assert.ok(!hosts.includes('other.com'));
  assert.ok(!hosts.includes('localhost'));
});

test('connection metadata uses Cloudflare request fields and reports allowed sites without fetching', async () => {
  const handler = createNetworkHandler({ fetcher: () => { throw new Error('unexpected fetch'); } });
  const { response, payload } = await call(handler, { action: 'identity', method: 'GET', headers: { 'cf-connecting-ip': '8.8.8.8' }, cf: { asn: 15169, asOrganization: 'Google', country: 'US', colo: 'SIN' }, env: { NETWORK_ALLOWED_HOSTS: 'safe.domain.com' } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(payload.identity, { ip: '8.8.8.8', asn: 15169, organization: 'Google', country: 'US', colo: 'SIN' });
  assert.ok(payload.allowedHosts.includes('safe.domain.com'));
});

test('arbitrary HTTP hosts and cross-site invocations are blocked before outbound requests', async () => {
  const { handler, calls } = mockedNetwork();
  assert.equal((await call(handler, { body: { url: 'https://evil.example.com/' } })).payload.code, 'HOST_NOT_ALLOWED');
  assert.equal((await call(handler, { headers: { origin: 'https://other.com' } })).payload.code, 'FORBIDDEN');
  assert.equal(calls.length, 0);
});

test('DoH uses a fixed HTTPS resolver with workerd-supported manual redirects and rejects redirect responses', async () => {
  let redirect = false;
  let calls = 0;
  const handler = createNetworkHandler({ fetcher: async (source, options) => {
    calls += 1;
    const endpoint = new URL(source);
    assert.equal(endpoint.origin, 'https://1.1.1.1');
    assert.equal(endpoint.pathname, '/dns-query');
    assert.equal(endpoint.searchParams.get('name'), 'example.com');
    assert.equal(endpoint.searchParams.get('type'), 'A');
    assert.equal(options.headers.accept, 'application/dns-json');
    // workerd does not implement redirect: 'error'. Following resolver
    // redirects could also bypass the fixed trusted DNS service boundary.
    assert.equal(options.redirect, 'manual');
    return redirect
      ? new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/dns-query' } })
      : responseJson({ Status: 0, Answer: [{ type: 1, data: '104.18.27.120' }] });
  } });
  const input = { action: 'dns', method: 'GET', query: '&name=example.com&type=A' };
  assert.equal((await call(handler, input)).payload.success, true);
  redirect = true;
  assert.equal((await call(handler, input)).payload.code, 'DNS_FAILED');
  assert.equal(calls, 2);
});

test('HTTP inspection rejects a trusted domain whose A or AAAA answer points to private addresses', async () => {
  for (const [type, ip] of [[1, '127.0.0.1'], [28, 'fd00::1']]) {
    const { handler, calls } = mockedNetwork({ resolve: () => responseJson({ Status: 0, Answer: [{ type, data: ip }] }) });
    const { payload } = await call(handler);
    assert.equal(payload.code, 'BLOCKED_TARGET');
    assert.ok(calls.every(({ url }) => url.hostname === '1.1.1.1'));
  }
});

test('HTTP inspection fails closed on unresolvable DNS and invalid/private CNAME destinations', async () => {
  for (const Answer of [[], [{ type: 5, data: 'server.local.' }, { type: 1, data: '104.18.27.120' }]]) {
    const { handler, calls } = mockedNetwork({ resolve: () => responseJson({ Status: 0, Answer }) });
    assert.equal((await call(handler)).payload.success, false);
    assert.ok(calls.every(({ url }) => url.hostname === '1.1.1.1'));
  }
});

test('HTTP uses only HEAD with new headers and never returns target body or authentication cookies', async () => {
  let cancelled = false;
  const { handler, calls } = mockedNetwork({ inspect: () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('TARGET_SECRET_BODY')); },
    cancel() { cancelled = true; },
  }), { headers: { server: 'test', 'set-cookie': 'SECRET_COOKIE', 'www-authenticate': 'SECRET_AUTH' } }) });
  const { payload } = await call(handler, { headers: { cookie: 'browser=private', authorization: 'Bearer private', 'x-forwarded-for': 'private' } });
  assert.equal(payload.success, true);
  assert.equal(cancelled, true);
  const inspection = calls.find(({ options }) => options.method === 'HEAD');
  assert.deepEqual(inspection.options.headers, { accept: '*/*' });
  assert.equal(inspection.options.redirect, 'manual');
  assert.doesNotMatch(JSON.stringify(payload), /SECRET|private/);
  assert.deepEqual(payload.hops[0].headers, [['server', 'test']]);
});

test('each redirect destination gets new A and AAAA checks, while private and unlisted redirects stop', async () => {
  const { handler, calls } = mockedNetwork({ inspect: (url) => url.hostname === 'example.com'
    ? new Response(null, { status: 302, headers: { location: 'https://cloudflare.com/' } })
    : new Response(null, { status: 200 }) });
  const { payload } = await call(handler);
  assert.equal(payload.hops.length, 2);
  assert.equal(calls.filter(({ url }) => url.hostname === '1.1.1.1').length, 4);
  for (const location of ['http://169.254.169.254/latest/meta-data', 'https://unlisted.domain.com/']) {
    const unsafe = mockedNetwork({ inspect: () => new Response(null, { status: 302, headers: { location } }) });
    const { payload: stopped } = await call(unsafe.handler);
    assert.equal(stopped.hops.length, 1);
    assert.ok(['BLOCKED_TARGET', 'HOST_NOT_ALLOWED'].includes(stopped.stopped));
    assert.equal(unsafe.calls.filter(({ options }) => options.method === 'HEAD').length, 1);
  }
});

test('redirect loops and maximum five redirects produce bounded trace results', async () => {
  const loop = mockedNetwork({ inspect: () => new Response(null, { status: 302, headers: { location: '/' } }) });
  assert.equal((await call(loop.handler)).payload.stopped, 'REDIRECT_LOOP');
  const chain = mockedNetwork({ inspect: (url) => new Response(null, { status: 302, headers: { location: `/?hop=${Number(url.searchParams.get('hop') || 0) + 1}` } }) });
  const { payload } = await call(chain.handler);
  assert.equal(payload.stopped, 'REDIRECT_LIMIT');
  assert.equal(payload.hops.length, 6);
});

test('timeouts bound both DNS body reads and stalled HTTP connection attempts', async () => {
  let dnsCanceled = false;
  const dnsBody = new ReadableStream({ start() {}, cancel() { dnsCanceled = true; } });
  const stalledDns = createNetworkHandler({ timeoutMs: 10, fetcher: async () => new Response(dnsBody) });
  const dns = await call(stalledDns, { action: 'dns', method: 'GET', query: '&name=example.com&type=A' });
  assert.equal(dns.response.status, 504);
  assert.equal(dns.payload.code, 'NETWORK_TIMEOUT');
  assert.equal(dnsCanceled, true);
  assert.equal(dnsBody.locked, false);
  const stalledHttp = createNetworkHandler({ totalTimeoutMs: 10, fetcher: async (source) => {
    if (new URL(source).hostname === '1.1.1.1') return responseJson({ Status: 0, Answer: [{ type: 1, data: '104.18.27.120' }] });
    return new Promise(() => {});
  } });
  assert.equal((await call(stalledHttp)).payload.code, 'NETWORK_TIMEOUT');
});

test('a timed-out incoming HTTP body is canceled and unlocked even when source cancellation never finishes', async () => {
  let canceled = false;
  let fetched = false;
  const body = new ReadableStream({
    pull() {},
    cancel() { canceled = true; return new Promise(() => {}); },
  });
  const request = new Request('https://tools.arcinks.com/api/network?action=http', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half',
  });
  const handler = createNetworkHandler({ timeoutMs: 10, fetcher: async () => { fetched = true; throw new Error('unexpected fetch'); } });
  const response = await handler({ request });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, 'NETWORK_TIMEOUT');
  assert.equal(canceled, true);
  assert.equal(body.locked, false);
  assert.equal(fetched, false);
});

test('request body, DNS body and headers enforce explicit size limits', async () => {
  const normal = mockedNetwork();
  assert.equal((await call(normal.handler, { body: ' '.repeat(4097) })).payload.code, 'RESPONSE_TOO_LARGE');
  assert.equal(normal.calls.length, 0);
  const largeDns = createNetworkHandler({ fetcher: async () => new Response(' '.repeat(65537)) });
  assert.equal((await call(largeDns, { action: 'dns', method: 'GET', query: '&name=example.com' })).payload.code, 'RESPONSE_TOO_LARGE');
  const largeHeader = mockedNetwork({ inspect: () => new Response(null, { headers: { 'x-large': 'x'.repeat(16385) } }) });
  assert.equal((await call(largeHeader.handler)).payload.code, 'RESPONSE_TOO_LARGE');
});

test('network UI locales have complete matching keys', () => {
  assert.deepEqual(Object.keys(NETWORK_TRANSLATIONS.en).sort(), Object.keys(NETWORK_TRANSLATIONS['zh-CN']).sort());
  assert.ok(Object.values(NETWORK_TRANSLATIONS.en).every(Boolean));
  assert.ok(Object.values(NETWORK_TRANSLATIONS['zh-CN']).every(Boolean));
});
