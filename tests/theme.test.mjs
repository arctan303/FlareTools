import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseThemePreference,
  resolveTheme,
  serializeThemePreference,
  THEME_PREFERENCE_TTL_MS,
} from '../src/utils/themePreference.js';

test('theme preference migrates legacy light and dark values', () => {
  assert.deepEqual(parseThemePreference('dark', 100), {
    mode: 'dark',
    shouldRemove: false,
    shouldMigrate: true,
  });
  assert.deepEqual(parseThemePreference('light', 100), {
    mode: 'light',
    shouldRemove: false,
    shouldMigrate: true,
  });
});

test('theme preference accepts system mode and rejects expired or invalid values', () => {
  const active = JSON.stringify({ value: 'system', expires: 1_000 });
  assert.equal(parseThemePreference(active, 100).mode, 'system');

  const expired = JSON.stringify({ value: 'dark', expires: 99 });
  assert.deepEqual(parseThemePreference(expired, 100), {
    mode: 'system',
    shouldRemove: true,
    shouldMigrate: false,
  });

  assert.equal(parseThemePreference('{broken', 100).shouldRemove, true);
  assert.equal(parseThemePreference(JSON.stringify({ value: 'sepia', expires: 1_000 }), 100).shouldRemove, true);
});

test('theme serialization uses the shared expiry and resolution follows system preference', () => {
  const now = 1_000;
  assert.deepEqual(JSON.parse(serializeThemePreference('dark', now)), {
    value: 'dark',
    expires: now + THEME_PREFERENCE_TTL_MS,
  });
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
});
