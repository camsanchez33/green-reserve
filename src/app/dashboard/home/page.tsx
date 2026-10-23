'use client';
// DASH-C Home (Cam 2026-10-22, "very nice" on the mockups): today at a glance —
// players by hour against the same weekday last week, what needs the course,
// its money, and the next tee times. Data: /api/operator/home (one load) and,
// for logins that see payouts, /api/operator/stripe/payouts.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import type { PayoutsData } from '@/components/dashboard/money/PayoutsTable';

type Group = { id: string; name: string; players: number; paymentStatus: string; checkedIn: boolean };
type Home = {
  courseName: string; today: string; lastWeek: string; clock: string;
  hours: { hour: number; today: number; lastWeek: number }[];
  players: { today: number; lastWeek: number };
  fillPct: { today: number | null; lastWeek: number | null };
  money: null | { paidCents: number; paidRounds: number; outstandingCents: number; outstandingGroups: number; lateFeesWeekCents: number };
  declined: { id: string; name: string; date: string; time: string; amountCents: number | null }[];
  late: { id: string; name: string; time: string }[];
  unreadMessages: number;
  comingUp: { time: string; open: number; groups: Group[] }[];
};

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
const longDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const weekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const PAID = new Set(['paid', 'paid_offline']);

function diff(now: number, then: number, unit = '') {
  const d = now - then;
  if (d === 0) return { tone: 'text-ink-muted', text: `same as last week${unit}` };
  return { tone: d > 0 ? 'text-ok' : 'text-bad', text: `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} vs last week` };
}

export default function DashboardHome() {
  const access = useDashboardAccess();
  const seesPayouts = access.can('money.payouts');
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState('');
  const [payouts, setPayouts] = useState<PayoutsData | null>(null);
  const [payoutError, setPayoutError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const r = await dfetch<Home>('/api/operator/home');
    if (!r.ok || !r.data) { setError(r.ok ? 'Nothing came back — try again.' : r.error); return; }
    setHome(r.data);
  }, []);
  const loadPayouts = useCallback(async () => {
    setPayoutError('');
    const r = await dfetch<PayoutsData>('/api/operator/stripe/payouts');
    if (!r.ok || !r.data) { setPayoutError(r.ok ? 'Nothing came back from Stripe.' : r.error); return; }
    setPayouts(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (access.loaded && seesPayouts) loadPayouts(); }, [access.loaded, seesPayouts, loadPayouts]);

  // The chart spans the hours that have tee times either day (at least 6am–6pm).
  const active = home ? home.hours.filter(h => h.today || h.lastWeek).map(h => h.hour) : [];
  const from = Math.min(6, ...active), to = Math.max(18, ...active);
  const shown = home ? home.hours.filter(h => h.hour >= from && h.hour <= to) : [];
  const peak = Math.max(1, ...shown.map(h => Math.max(h.today, h.lastWeek)));

  const paidOut30 = payouts?.payouts.filter(p => p.status === 'paid' && Date.now() - new Date(p.arrivalDate).getTime() < 30 * 86_400_000).reduce((s, p) => s + p.amountCents, 0) ?? null;
  const needs = home ? home.declined.length + home.late.length + (home.unreadMessages > 0 ? 1 : 0) : 0;

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="home" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-10 py-7 flex flex-col gap-8">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[260px]">
              <h1 className="font-serif text-[32px] leading-none text-ink">{home ? longDate(home.today) : 'Today'}</h1>
              <p className="mt-2.5 text-[14px] text-ink-soft">{home ? `${home.courseName} · as of ${fmtTime(home.clock)}` : 'Loading today…'}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard" className="text-[13px] font-medium text-ink px-3.5 py-2 rounded-md bg-white border border-line hover:border-line-strong">Open tee sheet</Link>
              <button type="button" onClick={load} aria-label="Refresh" title="Refresh" className="w-9 h-9 rounded-md bg-white border border-line hover:border-line-strong text-ink-soft text-[17px] leading-none">↻</button>
            </div>
          </div>

          {error && <LoadError message={`Couldn't load today — ${error}`} onRetry={load} />}

          {home && (
            <div className="flex flex-wrap gap-8">
              <section className="flex-[2_1_560px] min-w-0 flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-[20px] font-bold text-ink">Today</h2>
                  <span className="ml-auto text-[13px] text-ink-muted">Players booked by hour · <span className="inline-block w-2.5 h-2.5 rounded-sm bg-pine align-middle" /> today <span className="inline-block w-2.5 h-2.5 rounded-sm bg-line align-middle ml-1" /> last {weekday(home.lastWeek)}</span>
                </div>
                <div className="flex items-end gap-1.5 h-40" role="img" aria-label={`Players booked by hour today and last ${weekday(home.lastWeek)}`}>
                  {shown.map(h => (
                    <div key={h.hour} className="flex-1 h-full flex items-end gap-0.5" title={`${hourLabel(h.hour)}: ${h.today} today, ${h.lastWeek} last week`}>
                      <div className="flex-1 bg-line rounded-t-sm" style={{ height: `${(h.lastWeek / peak) * 100}%` }} />
                      <div className="flex-1 bg-pine rounded-t-sm" style={{ height: `${(h.today / peak) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 text-[11.5px] text-ink-muted -mt-2">{shown.map(h => <span key={h.hour} className="flex-1 text-center">{h.hour % 2 === 0 ? hourLabel(h.hour) : ''}</span>)}</div>

                <div className="grid grid-cols-2 lg:grid-cols-4 border border-line rounded-lg overflow-hidden">
                  {(() => { const d = diff(home.players.today, home.players.lastWeek); return (
                    <div className="px-4 py-3.5"><div className="text-[13px] text-ink-soft">Players booked</div><div className="text-[24px] font-semibold tabular-nums text-ink mt-1">{home.players.today}</div><div className={`text-[12.5px] ${d.tone}`}>{d.text}</div></div>); })()}
                  <div className="px-4 py-3.5 border-l border-line"><div className="text-[13px] text-ink-soft">Tee sheet filled</div><div className="text-[24px] font-semibold tabular-nums text-ink mt-1">{home.fillPct.today === null ? '—' : `${home.fillPct.today}%`}</div>
                    <div className="text-[12.5px] text-ink-muted">{home.fillPct.lastWeek === null ? 'no tee times last week' : `${home.fillPct.lastWeek}% last week`}</div></div>
                  {home.money && <>
                    <div className="px-4 py-3.5 border-t lg:border-t-0 lg:border-l border-line"><div className="text-[13px] text-ink-soft">Paid today</div><div className="text-[24px] font-semibold tabular-nums text-ink mt-1">{usd(home.money.paidCents)}</div><div className="text-[12.5px] text-ink-muted">{home.money.paidRounds} round{home.money.paidRounds === 1 ? '' : 's'} paid</div></div>
                    <div className="px-4 py-3.5 border-t border-l lg:border-t-0 border-line"><div className="text-[13px] text-ink-soft">Played, not paid</div><div className="text-[24px] font-semibold tabular-nums text-ink mt-1">{usd(home.money.outstandingCents)}</div>
                      <div className={`text-[12.5px] ${home.money.outstandingGroups ? 'text-warn' : 'text-ink-muted'}`}>{home.money.outstandingGroups ? `${home.money.outstandingGroups} group${home.money.outstandingGroups === 1 ? '' : 's'} so far today` : 'every group so far has paid'}</div></div>
                  </>}
                </div>
              </section>

              <section className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
                <h2 className="text-[20px] font-bold text-ink">Needs you</h2>
                {needs === 0 ? (
                  <p className="text-[14px] text-ink-soft"><StatusDot status="ok" label="" /> Nothing needs you right now.</p>
                ) : (
                  <div className="border border-line rounded-lg divide-y divide-line-soft text-[14px]">
                    {home.declined.map(d => (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                        <StatusDot status="bad" label="" />
                        <div className="flex-1 min-w-0"><div className="truncate">Card declined — {d.name}</div><div className="text-[12.5px] text-ink-muted">{d.date === home.today ? fmtTime(d.time) : `${d.date} ${fmtTime(d.time)}`}{d.amountCents !== null ? ` · ${usd(d.amountCents)}` : ''}</div></div>
                        <Link href={d.amountCents !== null ? '/dashboard/money' : '/dashboard'} className="text-[13px] font-medium text-pine">Open</Link>
                      </div>
                    ))}
                    {home.late.length > 0 && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <StatusDot status="warn" label="" />
                        <div className="flex-1 min-w-0"><div>{home.late.length} group{home.late.length === 1 ? '' : 's'} past their tee time, not checked in</div><div className="text-[12.5px] text-ink-muted truncate">{home.late.map(l => `${fmtTime(l.time)} ${l.name}`).join(' · ')}</div></div>
                        <Link href="/dashboard" className="text-[13px] font-medium text-pine">Open</Link>
                      </div>
                    )}
                    {home.unreadMessages > 0 && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <StatusDot status="warn" label="" />
                        <div className="flex-1">{home.unreadMessages} unread message{home.unreadMessages === 1 ? '' : 's'} from GreenReserve</div>
                        <Link href="/dashboard/messages" className="text-[13px] font-medium text-pine">Read</Link>
                      </div>
                    )}
                  </div>
                )}

                {(home.money || seesPayouts) && <>
                  <div className="flex items-baseline gap-3"><h2 className="text-[20px] font-bold text-ink">Your money</h2><Link href="/dashboard/money" className="ml-auto text-[13px] text-pine">Money →</Link></div>
                  {payoutError && <LoadError message={`Couldn't load your payouts from Stripe — ${payoutError}`} onRetry={loadPayouts} />}
                  <div className="border border-line rounded-lg divide-y divide-line-soft text-[14px]">
                    {seesPayouts && !payoutError && (
                      <div className="flex items-center gap-3 px-4 py-3"><span className="flex-1">Next payout</span>
                        {!payouts ? <span className="text-ink-muted">Checking Stripe…</span>
                          : !payouts.connected ? <Link href="/dashboard/money?tab=payouts" className="text-pine">Connect Stripe</Link>
                          : payouts.next ? <><span className="font-semibold tabular-nums">{usd(payouts.next.amountCents)}</span><span className="text-[12.5px] text-ink-muted">{new Date(payouts.next.arrivalDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></>
                          : <span className="text-ink-muted">Nothing on its way</span>}
                      </div>
                    )}
                    {seesPayouts && payouts?.connected && paidOut30 !== null && (
                      <div className="flex items-center gap-3 px-4 py-3"><span className="flex-1">Paid to your bank, last 30 days</span><span className="font-semibold tabular-nums">{usd(paidOut30)}</span></div>
                    )}
                    {home.money && (
                      <div className="flex items-center gap-3 px-4 py-3"><span className="flex-1">Late-cancel fees, last 7 days</span><span className="font-semibold tabular-nums">{usd(home.money.lateFeesWeekCents)}</span></div>
                    )}
                  </div>
                </>}
              </section>
            </div>
          )}

          {home && (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3"><h2 className="text-[20px] font-bold text-ink">Coming up</h2><Link href="/dashboard" className="ml-auto text-[13px] text-pine">Full tee sheet →</Link></div>
              {home.comingUp.length === 0 ? (
                <p className="text-[14px] text-ink-soft">No more tee times today.</p>
              ) : (
                <div className="border border-line rounded-lg divide-y divide-line-soft text-[14px]">
                  {home.comingUp.map(s => (
                    <div key={s.time} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <span className="w-20 font-semibold tabular-nums">{fmtTime(s.time)}</span>
                      <span className="flex-1 min-w-[160px] truncate">{s.groups.length ? s.groups.map(g => `${g.name} · ${g.players}`).join(', ') : <span className="text-ink-muted">Open — {s.open} spot{s.open === 1 ? '' : 's'}</span>}</span>
                      {s.groups.length > 0 && (() => {
                        const unpaid = s.groups.filter(g => !PAID.has(g.paymentStatus)).length;
                        return unpaid === 0 ? <StatusDot status="ok" label="Paid" /> : <StatusDot status="warn" label={unpaid === s.groups.length ? 'Not paid yet' : `${s.groups.length - unpaid} of ${s.groups.length} paid`} />;
                      })()}
                      {s.groups.length > 0 && s.open > 0 && <span className="text-[12.5px] text-ink-muted">{s.open} open</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
