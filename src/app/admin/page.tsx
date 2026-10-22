'use client';
// ADMIN-C (Cam 2026-10-22, mockup C "Clean hub", after Stripe's dashboard):
// Home. Left: today's online bookings hour by hour against the same weekday
// last week, the last 7 days against the 7 before, then every course worst
// first. Right, "Needs you": open problems, the pipeline's to-dos, and goals.
// System health lives in the top bar on every page. Data: /api/admin/today,
// which leaves out (null) any section the signed-in role can't see.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-roles';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatMoney as fmtMoney, formatRelative as fmtAgo } from '@/lib/format';

interface ActionRow {
  id: string; who: string; why: string; doThis: string; ageDays: number; severity: 'bad' | 'warn';
  actionLabel: string; href: string;
  fire?: { kind: 'resend_preview' | 'resend_sheet' | 'send_nudge'; inquiryId?: string; courseId?: string };
  courseId?: string;
}
interface HomeCourse {
  id: string; name: string; live: boolean;
  staffSeenAt: string | null; staffQuiet: boolean;
  rows: ActionRow[];
  bookings7d: number; bookingsPrev7d: number; onlineSharePct: number | null; fees7d: number; closed: boolean;
}
interface Week {
  onlineBookings: number; allBookings: number; onlineSharePct: number | null; feesCents: number;
  noShowPct: number | null; rounds: number; noShows: number; uncollectedCents: number; uncollectedRounds: number;
}
interface Problem { id: string; title: string; detail: string; href: string; courseId: string | null; courseName: string | null; openedAt: string; ownerName: string }
interface Goal { id: string; label: string; unit: 'count' | 'cents'; target: number; current: number; dueAt: string; status: 'met' | 'on_pace' | 'behind' | 'missed' }
interface Home {
  needs: ActionRow[] | null;
  courses: HomeCourse[] | null;
  today: { hours: number[]; lastWeekHours: number[]; hourNow: number; bookings: number; lastWeekSoFar: number; feesCents: number; lastWeekFeesCents: number } | null;
  overview: { current: Week; previous: Week; liveCourses: number; liveGoal: { target: number; dueAt: string } | null } | null;
  problems: Problem[] | null;
  goals: Goal[] | null;
  at: string;
}

const REFRESH_MS = 5 * 60 * 1000;
type FireStatus = 'idle' | 'pending' | 'success' | 'error';
const FIRE_LABELS: Record<string, string> = { resend_preview: 'Resend preview', resend_sheet: 'Resend sheet', send_nudge: 'Send nudge' };
const PACE: Record<Goal['status'], string> = { met: 'met', on_pace: 'on pace', behind: 'behind', missed: 'missed' };
const H2 = 'text-[22px] font-bold tracking-[-0.01em] text-ink';
const dayAge = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const ageText = (d: number) => d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
// The chart's hours are the platform's (Eastern); every date and time on the page reads in the same zone.
const TZ = 'America/New_York';
const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });

/** "+19%" against the period before; nothing when there was nothing before. */
function change(cur: number, prev: number, lowerIsBetter = false): { text: string; tone: string } | null {
  if (prev === 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: 'no change', tone: 'text-ink-muted' };
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, tone: good ? 'text-ok' : 'text-bad' };
}

function Stat({ label, value, note, tone = 'text-ink-muted', cls, href }: { label: string; value: string; note?: string; tone?: string; cls: string; href?: string }) {
  const body = (
    <>
      <div className="text-[13.5px] text-ink-soft">{label}</div>
      <div className="mt-1.5 text-[24px] font-medium text-ink tabular-nums">
        {value}{note && <span className={`ml-1.5 text-[13px] font-normal ${tone}`}>{note}</span>}
      </div>
    </>
  );
  const c = `block p-[18px] border-line ${cls}`;
  return href ? <Link href={href} className={`${c} hover:bg-paper`}>{body}</Link> : <div className={c}>{body}</div>;
}

/** Cumulative online bookings through the day: today solid to now, last week dashed to midnight. */
function DayChart({ today, at }: { today: NonNullable<Home['today']>; at: string }) {
  const W = 800, H = 180, base = 170, top = 20;
  const cum = (h: number[]) => h.reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + v], []);
  const t = cum(today.hours), lw = cum(today.lastWeekHours);
  const max = Math.max(4, t[today.hourNow] ?? 0, lw[23] ?? 0);
  const y = (v: number) => base - (v / max) * (base - top);
  const x = (hourEnd: number) => (hourEnd / 24) * W;
  const nowX = x(today.hourNow + new Date(at).getMinutes() / 60);
  const lwPath = `M0 ${base} ` + lw.map((v, h) => `L${x(h + 1).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const tPath = `M0 ${base} ` + t.slice(0, today.hourNow + 1).map((v, h) => `L${(h === today.hourNow ? nowX : x(h + 1)).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[180px] mt-[18px]" role="img"
        aria-label={`Online bookings through the day: ${today.bookings} so far today, ${today.lastWeekSoFar} by this time on the same day last week`}>
        <line x1="0" y1={base + 6} x2={W} y2={base + 6} stroke="#E3E4DE" />
        <line x1={nowX} y1={top} x2={nowX} y2={base + 6} stroke="#E3E4DE" strokeDasharray="2 4" />
        <path d={lwPath} fill="none" stroke="#C9CEC8" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <path d={tPath} fill="none" stroke="#173B2A" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative h-4 text-[12px] text-ink-muted">
        <span className="absolute left-0">12 AM</span>
        {nowX / W > 0.08 && nowX / W < 0.92 && <span className="absolute -translate-x-1/2" style={{ left: `${(nowX / W) * 100}%` }}>Now</span>}
        <span className="absolute right-0">Midnight</span>
      </div>
      <p className="mt-2 text-[12px] text-ink-muted flex gap-4">
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-[2.5px] bg-pine" />Today</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-[#C9CEC8]" />Same day last week</span>
      </p>
    </>
  );
}

function courseDot(c: HomeCourse): 'ok' | 'bad' | 'warn' | 'neutral' {
  if (c.rows.some(r => r.severity === 'bad')) return 'bad';
  if (c.rows.length || c.staffQuiet) return 'warn';
  if (!c.live || c.closed) return 'neutral';
  return 'ok';
}

/** Worst first: a red to-do, then amber, then the biggest drop in bookings. Closed and drafts last. */
function rankCourses(list: HomeCourse[]): HomeCourse[] {
  const rank = { bad: 0, warn: 1, ok: 2, neutral: 3 } as const;
  return [...list].sort((a, b) => rank[courseDot(a)] - rank[courseDot(b)]
    || (a.bookings7d - a.bookingsPrev7d) - (b.bookings7d - b.bookingsPrev7d)
    || a.name.localeCompare(b.name));
}

function seenText(c: HomeCourse): string {
  if (!c.staffSeenAt) return 'Not yet';
  return fmtAgo(new Date(c.staffSeenAt).getTime(), Date.now());
}

export default function AdminHomePage() {
  const { role, areas } = useAdminSession();
  const [data, setData] = useState<Home | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [fireStatuses, setFireStatuses] = useState<Record<string, FireStatus>>({});
  const [fireErrors, setFireErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/today');
      if (r.ok) { setData(await r.json()); setLastUpdated(Date.now()); setError(''); }
      else setError(r.status === 401 ? 'Your session ended — sign in again to refresh.' : 'Couldn’t refresh — what you see may be out of date.');
    } catch {
      setError('Network error — what you see may be out of date.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setTick(t => t + 1), 15000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [load]);

  function canFire(row: ActionRow) {
    if (!row.fire) return false;
    if (row.fire.kind === 'send_nudge') return SUPPORT_PLUS.includes(role);
    // /api/preview/send and resending the details sheet are manager+.
    return MANAGER_PLUS.includes(role);
  }

  async function fire(row: ActionRow) {
    if (!row.fire) return;
    setFireStatuses(s => ({ ...s, [row.id]: 'pending' }));
    try {
      let res: Response;
      if (row.fire.kind === 'resend_preview') {
        res = await fetch('/api/preview/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: row.fire.inquiryId }) });
      } else if (row.fire.kind === 'resend_sheet') {
        res = await fetch('/api/admin/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.fire.inquiryId, action: 'resend_details' }) });
      } else {
        res = await fetch('/api/admin/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: row.fire.courseId, body: 'Just checking in on this — let us know if you have any questions!' }) });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFireErrors(s => ({ ...s, [row.id]: d.error || `Failed (${res.status}).` }));
      }
      setFireStatuses(s => ({ ...s, [row.id]: res.ok ? 'success' : 'error' }));
    } catch {
      setFireErrors(s => ({ ...s, [row.id]: 'Network error — nothing was sent.' }));
      setFireStatuses(s => ({ ...s, [row.id]: 'error' }));
    }
  }

  const today = data?.today;
  const ov = data?.overview;
  const courses = data?.courses ? rankCourses(data.courses) : null;
  const problems = data?.problems;
  const needs = data?.needs;
  const goals = data?.goals?.filter(g => g.status !== 'missed' && new Date(g.dueAt) > new Date()) ?? null;
  // A course's to-dos join Needs you only when no open problem already names that course (no double listing).
  const problemCourses = new Set((problems ?? []).map(p => p.courseId).filter(Boolean));
  const courseTodos = (courses ?? []).filter(c => c.rows.length > 0 && !problemCourses.has(c.id));
  const seesNothing = data && !today && !courses && !needs && !problems && !data.goals;

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar active="overview" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 pt-2.5 pb-10 flex flex-col gap-7">
          <div className="flex items-end justify-between border-b border-line pb-4 gap-4">
            <h1 className="m-0 text-[32px] font-bold tracking-[-0.02em] text-ink leading-none">Today</h1>
            <div className="flex items-center gap-3 text-[13px] text-ink-muted">
              <span>
                {new Date().toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' })}
                {lastUpdated && <> · updated {fmtAgo(lastUpdated, Date.now())}</>}
              </span>
              <button
                type="button" onClick={load} disabled={loading} aria-label="Refresh" title="Refresh"
                className="w-8 h-8 flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-paper disabled:opacity-50"
              >
                <RefreshCw aria-hidden="true" className={`w-4 h-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-xs text-bad">{error}</p>
              <button type="button" onClick={load} className="text-xs font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
            </div>
          )}
          {!data && loading && <p className="text-ink-muted text-center py-20 text-sm">Loading…</p>}

          {seesNothing && (
            <p className="text-[14px] text-ink-soft">
              Nothing on Home is part of your login. Use the menu on the left{role === 'viewer' && (areas.includes('pipeline') || areas.includes('courses')) ? <> — you can read {areas.includes('pipeline') && <Link href="/admin/inquiries" className="text-pine font-medium hover:underline">Pipeline</Link>}{areas.includes('pipeline') && areas.includes('courses') && ' and '}{areas.includes('courses') && <Link href="/admin/courses" className="text-pine font-medium hover:underline">Courses</Link>}</> : ''}.
            </p>
          )}

          {data && !seesNothing && (
            <div className="flex flex-wrap gap-8 items-start">
              <div className="flex-[1_1_600px] min-w-0 flex flex-col gap-8">
                {today && (
                  <section>
                    <div className="flex gap-12 flex-wrap">
                      <div>
                        <div className="text-[14px] text-ink-soft">Online bookings today</div>
                        <div className="mt-1 text-[26px] font-medium text-ink tabular-nums">{today.bookings}</div>
                        <div className="text-[12.5px] text-ink-muted">as of {new Date(data.at).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</div>
                      </div>
                      <div>
                        <div className="text-[14px] text-ink-muted">Same day last week, by now</div>
                        <div className="mt-1 text-[26px] font-medium text-ink-muted tabular-nums">{today.lastWeekSoFar}</div>
                      </div>
                      <div>
                        <div className="text-[14px] text-ink-soft">Fees today</div>
                        <div className="mt-1 text-[26px] font-medium text-ink tabular-nums">{fmtMoney(today.feesCents / 100)}</div>
                        <div className="text-[12.5px] text-ink-muted">{fmtMoney(today.lastWeekFeesCents / 100)} by now last week</div>
                      </div>
                    </div>
                    <DayChart today={today} at={data.at} />
                  </section>
                )}

                {ov && (() => {
                  const c = ov.current, p = ov.previous;
                  const ob = change(c.onlineBookings, p.onlineBookings);
                  const fe = change(c.feesCents, p.feesCents);
                  return (
                    <section>
                      <div className="flex items-baseline justify-between gap-3">
                        <h2 className={H2}>Your overview</h2>
                        <span className="text-[13px] text-ink-muted">Last 7 days · vs the 7 before</span>
                      </div>
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 border border-line rounded-lg">
                        <Stat cls="sm:border-r border-b" label="Online bookings" value={String(c.onlineBookings)} note={ob?.text} tone={ob?.tone} />
                        <Stat cls="sm:border-r border-b" label="GreenReserve fees" value={fmtMoney(c.feesCents / 100)} note={fe?.text} tone={fe?.tone} />
                        <Stat cls="border-b" label="Online share" value={c.onlineSharePct === null ? '—' : `${c.onlineSharePct}%`}
                          note={c.allBookings ? `of ${c.allBookings} booking${c.allBookings === 1 ? '' : 's'}` : 'no bookings yet'} />
                        <Stat href="/admin/goals" cls="sm:border-r border-b sm:border-b-0" label="Live courses" value={String(ov.liveCourses)}
                            note={ov.liveGoal ? `goal ${ov.liveGoal.target} by ${dateText(ov.liveGoal.dueAt)}` : 'set a goal'} />
                        <Stat cls="sm:border-r border-b sm:border-b-0" label="No-show rate" value={c.noShowPct === null ? '—' : `${c.noShowPct}%`}
                          note={c.rounds ? `${c.noShows} of ${c.rounds} rounds, to yesterday` : 'no rounds played'} />
                        <Stat href="/admin/revenue" cls="" label="Fees not collected" value={fmtMoney(c.uncollectedCents / 100)}
                            note={c.uncollectedRounds ? `${c.uncollectedRounds} paid at the counter` : 'none'} tone={c.uncollectedRounds ? 'text-warn' : 'text-ink-muted'} />
                      </div>
                    </section>
                  );
                })()}

                {courses && (
                  <section>
                    <div className="flex items-baseline justify-between gap-3 mb-3">
                      <h2 className={H2}>Courses</h2>
                      <Link href="/admin/courses" className="text-[13.5px] font-medium text-pine hover:underline underline-offset-2">All courses</Link>
                    </div>
                    {courses.length === 0 ? (
                      <p className="text-[14px] text-ink-soft">No courses yet. A course appears here once it is built from its inquiry.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[14px] border-collapse">
                          <thead>
                            <tr className="text-left text-[12.5px] text-ink-muted border-b border-line">
                              <th className="py-2 font-medium">Course</th>
                              <th className="py-2 font-medium">Bookings 7d</th>
                              <th className="py-2 font-medium">Online share</th>
                              <th className="py-2 font-medium">Fees 7d</th>
                              <th className="py-2 font-medium">Staff seen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {courses.map(c => {
                              const diff = c.bookings7d - c.bookingsPrev7d;
                              const quietRow = !c.live || c.closed;
                              return (
                                <tr key={c.id} className="border-b border-line-soft last:border-0 align-top">
                                  <td className="py-3 pr-4">
                                    <Link href={`/admin/courses/${c.id}`} className={`inline-flex items-center gap-2 font-medium hover:underline underline-offset-2 ${quietRow ? 'text-ink-muted' : 'text-ink'}`}>
                                      <StatusDot status={courseDot(c)} />{c.name}
                                    </Link>
                                    {c.rows.length > 0 && (
                                      <div className="mt-0.5 pl-[13px] text-[12.5px] text-ink-soft">
                                        {c.rows[0].why}{c.rows.length > 1 ? ` · ${c.rows.length - 1} more` : ''}
                                      </div>
                                    )}
                                  </td>
                                  {!c.live ? (
                                    <td colSpan={4} className="py-3 text-ink-muted">Not live yet</td>
                                  ) : c.closed ? (
                                    <td colSpan={4} className="py-3 text-ink-muted">No open tee times this week or the next two · {fmtMoney(c.fees7d)} in fees</td>
                                  ) : (
                                    <>
                                      <td className="py-3 tabular-nums">
                                        {c.bookings7d}
                                        {diff !== 0 && <span className={`ml-1.5 text-[12.5px] ${diff > 0 ? 'text-ok' : 'text-bad'}`}>{diff > 0 ? '+' : '−'}{Math.abs(diff)}</span>}
                                      </td>
                                      <td className="py-3 tabular-nums">{c.onlineSharePct === null ? '—' : `${c.onlineSharePct}%`}</td>
                                      <td className="py-3 tabular-nums">{fmtMoney(c.fees7d)}</td>
                                      <td className={`py-3 ${c.staffQuiet ? 'text-warn' : 'text-ink-muted'}`}>{seenText(c)}</td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {courses.some(c => c.staffQuiet) && (
                          <p className="mt-2 text-[12px] text-ink-muted">Staff seen in amber: nobody from the course has opened the dashboard in 3 days while it had tee times.</p>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </div>

              {(problems || needs || goals) && (
                <aside className="flex-[0_1_360px] min-w-[280px] bg-paper rounded-lg p-5 flex flex-col gap-[18px]">
                  {problems && (
                    <div>
                      <div className="flex items-baseline justify-between">
                        <h2 className="text-[16px] font-semibold text-ink">Needs you</h2>
                        <Link href="/admin/problems" className="text-[13px] text-ink-soft hover:text-ink">Problems</Link>
                      </div>
                      {problems.length === 0 && courseTodos.length === 0 ? (
                        <p className="mt-3 text-[14px] text-ink flex items-center gap-2"><StatusDot status="ok" />Nothing is broken.</p>
                      ) : (
                        <div className="mt-3 flex flex-col gap-3.5 text-[14px]">
                          {problems.slice(0, 6).map(p => (
                            <div key={p.id}>
                              <div className="font-medium text-ink">{p.title}{p.courseName && !p.title.includes(p.courseName) ? ` — ${p.courseName}` : ''}</div>
                              <div className="text-[13px] text-ink-muted">{p.detail ? `${p.detail} · ` : ''}{ageText(dayAge(p.openedAt))}{p.ownerName ? ` · ${p.ownerName} has it` : ''}</div>
                              <Link href={`/admin/problems#${p.id}`} className="text-[13.5px] font-medium text-pine hover:underline underline-offset-2">{p.ownerName ? 'Open' : 'Take it'}</Link>
                            </div>
                          ))}
                          {problems.length > 6 && <Link href="/admin/problems" className="text-[13px] text-ink-soft hover:text-ink">{problems.length - 6} more problems</Link>}
                          {courseTodos.slice(0, 4).map(c => (
                            <div key={c.id}>
                              <div className="font-medium text-ink">{c.name}</div>
                              <div className="text-[13px] text-ink-muted">{c.rows[0].why} · {c.rows[0].doThis}</div>
                              <Link href={c.rows[0].href} className="text-[13.5px] font-medium text-pine hover:underline underline-offset-2">{c.rows[0].actionLabel}</Link>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {needs && (
                    <div className="border-t border-line pt-4">
                      <div className="flex items-baseline justify-between">
                        <h2 className="text-[16px] font-semibold text-ink">Pipeline</h2>
                        <Link href="/admin/inquiries" className="text-[13px] text-ink-soft hover:text-ink">Open</Link>
                      </div>
                      {needs.length === 0 ? (
                        <p className="mt-2.5 text-[14px] text-ink-soft">No inquiries waiting on you.</p>
                      ) : (
                        <div className="mt-2.5 flex flex-col gap-2.5 text-[14px]">
                          {needs.slice(0, 8).map(row => {
                            const fs = fireStatuses[row.id] ?? 'idle';
                            return (
                              <div key={row.id}>
                                <div className="flex justify-between gap-3">
                                  <Link href={row.href} className="text-ink hover:underline underline-offset-2 truncate">{row.why} · {row.who}</Link>
                                  <span className={`shrink-0 ${row.severity === 'bad' ? 'text-bad' : row.ageDays >= 7 ? 'text-warn' : 'text-ink-muted'}`}>{ageText(row.ageDays)}</span>
                                </div>
                                {row.fire && canFire(row) && (
                                  fs === 'success' ? (
                                    <span className="text-[12.5px] font-medium text-ok">Sent</span>
                                  ) : (
                                    <button type="button" onClick={() => fire(row)} disabled={fs === 'pending'} className="text-[12.5px] font-medium text-pine hover:underline underline-offset-2 disabled:opacity-50">
                                      {fs === 'pending' ? 'Sending…' : fs === 'error' ? 'Failed — retry' : FIRE_LABELS[row.fire.kind]}
                                    </button>
                                  )
                                )}
                                {fs === 'error' && fireErrors[row.id] && <p role="alert" className="text-[12px] text-bad">{fireErrors[row.id]}</p>}
                              </div>
                            );
                          })}
                          {needs.length > 8 && <Link href="/admin/inquiries" className="text-[13px] text-ink-soft hover:text-ink">{needs.length - 8} more</Link>}
                        </div>
                      )}
                    </div>
                  )}

                  {goals && (
                    <div className="border-t border-line pt-4">
                      <div className="flex items-baseline justify-between">
                        <h2 className="text-[16px] font-semibold text-ink">{goals.length === 1 ? 'Goal' : 'Goals'}</h2>
                        <Link href="/admin/goals" className="text-[13px] text-ink-soft hover:text-ink">{goals.length ? 'All goals' : 'Set one'}</Link>
                      </div>
                      {goals.length === 0 ? (
                        <p className="mt-2 text-[14px] text-ink-soft">No goal running.</p>
                      ) : goals.slice(0, 3).map(g => {
                        const show = (n: number) => g.unit === 'cents' ? fmtMoney(n / 100) : String(n);
                        const pct = Math.min(100, g.target ? Math.round((g.current / g.target) * 100) : 0);
                        return (
                          <div key={g.id} className="mt-2.5">
                            <div className="text-[14px] text-ink">{g.label}: {show(g.target)} by {dateText(g.dueAt)}</div>
                            <div className="h-1.5 bg-line rounded-sm mt-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.label} goal`}>
                              <div className={`h-1.5 rounded-sm ${g.status === 'behind' ? 'bg-warn' : 'bg-fairway'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className={`mt-1.5 text-[12.5px] ${g.status === 'behind' ? 'text-warn' : 'text-ink-muted'}`}>{show(g.current)} of {show(g.target)} · {PACE[g.status]}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </aside>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
