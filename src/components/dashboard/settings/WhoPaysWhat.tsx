'use client';
// Settings → Prices & fees: "Who pays what" (Cam 2026-10-19). One table of the
// kinds of golfer the course has and what each pays, read from Schedule and
// Members (lib/who-pays.ts). Prices are changed where they live; this table is
// where a course sees them side by side.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { whoPays, type WireSchedule, type WireTier, type Cell, type Period } from '@/lib/who-pays';

const money = (v: number) => `$${v.toFixed(2)}`;

/** One kind of golfer's prices: a line per price period, weekdays and weekends. */
function Prices({ weekday, weekend, periods }: { weekday: Cell[]; weekend: Cell[]; periods: Period[] }) {
  const show = (c: Cell | undefined) => !c || c.na ? <span className="text-ink-faint" title="No tee times on these days">—</span>
    : c.dollars == null ? <span className="text-ink-muted">Public rate</span> : <span className="tabular-nums">{money(c.dollars)}</span>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1 text-[13.5px]">
      <span className="text-[12px] text-ink-muted">{periods.length > 1 ? 'Times' : ''}</span>
      <span className="text-[12px] text-ink-muted text-right">Weekdays</span>
      <span className="text-[12px] text-ink-muted text-right">Weekends</span>
      {periods.map((p, i) => (
        <div key={p.id} className="contents">
          <span className="text-ink-soft truncate">{periods.length > 1 ? p.label : ''}</span>
          <span className="text-right">{show(weekday[i])}</span>
          <span className="text-right">{show(weekend[i])}</span>
        </div>
      ))}
    </div>
  );
}

export function WhoPaysWhat({ accessLoaded, accessFailed, canSeeSchedule, canSeeMembers }: { accessLoaded: boolean; accessFailed: boolean; canSeeSchedule: boolean; canSeeMembers: boolean }) {
  const [data, setData] = useState<ReturnType<typeof whoPays> | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    // What this login may see isn't known until the access check answers.
    if (!accessLoaded) return;
    if (accessFailed) { setError('We couldn’t check what your login can see. Reload the page to try again.'); return; }
    if (!canSeeSchedule) { setError('Your login can’t see the schedule, where prices are set. Ask the course owner.'); return; }
    const [s, t] = await Promise.all([
      dfetch<WireSchedule[]>('/api/operator/schedule'),
      canSeeMembers ? dfetch<WireTier[]>('/api/operator/tiers') : Promise.resolve(null),
    ]);
    if (!s.ok) { setError(s.error); return; }
    if (t && !t.ok) { setError(t.error); return; }
    setData(whoPays(s.data, t?.ok ? t.data : []));
  }, [accessLoaded, accessFailed, canSeeSchedule, canSeeMembers]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Who pays what</h2>
        <span className="text-[12.5px] text-ink-muted">Green fee per player</span>
      </div>
      {error && <div className="mt-3"><LoadError message={error} onRetry={canSeeSchedule && !accessFailed ? load : undefined} /></div>}
      {!data && !error && <p className="mt-3 text-[13.5px] text-ink-muted">Loading prices…</p>}
      {data && data.periods.length === 0 && (
        <p className="mt-3 text-[13.5px] text-ink-soft">No tee times are set up yet, so there are no prices to show. Set them in <Link href="/dashboard/schedules" className="text-pine font-medium hover:underline">Schedule</Link>.</p>
      )}
      {data && data.periods.length > 0 && (
        <ul className="mt-3 divide-y divide-line-soft border-t border-line-soft">
          {data.rows.map(r => (
            <li key={r.key} className="py-3.5 grid gap-x-6 gap-y-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div>
                <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                  {r.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} aria-hidden="true" />}
                  {r.label}
                </div>
                <p className="text-[12.5px] text-ink-muted mt-0.5 leading-snug">{r.who}</p>
              </div>
              <Prices weekday={r.weekday} weekend={r.weekend} periods={data.periods} />
            </li>
          ))}
        </ul>
      )}
      {data && data.periods.length > 0 && !canSeeMembers && (
        <p className="mt-3 text-[12.5px] text-ink-muted">Membership prices aren&apos;t shown — your login can&apos;t see Members.</p>
      )}
      {data && data.periods.length > 0 && !data.rows.some(r => r.key === 'resident') && (
        <p className="mt-3 text-[12.5px] text-ink-muted">No resident prices. To charge residents less, add a resident price to a schedule.</p>
      )}
      <p className="mt-3 text-[13px] text-ink-soft">
        Change public and resident prices in <Link href="/dashboard/schedules" className="text-pine font-medium hover:underline">Schedule</Link>
        {canSeeMembers && <>, and membership prices in <Link href="/dashboard/members" className="text-pine font-medium hover:underline">Members</Link></>}.
        {' '}Cart fees are on top. Golfers pay $1.50 per player on each online booking, added to your price.
      </p>
    </Card>
  );
}
