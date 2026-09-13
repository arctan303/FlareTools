export default function ToolPanel({
  as: Component = 'section',
  children,
  className = '',
  description,
  title,
}) {
  return (
    <Component
      className={`rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6 ${className}`}
    >
      {(title || description) && (
        <header className="mb-5">
          {title && (
            <h2 className="font-brand text-xl font-semibold text-[var(--text-strong)]">
              {title}
            </h2>
          )}
          {description && <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{description}</p>}
        </header>
      )}
      {children}
    </Component>
  );
}
