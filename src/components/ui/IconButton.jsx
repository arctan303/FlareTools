import { forwardRef } from 'react';

const IconButton = forwardRef(function IconButton({
  children,
  className = '',
  label,
  size = 'md',
  type = 'button',
  ...props
}, ref) {
  const sizeClass = size === 'sm' ? 'size-11 [&>svg]:size-4' : 'size-11';

  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={props.title || label}
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] border border-transparent text-[var(--muted)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--page-soft)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export default IconButton;
