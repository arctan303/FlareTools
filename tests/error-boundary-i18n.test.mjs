import test from 'node:test';
import assert from 'node:assert/strict';
import { readLanguageCookie, resolveLanguagePreference } from '../src/utils/languagePreference.js';

test('error boundary language honors both supported cookie values', () => {
  assert.equal(readLanguageCookie('theme=dark; lang=en; session=1'), 'en');
  assert.equal(readLanguageCookie('lang=zh-CN'), 'zh-CN');
  assert.equal(resolveLanguagePreference('lang=en', 'zh-CN'), 'en');
  assert.equal(resolveLanguagePreference('lang=zh-CN', 'en-US'), 'zh-CN');
});

test('error boundary language falls back to the browser for invalid or absent cookies', () => {
  assert.equal(resolveLanguagePreference('', 'zh-HK'), 'zh-CN');
  assert.equal(resolveLanguagePreference('lang=fr', 'en-US'), 'en');
});
