import React from 'react';

export function SidebarShell({ variant = 'admin', children, accent }: {
  variant?: 'admin' | 'operator';
  children: React.ReactNode;
  accent?: string;
}) {
  if (variant === 'admin') {
    return (
      <div className="fixed left-0 top-0 h-full w-56 bg-pine flex flex-col z-10 overflow-y-auto">
        {children}
      </div>
    );
  }
  return (
    <div
      className="fixed left-0 top-0 h-full w-56 bg-white border-r border-line flex flex-col z-10 overflow-y-auto"
      style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
