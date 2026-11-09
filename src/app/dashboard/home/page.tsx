'use client';
// DASH-C Home (Cam 2026-10-22, "very nice" on the mockups): today at a glance —
// players by hour against the same weekday last week, what needs the course,
// its money, and the next tee times. DENSE-3 (Cam 2026-10-28): seven-week trend
// lines under the numbers, the next 14 days against the usual, Not paid yet as on
// the tee sheet strip, checked-in state in the next tee times, and Next payout only.
// HOME-1 (Cam 2026-11-05, page-by-page pass): the weather and the next tee times open
// the page in one bar (Coming up merged into it), Finish setting up is one line whose
// buttons land on the field itself, Needs you leads with counts, and the page is two
// columns that stack — so no card leaves a gap under its neighbour.
// Data: /api/operator/home (one load), /api/operator/weather and, for logins that see
// payouts, /api/operator/stripe/payouts — each loads on its own.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { DeclinedCardList } from '@/components/dashboard/DeclinedCardList';
import type { DeclinedCard } from '@/lib/operator-home';
import { LoadError } from '@/components/dashboard/LoadError';
import { OpenRegister } from '@/components/dashboard/OpenRegister';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import type { PayoutsData } from '@/components/dashboard/money/PayoutsTable';
import { useRouter } from 'next/navigation';
import { FinishSetup } from '@/components/dashboard/settings/FinishSetup';
import { settingsHref, type MissingItem } from '@/lib/setup-missing';
import { TERMS } from '@/lib/analytics-terms';
import { CARD } from '@/components/ui/Card';
import { hourKey, type Weather, type WeatherHour } from '@/lib/weather';
import { ShiftNotes, ConditionsCard, WeekAheadCard, GoalsCard, type ShiftNote, type Conditions, type WeekAhead, type Goals } from '@/components/dashboard/home/HomeBoard';

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
  late: { id: string; teeTimeId: string; name: string; time: string }[];
  noShows: number;
  unreadMessages: number;
  comingUp: { id: string; time: string; open: number; groups: Group[] }[];
  setupMissing: MissingItem[];
  /** DASH-D: the shift notes, conditions, week ahead; HOME-2: the month's goals (money ones for money logins). */
  board: { notes: ShiftNote[]; conditions: Conditions; week: WeekAhead; goals: Goals };
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
      <circle cx={xy(last).split(',')[0]} cy={xy(last).split(',')[1]} r="2.5" style={{ fill: 'var(--color-pine)' }} />
    </svg>
  );
}

function diff(now: number, then: number, unit = '') {
  const d = now - then;
  if (d === 0) return { tone: 'text-ink-muted', text: `same as last week${unit}` };
  return { tone: d > 0 ? 'text-ok' : 'text-bad', text: `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} vs last week` };
}

/** The forecast hour a tee time falls in (the forecast's own local hour is the course's), or null. */
const forecastAt = (hours: WeatherHour[], date: string, hhmm: string) => hours.find(h => hourKey(h.at) === `${date} ${hhmm.slice(0, 2)}`) ?? null;
const rainLine = (h: WeatherHour) => `${h.tempF}°${h.rainPct ? ` · ${h.rainPct}% rain` : ''}`;
const WEATHER_WHY: Record<string, string> = {
  no_address: 'No address on file',
  address_not_found: 'Address not found',
  unavailable: 'Forecast unavailable',
};

/** HOME-1: the weather now and the next tee times, each with its hour's forecast — the top of the page. */
function NextUpBar({ home, weather, weatherError }: { home: Home; weather: Weather | null; weatherError: string }) {
  const hours = weather?.ok ? weather.hours : [];
  const now = hours[0] ?? null;
  return (
    <section className={`${CARD} flex flex-col md:flex-row min-w-0`} aria-label="Weather">
      <div className="px-5 py-4 md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-line">
        {now ? <>
          <div className="text-[12.5px] text-ink-muted">Now</div>
          <div className="mt-1 text-[24px] font-semibold tabular-nums text-ink leading-none">{now.tempF}°</div>
          <div className="mt-1.5 text-[13px] text-ink">{now.summary}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-muted tabular-nums">{[now.windMph != null ? `Wind ${now.windMph} mph` : '', now.rainPct != null ? `${now.rainPct}% rain` : ''].filter(Boolean).join(' · ')}</div>
        </> : <p className="text-[13px] text-ink-muted" title={weatherError || undefined}>{weatherError ? WEATHER_WHY.unavailable : weather && !weather.ok ? WEATHER_WHY[weather.reason] : 'Loading…'}</p>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 px-5 pt-3"><h2 className="text-[15px] font-semibold text-ink">Next tee times</h2><Link href="/dashboard" className="ml-auto text-[13px] text-pine">Tee sheet →</Link></div>
        {home.comingUp.length === 0 ? (
          <p className="px-5 py-3 text-[14px] text-ink-soft">None left.</p>
        ) : (
          <div className="flex overflow-x-auto px-2 pb-2 pt-1">
            {home.comingUp.map(s => {
              const w = forecastAt(hours, home.today, s.time);
              return (
                // Home audit: a time opens its card on the tee sheet (check in, pay, move).
                <Link key={s.id} href={`/dashboard?tt=${s.id}`} className="shrink-0 w-[150px] rounded-[7px] px-3 py-2 hover:bg-paper/70">
                  <div className="flex items-baseline gap-2"><span className="text-[14px] font-semibold tabular-nums text-pine">{fmtTime(s.time)}</span>
                    {w && <span className="text-[12px] text-ink-muted tabular-nums" title={w.summary}>{rainLine(w)}</span>}</div>
                  <div className="mt-1 flex flex-col gap-0.5 text-[12.5px]">
                    {/* DENSE-3 (Cam 2026-10-28): each group says whether it's checked in, paid or not yet. */}
                    {s.groups.slice(0, 3).map(g => (
                      <span key={g.id} className="flex items-center gap-1.5 min-w-0"><StatusDot status={g.checkedIn || PAID.has(g.paymentStatus) ? 'ok' : 'warn'} label="" />
                        <span className="truncate text-ink">{g.name} · {g.players}</span>
                        <span className="sr-only">{g.checkedIn ? 'Checked in' : PAID.has(g.paymentStatus) ? 'Paid' : 'Not paid'}</span></span>
                    ))}
                    {s.groups.length > 3 && <span className="text-ink-muted">+{s.groups.length - 3} more</span>}
                    {s.open > 0 && <span className="text-ink-muted">{s.open} open</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function DashboardHome() {
  const router = useRouter();
  const access = useDashboardAccess();
  const seesPayouts = access.can('money.payouts');
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState('');
  const [payouts, setPayouts] = useState<PayoutsData | null>(null);
  const [payoutError, setPayoutError] = useState('');
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState('');

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
  const loadWeather = useCallback(async () => {
    setWeatherError('');
    const r = await dfetch<Weather>('/api/operator/weather');
    if (!r.ok || !r.data) { setWeatherError(r.ok ? 'empty' : r.error); return; }
    setWeather(r.data);
  }, []);
  useEffect(() => { load(); loadWeather(); }, [load, loadWeather]);
  useEffect(() => { if (access.loaded && seesPayouts) loadPayouts(); }, [access.loaded, seesPayouts, loadPayouts]);

  // The chart spans the hours that have tee times either day (at least 6am–6pm).
  const active = home ? home.hours.filter(h => h.today || h.lastWeek).map(h => h.hour) : [];
  const from = Math.min(6, ...active), to = Math.max(18, ...active);
  const shown = home ? home.hours.filter(h => h.hour >= from && h.hour <= to) : [];
  const peak = Math.max(1, ...shown.map(h => Math.max(h.today, h.lastWeek)));

  const needs = home ? home.declinedTotal + home.late.length + (home.unreadMessages > 0 ? 1 : 0) : 0;
  // HOME-1 (Cam 2026-11-05, "# of cards declined, and similar stats"): the counts first, then what to do about each.
  const counts = home ? [
    { label: 'Cards declined', n: home.declinedTotal, tone: 'text-bad' },
    { label: 'Past their time', n: home.late.length, tone: 'text-warn' },
    { label: 'No-shows today', n: home.noShows, tone: 'text-ink' },
    { label: 'Unread messages', n: home.unreadMessages, tone: 'text-warn' },
  ] : [];

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="home" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-8 py-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[260px]">
              <h1 className="font-serif text-[26px] leading-none text-ink">{home ? longDate(home.today) : 'Today'}</h1>
              <p className="mt-2.5 text-[14px] text-ink-soft flex items-center gap-1.5">{home ? `${home.courseName} · as of ${fmtTime(home.clock)}` : 'Loading today…'}
                <button type="button" onClick={() => { load(); loadWeather(); }} aria-label="Refresh" className="px-1 text-[16px] leading-none text-ink-muted hover:text-ink">↻</button></p>
            </div>
            <Link href="/dashboard" className="text-[13px] font-medium text-white bg-pine hover:bg-pine-hover px-4 py-2 rounded-[7px]">Open tee sheet</Link>
          </div>

          {error && <LoadError message={`Couldn't load today — ${error}`} onRetry={load} />}

          {/* POS-7 (Cam 2026-11-09): until today's register is open, Home asks for the starting cash. */}
          <OpenRegister where="home" />

          {/* Cam 2026-10-27 / 2026-11-05: what's still missing, one line; each button lands on the field in Settings. */}
          {home && home.setupMissing.length > 0 && (
            <FinishSetup compact items={home.setupMissing.map(i => ({ ...i, onClick: () => router.push(i.href ?? settingsHref(i.section, i.key)) }))} />
          )}

          {home && <NextUpBar home={home} weather={weather} weatherError={weatherError} />}

          {home && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] items-start">
              <div className="flex flex-col gap-4 min-w-0">
                <section className={`${CARD} px-5 py-4 min-w-0 flex flex-col gap-4`}>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h2 className="text-[15px] font-semibold text-ink">Today</h2>
                    <span className="ml-auto text-[13px] text-ink-muted">Players booked by hour · <span className="inline-block w-2.5 h-2.5 rounded-sm bg-pine align-middle" /> today <span className="inline-block w-2.5 h-2.5 rounded-sm bg-line-strong align-middle ml-1" /> last {weekday(home.lastWeek)}</span>
                  </div>
                  {/* HOME-1 (Cam 2026-11-05, "less compacted"): room between hours, the two bars of an hour side by side. */}
                  <div className="flex items-end gap-2 sm:gap-3 h-44" role="img" aria-label="Players by hour">
                    {shown.map(h => (
                      <div key={h.hour} className="flex-1 h-full flex items-end justify-center gap-[3px]" title={`${hourLabel(h.hour)}: ${h.today} today, ${h.lastWeek} last week`}>
                        <div className="flex-1 max-w-[14px] bg-line-strong/70 rounded-t-[2px]" style={{ height: `${(h.lastWeek / peak) * 100}%` }} />
                        <div className="flex-1 max-w-[14px] bg-pine rounded-t-[2px]" style={{ height: `${(h.today / peak) * 100}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 sm:gap-3 text-[11.5px] text-ink-muted -mt-2">{shown.map(h => <span key={h.hour} className="flex-1 text-center">{shown.length <= 14 || h.hour % 2 === 0 ? hourLabel(h.hour) : ''}</span>)}</div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-line">
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
                  <div className="flex items-baseline gap-3 mt-2"><h2 className="text-[15px] font-semibold text-ink">Next 14 days</h2>
                    <span className="ml-auto text-[13px] text-ink-muted" title={TERMS.pace}>Booked · <span className="inline-block w-px h-3 bg-ink align-middle" /> usual by now</span></div>
                  <div className="grid grid-cols-7 border-y border-line" role="list" aria-label="Next 14 days">
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

                {/* DASH-D (Cam 2026-11-01, "week-ahead heat map"). */}
                <WeekAheadCard week={home.board.week} canDeal={access.can('schedule.view')} />
              </div>

              <div className="flex flex-col gap-4 min-w-0">
                <section className={`${CARD} px-5 py-4 flex flex-col gap-3`}>
                  <h2 className="text-[15px] font-semibold text-ink">Action needed</h2>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {counts.map(c => (
                      <div key={c.label}><div className="text-[12.5px] text-ink-muted">{c.label}</div>
                        <div className={`text-[20px] font-semibold tabular-nums leading-tight ${c.n ? c.tone : 'text-ink'}`}>{c.n}</div></div>
                    ))}
                  </div>
                  {needs === 0 ? (
                    <p className="text-[13.5px] text-ink-soft"><StatusDot status="ok" label="" /> All clear.</p>
                  ) : (
                    <div className="-mx-5 border-y border-line divide-y divide-line-soft text-[14px]">
                      {/* HOME-1 ("more concise"): three here; See all opens the rest on Money. */}
                      <DeclinedCardList rows={home.declined.slice(0, 3)} total={home.declinedTotal} canSendLink={access.can('sheet.checkin')} moreHref={access.can('money.payments') ? '/dashboard/money' : undefined} />
                      {home.late.length > 0 && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <StatusDot status="warn" label="" />
                          <div className="flex-1 min-w-0"><div>{home.late.length} past their time</div><div className="text-[12.5px] text-ink-muted truncate">{home.late.map(l => `${fmtTime(l.time)} ${l.name}`).join(' · ')}</div></div>
                          {/* Home audit: one late group opens its time's card; several open the sheet. */}
                          <Link href={home.late.length === 1 ? `/dashboard?tt=${home.late[0].teeTimeId}` : '/dashboard'} className="text-[13px] font-medium text-pine">Open</Link>
                        </div>
                      )}
                      {home.unreadMessages > 0 && (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <StatusDot status="warn" label="" />
                          <div className="flex-1">{home.unreadMessages} unread from GreenReserve</div>
                          <Link href="/dashboard/messages" className="text-[13px] font-medium text-pine">Read</Link>
                        </div>
                      )}
                    </div>
                  )}

                  {/* DENSE-3 (Cam 2026-10-28): the money panel is the next payout only. */}
                  {seesPayouts && (payoutError ? <LoadError message={`Couldn't load your payouts from Stripe — ${payoutError}`} onRetry={loadPayouts} /> : (
                    <div className="flex items-center gap-3 text-[14px]"><Link href="/dashboard/money" className="flex-1 text-ink hover:text-pine">Next payout</Link>
                      {!payouts ? <span className="text-ink-muted">Checking Stripe…</span>
                        : !payouts.connected ? <Link href="/dashboard/money?tab=payouts" className="text-pine">Connect Stripe</Link>
                        : payouts.next ? <><span className="font-semibold tabular-nums">{usd(payouts.next.amountCents)}</span><span className="text-[12.5px] text-ink-muted">{new Date(payouts.next.arrivalDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></>
                        : <span className="text-ink-muted">Nothing on its way</span>}
                    </div>
                  ))}
                </section>

                {/* DASH-D (Cam 2026-11-01): the shift's notes and the course conditions. */}
                <ShiftNotes key={home.board.notes.map(n => n.id).join()} initial={home.board.notes} />
                <ConditionsCard key={home.board.conditions.updatedAt ?? ''} initial={home.board.conditions} canEdit={access.can('sheet.course_alert')} />
                {/* HOME-2 (Cam 2026-11-05): goals on the numbers the course picks; setting one is settings.edit (money ones also money.payments, checked by the route). */}
                <GoalsCard key={home.board.goals.goals.map(g => `${g.metric}:${g.target}`).join()} goals={home.board.goals} canSet={access.can('settings.edit')} onSaved={load} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
