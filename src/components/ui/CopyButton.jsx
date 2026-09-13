import { useEffect, useRef, useState } from 'react';
import { Check, Copy, CircleAlert } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import Button from './Button';

export default function CopyButton({
  className = '',
  disabled = false,
  label,
  onResult,
  value,
  variant = 'secondary',
}) {
  const { t } = useI18n();
  const [state, setState] = useState('idle');
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setState('copied');
      onResult?.(true);
    } catch {
      setState('failed');
      onResult?.(false);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  };

  const buttonLabel = state === 'copied'
    ? t('copied')
    : state === 'failed'
      ? t('copy_failed_short')
      : label || t('copy');

  return (
    <Button
      className={className}
      disabled={disabled || !value}
      variant={variant}
      onClick={handleCopy}
    >
      {state === 'copied'
        ? <Check className="size-4 text-[var(--success)]" aria-hidden="true" />
        : state === 'failed'
          ? <CircleAlert className="size-4 text-[var(--danger)]" aria-hidden="true" />
          : <Copy className="size-4" aria-hidden="true" />}
      {buttonLabel}
    </Button>
  );
}
