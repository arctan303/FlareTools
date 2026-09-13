import { forwardRef } from 'react';

const VARIANTS = {
  primary: 'border-transparent bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-95 active:brightness-90',
  secondary: 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-strong)] hover:border-[var(--accent)] hover:text-[var(--accent)]',
  ghost: 'border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)]',
  danger: 'border-transparent bg-[var(--danger)] text-[var(--on-danger)] hover:brightness-95 active:brightness-90',
};

const SIZES = {
  sm: 'min-h-9 px-3 py-1.5 text-sm',
  md: 'min-h-11 px-4 py-2 text-sm',
  lg: 'min-h-12 px-5 py-2.5 text-base',
};

const Button = forwardRef(function Button({
  children,
  className = '',
  disabled = false,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}, ref) {
  const variantClass = VARIANTS[variant] || VARIANTS.primary;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] border font-medium transition-[color,background-color,border-color,filter,transform] duration-[var(--motion-fast)] disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
});

export default Button;
