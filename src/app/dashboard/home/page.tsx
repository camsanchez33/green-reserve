'use client';
// DASH-C Home (Cam 2026-10-22, "very nice" on the mockups): today at a glance —
// players by hour against the same weekday last week, what needs the course,
// its money, and the next tee times. DENSE-3 (Cam 2026-10-28): seven-week trend
// lines under the numbers, the next 14 days against the usual, Not paid yet as on
// the tee sheet strip, checked-in state in Coming up, and Next payout only. Data: /api/operator/home (one load) and,
// for logins that see payouts, /api/operator/stripe/payouts.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { DeclinedCardList } from '@/components/dashboard/DeclinedCardList';
import type { DeclinedCard } from '@/lib/operator-home';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import type { PayoutsData } from '@/components/dashboard/money/PayoutsTable';
import { useRouter } from 'next/navigation';
import { FinishSetup } from '@/components/dashboard/settings/FinishSetup';
import { settingsHref, type MissingItem } from '@/lib/setup-missing';
import { TERMS } from '@/lib/analytics-terms';

type Group = { id: string; name: string; players: number; paymentStatus: string; checkedIn: boolean };
type Home = {
  courseName: string; today: string; lastWeek: string; clock: string;
  hours: { hour: number; today: number; lastWeek: number }[];
  players: { today: number; lastWeek: number };
  fillPct: { today: number | null; lastWeek: number | null };
  trend: { dates: string[]; players: number[]; fillPct: (number | null)[]; paidCents: number[] | null };
  pace: { date: string; offered: number; booked: number; usual: number | null; weeks: number }[];
  money: null | { paidCents: number; paidGroups: number; outstandingCents: number; outstandingGroups: number; lateGroups: number };
  declined: DeclinedCard[];
  declinedTotal: number;
  late: { id: string; name: string; time: string }[];
  unreadMessages: number;
  comingUp: { time: string; open: number; groups: Group[] }[];
  setupMissing: MissingItem[];
};

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
const longDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const weekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const PAID = new Set(['paid', 'paid_offline', 'on_account']);

const shortDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** DENSE-3 (Cam 2026-10-28, "yes, add trend lines"): the same weekday for the last seven weeks, then today. */
function Spark({ values, dates, fmt }: { values: (number | null)[]; dates: string[]; fmt: (v: number) => string }) {
  const pts = values.map((v, i) => (v === null ? null : { i, v }));
  const real = pts.filter((p): p is { i: number; v: number } => p !== null);
  if (real.length < 2) return null;
  const max = Math.max(...real.map(p => p.v), 1), W = 96, H = 22;
  const xy = (p: { i: number; v: number }) => `${(p.i / (values.length - 1)) * W},${H - 2 - (p.v / max) * (H - 4)}`;
  const last = real[real.length - 1];
  const label = real.map(p => `${shortDay(dates[p.i])}: ${fmt(p.v)}`).join(', ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-1.5 overflow-visible" role="img" aria-label={`Same weekday, last 7 weeks — ${label}`}>
      <title>{label}</title>
      <polyline points={real.map(xy).join(' ')} fill="none" stroke="#8FA898" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={xy(last).split(',')[0]} cy={xy(last).split(',')[1]} r="2.5" fill="#173B2A" />
    </svg>
  );
}

function diff(now: number, then: number, unit = '') {
  const d = now - then;
  if (d === 0) return { tone: 'text-ink-muted', text: `same as last week${unit}` };
  return { tone: d > 0 ? 'text-ok' : 'text-bad', text: `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} vs last week` };
}

export default function DashboardHome() {
  const router = useRouter();
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

  const needs = home ? home.declinedTotal + home.late.length + (home.unreadMessages > 0 ? 1 : 0) : 0;

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

          {/* Cam 2026-10-27: what's still missing from the booking page, each linking to its Settings section. */}
          {home && home.setupMissing.length > 0 && (
            <div className="-mb-3"><FinishSetup items={home.setupMissing.map(i => ({ ...i, onClick: () => router.push(settingsHref(i.section)) }))} /></div>
          )}

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
                    <div className="px-4 py-3.5"><div className="text-[13px] text-ink-soft">Players booked</div><div className="text-[24px] font-semibold tabular-nums text-ink mt-1">{home.players.today}</div><div className={`text-[12.5px] ${d.tone}`}>{d.text}</div>
                      <Spark values={home.trend.players} dates={home.trend.dates} fmt={v => `${v}`} /></div>); })()}
                  <div className="px-4 py-3.5 border-l border-line"><div className="text-[13px] text-ink-soft">Tee sheet filled</div><div className="text-[24px] font-semibold tabular-nums text-ink mt-1">{home.fillPct.today === null ? '—' : `${home.fillPct.today}%`}</div>
                    <div className="text-[12.5px] text-ink-muted">{home.fillPct.lastWeek === null ? 'no tee times last week' : `${home.fillPct.lastWeek}% last week`}</div>
                    <Spark values={home.trend.fillPct} dates={home.trend.dates} fmt={v => `${v}%`} /></div>
                  {home.money && <>
                    <div className="px-4 py-3.5 border-t lg:border-t-0 lg:border-l border-line"><div className="text-[13px] text-ink-soft">Paid today</div><div className="text-[24px] font-semibold tabular-nums text-ink mt-1">{usd(home.money.paidCents)}</div><div className="text-[12.5px] text-ink-muted">{home.money.paidGroups} group{home.money.paidGroups === 1 ? '' : 's'}</div>
                      {home.trend.paidCents && <Spark values={home.trend.paidCents} dates={home.trend.dates} fmt={usd} />}</div>
                    <Link href="/dashboard/money?tab=payments&show=unpaid" className="px-4 py-3.5 border-t border-l lg:border-t-0 border-line hover:bg-paper/60"><div className="text-[13px] text-ink-soft">Not paid yet</div><div className={`text-[24px] font-semibold tabular-nums mt-1 ${home.money.lateGroups ? 'text-warn' : 'text-ink'}`}>{usd(home.money.outstandingCents)}</div>
                      <div className="text-[12.5px] text-ink-muted">{home.money.outstandingGroups} group{home.money.outstandingGroups === 1 ? '' : 's'}{home.money.lateGroups > 0 && <span className="text-warn"> · {home.money.lateGroups} past</span>}</div></Link>
                  </>}
                </div>

                {/* DENSE-3 (Cam 2026-10-28): the next 14 days against what that weekday usually has by now (analytics bookingPace). */}
                <div className="flex items-baseline gap-3 mt-2"><h2 className="text-[20px] font-bold text-ink">Next 14 days</h2>
                  <span className="ml-auto text-[13px] text-ink-muted" title={TERMS.pace}>Booked · <span className="inline-block w-px h-3 bg-ink align-middle" /> usual by now</span></div>
                <div className="grid grid-cols-7 border border-line rounded-lg overflow-hidden" role="list" aria-label="Next 14 days">
                  {home.pace.map((d, i) => {
                    const behind = d.usual !== null && d.booked < d.usual;
                    return (
                      <div key={d.date} role="listitem" className={`px-2.5 py-2.5 ${i % 7 ? 'border-l' : ''} ${i >= 7 ? 'border-t' : ''} border-line min-w-0`}
                        title={d.offered === 0 ? `${shortDay(d.date)}: no tee times` : `${shortDay(d.date)}: ${d.booked} booked of ${d.offered}${d.usual !== null ? ` · usually ${d.usual} by now (${d.weeks} week${d.weeks === 1 ? '' : 's'})` : ''}`}>
                        <div className="text-[11.5px] text-ink-muted truncate">{i === 0 ? 'Today' : shortDay(d.date).replace(',', '')}</div>
                        {d.offered === 0 ? <div className="text-[13px] text-ink-faint mt-1">—</div> : <>
                          <div className={`text-[17px] font-semibold tabular-nums mt-0.5 ${behind ? 'text-warn' : 'text-ink'}`}>{d.booked}</div>
                          <div className="relative h-1.5 mt-1.5 rounded-full bg-line-soft">
                            <div className="absolute inset-y-0 left-0 rounded-full bg-pine" style={{ width: `${Math.min(100, (d.booked / d.offered) * 100)}%` }} />
                            {d.usual !== null && <div className="absolute -top-1 -bottom-1 w-px bg-ink" style={{ left: `${Math.min(100, (d.usual / d.offered) * 100)}%` }} />}
                          </div>
                          <div className="text-[11px] text-ink-muted mt-1 tabular-nums">{d.usual === null ? 'new' : `usual ${d.usual}`}</div>
                        </>}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
                <h2 className="text-[20px] font-bold text-ink">Needs you</h2>
                {needs === 0 ? (
                  <p className="text-[14px] text-ink-soft"><StatusDot status="ok" label="" /> Nothing needs you right now.</p>
                ) : (
                  <div className="border border-line rounded-lg divide-y divide-line-soft text-[14px]">
                    <DeclinedCardList rows={home.declined} total={home.declinedTotal} canSendLink={access.can('sheet.checkin')} moreHref={access.can('money.payments') ? '/dashboard/money' : undefined} />
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

                {/* DENSE-3 (Cam 2026-10-28): the money panel is the next payout only. */}
                {seesPayouts && <>
                  <div className="flex items-baseline gap-3"><h2 className="text-[20px] font-bold text-ink">Your money</h2><Link href="/dashboard/money" className="ml-auto text-[13px] text-pine">Money →</Link></div>
                  {payoutError ? <LoadError message={`Couldn't load your payouts from Stripe — ${payoutError}`} onRetry={loadPayouts} /> : (
                    <div className="border border-line rounded-lg text-[14px]">
                      <div className="flex items-center gap-3 px-4 py-3"><span className="flex-1">Next payout</span>
                        {!payouts ? <span className="text-ink-muted">Checking Stripe…</span>
                          : !payouts.connected ? <Link href="/dashboard/money?tab=payouts" className="text-pine">Connect Stripe</Link>
                          : payouts.next ? <><span className="font-semibold tabular-nums">{usd(payouts.next.amountCents)}</span><span className="text-[12.5px] text-ink-muted">{new Date(payouts.next.arrivalDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></>
                          : <span className="text-ink-muted">Nothing on its way</span>}
                      </div>
                    </div>
                  )}
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
                      {/* DENSE-3 (Cam 2026-10-28): each group says whether it's checked in, paid or not yet. */}
                      <span className="flex-1 min-w-[160px] flex flex-wrap gap-x-4 gap-y-1">{s.groups.length ? s.groups.map(g => (
                        <span key={g.id} className="inline-flex items-center gap-1.5 min-w-0"><span className="truncate">{g.name} · {g.players}</span>
                          <StatusDot status={g.checkedIn ? 'ok' : PAID.has(g.paymentStatus) ? 'ok' : 'warn'} label={g.checkedIn ? 'Checked in' : PAID.has(g.paymentStatus) ? 'Paid' : 'Not paid'} /></span>
                      )) : <span className="text-ink-muted">Open — {s.open} spot{s.open === 1 ? '' : 's'}</span>}</span>
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
