const SUPPORTED_LANGUAGES = new Set(['en', 'zh-CN']);

export function readLanguageCookie(cookieValue = '') {
  const match = cookieValue.match(/(?:^|;\s*)lang=([^;]+)/);
  return match && SUPPORTED_LANGUAGES.has(match[1]) ? match[1] : null;
}

export function resolveLanguagePreference(cookieValue = '', browserLanguage = '') {
  const savedLanguage = readLanguageCookie(cookieValue);
  if (savedLanguage) return savedLanguage;
  return browserLanguage.startsWith('zh') ? 'zh-CN' : 'en';
}
