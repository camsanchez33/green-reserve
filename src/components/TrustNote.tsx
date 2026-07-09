import { ReactNode } from 'react';

// Short trust message at golfer hesitation points.
// Consistent style: xs, ink-soft, never a modal or tooltip.
export function TrustNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-xs text-ink-soft leading-relaxed ${className}`.trim()}>
      {children}
    </p>
  );
}
