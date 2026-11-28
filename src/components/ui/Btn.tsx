import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link' | 'danger';

// UI-KIT-4 (Cam 2026-11-26, the v4 kit's .btn): 36px, 8px radius. Primary is the brand green with a top highlight and a
// bottom edge (one filled primary per action area); secondary is a transparent button with a visible edge; ghost is the
// quiet button. Same props and same handlers as before.
export function Btn({ children, variant = 'primary', onClick, disabled, type = 'button', className = '' }: {
  children: React.ReactNode;
  variant?: Variant;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const base = 'inline-flex items-center justify-center gap-2 h-9 px-3.5 text-[14px] font-medium rounded-lg border border-transparent whitespace-nowrap transition-[transform,background-color,filter] duration-[120ms] ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[.97] disabled:opacity-45 disabled:cursor-default disabled:active:scale-100';
  const styles: Record<Variant, string> = {
    primary:   'bg-brand text-white hover:brightness-110 shadow-[inset_0_1px_0_rgb(255_255_255/.22),inset_0_-1px_0_rgb(0_0_0/.25),0_1px_2px_rgb(0_0_0/.25)]',
    secondary: 'text-ink border-ink/30 hover:bg-ink/10',
    ghost:     'text-ink-soft hover:text-ink hover:bg-ink/10',
    link:      'text-pine hover:text-pine-hover underline-offset-2 hover:underline px-0 h-auto',
    danger:    'bg-bad/10 border-bad/30 text-bad hover:bg-bad/20',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
