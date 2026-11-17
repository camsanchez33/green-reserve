'use client';
// ANALYTICS-5 (Cam 2026-11-17, approved mockup lanes/dashboard/analytics-mockup.html): the pieces every Analytics tab
// shares. Tokens only, so Charcoal and Light both follow. Figure rows keep one-line labels with every number on the
// same line (Cam: "every figure row on one plane"); colour only on money lost (red, minus) and recovered (green, plus).
import type { ReactNode } from 'react';

export type Tone = 'lost' | 'gained' | 'up' | 'dn' | undefined;
const TONE: Record<string, string> = { lost: 'text-bad', gained: 'text-ok', up: 'text-ok', dn: 'text-bad' };

export type Figure = { label: string; value: string; tone?: Tone; note?: string; delta?: { text: string; tone?: Tone } };

/** A figure row: label over number, ruled above and below. `three` keeps a row of three at thirds. */
export function Figures({ items, three }: { items: (Figure | null | false | undefined)[]; three?: boolean }) {
  const shown = items.filter((x): x is Figure => !!x);
  if (!shown.length) return null;
  return (
    <div className={'grid border-y border-line ' + (three ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]')}>
      {shown.map(f => (
        <div key={f.label} className="grid content-start gap-1 py-3.5 pr-4 min-w-0">
          <span className="text-[13px] leading-[1.3] text-ink-muted md:whitespace-nowrap md:overflow-hidden md:text-ellipsis max-md:min-h-[2.6em] max-md:flex max-md:items-end">{f.label}</span>
          <b className={'text-[22px] leading-[1.2] font-semibold tabular-nums md:whitespace-nowrap ' + (f.tone ? TONE[f.tone] : 'text-ink')}>{f.value}</b>
          {f.delta && <small className={'text-[12px] font-medium ' + (f.delta.tone ? TONE[f.delta.tone] : 'text-ink-muted')}>{f.delta.text}</small>}
          {f.note && <em className="not-italic text-[12px] leading-[1.35] text-ink-muted">{f.note}</em>}
        </div>
      ))}
    </div>
  );
}

/** One block of a tab: a plain heading, then the detail. */
export function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[15px] font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Two blocks side by side on a wide screen. */
export function Pair({ children }: { children: ReactNode }) {
  return <div className="grid lg:grid-cols-2 gap-x-8 gap-y-7">{children}</div>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[12.5px] text-ink-muted">{children}</p>;
}

const SEG = ['bg-ink', 'bg-ink-muted', 'bg-line outline outline-1 -outline-offset-1 outline-ink-muted'];
/** A split of one whole: one 12px bar and its key. Shares are worked out here, from counts or cents. */
export function Split({ parts, label }: { parts: [string, number][]; label: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p[1]), 0);
  if (total <= 0) return <Note>None in these dates.</Note>;
  const shares = parts.map(([l, v]) => [l, Math.round((Math.max(0, v) / total) * 100)] as const);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 rounded-[6px] overflow-hidden gap-0.5" role="img" aria-label={`${label}: ${shares.map(([l, s]) => `${l} ${s}%`).join(', ')}`}>
        {parts.map(([l, v], i) => v > 0 && <i key={l} className={'block ' + SEG[i % SEG.length]} style={{ width: `${(v / total) * 100}%` }} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
        {shares.map(([l, s], i) => (
          <span key={l} className="inline-flex items-center gap-1.5"><i className={'inline-block w-2.5 h-2.5 rounded-[3px] ' + SEG[i % SEG.length]} />{l} <b className="text-ink font-semibold tabular-nums">{s}%</b></span>
        ))}
      </div>
    </div>
  );
}

/** A labelled bar: how big one part is against the largest. */
export function BarRow({ label, value, max, right }: { label: string; value: number; max: number; right: string }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)_50px] sm:grid-cols-[110px_minmax(0,1fr)_60px] gap-2.5 items-center text-[13px]">
      <span className="text-ink">{label}</span>
      <i className="block h-2 rounded-[4px] bg-line"><em className="block h-full rounded-[4px] bg-ink" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} /></i>
      <b className="font-medium text-right tabular-nums text-ink">{right}</b>
    </div>
  );
}

/** A plain table: header in muted text, rows ruled. The first column is the name; the rest read as numbers. */
export function Table({ head, rows, empty, tight, label }: { head: string[]; rows: ReactNode[][]; empty: string; tight?: boolean; label: string }) {
  if (!rows.length) return <Note>{empty}</Note>;
  const cols = `repeat(${head.length}, minmax(${tight ? 64 : 90}px, 1fr))`;
  return (
    <div className="overflow-x-auto" role="table" aria-label={label}>
      <div role="row" className="grid gap-2.5 py-1.5 text-[12px] text-ink-muted" style={{ gridTemplateColumns: cols, minWidth: tight ? undefined : head.length * 100 }}>
        {head.map((h, i) => <span key={i} role="columnheader">{h}</span>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} role="row" className="grid gap-2.5 py-[7px] border-t border-line text-[13px] tabular-nums text-ink items-center" style={{ gridTemplateColumns: cols, minWidth: tight ? undefined : head.length * 100 }}>
          {r.map((c, j) => <span key={j} role="cell" className="flex items-center gap-1.5 min-w-0">{c}</span>)}
        </div>
      ))}
    </div>
  );
}

/** A small bar inside a table cell, with the % beside it (the bar drops on a phone). */
export function CellBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-ink-muted">—</span>;
  return (
    <span className="grid grid-cols-1 sm:grid-cols-[minmax(40px,1fr)_38px] gap-2 items-center w-full">
      <i className="hidden sm:block h-2 rounded-[4px] bg-line"><em className="block h-full rounded-[4px] bg-ink" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></i>
      <b className="font-medium sm:text-right">{Math.round(pct)}%</b>
    </span>
  );
}

/** Spots booked against the spots offered, with a tick where they usually stand by now. */
export function PaceBar({ value, of, usual }: { value: number; of: number; usual: number | null }) {
  const w = (v: number) => `${of > 0 ? Math.min(100, (v / of) * 100) : 0}%`;
  return (
    <span className="block">
      <i className="relative block h-2 rounded-[4px] bg-line">
        <em className="block h-full rounded-[4px] bg-ink" style={{ width: w(value) }} />
        {usual != null && usual > 0 && <u className="absolute -top-1 -bottom-1 w-0.5 rounded-[1px] bg-warn" style={{ left: w(usual) }} />}
      </i>
    </span>
  );
}

/** How full each hour was, Monday to Sunday, with the day's own % at the end. */
export function Heatmap({ hours, rows, label }: { hours: number[]; rows: { dow: string; cells: (number | null)[]; all: number | null }[]; label: string }) {
  const cols = `40px repeat(${hours.length}, minmax(0, 1fr)) 40px`;
  const op = (c: number) => Math.max(0.06, Math.min(1, c / 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-[3px] items-center text-[11px] text-ink-muted" style={{ gridTemplateColumns: cols }} role="img" aria-label={label}>
        <span />
        {hours.map(h => <b key={h} className="font-medium text-center">{h % 12 || 12}<span className="max-sm:hidden">{h < 12 ? 'a' : 'p'}</span></b>)}
        <b className="font-medium text-right">All</b>
        {rows.map(r => [
          <span key={r.dow}>{r.dow}</span>,
          ...r.cells.map((c, i) => (
            <i key={`${r.dow}${i}`} className={'block h-4 sm:h-[22px] rounded-[4px] ' + (c == null ? 'bg-line/50' : 'bg-ink')} style={c == null ? undefined : { opacity: op(c) }}
              title={`${r.dow} ${hourLong(hours[i])}: ${c == null ? 'no tee times' : `${Math.round(c)}% full`}`} />
          )),
          <em key={`${r.dow}all`} className="not-italic text-[11.5px] text-ink text-right tabular-nums">{r.all == null ? '—' : `${Math.round(r.all)}%`}</em>,
        ])}
      </div>
      <div className="flex items-center justify-end gap-2 text-[12px] text-ink-muted" aria-hidden="true">
        <span>Empty</span>{[0.15, 0.35, 0.55, 0.75, 0.95].map(o => <i key={o} className="w-[18px] h-2.5 rounded-[3px] bg-ink" style={{ opacity: o }} />)}<span>Full</span>
      </div>
    </div>
  );
}
const hourLong = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
