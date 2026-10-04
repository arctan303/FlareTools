export const DNS_RECORD_TYPES = Object.freeze({ A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, NS: 2 });

// Exact trusted hosts are deliberate: Workers fetch cannot pin arbitrary HTTPS
// hosts to a checked DNS address. Never use user-supplied hosts or wildcards here.
export const DEFAULT_ALLOWED_HOSTS = Object.freeze([
  'tools.arcinks.com',
  'example.com',
  'cloudflare.com',
  'www.cloudflare.com',
  'developers.cloudflare.com',
  'github.com',
  'www.wikipedia.org',
]);

export class NetworkError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'NetworkError';
    this.code = code;
    this.status = status;
  }
}

function ipv4Parts(value) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

function ipv6Parts(value) {
  if (!/^[\da-f:]+$/i.test(value) || !value.includes(':')) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if (![...left, ...right].every((part) => /^[\da-f]{1,4}$/i.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  return [...left, ...Array(missing).fill('0'), ...right].map((part) => parseInt(part, 16));
}

export function isPublicIp(value) {
  const normalized = String(value).toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = ipv4Parts(normalized);
  if (v4) {
    const [a, b, c] = v4;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  const v6 = ipv6Parts(normalized);
  if (!v6 || (v6[0] & 0xe000) !== 0x2000) return false;
  // Exclude documentation and transition/special-purpose allocations. IPv4
  // mapped, loopback, ULA, link-local, multicast and NAT64 fail the global prefix.
  if (v6[0] === 0x2002 || (v6[0] === 0x3fff && (v6[1] & 0xf000) === 0)) return false;
  if (v6[0] === 0x2001 && (v6[1] < 0x0200 || v6[1] === 0x0db8)) return false;
  return true;
}

const RESERVED_SUFFIXES = ['localhost', 'local', 'lan', 'internal', 'home', 'onion', 'test', 'invalid', 'example', 'arpa'];

export function normalizeDnsName(input, { allowUnderscore = true } = {}) {
  const source = String(input ?? '').trim().replace(/\.$/, '');
  if (!source || source.length > 253 || /[\s/:@?#%\\]/.test(source)) throw new NetworkError('INVALID_DOMAIN');
  let hostname;
  try { hostname = new URL(`https://${source}`).hostname.toLowerCase(); }
  catch { throw new NetworkError('INVALID_DOMAIN'); }
  const labels = hostname.split('.');
  const labelPattern = allowUnderscore ? /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/ : /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
  if (hostname.length > 253 || labels.length < 2 || labels.some((label) => label.length > 63 || !labelPattern.test(label)) ||
      !/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(labels.at(-1)) || RESERVED_SUFFIXES.includes(labels.at(-1))) {
    throw new NetworkError('INVALID_DOMAIN');
  }
  return hostname;
}

export function normalizeHttpTarget(input) {
  const source = String(input ?? '').trim();
  if (source.length > 2048 || source.includes('\\') || [...source].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) {
    throw new NetworkError('INVALID_URL');
  }
  let url;
  try { url = new URL(source); }
  catch { throw new NetworkError('INVALID_URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new NetworkError('INVALID_URL');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname.includes(':') || /^\d+(?:\.\d+)*$/.test(hostname)) {
    if (!isPublicIp(hostname)) throw new NetworkError('BLOCKED_TARGET');
  } else {
    try { normalizeDnsName(hostname, { allowUnderscore: false }); }
    catch { throw new NetworkError('BLOCKED_TARGET'); }
  }
  url.hostname = hostname;
  url.hash = '';
  return url;
}

export function allowedNetworkHosts(config = '') {
  const configured = String(config).split(',').slice(0, 32).flatMap((entry) => {
    try { return [normalizeDnsName(entry, { allowUnderscore: false })]; }
    catch { return []; }
  });
  return [...new Set([...DEFAULT_ALLOWED_HOSTS, ...configured])];
}

export function dnsTypeLabel(value) {
  return Object.entries(DNS_RECORD_TYPES).find(([, number]) => number === value)?.[0] || String(value);
}
