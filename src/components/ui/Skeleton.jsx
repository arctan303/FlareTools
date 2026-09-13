import { useI18n } from '../../contexts/I18nContext';

export default function Skeleton() {
  const { t } = useI18n();
  
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse space-y-8 py-4 sm:py-8" role="status" aria-busy="true">
      {/* Header Skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-[var(--line)]"></div>
        <div className="h-8 w-1/2 rounded bg-[var(--line-strong)]"></div>
        <div className="h-4 w-3/4 rounded bg-[var(--line)]"></div>
      </div>
      
      {/* Content Area Skeleton */}
      <div className="space-y-4">
        <div className="h-40 w-full rounded-[10px] bg-[var(--page-soft)] border border-[var(--line)]"></div>
        <div className="h-32 w-full rounded-[10px] bg-[var(--page-soft)] border border-[var(--line)]"></div>
      </div>

      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
