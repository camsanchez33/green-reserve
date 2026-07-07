import React from 'react';

export function PageHeader({ title, sub, action }: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">{title}</h1>
        {sub && <p className="text-sm text-ink-soft mt-0.5">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
