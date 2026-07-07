import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link' | 'danger';

export function Btn({ children, variant = 'primary', onClick, disabled, type = 'button', className = '' }: {
  children: React.ReactNode;
  variant?: Variant;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const base = 'inline-flex items-center gap-1.5 text-[12.5px] font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const styles: Record<Variant, string> = {
    primary:   'bg-pine hover:bg-pine-hover text-white px-4 py-2',
    secondary: 'bg-white border border-line text-ink hover:border-line-strong px-4 py-2',
    ghost:     'text-ink-soft hover:text-ink hover:bg-paper px-3 py-2',
    link:      'text-pine hover:text-pine-hover underline-offset-2 hover:underline',
    danger:    'bg-bad/10 border border-bad/30 text-bad hover:bg-bad/20 px-4 py-2',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
