export default function ToolPageHeader({
  actions,
  description,
  eyebrow,
  icon: Icon,
  title,
}) {
  return (
    <header className="border-b border-[var(--line)] pb-6 sm:pb-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--accent)]">
              {eyebrow}
            </p>
          )}
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--surface)] text-[var(--accent)]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            )}
            <div>
              <h1 className="font-brand text-3xl font-semibold leading-tight tracking-tight text-[var(--text-strong)] sm:text-4xl">
                {title}
              </h1>
              {description && (
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
