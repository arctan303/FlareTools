export const THEME_STORAGE_KEY = 'theme_pref';
export const THEME_PREFERENCE_TTL_MS = 6 * 60 * 60 * 1000;
export const THEME_MODES = Object.freeze(['system', 'light', 'dark']);

export function normalizeThemeMode(value) {
  return THEME_MODES.includes(value) ? value : 'system';
}

export function parseThemePreference(rawValue, now = Date.now()) {
  if (!rawValue) {
    return { mode: 'system', shouldRemove: false, shouldMigrate: false };
  }

  if (rawValue === 'light' || rawValue === 'dark') {
    return { mode: rawValue, shouldRemove: false, shouldMigrate: true };
  }

  try {
    const parsed = JSON.parse(rawValue);
    const mode = normalizeThemeMode(parsed?.value);
    const expires = Number(parsed?.expires);

    if (!Number.isFinite(expires) || expires <= now) {
      return { mode: 'system', shouldRemove: true, shouldMigrate: false };
    }

    if (mode !== parsed.value) {
      return { mode: 'system', shouldRemove: true, shouldMigrate: false };
    }

    return { mode, shouldRemove: false, shouldMigrate: false };
  } catch {
    return { mode: 'system', shouldRemove: true, shouldMigrate: false };
  }
}

export function serializeThemePreference(mode, now = Date.now()) {
  return JSON.stringify({
    value: normalizeThemeMode(mode),
    expires: now + THEME_PREFERENCE_TTL_MS,
  });
}

export function resolveTheme(mode, systemPrefersDark) {
  const normalized = normalizeThemeMode(mode);
  if (normalized === 'system') return systemPrefersDark ? 'dark' : 'light';
  return normalized;
}

export function readThemePreference(storage = window.localStorage, now = Date.now()) {
  const rawValue = storage.getItem(THEME_STORAGE_KEY);
  const result = parseThemePreference(rawValue, now);

  if (result.shouldRemove) {
    storage.removeItem(THEME_STORAGE_KEY);
  } else if (result.shouldMigrate) {
    storage.setItem(THEME_STORAGE_KEY, serializeThemePreference(result.mode, now));
  }

  return result.mode;
}

export function writeThemePreference(mode, storage = window.localStorage, now = Date.now()) {
  const normalized = normalizeThemeMode(mode);
  storage.setItem(THEME_STORAGE_KEY, serializeThemePreference(normalized, now));
  return normalized;
}

export function applyTheme(theme, root = document.documentElement) {
  const isDark = theme === 'dark';
  root.classList.toggle('dark', isDark);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', isDark ? '#181714' : '#f5f3ec');
  }

  return isDark;
}
