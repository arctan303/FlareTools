import test from 'node:test';
import assert from 'node:assert/strict';
import translations from '../src/locales/translations.js';
import { API_ERROR_KEYS, getApiErrorKey } from '../src/locales/errorCodes.js';
import { ERROR_RESPONSE_CODES } from '../functions/api/text-share/responseCodes.js';

test('English and Chinese translation resources expose the same keys', () => {
  const englishKeys = Object.keys(translations.en).sort();
  const chineseKeys = Object.keys(translations['zh-CN']).sort();
  assert.deepEqual(chineseKeys, englishKeys);
});

test('every Worker error code has a localized frontend key', () => {
  for (const code of ERROR_RESPONSE_CODES) {
    const key = API_ERROR_KEYS[code];
    assert.ok(key, `Missing frontend error mapping for ${code}`);
    assert.ok(translations.en[key], `Missing English translation for ${key}`);
    assert.ok(translations['zh-CN'][key], `Missing Chinese translation for ${key}`);
  }
});

test('unknown Worker codes use the generic localized fallback key', () => {
  assert.equal(getApiErrorKey('FUTURE_ERROR'), 'api_error_unknown');
  assert.equal(translations['zh-CN'].layout_toolbox, '工具箱');
  assert.equal(translations.en.layout_toolbox, 'Tools');
});
