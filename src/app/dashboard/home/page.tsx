'use client';
// DASH-C Home (Cam 2026-10-22) → HOME-3 (Cam 2026-11-12, "approved, build the home page to match the mockup";
// ADMIN_REDO_SPEC.md "Course dashboard Home: APPROVED", lanes/dashboard/home-mockup.html): the course's morning
// page in charcoal glass. Top: the date, "As of", the one search, "Open the register" (only while it isn't open),
// then three cards — next off, checked in, the weather — and four numbers: players booked and tee sheet filled vs
// last week, collected today (green) and not paid yet (red). Left: today by hour (played · playing · booked ·
// open), the next 14 days against the 4-week same-weekday average, the week ahead, events coming up. Right: action
// needed (just the list), next payout, staff notes, course conditions, the month's goals. Every number is counted
// (lib/operator-home, lib/home-today, computeAnalytics); colour only where it means something.
// Data: /api/operator/home (one load), /api/operator/weather and, for logins that see payouts,
// /api/operator/stripe/payouts — each loads on its own and says when it can't.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import OperatorSearch from '@/components/dashboard/OperatorSearch';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
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
import type { Weather } from '@/lib/weather';
import { weatherLine, type HourBar } from '@/lib/home-today';
import { ShiftNotes, ConditionsCard, WeekAheadCard, GoalsCard, EventsCard, type ShiftNote, type Conditions, type WeekAhead, type Goals, type HomeEvent } from '@/components/dashboard/home/HomeBoard';

type Group = { id: string; name: string; players: number; paymentStatus: string; checkedIn: boolean };
type Home = {
  nextOff: { id: string; time: string; name: string; groups: number; players: number } | null;
  courseName: string; today: string; lastWeek: string; clock: string; takesCash: boolean;
  players: { today: number; lastWeek: number };
  fillPct: { today: number | null; lastWeek: number | null };
  pace: { date: string; offered: number; booked: number; usual: number | null; weeks: number; avg4: number | null }[];
  byHour: HourBar[];
  checkedIn: { checkedIn: number; booked: number };
  money: null | { paidCents: number; paidGroups: number; outstandingCents: number; outstandingGroups: number; lateGroups: number };
  declined: DeclinedCard[];
  declinedTotal: number;
  late: { id: string; teeTimeId: string; name: string; time: string }[];
  unreadMessages: number;
  comingUp: { id: string; time: string; open: number; groups: Group[] }[];
  setupMissing: MissingItem[];
  /** The board (lib/home-board): notes, conditions, week ahead, goals; events only for logins that run events. */
  board: { notes: ShiftNote[]; conditions: Conditions; week: WeekAhead; goals: Goals; events: HomeEvent[] | null };
};

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
const longDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const shortDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekdayShort = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const weekdayLong = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const isWeekend = (d: string) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6; };
const WEATHER_WHY: Record<string, string> = { no_address: 'No address on file', address_not_found: 'Address not found', unavailable: 'Forecast unavailable' };
const STRIP = 'px-4 py-3 flex items-center gap-2 min-w-0 text-[14px]';

/** "+12 vs last week" — up is green (ahead of usual), down amber (behind). */
function vsLastWeek(now: number, then: number) {
  const d = now - then;
  if (d === 0) return <span className="text-ink-muted">Same as last week</span>;
  return <><span className={d > 0 ? 'text-ok' : 'text-warn'}>{d > 0 ? '+' : '−'}{Math.abs(d)}</span> <span className="text-ink-muted">vs last week</span></>;
}

function Number_({ label, value, tone = 'text-ink', sub, title, href }: { label: string; value: string; tone?: string; sub?: React.ReactNode; title?: string; href?: string }) {
  const body = <>
    <span className="text-[12.5px] font-medium text-ink-muted" title={title}>{label}</span>
    <span className={'text-[26px] font-semibold tabular-nums leading-tight ' + tone}>{value}</span>
    {sub && <span className="text-[12.5px]">{sub}</span>}
  </>;
  return href
    ? <Link href={href} className="bg-white shadow-card rounded-lg p-4 flex flex-col gap-1 min-w-0 hover:opacity-90">{body}</Link>
    : <Card className="p-4 flex flex-col gap-1 min-w-0">{body}</Card>;
}

/** Today by hour (Cam 2026-11-12): every bar the same height, filled by share — played green, playing amber,
 *  booked white, open red — then one line: the day's spots and how many are booked. */
function TodayByHour({ bars }: { bars: HourBar[] }) {
  const spots = bars.reduce((n, b) => n + b.spots, 0);
  const booked = bars.reduce((n, b) => n + b.played + b.playing + b.booked, 0);
  const KEY = [['bg-ok', 'Played'], ['bg-warn', 'Playing'], ['bg-ink', 'Booked'], ['bg-bad/75', 'Open']] as const;
  return (
    <Card className="px-5 py-4 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3"><h2 className="text-[15px] font-semibold text-ink">Today by hour</h2>
        <span className="ml-auto flex flex-wrap gap-x-3 text-[12.5px] text-ink-muted" title={TERMS.playedPlaying}>{KEY.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={'inline-block w-2.5 h-2.5 rounded-[2px] ' + c} />{l}</span>)}</span></div>
      {bars.length === 0 ? <p className="text-[13.5px] text-ink-muted">No tee times today.</p> : <>
        <div className="flex items-end gap-1 sm:gap-2.5 h-40" role="img" aria-label={bars.map(b => `${hourLabel(b.hour)}: ${b.played} played, ${b.playing} playing, ${b.booked} booked, ${b.open} open`).join('; ')}>
          {bars.map(b => (
            <div key={b.hour} className="flex-1 h-full flex justify-center" title={`${hourLabel(b.hour)}: ${b.played} played, ${b.playing} playing, ${b.booked} booked, ${b.open} open`}>
              <div className="w-full max-w-[30px] h-full flex flex-col gap-px rounded-[4px] overflow-hidden">
                {b.open > 0 && <i className="block bg-bad/75" style={{ flex: b.open }} />}
                {b.booked > 0 && <i className="block bg-ink" style={{ flex: b.booked }} />}
                {b.playing > 0 && <i className="block bg-warn" style={{ flex: b.playing }} />}
                {b.played > 0 && <i className="block bg-ok" style={{ flex: b.played }} />}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 sm:gap-2.5 mt-1.5 text-[11.5px] text-ink-muted">{bars.map((b, i) => <span key={b.hour} className="flex-1 text-center">{bars.length <= 12 || i % 2 === 0 ? hourLabel(b.hour) : ''}</span>)}</div>
        <p className="mt-3 text-[13px] text-ink-muted"><b className="font-semibold text-ink tabular-nums">{spots}</b> spots · <b className="font-semibold text-ink tabular-nums">{booked}</b> booked</p>
      </>}
    </Card>
  );
}

/** Next 14 days (Cam 2026-11-12): one column per day; the bar is booked of the most seats any day has, the line
 *  is the 4-week average for that weekday, amber when behind its usual pace for this many days out. */
function Next14({ pace }: { pace: Home['pace'] }) {
  const max = Math.max(1, ...pace.map(d => d.offered));
  return (
    <Card className="px-5 py-4 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3"><h2 className="text-[15px] font-semibold text-ink">Next 14 days</h2>
        <span className="ml-auto text-[12.5px] text-ink-muted" title={TERMS.avg4}>Booked · <span aria-hidden="true" className="inline-block w-3 h-[2px] bg-ink/60 align-middle" /> 4-week avg</span></div>
      <div className="grid gap-[3px] sm:gap-2 items-end" style={{ gridTemplateColumns: `repeat(${pace.length}, minmax(0,1fr))` }} role="list">
        {pace.map((d, i) => {
          const behind = d.usual !== null && d.booked < d.usual;
          const name = i === 0 ? 'Today' : weekdayShort(d.date);
          return (
            <div key={d.date} role="listitem" className="flex flex-col items-center gap-1.5 min-w-0"
              title={d.offered === 0 ? `${shortDay(d.date)}: no tee times` : `${shortDay(d.date)}: ${d.booked} booked of ${d.offered}${d.avg4 !== null ? `. A ${weekdayLong(d.date)} averages ${d.avg4} (the last 4).` : ''}${d.usual !== null ? ` Usually ${d.usual} by now.` : ''}`}>
              <b className={'text-[11px] sm:text-[13px] font-semibold tabular-nums ' + (behind ? 'text-warn' : 'text-ink')}>{d.offered === 0 ? '—' : d.booked}</b>
              <div className="relative w-full max-w-[26px] h-[90px] sm:h-[120px] rounded-[5px] bg-line-soft">
                {d.offered > 0 && <div className={'absolute inset-x-0 bottom-0 rounded-[5px] ' + (behind ? 'bg-warn' : 'bg-ink')} style={{ height: `${Math.min(100, (d.booked / max) * 100)}%` }} />}
                {d.avg4 !== null && <div className="absolute -left-1 -right-1 h-[2px] rounded-[1px] bg-ink/60" style={{ bottom: `${Math.min(100, (d.avg4 / max) * 100)}%` }} />}
              </div>
              <span className={'text-[10.5px] sm:text-[11px] text-center leading-tight ' + (i === 0 ? 'text-ink font-bold' : isWeekend(d.date) ? 'text-ink-soft font-semibold' : 'text-ink-muted')}>{name}<br />{Number(d.date.slice(8, 10))}</span>
            </div>
          );
        })}
      </div>
    </Card>
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

  // quiet: a background re-read keeps what's on screen when it fails (the next one tries again).
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError('');
    const r = await dfetch<Home>('/api/operator/home');
    if (!r.ok || !r.data) { if (!quiet) setError(r.ok ? 'Nothing came back — try again.' : r.error); return; }
    setHome(r.data); setError('');
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
  // Stress test 2026-11-10 ("it told me all clear and three groups were standing there"): Home left open on the
  // counter re-reads itself each minute and when the tab comes back — never while someone is typing on it.
  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'); };
    const tick = () => { if (document.visibilityState === 'visible' && !typing()) load(true); };
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [load]);
  useEffect(() => { if (access.loaded && seesPayouts) loadPayouts(); }, [access.loaded, seesPayouts, loadPayouts]);

  const needs = home ? home.declinedTotal + home.late.length + (home.unreadMessages > 0 ? 1 : 0) : 0;
  const next = home?.nextOff ?? null;
  const wx = weather?.ok && home ? weatherLine(weather.hours, home.today) : null;

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="home" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="op-home px-4 sm:px-6 py-5 flex flex-col gap-4 max-w-[1320px]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mr-auto font-serif text-[26px] sm:text-[30px] leading-none text-ink">{home ? longDate(home.today) : 'Today'}</h1>
            {/* HOME-3: the one search (the rail leaves it to Home). */}
            <div className="w-full sm:w-[280px]"><OperatorSearch /></div>
          </div>
          <p className="-mt-2 text-[13px] text-ink-muted flex items-center gap-1.5">{home ? `As of ${fmtTime(home.clock)}` : 'Loading today…'}
            <button type="button" onClick={() => { load(); loadWeather(); }} aria-label="Refresh" className="px-1 text-[15px] leading-none text-ink-muted hover:text-ink">↻</button></p>

          {error && <LoadError message={`Couldn't load today — ${error}`} onRetry={() => load()} />}

          {/* POS-7 / HOME-3 (Cam 2026-11-12): "Open the register" — one bar until tapped, only while it isn't open, and
              only for a course that takes cash (Settings → Pro shop). Display only: cash gating stays the route's. */}
          {home?.takesCash && <OpenRegister where="home" />}

          {/* Cam 2026-10-27 / 2026-11-05: what's still missing, one line; each button lands on the field in Settings. */}
          {home && home.setupMissing.length > 0 && (
            <FinishSetup compact items={home.setupMissing.map(i => ({ ...i, onClick: () => router.push(i.href ?? settingsHref(i.section, i.key)) }))} />
          )}

          {home && <>
            {/* Cam 2026-11-12, "seperate these bubbles": next off, checked in, the weather. */}
            <div className="grid gap-3 sm:grid-cols-3">
              {next ? (
                <Link href={`/dashboard?tt=${next.id}`} className={'bg-white shadow-card rounded-lg hover:opacity-90 ' + STRIP}>
                  <span className="text-ink-muted">Next off</span>
                  <b className="font-semibold text-ink truncate">{fmtTime(next.time)} · {next.name}{next.groups > 1 ? ` +${next.groups - 1}` : ''}, {next.players} players</b>
                </Link>
              ) : <Card className={STRIP}><span className="text-ink-muted">Next off</span><b className="font-semibold text-ink">None left today</b></Card>}
              <Card className={STRIP}><span className="text-ink-muted">Checked in</span><b className="font-semibold text-ink tabular-nums">{home.checkedIn.checkedIn} of {home.checkedIn.booked} players</b></Card>
              <Card className={STRIP} aria-label="Weather">
                {wx ? <span className="truncate">{wx.now}{wx.rain && <> <span className="text-ink-muted">·</span> <b className="font-semibold" style={{ color: 'var(--op-rain)' }}>{wx.rain}</b></>}</span>
                  : <span className="text-ink-muted" title={weatherError || undefined}>{weatherError ? WEATHER_WHY.unavailable : weather && !weather.ok ? WEATHER_WHY[weather.reason] : 'Loading…'}</span>}
              </Card>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Number_ label="Players booked" value={String(home.players.today)} sub={vsLastWeek(home.players.today, home.players.lastWeek)} />
              <Number_ label="Tee sheet filled" value={home.fillPct.today === null ? '—' : `${home.fillPct.today}%`} title={TERMS.fillVsLastWeek}
                sub={home.fillPct.today === null || home.fillPct.lastWeek === null ? <span className="text-ink-muted">{home.fillPct.lastWeek === null ? 'No tee times last week' : `${home.fillPct.lastWeek}% last week`}</span>
                  : home.fillPct.today === home.fillPct.lastWeek ? <span className="text-ink-muted">Same as last week</span>
                  : <><span className={home.fillPct.today > home.fillPct.lastWeek ? 'text-ok' : 'text-warn'}>{home.fillPct.today > home.fillPct.lastWeek ? 'Up' : 'Down'} {Math.abs(home.fillPct.today - home.fillPct.lastWeek)}%</span> <span className="text-ink-muted">vs last week</span></>} />
              {home.money && <>
                <Number_ label="Collected today" value={usd0(home.money.paidCents)} tone="text-ok" title={`${usd(home.money.paidCents)} · ${home.money.paidGroups} group${home.money.paidGroups === 1 ? '' : 's'}`} />
                <Number_ label="Not paid yet" value={usd0(home.money.outstandingCents)} tone={home.money.outstandingCents ? 'text-bad' : 'text-ink'} href="/dashboard/money?tab=payments&show=unpaid"
                  title={`${usd(home.money.outstandingCents)} · ${home.money.outstandingGroups} group${home.money.outstandingGroups === 1 ? '' : 's'}${home.money.lateGroups ? `, ${home.money.lateGroups} past their time` : ''}`} />
              </>}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)] items-start">
              <div className="flex flex-col gap-4 min-w-0">
                <TodayByHour bars={home.byHour} />
                <Next14 pace={home.pace} />
                <WeekAheadCard week={home.board.week} canDeal={access.can('schedule.view')} />
                {home.board.events && <EventsCard events={home.board.events} />}
              </div>

              <div className="flex flex-col gap-4 min-w-0">
                <Card className="px-5 py-4 flex flex-col gap-2">
                  <h2 className="text-[15px] font-semibold text-ink">Action needed</h2>
                  {needs === 0 ? (
                    <p className="text-[13.5px] text-ink-soft"><StatusDot status="ok" label="" /> All clear.</p>
                  ) : (
                    <div className="-mx-5 divide-y divide-line text-[14px]">
                      {home.declinedTotal > 0 && <DeclinedCardList key={home.declined.map(d => d.id).join()} rows={home.declined.slice(0, 3)} total={home.declinedTotal} canSendLink={access.can('sheet.checkin')} moreHref={access.can('money.payments') ? '/dashboard/money' : undefined} onRemoved={() => load(true)} />}
                      {home.late.length > 0 && (
                        <div className="flex items-center gap-3 px-5 py-3">
                          <StatusDot status="warn" label="" />
                          <div className="flex-1 min-w-0"><div>{home.late.length} past their time</div><div className="text-[12.5px] text-ink-muted truncate">{home.late.map(l => `${fmtTime(l.time)} ${l.name}`).join(' · ')}</div></div>
                          {/* One late group opens its time's card; several open the sheet. */}
                          <Link href={home.late.length === 1 ? `/dashboard?tt=${home.late[0].teeTimeId}` : '/dashboard'} className="text-[13px] font-semibold text-pine">Open</Link>
                        </div>
                      )}
                      {home.unreadMessages > 0 && (
                        <div className="flex items-center gap-3 px-5 py-3">
                          <StatusDot status="warn" label="" />
                          <div className="flex-1">{home.unreadMessages} unread from GreenReserve</div>
                          <Link href="/dashboard/support" className="text-[13px] font-semibold text-pine">Read</Link>
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* Cam 2026-11-12: next payout is its own card. */}
                {seesPayouts && (payoutError ? <LoadError message={`Couldn't load your payouts from Stripe — ${payoutError}`} onRetry={loadPayouts} /> : (
                  <Card className="px-5 py-4 flex items-center gap-3 text-[14px]">
                    <Link href="/dashboard/money?tab=payouts" className="flex-1 text-ink hover:underline underline-offset-4">Next payout</Link>
                    {!payouts ? <span className="text-ink-muted">Checking Stripe…</span>
                      : !payouts.connected ? <Link href="/dashboard/money?tab=payouts" className="font-semibold text-pine">Connect Stripe</Link>
                      : payouts.next ? <><b className="font-semibold tabular-nums">{usd(payouts.next.amountCents)}</b><span className="text-[12.5px] text-ink-muted">{new Date(payouts.next.arrivalDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></>
                      : <span className="text-ink-muted">Nothing on its way</span>}
                  </Card>
                ))}

                <ShiftNotes key={'notes:' + home.board.notes.map(n => n.id).join()} initial={home.board.notes} />
                <ConditionsCard key={'cond:' + (home.board.conditions.updatedAt ?? '')} initial={home.board.conditions} canEdit={access.can('sheet.course_alert')} />
                {/* HOME-2: setting a goal is settings.edit (money ones also money.payments, checked by the route). */}
                <GoalsCard key={'goals:' + home.board.goals.goals.map(g => `${g.metric}:${g.target}`).join()} goals={home.board.goals} canSet={access.can('settings.edit')} onSaved={() => load()} />
              </div>
            </div>
          </>}
        </div>
      </main>
    </div>
  );
}
