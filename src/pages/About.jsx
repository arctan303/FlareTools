import { ArrowLeft, Cloud, Code2, ExternalLink, Globe, RadioTower, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useI18n } from '../contexts/I18nContext';

const PRIVACY_ROWS = [
  ['about_privacy_local_title', 'about_privacy_local_desc', ShieldCheck],
  ['about_privacy_text_title', 'about_privacy_text_desc', Cloud],
  ['about_privacy_file_title', 'about_privacy_file_desc', RadioTower],
];

export default function About() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-4xl">
      <SEO titleKey="about_title" descriptionKey="about_desc" />

      <Link
        to="/"
        className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back_home')}
      </Link>

      <header className="grid gap-7 border-b border-[var(--line)] pb-10 sm:grid-cols-[76px_minmax(0,1fr)] sm:items-start">
        <div className="flex size-[76px] items-center justify-center rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)]">
          <img src="/favicon.svg" alt="FlareTools" className="size-12" />
        </div>
        <div>
          <p className="font-mono text-base font-bold uppercase tracking-[0.16em] text-[var(--accent)]">{t('hero_eyebrow')}</p>
          <h1 className="mt-3 font-brand text-4xl font-semibold tracking-[-0.03em] text-[var(--text-strong)]">{t('about_heading')}</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--muted)]">{t('about_subheading')}</p>
        </div>
      </header>

      <div className="grid gap-x-12 gap-y-10 py-10 md:grid-cols-2">
        <section>
          <h2 className="flex items-center gap-2 font-brand text-xl font-semibold text-[var(--text-strong)]">
            <UserRound className="size-4 text-[var(--accent)]" aria-hidden="true" />
            {t('about_who')}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{t('about_who_body')}</p>
          <a
            href="https://github.com/arctan303/FlareTools"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] underline decoration-[var(--line-strong)] underline-offset-4 hover:decoration-[var(--accent)]"
          >
            GitHub Repository
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </section>

        <section>
          <h2 className="flex items-center gap-2 font-brand text-xl font-semibold text-[var(--text-strong)]">
            <Code2 className="size-4 text-[var(--accent)]" aria-hidden="true" />
            {t('about_tech')}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{t('about_tech_body')}</p>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs text-[var(--faint)]" aria-label={t('about_tech')}>
            {['React', 'Vite', 'Tailwind CSS', 'Cloudflare Pages', 'Workers', 'D1', 'WebRTC'].map((tech) => <li key={tech}>{tech}</li>)}
          </ul>
        </section>
      </div>

      <section className="border-y border-[var(--line)] py-10">
        <h2 className="font-brand text-2xl font-semibold text-[var(--text-strong)]">{t('about_privacy')}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">{t('about_privacy_intro')}</p>
        <div className="mt-7 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {PRIVACY_ROWS.map(([titleKey, descriptionKey, Icon]) => (
            <div key={titleKey} className="grid gap-3 py-5 sm:grid-cols-[180px_minmax(0,1fr)]">
              <h3 className="flex items-center gap-2 text-sm font-medium text-[var(--text-strong)]">
                <Icon className="size-4 text-[var(--accent)]" aria-hidden="true" />
                {t(titleKey)}
              </h3>
              <p className="text-sm leading-6 text-[var(--muted)]">{t(descriptionKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-brand text-xl font-semibold text-[var(--text-strong)]">{t('about_contact')}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t('about_contact_desc')}</p>
        </div>
        <a
          href="https://github.com/arctan303/FlareTools/issues"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--accent)]"
        >
          <Globe className="size-4" aria-hidden="true" />
          {t('about_issues_link')}
        </a>
      </section>
    </div>
  );
}
