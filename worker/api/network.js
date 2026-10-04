import { allowedNetworkHosts, DNS_RECORD_TYPES, isPublicIp, NetworkError, normalizeDnsName, normalizeHttpTarget } from '../../src/utils/networkTools.js';

const MAX_DNS_BYTES = 64 * 1024;
const MAX_REQUEST_BYTES = 4096;
const MAX_HEADER_BYTES = 16 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Cloudflare's unfiltered resolver. Use its HTTPS IP endpoint to avoid relying
// on bootstrap DNS for cloudflare-dns.com; fetch still validates its certificate.
// https://developers.cloudflare.com/1.1.1.1/infrastructure/network-operators/
const DOH_ENDPOINT = 'https://1.1.1.1/dns-query';

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extraHeaders },
  });
}

async function readLimited(response, maximum, signal) {
  if (signal?.aborted) throw new NetworkError('NETWORK_TIMEOUT', 504);
  if (Number(response.headers.get('content-length')) > maximum) {
    response.body?.cancel().catch(() => {});
    throw new NetworkError('RESPONSE_TOO_LARGE', 502);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  // Cancelling a reader resolves pending read() calls even when the underlying
  // source's cancellation promise stalls. Do not wait for that promise to close.
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new NetworkError('NETWORK_TIMEOUT', 504);
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new NetworkError('RESPONSE_TOO_LARGE', 502);
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createNetworkHandler({ fetcher = globalThis.fetch, timeoutMs = 8000, totalTimeoutMs = 15000 } = {}) {
  // Keep the timeout active through body reads, rather than only until headers.
  async function withTimeout(operation, milliseconds = timeoutMs) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new NetworkError('NETWORK_TIMEOUT', 504));
          }, milliseconds);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async function queryDns(name, type, signal) {
    const endpoint = new URL(DOH_ENDPOINT);
    endpoint.searchParams.set('name', name);
    endpoint.searchParams.set('type', type);
    const response = await fetcher(endpoint.toString(), {
      headers: { accept: 'application/dns-json' }, redirect: 'manual', signal,
    });
    if (!response.ok) throw new NetworkError('DNS_FAILED', 502);
    let payload;
    try { payload = JSON.parse(await readLimited(response, MAX_DNS_BYTES, signal)); }
    catch (error) {
      if (error instanceof NetworkError) throw error;
      throw new NetworkError('DNS_FAILED', 502);
    }
    if (!Number.isInteger(payload.Status)) throw new NetworkError('DNS_FAILED', 502);
    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    if (answers.length > 128) throw new NetworkError('RESPONSE_TOO_LARGE', 502);
    return {
      name, type, status: payload.Status, dnssec: payload.AD === true,
      answers: answers.map(({ name: recordName, type: recordType, TTL, data }) => ({
        name: String(recordName ?? '').slice(0, 254), type: Number(recordType), ttl: Number(TTL) || 0, data: String(data ?? '').slice(0, 4096),
      })),
    };
  }

  async function validateResolution(hostname, signal) {
    const results = await Promise.all([queryDns(hostname, 'A', signal), queryDns(hostname, 'AAAA', signal)]);
    if (results.some((result) => result.status !== 0)) throw new NetworkError('DNS_FAILED', 502);
    const addresses = [];
    for (const { answers } of results) {
      for (const record of answers) {
        if (record.type === 1 || record.type === 28) {
          if (!isPublicIp(record.data)) throw new NetworkError('BLOCKED_TARGET');
          addresses.push(record.data);
        } else if (record.type === 5) {
          try { normalizeDnsName(record.data, { allowUnderscore: false }); }
          catch { throw new NetworkError('BLOCKED_TARGET'); }
        }
      }
    }
    if (addresses.length === 0) throw new NetworkError('DNS_FAILED', 502);
  }

  async function inspectHttp(input, allowedHosts) {
    return withTimeout(async (signal) => {
      let target = normalizeHttpTarget(input);
      const hops = [];
      const seen = new Set();
      for (let index = 0; index <= 5; index += 1) {
        if (!allowedHosts.includes(target.hostname)) {
          if (hops.length) return { hops, stopped: 'HOST_NOT_ALLOWED' };
          throw new NetworkError('HOST_NOT_ALLOWED', 403);
        }
        if (seen.has(target.href)) return { hops, stopped: 'REDIRECT_LOOP' };
        seen.add(target.href);
        await validateResolution(target.hostname, signal);
        const start = Date.now();
        const response = await fetcher(target.href, {
          method: 'HEAD', redirect: 'manual', signal,
          // Construct headers from scratch; no client cookies, authorization,
          // forwarding headers, request body, or arbitrary method are accepted.
          headers: { accept: '*/*' },
        });
        await response.body?.cancel();
        const headers = [];
        let headerBytes = 0;
        for (const [name, value] of response.headers) {
          if (['set-cookie', 'set-cookie2', 'www-authenticate', 'proxy-authenticate'].includes(name.toLowerCase())) continue;
          headerBytes += name.length + value.length;
          if (headerBytes > MAX_HEADER_BYTES) throw new NetworkError('RESPONSE_TOO_LARGE', 502);
          headers.push([name, value]);
        }
        hops.push({ url: target.href, status: response.status, durationMs: Date.now() - start, headers });
        const location = response.headers.get('location');
        if (!REDIRECT_STATUSES.has(response.status) || !location) return { hops, stopped: null };
        if (index === 5) return { hops, stopped: 'REDIRECT_LIMIT' };
        try { target = normalizeHttpTarget(new URL(location, target).href); }
        catch { return { hops, stopped: 'BLOCKED_TARGET' }; }
      }
      return { hops, stopped: 'REDIRECT_LIMIT' };
    }, totalTimeoutMs);
  }

  return async function handle({ request, env = {} }) {
    try {
      const source = new URL(request.url);
      const action = source.searchParams.get('action') || 'identity';
      const allowedHosts = allowedNetworkHosts(env.NETWORK_ALLOWED_HOSTS);
      if (request.headers.get('sec-fetch-site') === 'cross-site' ||
          (request.headers.has('origin') && request.headers.get('origin') !== source.origin)) {
        throw new NetworkError('FORBIDDEN', 403);
      }
      const method = action === 'http' ? 'POST' : 'GET';
      if (request.method !== method) return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405, { allow: method });
      if (action === 'identity') {
        return json({ success: true, allowedHosts, identity: {
          ip: request.headers.get('cf-connecting-ip') || null,
          asn: request.cf?.asn ?? null,
          organization: request.cf?.asOrganization ?? null,
          country: request.cf?.country ?? null,
          colo: request.cf?.colo ?? null,
        } });
      }
      if (action === 'dns') {
        const name = normalizeDnsName(source.searchParams.get('name'));
        const type = (source.searchParams.get('type') || 'A').toUpperCase();
        if (!Object.hasOwn(DNS_RECORD_TYPES, type)) throw new NetworkError('INVALID_DNS_TYPE');
        const dns = await withTimeout((signal) => queryDns(name, type, signal));
        return json({ success: true, dns });
      }
      if (action === 'http') {
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new NetworkError('INVALID_REQUEST');
        let body;
        try { body = JSON.parse(await withTimeout((signal) => readLimited(request, MAX_REQUEST_BYTES, signal))); }
        catch (error) {
          if (error instanceof NetworkError) throw error;
          throw new NetworkError('INVALID_REQUEST');
        }
        if (typeof body?.url !== 'string') throw new NetworkError('INVALID_URL');
        const inspection = await inspectHttp(body.url, allowedHosts);
        return json({ success: true, ...inspection });
      }
      throw new NetworkError('UNKNOWN_ACTION');
    } catch (error) {
      const known = error instanceof NetworkError;
      return json({ success: false, code: known ? error.code : 'NETWORK_FAILED' }, known ? error.status : 502);
    }
  };
}

export const onRequest = createNetworkHandler();
