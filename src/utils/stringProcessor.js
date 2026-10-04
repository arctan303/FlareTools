import CryptoJS from 'crypto-js';

const EMPTY_RESULTS = { base64: '', md5: '', sha1: '', sha256: '', url: '' };
const EMPTY_STATS = { bytes: 0, chars: 0, lines: 0, words: 0 };

export function utf8ToBase64(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export function decodeString(input, format = 'base64') {
  if (!input) return { error: null, value: '' };

  if (format === 'url') {
    try {
      return { error: null, value: decodeURIComponent(input) };
    } catch {
      return { error: 'invalid-url-encoding', value: '' };
    }
  }
  if (format !== 'base64') return { error: 'invalid-format', value: '' };

  // Accept wrapped or unpadded Base64, but reject malformed padding and bits.
  const encoded = input.replace(/[\t\r\n ]/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    return { error: 'invalid-base64', value: '' };
  }
  try {
    const binary = atob(encoded);
    if (btoa(binary).replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
      return { error: 'invalid-base64', value: '' };
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    // Binary payloads must not silently become replacement characters.
    return { error: null, value: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch (error) {
    return { error: error.name === 'TypeError' ? 'invalid-utf8' : 'invalid-base64', value: '' };
  }
}

export function analyzeString(input) {
  if (!input) return { error: null, results: EMPTY_RESULTS, stats: EMPTY_STATS };

  try {
    return {
      error: null,
      stats: {
        bytes: new TextEncoder().encode(input).length,
        chars: input.length,
        lines: input.split(/\r\n|\r|\n/).length,
        words: input.trim() === '' ? 0 : input.trim().split(/\s+/).length,
      },
      results: {
        base64: utf8ToBase64(input),
        md5: CryptoJS.MD5(input).toString(),
        sha1: CryptoJS.SHA1(input).toString(),
        sha256: CryptoJS.SHA256(input).toString(),
        url: encodeURIComponent(input),
      },
    };
  } catch (error) {
    return { error: error.message || 'processing-failed', results: EMPTY_RESULTS, stats: EMPTY_STATS };
  }
}
