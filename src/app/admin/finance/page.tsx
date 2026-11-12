'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { EXPENSE_CATEGORY_LABEL } from '@/lib/expenses';
import g from '../admin-glass.module.css';
import c from '../courses/courses.module.css';
import r from '../revenue/revenue.module.css';
import s from './finance.module.css';
import { TERMS, SESSION_ENDED, loadFailed, NOT_YET } from './terms';
import {
  type Per, type Month, type FinanceData, type Totals, type Category, PERIODS, SOURCES, CATEGORIES,
  isAnswer, totals, windowTotals, pct, pointsChange, monthLabel, spansYears, curve, ticks, sourceLabel, toCsv,
} from './logic';

// ADMIN-REDO Financial analytics (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Financial analytics:
// APPROVED"). Owner only. ONE Filter (Last 12 / 6 / 3 months, This year) drives every part: four cards (Revenue ·
// Expenses · Profit · Margin, each against the same stretch before), month by month (revenue green, expenses red,
// the gap between them green in profit and red at a loss), the revenue and expenses breakdowns, then the months
// table — a month opens to its breakdown — with CSV. Read-only. Data: /api/admin/finance (Build's, owner-only):
// GreenReserve's side of the MoneyMove ledger and Expenses, counted, never estimated.

const usd = (cents: number) => (cents < 0 ? '−' : '') + '$' + Math.abs(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
const catLabel = (k: Category) => EXPENSE_CATEGORY_LABEL[k] ?? k;

/** A change line. `goodUp` false for costs: a rise is red. `points` for the margin. */
function Change({ now, was, vs, goodUp = true, points = false }: { now: number | null; was: number | null; vs: string; goodUp?: boolean; points?: boolean }) {
  const d = points ? pointsChange(now, was) : now === null || was === null ? null : pct(now, was);
  if (d === null) return <span title={TERMS.vsPrior}>No comparison with {vs}</span>;
  const n = Math.round(d);
  if (n === 0) return <span title={TERMS.vsPrior}>Same as {vs}</span>;
  const good = goodUp ? n > 0 : n < 0;
  return <span title={TERMS.vsPrior}><span className={good ? g.up : g.down}>{n > 0 ? 'Up' : 'Down'} {Math.abs(n)}{points ? (Math.abs(n) === 1 ? ' pt' : ' pts') : '%'}</span> vs {vs}</span>;
}

/** Month by month: smooth revenue and expenses lines, the gap shaded green above expenses and red below. */
function MonthChart({ months, wy }: { months: Month[]; wy: boolean }) {
  const W = 1000, H = 220, pt = 14, pb = 8;
  const n = months.length;
  const top = Math.max(1, ...months.map(m => Math.max(m.revenue.cents, m.expenses.cents)));
  const levels = ticks(top);
  const max = Math.max(top, levels[levels.length - 1] ?? top) * 1.06;
  const X = (i: number) => (n === 1 ? W / 2 : (i * W) / (n - 1));
  const Y = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  const R = months.map((m, i) => [X(i), Y(m.revenue.cents)] as [number, number]);
  const E = months.map((m, i) => [X(i), Y(m.expenses.cents)] as [number, number]);
  const rLine = curve(R), eLine = curve(E);
  const gap = `${rLine} ${curve([...E].reverse()).replace(/^M/, 'L')} Z`;
  const last = months[n - 1];
  return (
    <>
      <div className={s.fx}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.fxs} role="img" aria-label="Revenue and expenses, month by month">
          <defs>
            <clipPath id="finAbove"><path d={`${eLine} L${W} 0 L0 0 Z`} /></clipPath>
            <clipPath id="finBelow"><path d={`${eLine} L${W} ${H} L0 ${H} Z`} /></clipPath>
          </defs>
          {levels.map(t => <line key={t} x1="0" x2={W} y1={Y(t)} y2={Y(t)} className={s.grid} />)}
          {n > 1 && <><path d={gap} className={s.gain} clipPath="url(#finAbove)" /><path d={gap} className={s.loss} clipPath="url(#finBelow)" /></>}
          <path d={eLine} className={s.eLine} />
          <path d={rLine} className={s.rLine} />
          {R.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === n - 1 ? 5 : 3} className={s.dot} />)}
        </svg>
        {levels.map(t => <span key={t} className={s.yl} style={{ top: `${(Y(t) / H) * 100}%` }}>{usd(t)}</span>)}
        {last && <span className={s.end} style={{ top: `${(Y(last.revenue.cents) / H) * 100}%` }}>{usd(last.revenue.cents)}</span>}
      </div>
      <div className={s.ml}>{months.map(m => <span key={m.month}>{monthLabel(m.month, false, wy && m.month.endsWith('-01'))}</span>)}</div>
    </>
  );
}

function Bars({ rows, tone }: { rows: { label: string; cents: number }[]; tone: 'rev' | 'exp' }) {
  const top = Math.max(1, ...rows.map(x => x.cents));
  return (
    <div className={s.cats}>
      {rows.map(x => (
        <div key={x.label} className={s.cat}>
          <div className={s.cl}><span>{x.label}</span><b className={tone === 'exp' ? g.down : undefined}>{usd(x.cents)}</b></div>
          <div className={s.bar}><i className={tone === 'exp' ? s.exp : s.rev} style={{ width: `${Math.max(0, (x.cents / top) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function MonthDetail({ m, before }: { m: Month; before: { revenue: Month['revenue']; expenses: Month['expenses'] } | null }) {
  const t = totals(m.revenue.cents, m.expenses.cents);
  return (
    <div className={s.md}>
      <div>
        <h3>Revenue {usd(m.revenue.cents)} {before && <Change now={m.revenue.cents} was={before.revenue.cents} vs="the month before" />}</h3>
        {SOURCES.map(k => <p key={k}><span>{sourceLabel(k)}</span><b>{usd(m.revenue.bySource[k] ?? 0)}</b></p>)}
      </div>
      <div>
        <h3>Expenses <span className={g.down}>{usd(m.expenses.cents)}</span> {before && <Change now={m.expenses.cents} was={before.expenses.cents} vs="the month before" goodUp={false} />}</h3>
        {CATEGORIES.map(k => <p key={k}><span>{catLabel(k)}</span><b>{usd(m.expenses.byCategory[k] ?? 0)}</b></p>)}
      </div>
      <div>
        <h3>By course</h3>
        {m.byCourse.length === 0 ? <p><span>No course earned this month</span></p>
          : m.byCourse.map(x => <p key={x.courseId}><span>{x.name}</span><b>{x.bookings.toLocaleString()} · {usd(x.revenueCents)}</b></p>)}
      </div>
      <div>
        <h3>The month</h3>
        <p><span title={TERMS.bookings}>Bookings</span><b>{m.bookings.toLocaleString()}</b></p>
        <p><span title={TERMS.liveCourses}>Live courses</span><b>{m.liveCourses ?? '—'}</b></p>
        <p><span title={TERMS.newLive}>New courses live</span><b>{m.newLiveCourses}</b></p>
        <p><span title={TERMS.profit}>Profit</span><b className={t.profit >= 0 ? g.up : g.down}>{usd(t.profit)}</b></p>
      </div>
    </div>
  );
}

type Got = { ok: true; data: FinanceData } | { ok: false; msg: string; status?: number };

export default function FinancePage() {
  const [per, setPer] = useState<Per>('y12');
  const [got, setGot] = useState<Got | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const load = useCallback(async (p: Per) => {
    const mine = ++seq.current;
    setLoading(true);
    let out: Got;
    try {
      const res = await fetch(`/api/admin/finance?period=${p}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.status === 401) out = { ok: false, msg: SESSION_ENDED, status: 401 };
      else if (res.status === 404 && !body?.error) out = { ok: false, msg: NOT_YET, status: 404 }; // Build's route not live yet
      else if (!res.ok || !body) out = { ok: false, msg: body?.error ?? loadFailed(res.status), status: res.status };
      else if (!isAnswer(p, body)) out = { ok: false, msg: loadFailed() };
      else out = { ok: true, data: body };
    } catch { out = { ok: false, msg: loadFailed() }; }
    if (mine !== seq.current) return; // a later Filter pick won
    setGot(out); setLoading(false);
  }, []);
  useEffect(() => { load(per); }, [per, load]);

  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const data = got?.ok ? got.data : null;
  const P = PERIODS.find(x => x.v === per)!;
  const now: Totals | null = useMemo(() => (data ? windowTotals(data.months) : null), [data]);
  const was: Totals | null = useMemo(() => (data ? totals(data.prior.revenueCents, data.prior.expensesCents, data.prior.bookings) : null), [data]);
  const wy = data ? spansYears(data.months) : false;
  const bySource = data ? SOURCES.map(k => ({ label: sourceLabel(k), cents: data.months.reduce((t, m) => t + (m.revenue.bySource[k] ?? 0), 0) })) : [];
  const byCat = data ? CATEGORIES.map(k => ({ label: catLabel(k), cents: data.months.reduce((t, m) => t + (m.expenses.byCategory[k] ?? 0), 0) })) : [];

  function downloadCsv() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([toCsv(data.months, catLabel)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `greenreserve-finance-${data.period.from}-to-${data.period.to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <AdminSidebar active="finance" />
      <main className={g.main}>
        <div className={g.head}><h1>Financial analytics</h1></div>

        <div className={c.fwrap} ref={menuRef}>
          <button type="button" className={`${g.glass} ${c.fbtn}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            {P.label}
          </button>
          {menuOpen && (
            <div className={c.fmenu} role="group" aria-label="Period">
              {PERIODS.map(x => (
                <button key={x.v} type="button" aria-pressed={per === x.v} onClick={() => { setPer(x.v); setOpen(null); setMenuOpen(false); }}><span>{x.label}</span></button>
              ))}
            </div>
          )}
        </div>

        {got && !got.ok && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={got.status === 404 ? g.wa : g.down}>{got.msg}</span>
            {got.status === 401 ? <Link href="/cam">Sign in</Link> : <button type="button" onClick={() => load(per)} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        {!got && <div className={`${g.glass} ${r.skel}`} aria-busy="true" aria-label="Loading financial analytics" />}

        {data && now && was && (
          <div className={loading ? s.stale : undefined} aria-busy={loading}>
            <div className={s.stack}>
              <div className={s.k4}>
                <div className={`${g.glass} ${r.rkc}`}>
                  <span className={r.l} title={TERMS.revenue}>Revenue</span>
                  <b className={r.v}>{usd(now.revenue)}</b>
                  <span className={r.c}><Change now={now.revenue} was={was.revenue} vs={P.vs} /></span>
                </div>
                <div className={`${g.glass} ${r.rkc}`}>
                  <span className={r.l} title={TERMS.expenses}>Expenses</span>
                  <b className={`${r.v} ${g.down}`}>{usd(now.expenses)}</b>
                  <span className={r.c}><Change now={now.expenses} was={was.expenses} vs={P.vs} goodUp={false} /></span>
                </div>
                <div className={`${g.glass} ${r.rkc}`}>
                  <span className={r.l} title={TERMS.profit}>Profit</span>
                  <b className={`${r.v} ${now.profit >= 0 ? g.up : g.down}`}>{usd(now.profit)}</b>
                  <span className={r.c}><Change now={now.profit} was={was.profit} vs={P.vs} /></span>
                </div>
                <div className={`${g.glass} ${r.rkc}`}>
                  <span className={r.l} title={TERMS.margin}>Margin</span>
                  <b className={`${r.v} ${now.margin === null ? '' : now.margin >= 0 ? g.up : g.down}`}>{now.margin === null ? '—' : `${Math.round(now.margin) < 0 ? '−' : ''}${Math.abs(Math.round(now.margin))}%`}</b>
                  <span className={r.c}><Change now={now.margin} was={was.margin} vs={P.vs} points /></span>
                </div>
              </div>

              <section className={`${g.glass} ${r.pad}`} aria-label="Month by month">
                <div className={r.rh}>
                  <h2>Month by month</h2>
                  <span className={r.leg}>
                    <span><i className={s.swRev} />Revenue</span><span><i className={s.swExp} />Expenses</span>
                    <span><i className={s.swGain} />Profit</span><span><i className={s.swLoss} />Loss</span>
                  </span>
                </div>
                {data.months.length === 0 ? <p className={r.muted}>No months in this period.</p> : <MonthChart months={data.months} wy={wy} />}
              </section>

              <div className={s.split2}>
                <section className={`${g.glass} ${r.pad}`} aria-label="Revenue breakdown">
                  <div className={r.rh}><h2>Revenue breakdown</h2></div>
                  <Bars rows={bySource} tone="rev" />
                </section>
                <section className={`${g.glass} ${r.pad}`} aria-label="Expenses breakdown">
                  <div className={r.rh}>
                    <h2>Expenses breakdown</h2>
                    <Link className={r.ico} href="/admin/expenses" aria-label="Open Expenses" title="Open Expenses">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
                    </Link>
                  </div>
                  <Bars rows={byCat} tone="exp" />
                </section>
              </div>

              <section className={`${g.glass} ${r.pad}`} aria-label="Months">
                <div className={r.rh}>
                  <h2>Months</h2>
                  <button type="button" className={r.ico} onClick={downloadCsv} aria-label="Download CSV" title="Download CSV" disabled={data.months.length === 0}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                  </button>
                </div>
                <div className={r.tw}>
                  <table className={r.rt}>
                    <thead><tr><th>Month</th><th className={`${r.n} ${r.hideS}`}>Bookings</th><th className={r.n}>Revenue</th><th className={r.n}>Expenses</th><th className={r.n}>Profit</th><th className={`${r.n} ${r.hideS}`}>Margin</th></tr></thead>
                    <tbody>
                      {[...data.months].reverse().map(m => {
                        const t = totals(m.revenue.cents, m.expenses.cents);
                        const on = open === m.month;
                        const i = data.months.indexOf(m);
                        const before = i > 0 ? data.months[i - 1] : data.monthBefore;
                        const toggle = () => setOpen(on ? null : m.month);
                        return (
                          <Fragment key={m.month}>
                            <tr className={s.mrow} tabIndex={0} aria-expanded={on} onClick={toggle} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
                              <td className={r.nw}><span className={s.chev} aria-hidden="true">{on ? '▾' : '▸'}</span>{monthLabel(m.month, m.partial, wy)}</td>
                              <td className={`${r.n} ${r.hideS}`}>{m.bookings.toLocaleString()}</td>
                              <td className={r.n}>{usd(m.revenue.cents)}</td>
                              <td className={`${r.n} ${g.down}`}>{usd(m.expenses.cents)}</td>
                              <td className={`${r.n} ${t.profit >= 0 ? g.up : g.down}`}>{usd(t.profit)}</td>
                              <td className={`${r.n} ${r.hideS}`}>{t.margin === null ? '—' : `${Math.round(t.margin) < 0 ? '−' : ''}${Math.abs(Math.round(t.margin))}%`}</td>
                            </tr>
                            {on && <tr className={s.mdet}><td colSpan={6}><MonthDetail m={m} before={before} /></td></tr>}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
