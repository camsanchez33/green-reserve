'use client';

// AW-7 (Cam 2026-10-21): Bookings — players per week booked online vs at the
// counter or by phone, and the online share; then the recent bookings. Plain
// HTML/CSS bars, no chart library (AN-1).

import { formatDate as fmtDate, formatMoney as fmtMoney, formatTeeTime as fmtTime } from '@/lib/format';
import { lastBookingLabel, periodDelta } from '@/lib/course-metrics';
import { Card } from '@/components/ui/Card';
import { useCourse } from './context';

const share = (online: number, counter: number) => online + counter === 0 ? null : Math.round((online / (online + counter)) * 100);
const fmtWeek = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function BookingsTab() {
  const { detail } = useCourse();
  const weeks = detail.weeks;
  const online = weeks.reduce((n, w) => n + w.online, 0);
  const counter = weeks.reduce((n, w) => n + w.counter, 0);
  const total = share(online, counter);
  const max = Math.max(1, ...weeks.map(w => w.online + w.counter));
  const trend = periodDelta(detail.bookings30d, detail.bookingsPrior30d);

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-[14px] text-ink">
        {total === null
          ? 'No rounds played in the last 8 weeks.'
          : <>{total}% of players in the last 8 weeks booked online <span className="text-ink-muted">({online} online, {counter} at the counter or by phone)</span>.</>}
        {detail.lastBookingAt ? ` Last booking made ${lastBookingLabel(detail.lastBookingAt).toLowerCase()}.` : ''}
        {' '}{detail.bookings30d} booking{detail.bookings30d === 1 ? '' : 's'} in the last 30 days
        {trend.pct === null ? '' : `, ${trend.pct > 0 ? 'up' : trend.pct < 0 ? 'down' : 'level'}${trend.pct === 0 ? '' : ` ${Math.abs(trend.pct).toFixed(0)}%`} on the 30 before`}.
      </p>

      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-ink">Players by week</h2>
          <div className="flex items-center gap-4 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-pine" />Online</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-line-strong" />Counter or phone</span>
          </div>
        </div>
        <div className="divide-y divide-line-soft">
          {weeks.map(w => {
            const n = w.online + w.counter;
            const pct = share(w.online, w.counter);
            return (
              <div key={w.weekStart} className="grid grid-cols-[88px_1fr_120px] gap-3 items-center py-2">
                <span className="text-[13px] text-ink-muted tabular-nums">Wk of {fmtWeek(w.weekStart)}</span>
                <div className="h-3 bg-paper rounded-sm overflow-hidden flex" aria-hidden>
                  <div className="bg-pine h-full" style={{ width: `${(w.online / max) * 100}%` }} />
                  <div className="bg-line-strong h-full" style={{ width: `${(w.counter / max) * 100}%` }} />
                </div>
                <span className="text-[13px] text-ink tabular-nums text-right">
                  {n === 0 ? <span className="text-ink-muted">none</span> : <>{n} · {pct}% online</>}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div>
        <h2 className="text-[15px] font-semibold text-ink mb-2">Recent bookings</h2>
        {detail.recentBookings.length === 0 ? (
          <Card className="px-5 py-8 text-center text-sm text-ink-muted">
            {detail.totalBookings === 0 ? 'No bookings yet for this course.' : 'No bookings in the last 30 days.'}
          </Card>
        ) : (
          <Card className="divide-y divide-line-soft">
            {detail.recentBookings.map(b => (
              <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink text-sm">{b.golferName}</div>
                  <div className="text-xs text-ink-muted">
                    {fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.players} player{b.players !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-sm text-ink tabular-nums">{fmtMoney(b.totalAmount / 100)}</div>
              </div>
            ))}
          </Card>
        )}
        <p className="mt-2 text-[12px] text-ink-muted">{detail.totalBookings} booking{detail.totalBookings === 1 ? '' : 's'} all time.</p>
      </div>
    </div>
  );
}
