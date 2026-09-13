import { createContext, useCallback, useContext, useEffect, useState } from 'react';

let lastClick = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    lastClick = { x: e.clientX, y: e.clientY };
  }, true);
}
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from '../utils/themePreference';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => readThemePreference());
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      const resolved = resolveTheme(themeMode, media.matches);
      
      if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setIsDark(applyTheme(resolved));
        return;
      }

      const x = lastClick.x;
      const y = lastClick.y;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      const root = document.documentElement;
      root.style.setProperty('--vt-x', `${x}px`);
      root.style.setProperty('--vt-y', `${y}px`);
      root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`);
      root.setAttribute('data-theme-to', resolved);

      const transition = document.startViewTransition(() => {
        document.body.style.transition = 'none';
        setIsDark(applyTheme(resolved));
      });

      transition.finished.finally(() => {
        root.removeAttribute('data-theme-to');
        document.body.style.transition = '';
      });
    };

    syncTheme();
    if (themeMode === 'system') media.addEventListener('change', syncTheme);

    return () => media.removeEventListener('change', syncTheme);
  }, [themeMode]);

  const setThemeMode = useCallback((mode) => {
    setThemeModeState(writeThemePreference(mode));
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(isDark ? 'light' : 'dark');
  }, [isDark, setThemeMode]);

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
