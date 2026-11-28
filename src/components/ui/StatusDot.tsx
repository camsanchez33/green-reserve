import React from 'react';

type StatusKey = 'ok' | 'bad' | 'warn' | 'neutral' | string;

// UI-KIT-4 (Cam 2026-11-26, supersedes the StatusDot rule): a status is the WORD in its colour, no dot; a problem
// state (red: Unpaid, Failed) also gets a soft red fill. Same props as before (status, label, hollow), so no call site
// changes. A StatusDot passed no label has no word to colour, so it stays the small dot (a count's marker, a toast's
// edge) in the same colour; `hollow` ("fine, nothing collected yet") only mattered as a dot and is a plain word now.
const DOT: Record<string, string> = {
  ok:      'bg-ok',
  bad:     'bg-bad',
  warn:    'bg-warn',
  neutral: 'bg-dot-neutral',
};
const TXT: Record<string, string> = {
  ok:      'text-ok',
  bad:     'text-bad',
  warn:    'text-warn',
  neutral: 'text-ink-soft',
};

export function StatusDot({ status, label, hollow = false }: { status: StatusKey; label?: string; hollow?: boolean }) {
  void hollow;
  if (!label) return <span className={`inline-block w-[5px] h-[5px] rounded-full shrink-0 ${DOT[status] || DOT.neutral}`}/>;
  const txt = TXT[status] || TXT.neutral;
  // The soft red fill: the problem colour at 18% over whatever it sits on.
  const fill = status === 'bad' ? ' px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--color-bad)_18%,transparent)]' : '';
  return <span className={`inline-block whitespace-nowrap text-[13px] font-medium ${txt}${fill}`}>{label}</span>;
}
