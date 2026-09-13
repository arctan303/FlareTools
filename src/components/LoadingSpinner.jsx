import { LoaderCircle } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

export default function LoadingSpinner() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[45vh] items-center justify-center" role="status">
      <LoaderCircle className="size-6 animate-spin text-[var(--accent)] motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
