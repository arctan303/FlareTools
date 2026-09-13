import { Component } from 'react';
import translations from '../locales/translations';
import { resolveLanguagePreference } from '../utils/languagePreference';

function getLang() {
  return resolveLanguagePreference(document.cookie, navigator.language || '');
}

function bt(key) {
  const lang = getLang();
  return translations[lang]?.[key] || translations['en']?.[key] || key;
}

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-20 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--danger)]">{bt('error_label')}</p>
          <h2 className="mt-3 font-brand text-2xl font-semibold text-[var(--text-strong)]">{bt('error_something_wrong')}</h2>
          <p className="mb-5 mt-2 text-sm leading-6 text-[var(--muted)]">{bt('error_refresh_hint')}</p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-[10px] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--on-accent)]"
          >
            {bt('error_refresh_btn')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
