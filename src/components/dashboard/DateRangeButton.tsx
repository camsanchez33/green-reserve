'use client';
// AN-3 (Cam 2026-10-19: "last 7 days 30 and this season are just sitting there
// … should have organized maybe like a calendar thing that defaults to the past
// week"). One button naming the dates; it opens shortcuts beside a month
// calendar. Click a day to start, a second day to end, then Show.
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';

export type DateRange = { from: string; to: string };

const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();
const fmt = (d: string, year = false) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const monthStart = (d: string) => d.slice(0, 8) + '01';
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + n, 1)); return t.toISOString().slice(0, 10); };
const monthEnd = (m: string) => addDays(shiftMonth(m, 1), -1);

/** The shortcuts, all ending no later than today (the course's date). */
export function presets(today: string): { key: string; label: string; range: DateRange }[] {
  const monday = addDays(today, -((dow(today) + 6) % 7));
  const y = Number(today.slice(0, 4)) - (today.slice(5) < '03-01' ? 1 : 0);
  const lastMonth = shiftMonth(monthStart(today), -1);
  return [
    { key: '7d', label: 'Last 7 days', range: { from: addDays(today, -6), to: today } },
    { key: 'week', label: 'This week', range: { from: monday, to: today } },
    { key: 'lastweek', label: 'Last week', range: { from: addDays(monday, -7), to: addDays(monday, -1) } },
    { key: 'month', label: 'This month', range: { from: monthStart(today), to: today } },
    { key: 'lastmonth', label: 'Last month', range: { from: lastMonth, to: monthEnd(lastMonth) } },
    { key: '30d', label: 'Last 30 days', range: { from: addDays(today, -29), to: today } },
    { key: 'season', label: 'This season', range: { from: `${y}-03-01`, to: today } },
  ];
}

/** "Oct 12 – Oct 18", with the year only when the range leaves this year. */
export function rangeLabel(r: DateRange, today: string) {
  const year = r.from.slice(0, 4) !== today.slice(0, 4) || r.to.slice(0, 4) !== today.slice(0, 4);
  return r.from === r.to ? fmt(r.from, year) : `${fmt(r.from, year)} – ${fmt(r.to, year)}`;
}

export default function DateRangeButton({ value, today, onChange }: { value: DateRange; today: string; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: string; to: string | null }>({ from: value.from, to: value.to });
  const [month, setMonth] = useState(monthStart(value.to));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({ from: value.from, to: value.to }); setMonth(monthStart(value.to));
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, value.from, value.to]);

  const list = today ? presets(today) : [];
  const activeKey = list.find(p => p.range.from === value.from && p.range.to === value.to)?.key;
  const pickDay = (d: string) => {
    if (d > today) return;
    if (draft.to !== null || d < draft.from) setDraft({ from: d, to: null }); // start a new range
    else setDraft({ from: draft.from, to: d });
  };
  const apply = (r: DateRange) => { onChange(r); setOpen(false); };

  // The month grid: leading blanks to Sunday, then each day.
  const first = month; const last = monthEnd(month);
  const cells: (string | null)[] = Array.from({ length: dow(first) }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  const lo = draft.from; const hi = draft.to ?? draft.from;

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        className="inline-flex items-center gap-2 bg-white border border-line hover:border-line-strong rounded-md px-3.5 py-2 text-[13.5px] font-medium text-ink transition-colors">
        <span className="tabular-nums">{today ? rangeLabel(value, today) : 'Loading…'}</span>
        <span aria-hidden="true" className="text-ink-muted text-[11px]">▾</span>
      </button>
      {open && today && (
        <Card role="dialog" aria-label="Choose dates" className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-40 flex flex-col sm:flex-row w-[min(560px,calc(100vw-32px))]">
          <ul className="sm:w-44 shrink-0 p-2 border-b sm:border-b-0 sm:border-r border-line-soft grid grid-cols-2 sm:grid-cols-1 gap-0.5">
            {list.map(p => (
              <li key={p.key}>
                <button onClick={() => apply(p.range)}
                  className={'w-full text-left px-3 py-2 rounded-md text-[13.5px] ' + (activeKey === p.key ? 'bg-pine/[0.07] text-pine font-semibold' : 'text-ink hover:bg-paper')}>{p.label}</button>
              </li>
            ))}
          </ul>
          <div className="p-4 flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month" className="w-8 h-8 rounded-md hover:bg-paper text-ink-soft text-[18px] leading-none"><span aria-hidden="true">‹</span></button>
              <span className="text-[14px] font-semibold text-ink">{new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
              <button onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={shiftMonth(month, 1) > today} aria-label="Next month" className="w-8 h-8 rounded-md hover:bg-paper text-ink-soft text-[18px] leading-none disabled:opacity-30"><span aria-hidden="true">›</span></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[12px] text-ink-muted mb-1">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center text-[13px] tabular-nums">
              {cells.map((d, i) => {
                if (!d) return <span key={i} />;
                const inRange = d >= lo && d <= hi; const end = d === lo || d === hi; const future = d > today;
                return (
                  <button key={d} onClick={() => pickDay(d)} disabled={future}
                    className={'h-8 ' + (end ? 'bg-pine text-white font-semibold rounded-md' : inRange ? 'bg-pine/[0.08] text-ink' : future ? 'text-ink-faint' : 'text-ink hover:bg-paper rounded-md')}>
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-line-soft">
              <span className="text-[12.5px] text-ink-soft">{draft.to === null ? 'Now pick the last day' : rangeLabel({ from: draft.from, to: draft.to }, today)}</span>
              <button onClick={() => draft.to && apply({ from: draft.from, to: draft.to })} disabled={draft.to === null}
                className="px-3.5 py-1.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">Show</button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
