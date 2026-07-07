import React from 'react';

export function StatGroup({ stats }: {
  stats: { label: string; value: string | number; delta?: React.ReactNode }[];
}) {
  return (
    <div className="bg-white border border-line rounded-lg flex divide-x divide-line-soft">
      {stats.map(s => (
        <div key={s.label} className="flex-1 px-5 py-4 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">{s.label}</div>
          <div className="text-[22px] font-serif font-medium text-ink leading-tight truncate">{s.value}</div>
          {s.delta && <div className="mt-0.5 text-[11px]">{s.delta}</div>}
        </div>
      ))}
    </div>
  );
}
