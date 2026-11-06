'use client';
// VIEWS-1 (Cam 2026-11-03): the Calendar view — a month at a glance, each day shaded by
// how full it is (players booked of spots offered, blocked times left out; from
// GET /api/operator/tee-times?month=). Tapping a day opens that day's sheet. Nothing
// here writes. The shade is never the only signal: every day prints its share.
import { useCallback, useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { emptyDayWords, notYetWords, type CalendarInfo } from '@/lib/calendar-days';

type Day = { date: string; times: number; spots: number; booked: number };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
/** Fill → shade. Dark fills carry white text; the share is always printed. */
// Only the full day is solid (its white text follows dark mode's .bg-pine rule); the rest stay light enough for ink.
const shade = (pct: number) => pct >= 95 ? 'bg-pine text-white' : pct >= 75 ? 'bg-pine/40 text-ink' : pct >= 50 ? 'bg-pine/[0.28] text-ink' : pct >= 25 ? 'bg-pine/[0.16] text-ink' : 'bg-pine/[0.07] text-ink';

export default function TeeSheetCalendar({ selectedDate, today, onPick }: {
  selectedDate: string;
  today: string;
  /** A day tapped: open its sheet. */
  onPick: (date: string) => void;
}) {
  const [month, setMonth] = useState(selectedDate.slice(0, 7));
  // The day stepper above still moves the date; follow it to its month.
  useEffect(() => { setMonth(selectedDate.slice(0, 7)); }, [selectedDate]);
  const [days, setDays] = useState<Day[] | null>(null);
  const [info, setInfo] = useState<CalendarInfo | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setDays(null); setError('');
    const r = await dfetch<{ month: string; days: Day[]; info: CalendarInfo }>(`/api/operator/tee-times?month=${month}`);
    if (r.ok) { setDays(r.data.days); setInfo(r.data.info); } else setError(r.error);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const [y, mo] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const byDate = new Map((days ?? []).map(d => [d.date, d]));
  const title = new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div>
      <div className="flex items-center gap-2 pb-3">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper transition-colors"><span aria-hidden="true">‹</span></button>
        <h3 className="text-[15px] font-semibold text-ink min-w-[9.5rem] text-center">{title}</h3>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper transition-colors"><span aria-hidden="true">›</span></button>
        {month !== today.slice(0, 7) && <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="ml-1 text-[12.5px] font-semibold text-pine hover:underline underline-offset-4">This month</button>}
      </div>
      {error ? <LoadError message={`Couldn't load ${title} — ${error}`} onRetry={load} /> : !days ? (
        <p role="status" className="py-16 text-center text-ink-muted">Loading {title}…</p>
      ) : (
        <>
          <div aria-hidden="true" className="grid grid-cols-7 gap-1.5 pb-1.5 text-[12px] text-ink-muted">{WEEKDAYS.map(w => <span key={w} className="px-1">{w}</span>)}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} aria-hidden="true" />)}
            {Array.from({ length: count }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              const d = byDate.get(date);
              const pct = d && d.spots > 0 ? Math.round(d.booked / d.spots * 100) : null;
              const fill = pct === null ? 'bg-paper text-ink-muted' : shade(pct);
              // CAL-2 (Cam 2026-11-06): "60 players · 19%"; an empty day says why; a day golfers can't book yet says when.
              const words = pct === null ? (info ? emptyDayWords(date, info) : 'No tee times') : `${d!.booked} ${d!.booked === 1 ? 'player' : 'players'} · ${pct >= 100 ? 'Full' : `${pct}%`}`;
              const later = pct !== null && info ? notYetWords(date, info) : '';
              return (
                <button key={date} type="button" onClick={() => onPick(date)}
                  aria-label={`${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}: ${words}${d ? `, ${d.spots} spots` : ''}${later ? `, ${later}` : ''}. Open the sheet`}
                  className={'h-[4.5rem] sm:h-20 rounded-md px-2 py-1.5 flex flex-col justify-between text-left transition-shadow hover:shadow-[0_0_0_2px_var(--color-pine)] '
                    + fill + (date === selectedDate ? ' shadow-[0_0_0_2px_var(--color-ink)]' : '') + (date < today ? ' opacity-60' : '')}>
                  <span className={'text-[13px] font-semibold tabular-nums' + (date === today ? ' underline underline-offset-4' : '')}>{i + 1}</span>
                  <span className="text-[12px] tabular-nums leading-tight">{words}{later && <span className="hidden sm:inline opacity-80"><br />{later}</span>}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
