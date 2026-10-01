'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

// FLOW-2 (Cam 2026-10-01: "should be a little calendar pop up if needing to go
// into the future"): the date in a sheet's bar opens a month grid. Dates are
// YYYY-MM-DD strings, read at noon so no timezone can shift the day.
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (s: string) => new Date(s + 'T12:00:00');

export function MonthPicker({ value, onChange, today, label }: {
  value: string;
  onChange: (date: string) => void;
  today: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => { const d = at(value); return new Date(d.getFullYear(), d.getMonth(), 1, 12); });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const d = at(value); setMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, value]);

  const lead = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1, 12))),
  ];
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1, 12));

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
        className="inline-flex items-center gap-2 h-7 px-2 rounded-md whitespace-nowrap font-medium text-ink hover:bg-paper transition-colors">
        <CalendarDays className="w-4 h-4 text-ink-muted" />{label}
      </button>
      {open && (
        <div role="dialog" aria-label="Pick a date"
          className="absolute right-0 top-full mt-2 z-30 w-[268px] bg-white rounded-lg shadow-[0_0_0_1px_rgba(20,24,20,.08),0_12px_32px_-12px_rgba(20,24,20,.35)] p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[13.5px] font-semibold text-ink">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-muted mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => d === null ? <span key={i} /> : (
              <button key={d} type="button" onClick={() => { onChange(d); setOpen(false); }}
                className={'h-8 rounded-md text-[13px] tabular-nums transition-colors ' + (d === value
                  ? 'bg-pine text-white font-semibold'
                  : d === today ? 'text-pine font-semibold shadow-[inset_0_0_0_1px_var(--color-pine)] hover:bg-paper' : 'text-ink hover:bg-paper')}>
                {at(d).getDate()}
              </button>
            ))}
          </div>
          {value !== today && (
            <button type="button" onClick={() => { onChange(today); setOpen(false); }}
              className="mt-2 w-full text-[12.5px] font-semibold text-pine hover:underline underline-offset-4">Back to today</button>
          )}
        </div>
      )}
    </div>
  );
}
