'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import g from './admin-glass.module.css';

// ADMIN-REDO Overview (Cam 2026-11-11, the "green glass" mockup,
// ADMIN_REDO_SPEC.md): six numbers against last month, the fees chart with
// the period before dashed, Recent activity and Needs attention. Every number
// is counted by /api/admin/today/overview; a section the login can't see is
// left out. Before launch nearly everything is zero, and zero reads as zero.

type Grouping = 'day' | 'week' | 'month' | 'quarter' | 'year';
type Series = { labels: string[]; cur: number[]; prev: number[]; totalCents: number; sub: string };
type Overview = {
  at: string;
  coursesLive: { count: number; wentLive: number; wentLivePrior: number } | null;
  revenue: { cents: number; priorCents: number } | null;
  feesMissed: { cents: number; rounds: number; priorCents: number } | null;
  expenses: { cents: number; priorCents: number } | null;
  onboarding: { waiting: number; stuck: number; stuckDays: number } | null;
  net: { cents: number | null; priorCents: number | null; stripeUnavailable: boolean } | null;
  chart: Record<Grouping, Series> | null;
  activity: { id: string; at: string; text: string; tone: 'ok' | 'neutral' | 'brand'; href: string }[] | null;
  attention: { rows: { id: string; text: string; tone: 'bad' | 'warn'; href: string; action: string }[]; total: number; problemsMore: number; todosMore: number; todosHref: string } | null;
};

const TZ = 'America/New_York';
const GROUPS: { v: Grouping; label: string }[] = [
  { v: 'day', label: 'Day' }, { v: 'week', label: 'Week' }, { v: 'month', label: 'Month' }, { v: 'quarter', label: 'Quarter' }, { v: 'year', label: 'Year' },
];

const money = (cents: number) => (cents < 0 ? '−' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: Math.abs(cents) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const whole = (n: number) => n.toLocaleString('en-US');

/** "+3 vs last month" — a plain difference; a percentage off zero is not information. */
function versus(cur: number, prior: number, fmt: (n: number) => string, tinted: boolean, upIsBad = false) {
  const d = cur - prior;
  if (d === 0) return <><b>Same</b> as last month</>;
  const pct = prior > 0 ? ` (${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) / prior * 100)}%)` : '';
  const cls = tinted ? '' : (d > 0) !== upIsBad ? g.up : g.down;
  return <><b className={cls}>{d > 0 ? '+' : '−'}{fmt(Math.abs(d))}{pct}</b> vs last month</>;
}

function niceMax(v: number) {
  // No fees yet: a $0–$100 axis, so the ticks are distinct numbers rather than "$0 $0 $1".
  if (v <= 10_000) return 10_000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
const axis = (cents: number) => cents >= 100_000 ? `$${(cents / 100_000).toFixed(cents % 100_000 ? 1 : 0)}K` : `$${Math.round(cents / 100)}`;

function Chart({ s }: { s: Series }) {
  // Drawn at the box's real width so the labels stay 11px on a phone and on a wide screen.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 560 ? 200 : 260, L = 52, R = 16, T = 14, B = 30, w = W - L - R, h = H - T - B;
  const max = niceMax(Math.max(...s.cur, ...s.prev) * 1.08);
  const x = (i: number) => L + (s.cur.length === 1 ? w / 2 : (i * w) / (s.cur.length - 1));
  const y = (v: number) => T + h - (Math.max(v, 0) / max) * h;
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const every = Math.ceil(s.labels.length / Math.max(2, Math.floor(w / 90)));
  return (
    <div ref={box}>
    <svg className={g.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Service fees collected, ${s.sub}: ${money(s.totalCents)}, against the period before`}>
      {[0, 1, 2, 3, 4].map(k => {
        const v = (max * k) / 4, yy = y(v);
        return <g key={k}><line x1={L} x2={W - R} y1={yy} y2={yy} stroke="var(--g-grid)" /><text x={L - 8} y={yy + 4} textAnchor="end">{axis(v)}</text></g>;
      })}
      {s.labels.map((lb, i) => (i % every === 0 || i === s.labels.length - 1) && (
        <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === s.labels.length - 1 ? 'end' : 'middle'}>{lb}</text>
      ))}
      <path d={`${line(s.cur)} L${x(s.cur.length - 1)},${T + h} L${x(0)},${T + h} Z`} fill="var(--g-chart-fill)" />
      <path d={line(s.prev)} fill="none" stroke="var(--g-chart-prev)" strokeWidth="1.6" strokeDasharray="5 5" />
      <path d={line(s.cur)} fill="none" stroke="var(--g-chart)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
    </div>
  );
}

function when(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-US', { timeZone: TZ });
  if (day(d) === day(new Date())) return d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
}

export default function AdminOverview() {
  const { role } = useAdminSession();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Grouping>('week');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/today/overview', { cache: 'no-store' });
      const body = await r.json().catch(() => null);
      if (r.status === 401) { setError('Your session ended — sign in again.'); return; }
      if (!r.ok || !body) { setError(body?.error ?? `The overview didn't load (error ${r.status}). Try again.`); return; }
      setData(body as Overview);
    } catch {
      setError("The overview didn't load — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const d = data;
  const seesNothing = d && !d.coursesLive && !d.revenue && !d.feesMissed && !d.expenses && !d.onboarding && !d.net && !d.chart && !d.activity && !d.attention;
  const series = d?.chart?.[group];
  const today = new Date().toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <AdminSidebar active="overview" />
      <main className={g.main}>
        <div className={g.head}>
          <h1>Overview</h1>
          <p>{today}{d && <> · updated {when(d.at)}</>}</p>
        </div>

        {error && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={g.down}>{error}</span>
            {error.startsWith('Your session') ? <Link href="/admin/login">Sign in</Link> : <button type="button" onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}
        {!d && !error && <div className={`${g.glass} ${g.skel}`} aria-busy="true" aria-label="Loading the overview" />}
        {seesNothing && (
          <div className={`${g.glass} ${g.note}`}>
            Your login ({role}) doesn&apos;t include the areas this page draws from. The owner sets areas on Team.
          </div>
        )}

        {d && !seesNothing && (
          <>
            <section className={g.kpis} aria-label="This month against last month, to the same day">
              {d.coursesLive && (
                <Link href="/admin/courses" className={`${g.glass} ${g.kpi}`}>
                  <span className={g.kpiL}>Courses live</span>
                  <span className={g.kpiV}>{whole(d.coursesLive.count)}</span>
                  <span className={g.kpiC}><b className={d.coursesLive.wentLive ? g.up : ''}>{d.coursesLive.wentLive ? `+${d.coursesLive.wentLive}` : 'None'}</b> went live this month · last month {d.coursesLive.wentLivePrior}</span>
                </Link>
              )}
              {d.revenue && (
                <Link href="/admin/revenue" className={`${g.glass} ${g.kpi} ${g.t1}`}>
                  <span className={g.kpiL} title="GreenReserve's service fees on rounds paid this month, less fees refunded">Revenue this month</span>
                  <span className={g.kpiV}>{money(d.revenue.cents)}</span>
                  <span className={g.kpiC}>{versus(d.revenue.cents, d.revenue.priorCents, money, true)}</span>
                </Link>
              )}
              {d.onboarding && (
                <Link href="/admin/inquiries" className={`${g.glass} ${g.kpi}`}>
                  <span className={g.kpiL}>Waiting to onboard</span>
                  <span className={g.kpiV}>{whole(d.onboarding.waiting)}</span>
                  <span className={g.kpiC}>{d.onboarding.stuck > 0
                    ? <b className={g.wa}>{d.onboarding.stuck} stuck {d.onboarding.stuckDays}+ days</b>
                    : d.onboarding.waiting > 0 ? 'None stuck' : 'Pipeline is empty'}</span>
                </Link>
              )}
              {d.expenses && (
                <Link href="/admin/revenue" className={`${g.glass} ${g.kpi}`}>
                  <span className={g.kpiL} title="The month's expenses as the Revenue page counts them">Expenses</span>
                  <span className={g.kpiV}>{money(d.expenses.cents)}</span>
                  <span className={g.kpiC}>{versus(d.expenses.cents, d.expenses.priorCents, money, false, true)}</span>
                </Link>
              )}
              {d.feesMissed && (
                <Link href="/admin/revenue?tab=uncollected" className={`${g.glass} ${g.kpi}`}>
                  <span className={g.kpiL} title="Service fees not collected because the round was paid in cash at the counter">Fees missed</span>
                  <span className={g.kpiV}>{money(d.feesMissed.cents)}</span>
                  <span className={g.kpiC}>{versus(d.feesMissed.cents, d.feesMissed.priorCents, money, false, true)}</span>
                </Link>
              )}
              {d.net && (
                <Link href="/admin/revenue" className={`${g.glass} ${g.kpi} ${g.t2}`}>
                  <span className={g.kpiL} title="Service fees, less Stripe's processing and the month's expenses — the Revenue page's net">Net profit</span>
                  <span className={g.kpiV}>{d.net.cents === null ? '—' : money(d.net.cents)}</span>
                  <span className={g.kpiC}>{d.net.cents === null || d.net.priorCents === null
                    ? "Stripe couldn't be read"
                    : versus(d.net.cents, d.net.priorCents, money, true)}</span>
                </Link>
              )}
            </section>

            {d.chart && series && (
              <section className={`${g.glass} ${g.chart}`} aria-label="Revenue">
                <div className={g.chead}>
                  <div><div className={g.subt}>Service fees collected · {series.sub}</div><div className={g.big}>{money(series.totalCents)}</div></div>
                  <div className={g.legend}><span>This period</span><span className={g.prev}>Period before</span></div>
                  <div className={g.tabs} role="group" aria-label="Group by">
                    {GROUPS.map(o => <button key={o.v} type="button" aria-pressed={group === o.v} onClick={() => setGroup(o.v)}>{o.label}</button>)}
                  </div>
                </div>
                {series.totalCents === 0 && series.prev.every(v => v === 0) && <p className={g.empty}>No service fees collected yet in these periods.</p>}
                <Chart s={series} />
              </section>
            )}

            <div className={g.two}>
              {d.activity && (
                <section className={`${g.glass} ${g.list}`} aria-label="Recent activity">
                  <h2>Recent activity <span>Last 7 days</span></h2>
                  {d.activity.length === 0 && <p className={g.empty}>Nothing new this week.</p>}
                  {d.activity.map(a => (
                    <Link key={a.id} href={a.href} className={g.li}>
                      <span className={`${g.d} ${a.tone === 'ok' ? g.dok : a.tone === 'brand' ? g.dbrand : ''}`} />
                      <span className={g.lt}>{a.text}</span>
                      <span className={g.lw}>{when(a.at)}</span>
                    </Link>
                  ))}
                </section>
              )}
              {d.attention && (
                <section className={`${g.glass} ${g.list} ${g.attn}`} aria-label="Needs attention">
                  <h2>Needs attention <span>{d.attention.total || 'Nothing'}</span></h2>
                  {d.attention.rows.length === 0 && <p className={g.empty}>Nothing needs you right now.</p>}
                  {d.attention.rows.map(r => (
                    <Link key={r.id} href={r.href} className={g.li}>
                      <span className={`${g.d} ${r.tone === 'bad' ? g.dbad : g.dwarn}`} />
                      <span className={g.lt}>{r.text}</span>
                      <span className={g.act}>{r.action}</span>
                    </Link>
                  ))}
                  {(d.attention.problemsMore > 0 || d.attention.todosMore > 0) && (
                    <p className={g.empty}>
                      {d.attention.problemsMore > 0 && <Link href="/admin/problems">+{d.attention.problemsMore} problems</Link>}
                      {d.attention.problemsMore > 0 && d.attention.todosMore > 0 && ' · '}
                      {d.attention.todosMore > 0 && <Link href={d.attention.todosHref}>+{d.attention.todosMore} to-dos</Link>}
                    </p>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
