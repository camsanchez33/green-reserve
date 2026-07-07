import React from 'react';

export function Card({ children, className = '', onClick, padding = 'p-5' }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: string;
}) {
  const base = `bg-white border border-line rounded-lg ${padding}`;
  if (onClick) {
    return (
      <div onClick={onClick} className={`${base} cursor-pointer hover:border-line-strong transition-colors ${className}`}>
        {children}
      </div>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}
