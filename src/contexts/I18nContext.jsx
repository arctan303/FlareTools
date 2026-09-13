import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import translations from '../locales/translations';

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('lang');
    if (fromUrl && ['en', 'zh-CN'].includes(fromUrl)) {
      document.cookie = `lang=${fromUrl};path=/;max-age=${365*86400}`;
      return fromUrl;
    }
    const fromCookie = document.cookie.match(/(?:^|;\s*)lang=([^;]+)/);
    if (fromCookie && ['en', 'zh-CN'].includes(fromCookie[1])) return fromCookie[1];
    
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang && browserLang.startsWith('zh')) return 'zh-CN';
    return 'en';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const switchLang = (newLang) => {
    if (newLang === lang) return;

    const apply = () => {
      setLang(newLang);
      document.cookie = `lang=${newLang};path=/;max-age=${365*86400}`;
      const url = new URL(location.href);
      url.searchParams.set('lang', newLang);
      window.history.replaceState({}, '', url);
    };

    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply();
      return;
    }

    const transition = document.startViewTransition(() => {
      document.documentElement.classList.add('lang-transition');
      flushSync(() => {
        apply();
      });
    });

    transition.finished.finally(() => {
      document.documentElement.classList.remove('lang-transition');
    });
  };

  const t = useCallback((key) => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, switchLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
