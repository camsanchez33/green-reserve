'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../admin-glass.module.css';
import c from '../courses/courses.module.css';
import s from './revenue.module.css';
import { TERMS, NOT_YET, OWNER_ONLY, SESSION_ENDED, loadFailed } from './terms';

// ADMIN-REDO Revenue (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Revenue: APPROVED"): what
// GreenReserve earns. One column, no tabs; ONE Filter (This month · Last month · Last 30 days · This year) drives
// every part. READ-ONLY: nothing here charges, retries or refunds anyone (scripts/admin-never-charges-test.ts).
// Expenses moved to /admin/expenses; profit and unit economics left with it (Financial analytics, not built yet).
//
// Data (Build owns every money route; this page only shows what they answer, never an estimate):
//   /api/admin/revenue          the period, revenue, fees by day, by course, Books vs Stripe for the period (owner)
//   /api/admin/platform-stripe  owner: the next payout to our bank and the Stripe balance
//   /api/admin/course-payouts   owner: each course's payout state at Stripe
//   /api/admin/stripe-match     owner: the last full months, our books against Stripe
// What the routes don't answer yet shows "Not available yet" (asked of Build 2026-11-12): the ledger, prior
// revenue per course, failed or short course payouts, paid out to courses in the period, and the period kinds
// last_month / 30d / year (until then they are custom windows compared with the same number of days before).

type Per = 'month' | 'last' | 'd30' | 'year';
const PERIODS: { v: Per; label: string }[] = [
  { v: 'month', label: 'This month' }, { v: 'last', label: 'Last month' }, { v: 'd30', label: 'Last 30 days' }, { v: 'year', label: 'This year' },
];

interface Delta { pct: number | null; direction: 'up' | 'down' | 'flat' | null }
interface CourseRow { courseId: string; name: string; active: boolean; archived: boolean; booked: number; serviceFees: number }
interface RevenueData {
  period: { kind: string; label: string; from: string; to: string };
  isOwner: boolean;
  ownerMfaRequired?: boolean;
  pnl: { feesCollected: number; feesCollectedDelta: Delta; separateFees?: number };
  daily?: { current: number[]; prior: number[] };
  byCourse: CourseRow[];
  reconciliation?: { expected: number; actual: number; gap: number; reconciles: boolean | null; unavailable: boolean };
}
interface Platform { balance: { available: number }; nextPayout: { amount: number; arrivalDate: string } | null }
interface CoursePayout { courseId: string; name: string; error: string | null; payoutsEnabled: boolean; needsInfo: boolean }
interface MonthMatch { month: string; ours: number; stripe: number | null; result: 'match' | 'off' | 'unknown' }

const DAY = 86_400_000;
const usd = (n: number) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => ymd(new Date(Date.parse(day + 'T00:00:00Z') + n * DAY));
const short = (day: string, withYear = false) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
const weekday = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

/** The query for a period. The route answers mtd today; the other three are custom windows (UTC days) until
 *  Build adds them as their own kinds. */
function query(per: Per, now = new Date()): string {
  const today = ymd(now);
  if (per === 'month') return 'period=mtd';
  if (per === 'd30') return `period=custom&from=${addDays(today, -29)}&to=${today}`;
  if (per === 'year') return `period=custom&from=${today.slice(0, 4)}-01-01&to=${today}`;
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return `period=custom&from=${ymd(first)}&to=${ymd(last)}`;
}

type Got<T> = { ok: true; data: T } | { ok: false; msg: string; status?: number };
async function getJson<T>(url: string, what: string): Promise<Got<T>> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const body = await r.json().catch(() => null);
    if (r.status === 401) return { ok: false, msg: SESSION_ENDED, status: 401 };
    if (!r.ok || !body) return { ok: false, msg: body?.error ?? loadFailed(what, r.status), status: r.status };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, msg: loadFailed(what) };
  }
}

/** One owner-only source: loading, an error with a retry, or its data. */
function useOwnerSource<T>(url: string, what: string, enabled: boolean) {
  const [st, setSt] = useState<{ data: T | null; err: string | null; busy: boolean }>({ data: null, err: null, busy: false });
  const load = useCallback(async () => {
    setSt(x => ({ ...x, busy: true, err: null }));
    const r = await getJson<T>(url, what);
    setSt(r.ok ? { data: r.data, err: null, busy: false } : { data: null, err: r.msg, busy: false });
  }, [url, what]);
  const started = useRef(false);
  useEffect(() => { if (enabled && !started.current) { started.current = true; load(); } }, [enabled, load]);
  return { ...st, load };
}

function Retry({ msg, onRetry, busy }: { msg: string; onRetry: () => void; busy: boolean }) {
  return (
    <p className={s.err} role="alert">
      <span>{msg}</span>
      {msg === SESSION_ENDED ? <Link href="/admin/login">Sign in</Link>
        : <button type="button" onClick={onRetry} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>}
    </p>
  );
}

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
);
const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
);
function StripeLink({ href }: { href: string }) {
  return <a className={s.ico} href={href} target="_blank" rel="noopener noreferrer" aria-label="Open in Stripe" title="Open in Stripe"><ArrowIcon /></a>;
}

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span title={TERMS.vsPrior}>Nothing the period before</span>;
  const r = Math.round(pct);
  if (r === 0) return <span title={TERMS.vsPrior}>Same as the period before</span>;
  return <span title={TERMS.vsPrior}><span className={r > 0 ? g.up : g.down}>{r > 0 ? 'Up' : 'Down'} {Math.abs(r)}%</span> vs the period before</span>;
}

/** Running total through the period against the period before, from the route's fees by day. */
function RunningChart({ current, prior, from, done }: { current: number[]; prior: number[]; from: string; done: boolean }) {
  const run = (a: number[]) => { let t = 0; return a.map(v => (t += v)); };
  const T = run(current), Q = run(prior);
  const n = Math.max(T.length, Q.length, 2);
  const W = 1000, H = 200, pad = 8;
  const max = Math.max(T[T.length - 1] ?? 0, Q[Q.length - 1] ?? 0, 1) * 1.08;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const path = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const total = T[T.length - 1] ?? 0;
  const priorAt = Q[Math.min(T.length, Q.length) - 1] ?? 0;
  const ahead = total - priorAt;
  const last = addDays(from, n - 1);
  const labels = [short(from), short(addDays(from, Math.floor((n - 1) / 2))), short(last)];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.line} role="img"
        aria-label={`Revenue ${usd(total)} so far, ${usd(Math.abs(ahead))} ${ahead >= 0 ? 'ahead of' : 'behind'} the period before`}>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className={s.gl} />)}
        {Q.length > 1 && <path d={path(Q)} className={s.lp} />}
        {T.length > 1 && <path d={`${path(T)} L${x(T.length - 1)} ${H - pad} L${x(0)} ${H - pad} Z`} className={s.la} />}
        {T.length > 1 && <path d={path(T)} className={s.lt} />}
      </svg>
      <div className={s.lab} aria-hidden="true">{labels.map((l, i) => <span key={i}>{l}</span>)}</div>
      <p className={s.sum}>
        <b>{usd(total)}</b> {done ? 'in the period' : 'so far'} · <span className={ahead >= 0 ? g.up : g.down}>{usd(Math.abs(ahead))} {ahead >= 0 ? 'ahead of' : 'behind'} the period before</span>{!done && ' at the same day'}
      </p>
    </>
  );
}

function csvCell(v: string | number) {
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function download(name: string, rows: (string | number)[][]) {
  const blob = new Blob([rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function RevenuePage() {
  const [per, setPer] = useState<Per>('month');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [d, setD] = useState<(RevenueData & { per: Per }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const seq = useRef(0);
  const load = useCallback(async (p: Per) => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    const r = await getJson<RevenueData>(`/api/admin/revenue?${query(p)}`, 'Revenue');
    if (mine !== seq.current) return; // a later Filter pick won
    if (r.ok) setD({ ...r.data, per: p }); else setError(r.msg);
    setLoading(false);
  }, []);
  useEffect(() => { load(per); }, [load, per]);

  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const owner = !!d?.isOwner;
  const platform = useOwnerSource<Platform>('/api/admin/platform-stripe?period=30d', 'The Stripe balance', owner);
  const payouts = useOwnerSource<{ courses: CoursePayout[] }>('/api/admin/course-payouts', 'Course payouts', owner);
  const months = useOwnerSource<{ months: MonthMatch[] }>('/api/admin/stripe-match', 'The monthly match', owner);

  // Never show one period's numbers under another period's name.
  const shown = d && d.per === per ? d : null;
  const label = PERIODS.find(p => p.v === per)!.label;

  const view = useMemo(() => {
    if (!shown) return null;
    const separate = shown.pnl.separateFees ?? 0;
    const revenue = shown.pnl.feesCollected + separate;
    const live = shown.byCourse.filter(r => r.active && !r.archived).length;
    const courses = shown.byCourse
      .filter(r => (r.active && !r.archived) || r.booked > 0 || r.serviceFees !== 0)
      .sort((a, b) => b.serviceFees - a.serviceFees || b.booked - a.booked || a.name.localeCompare(b.name));
    const done = shown.period.to < ymd(new Date());
    return { separate, revenue, live, courses, done };
  }, [shown]);

  const problemCourses = (payouts.data?.courses ?? []).filter(x => x.error || !x.payoutsEnabled || x.needsInfo);
  const okCourses = (payouts.data?.courses ?? []).length - problemCourses.length;

  return (
    <>
      <AdminSidebar active="revenue" />
      <main className={g.main}>
        <div className={g.head}><h1>Revenue</h1></div>

        <div className={c.fwrap} ref={menuRef}>
          <button type="button" className={`${g.glass} ${c.fbtn}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            {label}
          </button>
          {menuOpen && (
            <div className={c.fmenu} role="group" aria-label="Period">
              {PERIODS.map(p => (
                <button key={p.v} type="button" aria-pressed={per === p.v} onClick={() => { setPer(p.v); setMenuOpen(false); }}>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={g.down}>{error}</span>
            {error === SESSION_ENDED ? <Link href="/admin/login">Sign in</Link> : <button type="button" onClick={() => load(per)} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        {!shown && !error && <div className={`${g.glass} ${s.skel}`} aria-busy="true" aria-label="Loading revenue" />}

        {shown && view && (
          <>
            <div className={s.rk}>
              <div className={`${g.glass} ${s.rkc}`}>
                <span className={s.l} title={TERMS.revenue}>Revenue</span>
                <b className={s.v}>{usd(view.revenue)}</b>
                <span className={s.c}>{view.separate === 0 ? <Change pct={shown.pnl.feesCollectedDelta.pct} /> : <>vs the period before: {NOT_YET.toLowerCase()}</>}</span>
              </div>
              <div className={`${g.glass} ${s.rkc}`}>
                <span className={s.l} title={TERMS.average}>Average per live course</span>
                {view.live > 0 ? <b className={s.v}>{usd(view.revenue / view.live)}</b> : <b className={s.na}>No live courses</b>}
                <span className={s.c}>{view.live} live course{view.live === 1 ? '' : 's'}</span>
              </div>
              <div className={`${g.glass} ${s.rkc}`}>
                <span className={s.l} title={TERMS.payout}>Stripe payout</span>
                {!owner ? <><b className={s.na}>—</b><span className={s.c}>{shown.ownerMfaRequired ? 'Sign in with your second factor to see it' : OWNER_ONLY}</span></>
                  : platform.err ? <Retry msg={platform.err} onRetry={platform.load} busy={platform.busy} />
                  : !platform.data ? <><b className={s.na} aria-busy="true">…</b><span className={s.c}>Asking Stripe</span></>
                  : platform.data.nextPayout ? <><b className={s.v}>{usd(platform.data.nextPayout.amount)}</b><span className={s.c}>Arrives {weekday(platform.data.nextPayout.arrivalDate)}</span></>
                  : <><b className={s.na}>None on the way</b><span className={s.c}>Balance {usd(platform.data.balance.available)}</span></>}
              </div>
            </div>

            <section className={`${g.glass} ${s.pad}`} aria-label="Revenue over the period">
              <div className={s.rh}>
                <h2>Revenue, {label.toLowerCase()}</h2>
                <span className={s.leg}><span><i className={s.sw} />{label}</span><span title={TERMS.vsPrior}><i className={s.swPrev} />The period before</span></span>
              </div>
              {shown.daily
                ? <RunningChart current={shown.daily.current} prior={shown.daily.prior} from={shown.period.from} done={view.done} />
                : <p className={s.muted}>{NOT_YET}</p>}
              {view.separate !== 0 && <p className={s.note}>{usd(view.separate)} in fees charged on their own is in Revenue but not in the chart yet.</p>}
            </section>

            <div className={s.stack}>
              <section className={`${g.glass} ${s.pad}`} aria-label="Course payments">
                <div className={s.rh}><h2 title={TERMS.coursePayments}>Course payments</h2>{owner && <StripeLink href="https://dashboard.stripe.com/connect/accounts/overview" />}</div>
                {!owner ? <p className={s.muted}>{OWNER_ONLY}</p>
                  : payouts.err ? <Retry msg={payouts.err} onRetry={payouts.load} busy={payouts.busy} />
                  : !payouts.data ? <p className={s.muted} aria-busy="true">Asking Stripe…</p>
                  : (
                    <div className={s.rows}>
                      {problemCourses.map(x => (
                        <div key={x.courseId}>
                          <span>{x.name}<small>{x.error ? `Couldn't read its payouts: ${x.error}` : !x.payoutsEnabled ? 'Stripe has paused its payouts' : 'Stripe needs information from it'}</small></span>
                          <b className={g.down}>Not paid</b>
                        </div>
                      ))}
                      <div><span>Failed or short payouts<small>This period</small></span><b className={s.na}>{NOT_YET}</b></div>
                      {okCourses > 0 && <div><span>{problemCourses.length ? 'Every other course' : `All ${okCourses} course${okCourses === 1 ? '' : 's'}`}<small>Payouts on at Stripe</small></span><b className={g.up}>OK</b></div>}
                    </div>
                  )}
              </section>

              <section className={`${g.glass} ${s.pad}`} aria-label="Payouts">
                <div className={s.rh}><h2>Payouts</h2>{owner && <StripeLink href="https://dashboard.stripe.com/payouts" />}</div>
                {!owner ? <p className={s.muted}>{OWNER_ONLY}</p>
                  : platform.err ? <Retry msg={platform.err} onRetry={platform.load} busy={platform.busy} />
                  : !platform.data ? <p className={s.muted} aria-busy="true">Asking Stripe…</p>
                  : (
                    <div className={s.rows}>
                      <div><span>To our bank<small>{platform.data.nextPayout ? `Next: ${weekday(platform.data.nextPayout.arrivalDate)}` : 'Nothing on the way'}</small></span><b>{platform.data.nextPayout ? usd(platform.data.nextPayout.amount) : '—'}</b></div>
                      <div><span>Balance at Stripe<small>Available now</small></span><b>{usd(platform.data.balance.available)}</b></div>
                      <div><span>To the courses<small>{label}</small></span><b className={s.na}>{NOT_YET}</b></div>
                    </div>
                  )}
              </section>

              <section className={`${g.glass} ${s.pad}`} aria-label="Books vs Stripe">
                <div className={s.rh}><h2 title={TERMS.books}>Books vs Stripe</h2></div>
                {!owner ? <p className={s.muted}>{OWNER_ONLY}</p> : (
                  <div className={s.rows}>
                    {shown.reconciliation && (
                      <div>
                        <span>{label}<small>Our books {usd(shown.reconciliation.expected)} · Stripe {shown.reconciliation.unavailable ? '—' : usd(shown.reconciliation.actual)}</small></span>
                        {shown.reconciliation.reconciles === null ? <b className={g.wa}>Stripe didn&rsquo;t answer</b>
                          : shown.reconciliation.reconciles ? <b className={g.up}>Matches</b>
                          : <b className={g.down}>Off by {usd(Math.abs(shown.reconciliation.gap))}</b>}
                      </div>
                    )}
                    {months.err ? <div><Retry msg={months.err} onRetry={months.load} busy={months.busy} /></div>
                      : !months.data ? <div><span className={s.muted} aria-busy="true">Asking Stripe…</span></div>
                      : months.data.months.map(m => (
                        <div key={m.month}>
                          <span>{m.month}<small>Our books {usd(m.ours)} · Stripe {m.stripe === null ? '—' : usd(m.stripe)}</small></span>
                          {m.result === 'unknown' ? <b className={g.wa}>Stripe didn&rsquo;t answer</b>
                            : m.result === 'match' ? <b className={g.up}>Matches</b>
                            : <b className={g.down}>Off by {usd(Math.abs(m.ours - (m.stripe ?? 0)))}</b>}
                        </div>
                      ))}
                  </div>
                )}
              </section>
            </div>

            <section className={`${g.glass} ${s.pad}`} aria-label="By course">
              <div className={s.rh}>
                <h2>By course</h2>
                {view.courses.length > 0 && (
                  <button type="button" className={s.ico} aria-label="Download CSV" title="Download CSV"
                    onClick={() => download(`revenue-by-course-${shown.period.from}-to-${shown.period.to}.csv`, [
                      ['Course', 'Bookings', 'Revenue'],
                      ...view.courses.map(r => [r.name, r.booked, r.serviceFees.toFixed(2)]),
                    ])}>
                    <DownloadIcon />
                  </button>
                )}
              </div>
              {view.courses.length === 0 ? <p className={s.muted}>No live courses.</p> : (
                <div className={s.tw}>
                  <table className={s.rt}>
                    <thead><tr>
                      <th>Course</th>
                      <th className={s.n} title={TERMS.bookings}>Bookings</th>
                      <th className={s.n} title={TERMS.courseRevenue}>Revenue</th>
                      <th className={`${s.n} ${s.hideS}`} title={TERMS.vsPrior}>vs the period before</th>
                    </tr></thead>
                    <tbody>
                      {view.courses.map(r => (
                        <tr key={r.courseId}>
                          <td><Link href={`/admin/courses/${r.courseId}`}>{r.name}</Link></td>
                          <td className={s.n}>{r.booked.toLocaleString('en-US')}</td>
                          <td className={s.n}>{usd(r.serviceFees)}</td>
                          <td className={`${s.n} ${s.hideS}`} title={NOT_YET}>—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={`${g.glass} ${s.pad}`} aria-label="Ledger">
              <div className={s.rh}><h2>Ledger</h2></div>
              <p className={s.muted}>{NOT_YET}</p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
