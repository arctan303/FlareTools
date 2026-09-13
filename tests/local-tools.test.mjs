import test from 'node:test';
import assert from 'node:assert/strict';
import { transformData } from '../src/utils/dataTransformer.js';
import { generatePassword } from '../src/utils/generatorTools.js';
import { analyzeString } from '../src/utils/stringProcessor.js';
import { fromHex, fromHsl, fromRgb } from '../src/utils/colorTools.js';
import { decodeJwt } from '../src/utils/jwtTools.js';
import { QR_MAX_UTF8_BYTES, validateQrContent } from '../src/utils/qrTools.js';
import { dateToTimestamp, timestampToDate } from '../src/utils/timestampTools.js';

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
