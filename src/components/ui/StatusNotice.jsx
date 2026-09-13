import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

const STATUS_STYLES = {
  info: {
    icon: Info,
    className: 'border-[var(--line)] bg-[var(--page-soft)] text-[var(--text)]',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-[color-mix(in_srgb,var(--success)_42%,var(--line))] bg-[color-mix(in_srgb,var(--success)_9%,var(--surface))] text-[var(--text)]',
  },
  warning: {
    icon: TriangleAlert,
    className: 'border-[color-mix(in_srgb,var(--warning)_42%,var(--line))] bg-[color-mix(in_srgb,var(--warning)_9%,var(--surface))] text-[var(--text)]',
  },
  error: {
    icon: AlertCircle,
    className: 'border-[color-mix(in_srgb,var(--danger)_42%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_9%,var(--surface))] text-[var(--text)]',
  },
};

export default function StatusNotice({ children, className = '', title, tone = 'info' }) {
  const config = STATUS_STYLES[tone] || STATUS_STYLES.info;
  const StatusIcon = config.icon;
  const isError = tone === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`flex items-start gap-3 rounded-[10px] border px-4 py-3 text-sm leading-relaxed ${config.className} ${className}`}
    >
      <StatusIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-medium text-[var(--text-strong)]">{title}</p>}
        <div className={title ? 'mt-1 text-[var(--muted)]' : ''}>{children}</div>
      </div>
    </div>
  );
}
