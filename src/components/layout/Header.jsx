import { useRef, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, ChevronDown, Languages, Monitor, Moon, Sun, Home, Info } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useI18n } from '../../contexts/I18nContext';

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };

export default function Header() {
  const { themeMode, setThemeMode } = useTheme();
  const { lang, switchLang, t } = useI18n();
  const { pathname } = useLocation();
  const themeMenuRef = useRef(null);
  const languageMenuRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const ThemeIcon = THEME_ICONS[themeMode] || Monitor;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const selectTheme = (mode) => {
    setThemeMode(mode);
    themeMenuRef.current?.removeAttribute('open');
  };

  const selectLanguage = (nextLanguage) => {
    switchLang(nextLanguage);
    languageMenuRef.current?.removeAttribute('open');
  };

  return (
    <header className={`sticky top-0 z-50 transition-all duration-[var(--motion-base)] ${scrolled ? 'border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_92%,transparent)] backdrop-blur-xl' : 'border-b border-transparent bg-transparent'}`}>
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 px-4 sm:h-[62px] sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1.5 font-brand text-sm font-semibold tracking-[0.16em] text-[var(--text-strong)] transition-colors hover:text-[var(--accent)]"
          aria-label={`${t('site_name')} ${t('nav_home')}`}
        >
          {t('brand_wordmark')}
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <nav className="flex items-center gap-1 sm:hidden" aria-label={t('layout_site_nav')}>
            <Link
              to="/"
              className={`flex size-11 items-center justify-center rounded-[8px] transition-colors hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)] ${pathname === '/' ? 'text-[var(--text-strong)] relative after:absolute after:inset-x-3 after:bottom-1.5 after:h-px after:bg-[var(--accent)]' : 'text-[var(--muted)]'}`}
              aria-label={t('nav_home')}
            >
              <Home className="size-[18px]" aria-hidden="true" />
            </Link>
            <Link
              to="/about"
              className={`flex size-11 items-center justify-center rounded-[8px] transition-colors hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)] ${pathname === '/about' ? 'text-[var(--text-strong)] relative after:absolute after:inset-x-3 after:bottom-1.5 after:h-px after:bg-[var(--accent)]' : 'text-[var(--muted)]'}`}
              aria-label={t('nav_about')}
            >
              <Info className="size-[18px]" aria-hidden="true" />
            </Link>
          </nav>
          <nav className="hidden items-center gap-2 text-xs text-[var(--muted)] sm:flex" aria-label={t('layout_site_nav')}>
            {[
              ['/', 'nav_home'],
              ['/about', 'nav_about'],
            ].map(([to, labelKey]) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`relative inline-flex min-h-11 min-w-11 items-center justify-center px-2.5 transition-colors after:absolute after:inset-x-2.5 after:bottom-1.5 after:h-px after:origin-right after:bg-[var(--accent)] after:transition-transform hover:text-[var(--text-strong)] hover:after:origin-left hover:after:scale-x-100 ${active ? 'font-medium text-[var(--text-strong)] after:scale-x-100' : 'after:scale-x-0'}`}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>

          <details ref={languageMenuRef} className="group relative">
            <summary
              className="flex size-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-[8px] text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)] sm:min-h-11 sm:w-auto sm:px-2.5 [&::-webkit-details-marker]:hidden"
              aria-label={`${t('layout_language')}: ${lang === 'zh-CN' ? t('language_zh') : t('language_en')}`}
            >
              <Languages className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{lang === 'zh-CN' ? '中' : 'EN'}</span>
              <ChevronDown className="hidden size-3.5 transition-transform group-open:rotate-180 sm:block" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-full mt-2 w-40 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-float)]">
              {[
                ['zh-CN', '简体中文'],
                ['en', 'English'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectLanguage(value)}
                  className="flex min-h-11 w-full items-center justify-between rounded-[8px] px-3 text-left text-sm text-[var(--text)] hover:bg-[var(--page-soft)]"
                  aria-pressed={lang === value}
                >
                  {label}
                  {lang === value && <Check className="size-4 text-[var(--accent)]" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </details>

          <details ref={themeMenuRef} className="group relative">
            <summary
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-[8px] text-[var(--muted)] transition-colors hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)] [&::-webkit-details-marker]:hidden"
              aria-label={`${t('layout_theme')}: ${t(`theme_${themeMode}`)}`}
              title={`${t('layout_theme')}: ${t(`theme_${themeMode}`)}`}
            >
              <ThemeIcon className="size-[18px]" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-full mt-2 w-44 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-float)]">
              {['system', 'light', 'dark'].map((mode) => {
                const ModeIcon = THEME_ICONS[mode];
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selectTheme(mode)}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-3 text-left text-sm text-[var(--text)] hover:bg-[var(--page-soft)]"
                    aria-pressed={themeMode === mode}
                  >
                    <ModeIcon className="size-4 text-[var(--muted)]" aria-hidden="true" />
                    <span className="flex-1">{t(`theme_${mode}`)}</span>
                    {themeMode === mode && <Check className="size-4 text-[var(--accent)]" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
