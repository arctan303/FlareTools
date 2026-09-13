import CryptoJS from 'crypto-js';

const EMPTY_RESULTS = { base64: '', md5: '', sha1: '', sha256: '', url: '' };
const EMPTY_STATS = { bytes: 0, chars: 0, lines: 0, words: 0 };

export function utf8ToBase64(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
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
