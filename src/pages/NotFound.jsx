import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useI18n } from '../contexts/I18nContext';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-20">
      <SEO titleKey="not_found_title" descriptionKey="not_found_desc" robots="noindex" />
      <p className="font-mono text-sm text-[var(--accent)]">{t('not_found_code_label')}</p>
      <h1 className="mt-5 font-brand text-4xl font-semibold tracking-[-0.03em] text-[var(--text-strong)] sm:text-6xl">
        {t('not_found_heading')}
      </h1>
      <p className="mt-5 max-w-xl text-base leading-8 text-[var(--muted)]">{t('not_found_desc')}</p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--on-accent)]"
      >
        {t('back_home')}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
