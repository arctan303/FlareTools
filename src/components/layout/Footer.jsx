import { Cloud, RadioTower, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';

const PRIVACY_ITEMS = [
  ['footer_local_title', 'footer_local_desc', ShieldCheck],
  ['footer_text_title', 'footer_text_desc', Cloud],
  ['footer_file_title', 'footer_file_desc', RadioTower],
];

export default function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-[var(--page-soft)]">
      <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-5 border-b border-[var(--line)] pb-7 md:grid-cols-3">
          {PRIVACY_ITEMS.map(([titleKey, descriptionKey, Icon]) => (
            <div key={titleKey} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-[var(--text-strong)]">{t(titleKey)}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t(descriptionKey)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 pt-6 text-xs text-[var(--faint)] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} {t('site_name')}. {t('footer_copyright')}</p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label={t('layout_footer_nav')}>
            <a
              href="https://github.com/arctan303/FlareTools"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-[var(--text-strong)]"
            >
              {t('layout_space')}
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
