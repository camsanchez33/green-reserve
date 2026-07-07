import React from 'react';

export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium ${className}`}>
      {children}
    </div>
  );
}
