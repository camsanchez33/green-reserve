import React from 'react';

type StatusKey = 'ok' | 'bad' | 'warn' | 'neutral' | string;

const DOT: Record<string, string> = {
  ok:      'bg-ok',
  bad:     'bg-bad',
  warn:    'bg-warn',
  neutral: 'bg-dot-neutral',
};
// SD-8e: a hollow ring in the same colour — "fine, nothing collected yet"
// beside a filled "paid". Same 5px footprint so rows stay aligned.
const RING: Record<string, string> = {
  ok:      'border-ok',
  bad:     'border-bad',
  warn:    'border-warn',
  neutral: 'border-dot-neutral',
};
const TXT: Record<string, string> = {
  ok:      'text-ok',
  bad:     'text-bad',
  warn:    'text-warn',
  neutral: 'text-ink-muted',
};

export function StatusDot({ status, label, hollow = false }: { status: StatusKey; label?: string; hollow?: boolean }) {
  const dot = hollow ? `border ${RING[status] || RING.neutral}` : (DOT[status] || DOT.neutral);
  const txt = TXT[status] || TXT.neutral;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${dot}`}/>
      {label && <span className={`text-xs font-medium ${txt}`}>{label}</span>}
    </span>
  );
}
