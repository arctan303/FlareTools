import { ArrowLeft, ChevronDown, LayoutGrid } from 'lucide-react';
import Sidebar from './Sidebar';
import { useI18n } from '../../contexts/I18nContext';

export default function ToolLayout({ children }) {
  const { t } = useI18n();

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/';
  };

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_210px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_230px]">
      <div className="min-w-0">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-4 md:mb-7">
          <button
            type="button"
            onClick={goBack}
            className="group inline-flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)]"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            <span>{t('back')}</span>
          </button>

          <details className="group relative md:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--text-strong)] [&::-webkit-details-marker]:hidden">
              <LayoutGrid className="size-4 text-[var(--accent)]" aria-hidden="true" />
              {t('layout_browse_tools')}
              <ChevronDown className="size-4 text-[var(--muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[min(84vw,320px)] overflow-y-auto rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-float)]">
              <Sidebar />
            </div>
          </details>
        </div>
        {children}
      </div>

      <aside className="sticky top-[86px] hidden self-start border-l border-[var(--line)] pl-6 md:block" aria-label={t('layout_tool_directory')}>
        <Sidebar />
      </aside>
    </div>
  );
}
