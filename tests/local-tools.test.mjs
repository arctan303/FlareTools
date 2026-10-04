import test from 'node:test';
import assert from 'node:assert/strict';
import { transformData } from '../src/utils/dataTransformer.js';
import { generatePassword } from '../src/utils/generatorTools.js';
import { analyzeString, decodeString, utf8ToBase64 } from '../src/utils/stringProcessor.js';
import { fromHex, fromHsl, fromRgb } from '../src/utils/colorTools.js';
import { decodeJwt } from '../src/utils/jwtTools.js';
import { QR_MAX_UTF8_BYTES, validateQrContent } from '../src/utils/qrTools.js';
import { dateToTimestamp, timestampToDate } from '../src/utils/timestampTools.js';
import { compareText, DIFF_MAX_CHARACTERS } from '../src/utils/diffTools.js';

test('data transformer handles empty, valid and invalid input without throwing', () => {
  assert.equal(transformData({ input: '  ', inputType: 'json', outputType: 'yaml' }).status, 'empty');
  const valid = transformData({ input: '{"name":"Arc"}', inputType: 'json', outputType: 'yaml' });
  assert.equal(valid.status, 'success');
  assert.match(valid.output, /name: Arc/);
  const invalid = transformData({ input: '{broken', inputType: 'json', outputType: 'yaml' });
  assert.equal(invalid.status, 'error');
  assert.equal(invalid.output, '');
});

test('string processor counts UTF-8 bytes and produces stable encodings', () => {
  const empty = analyzeString('');
  assert.deepEqual(empty.stats, { bytes: 0, chars: 0, lines: 0, words: 0 });
  const result = analyzeString('Arc 工具');
  assert.equal(result.stats.chars, 6);
  assert.equal(result.stats.bytes, 10);
  assert.equal(result.results.base64, 'QXJjIOW3peWFtw==');
  assert.equal(result.results.md5.length, 32);
});

test('Base64 decoding round-trips UTF-8 including emoji, BOM and wrapped or unpadded input', () => {
  const text = '\uFEFF工具 🧰\r\n café';
  const base64 = utf8ToBase64(text);
  assert.equal(decodeString(base64).value, text);
  assert.equal(decodeString(base64.replace(/=+$/, '')).value, text);
  assert.equal(decodeString(` \n${base64.slice(0, 4)}\r\n${base64.slice(4)}\t`).value, text);
  assert.deepEqual(decodeString(''), { error: null, value: '' });
});

test('Base64 decoding distinguishes malformed encodings from binary payloads', () => {
  for (const value of ['YQ=', 'a', 'Zm9v!', 'Zh==', '====']) {
    assert.equal(decodeString(value).error, 'invalid-base64', value);
  }
  assert.equal(decodeString('/w==').error, 'invalid-utf8');
  assert.equal(decodeString('wK8=').error, 'invalid-utf8');
});

test('URL decoding handles UTF-8, preserves plus signs and returns stable errors', () => {
  assert.equal(decodeString('%E5%B7%A5%E5%85%B7%20%F0%9F%A7%B0+a', 'url').value, '工具 🧰+a');
  for (const value of ['%', '%GG', '%FF', '%E5%B7']) {
    assert.deepEqual(decodeString(value, 'url'), { error: 'invalid-url-encoding', value: '' });
  }
});

test('Diff modes preserve spaces and non-Latin text while producing reconstructable changes', () => {
  const original = 'hello  world\n工具 😀\n';
  const modified = 'hello world!\n工具 🧰\n';
  for (const mode of ['lines', 'words', 'chars']) {
    const result = compareText(original, modified, mode);
    assert.equal(result.error, null);
    assert.equal(result.parts.filter((part) => !part.added).map((part) => part.value).join(''), original);
    assert.equal(result.parts.filter((part) => !part.removed).map((part) => part.value).join(''), modified);
  }
  assert.deepEqual(compareText('', ''), { error: null, parts: [] });
  assert.equal(compareText('a'.repeat(DIFF_MAX_CHARACTERS), 'b').error, 'too-large');
});

test('password generation rejects an empty pool and respects the selected length', () => {
  const none = generatePassword({ length: 16 });
  assert.equal(none.error, 'no-character-types');
  const generated = generatePassword(
    { length: 12, lowercase: true, numbers: false, symbols: false, uppercase: false },
    (values) => values.fill(0),
  );
  assert.equal(generated.error, null);
  assert.equal(generated.value, 'a'.repeat(12));
});

test('color conversions validate ranges and preserve equivalent values', () => {
  assert.equal(fromHex('#3b82f6').rgb, '59, 130, 246');
  assert.equal(fromRgb('59, 130, 246').hex, '#3b82f6');
  assert.equal(fromHsl('217, 91%, 60%').error, null);
  assert.equal(fromRgb('300, 0, 0').error, 'invalid-rgb');
  assert.equal(fromHsl('0, 101%, 50%').error, 'invalid-hsl');
});

test('timestamp conversions distinguish empty, valid and invalid values', () => {
  assert.equal(timestampToDate('').value, null);
  assert.equal(timestampToDate('0').value.toISOString(), '1970-01-01T00:00:00.000Z');
  assert.equal(timestampToDate('not-a-time').error, 'invalid-timestamp');
  assert.equal(dateToTimestamp('1970-01-01T00:00:01Z').value, '1');
  assert.equal(dateToTimestamp('not-a-date').error, 'invalid-date');
});

test('explicit timestamp units resolve early and distant dates without heuristic ambiguity', () => {
  assert.equal(timestampToDate('1000', 'milliseconds').value.toISOString(), '1970-01-01T00:00:01.000Z');
  assert.equal(timestampToDate('1000', 'seconds').value.toISOString(), '1970-01-01T00:16:40.000Z');
  assert.equal(timestampToDate('10000000000', 'seconds').value.getTime(), 10000000000000);
  assert.equal(timestampToDate('-1001', 'milliseconds').value.toISOString(), '1969-12-31T23:59:58.999Z');
  assert.equal(timestampToDate('8640000000000001', 'milliseconds').error, 'invalid-timestamp');
});

test('date output units preserve milliseconds, offsets and reject invalid calendar dates', () => {
  assert.equal(dateToTimestamp('1970-01-01T08:00:01.123+08:00', 'milliseconds').value, '1123');
  assert.equal(dateToTimestamp('1969-12-31T23:59:59.999Z', 'seconds').value, '-1');
  assert.equal(dateToTimestamp('2024-02-29T00:00:00Z').error, null);
  for (const value of ['2023-02-29T00:00:00Z', '2024-02-30', '2024-01-01T24:00:00Z']) {
    assert.equal(dateToTimestamp(value).error, 'invalid-date', value);
  }
});

test('JWT decoding returns structured output and a stable invalid state', () => {
  const valid = decodeJwt('eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhcmMifQ.');
  assert.match(valid.header, /"alg": "none"/);
  assert.match(valid.payload, /"sub": "arc"/);
  assert.equal(decodeJwt('').error, null);
  assert.equal(decodeJwt('broken').error, 'invalid-token');
});

test('QR content validation prevents renderer capacity errors without discarding input', () => {
  assert.equal(validateQrContent('').status, 'empty');
  assert.equal(validateQrContent('https://example.com').status, 'valid');
  const oversized = validateQrContent('界'.repeat(QR_MAX_UTF8_BYTES));
  assert.ok(oversized.bytes > QR_MAX_UTF8_BYTES);
  assert.equal(oversized.status, 'too-long');
});
