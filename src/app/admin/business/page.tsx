'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../admin-glass.module.css';
import c from '../courses/courses.module.css';
import r from '../revenue/revenue.module.css';
import s from './business.module.css';
import { TERMS, SESSION_ENDED, NOT_YET, SHORT_PERIOD, loadFailed } from './terms';
import { type Per, type BusinessData, PERIODS, STEP_LABEL, isAnswer, pct, points, stepRate, barScale, monthLabel, axisLabel, coursesCsv } from './logic';

// ADMIN-REDO Business analytics (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Business analytics:
// APPROVED"). Course-focused: nothing about who is golfing. ONE Filter (Last 12 / 6 / 3 months, This year) drives
// every part: three cards (Live courses · Online bookings · Tee sheets filled, each vs the stretch before), bookings by
// month (online · phone & counter, the running month faded and marked *), What courses get from us, Courses joining,
// and the courses table with CSV. Read-only. Data: GET /api/admin/business (Build's; manager+, Courses area) —
// counted, never estimated; a figure the route can't count comes back null and shows a dash.

const usd = (cents: number) => '$' + Math.round(cents / 100).toLocaleString('en-US');
const n = (v: number) => v.toLocaleString('en-US');
const pctText = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`);

/** A change line: up is good here. `pts` for rates (the change is in points). */
function Change({ now, was, vs, pts = false }: { now: number | null; was: number | null; vs: string; pts?: boolean }) {
  const d = pts ? points(now, was) : pct(now, was);
  if (d === null) return <span title={TERMS.vsPrior}>No comparison with {vs}</span>;
  const k = Math.round(d);
  if (k === 0) return <span title={TERMS.vsPrior}>Same as {vs}</span>;
  return <span title={TERMS.vsPrior}><span className={k > 0 ? g.up : g.down}>{k > 0 ? 'Up' : 'Down'} {Math.abs(k)}{pts ? (Math.abs(k) === 1 ? ' pt' : ' pts') : '%'}</span> vs {vs}</span>;
}

function BookingsChart({ months }: { months: BusinessData['months'] }) {
  const totals = months.map(m => m.online + m.counter);
  const { step, max } = barScale(totals);
  const lines: number[] = [];
  for (let v = 0; v <= max; v += step) lines.push(v);
  const wy = months.length > 0 && months[0].month.slice(0, 4) !== months[months.length - 1].month.slice(0, 4);
  return (
    <>
      <div className={s.bcw} role="img" aria-label="Bookings by month, online and phone & counter">
        {lines.map(v => <div key={v} className={s.gl} style={{ bottom: `${(v / max) * 100}%` }}><span>{axisLabel(v)}</span></div>)}
        <div className={s.bc}>
          {months.map((m, i) => (
            <div key={m.month} className={s.col}>
              <div className={`${s.m} ${m.partial ? s.part : ''}`} style={{ height: `${(totals[i] / max) * 100}%` }}
                title={`${monthLabel(m.month, false, true)}${m.partial ? ' so far' : ''}: ${n(m.online)} online, ${n(m.counter)} phone & counter`}>
                {totals[i] > 0 && <span className={s.val}>{n(totals[i])}</span>}
                <i className={s.on} style={{ flex: m.online }} />
                <i className={s.of} style={{ flex: m.counter }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={s.bl}>{months.map(m => <span key={m.month}>{monthLabel(m.month, m.partial, wy && m.month.endsWith('-01'))}</span>)}</div>
    </>
  );
}

type Got = { ok: true; data: BusinessData } | { ok: false; msg: string; status?: number };

export default function BusinessPage() {
  const [per, setPer] = useState<Per>('y12');
  const [got, setGot] = useState<Got | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const load = useCallback(async (p: Per) => {
    const mine = ++seq.current;
    setLoading(true);
    let out: Got;
    try {
      const res = await fetch(`/api/admin/business?period=${p}`, { cache: 'no-store' });
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

  const d = got?.ok ? got.data : null;
  const P = PERIODS.find(x => x.v === per)!;
  const steps = d?.joining.steps ?? [];
  // Our revenue per course needs the Money area too; the route sends null then, and the column is left out.
  const showRevenue = !!d && d.courses.some(x => x.ourRevenueCents !== null);
  const topStep = useMemo(() => Math.max(1, ...steps.map(x => x.count ?? 0)), [steps]);

  function downloadCsv() {
    if (!d) return;
    const url = URL.createObjectURL(new Blob([coursesCsv(d.courses, showRevenue)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `greenreserve-courses-${d.period.from}-to-${d.period.to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <AdminSidebar active="business" />
      <main className={g.main}>
        <div className={g.head}><h1>Business analytics</h1></div>

        <div className={c.fwrap} ref={menuRef}>
          <button type="button" className={`${g.glass} ${c.fbtn}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            {P.label}
          </button>
          {menuOpen && (
            <div className={c.fmenu} role="group" aria-label="Period">
              {PERIODS.map(x => <button key={x.v} type="button" aria-pressed={per === x.v} onClick={() => { setPer(x.v); setMenuOpen(false); }}><span>{x.label}</span></button>)}
            </div>
          )}
        </div>

        {got && !got.ok && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={got.status === 404 ? g.wa : g.down}>{got.msg}</span>
            {got.status === 401 ? <Link href="/admin/login">Sign in</Link> : <button type="button" onClick={() => load(per)} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        {!got && <div className={`${g.glass} ${r.skel}`} aria-busy="true" aria-label="Loading business analytics" />}

        {d && (
          <div className={`${s.stack} ${loading ? s.stale : ''}`} aria-busy={loading}>
            <div className={r.rk}>
              <div className={`${g.glass} ${r.rkc}`}>
                <span className={r.l} title={TERMS.live}>Live courses</span>
                <b className={r.v}>{n(d.cards.liveCourses.now)}</b>
                <span className={r.c}><Change now={d.cards.liveCourses.now} was={d.cards.liveCourses.prior} vs={P.vs} /></span>
              </div>
              <div className={`${g.glass} ${r.rkc}`}>
                <span className={r.l} title={TERMS.online}>Online bookings</span>
                <b className={r.v}>{n(d.cards.onlineBookings.count)}</b>
                <span className={r.c}><Change now={d.cards.onlineBookings.count} was={d.cards.onlineBookings.prior} vs={P.vs} /></span>
              </div>
              <div className={`${g.glass} ${r.rkc}`}>
                <span className={r.l} title={TERMS.fill}>Tee sheets filled</span>
                {d.cards.teeSheetFill.pct === null ? <b className={r.na}>—</b> : <b className={r.v}>{pctText(d.cards.teeSheetFill.pct)}</b>}
                <span className={r.c}><Change now={d.cards.teeSheetFill.pct} was={d.cards.teeSheetFill.prior} vs={P.vs} pts /></span>
              </div>
            </div>

            <section className={`${g.glass} ${r.pad}`} aria-label="Bookings by month">
              <div className={r.rh}>
                <h2>Bookings by month</h2>
                <span className={r.leg}><span><i className={s.swOn} />Online</span><span><i className={s.swOff} />Phone &amp; counter</span></span>
              </div>
              {d.months.length === 0 ? <p className={r.muted}>No months in this period.</p> : <BookingsChart months={d.months} />}
            </section>

            <div className={s.split2}>
              <section className={`${g.glass} ${r.pad}`} aria-label="What courses get from us">
                <div className={r.rh}><h2>What courses get from us</h2></div>
                <div className={s.vrows}>
                  <div><span title={TERMS.greenFees}>Green fees booked online</span><b>{usd(d.value.onlineGreenFeesCents)}</b></div>
                  <div>
                    <span title={TERMS.afterHours}>Booked outside tee-sheet hours{d.value.afterHours && d.value.afterHours.pctOfOnline !== null && <small>{pctText(d.value.afterHours.pctOfOnline)} of online bookings</small>}</span>
                    <b>{d.value.afterHours ? n(d.value.afterHours.count) : '—'}</b>
                  </div>
                  <div><span title={TERMS.paidBefore}>Paid before they arrived<small>{n(d.value.paidBeforeArrival.count)} round{d.value.paidBeforeArrival.count === 1 ? '' : 's'}</small></span><b>{usd(d.value.paidBeforeArrival.cents)}</b></div>
                  <div><span title={TERMS.noShowFees}>No-show &amp; late fees collected</span><b>{usd(d.value.noShowLateFeesCents)}</b></div>
                </div>
              </section>

              <section className={`${g.glass} ${r.pad}`} aria-label="Courses joining">
                <div className={r.rh}><h2 title={TERMS.joining}>Courses joining</h2></div>
                <div className={s.fun}>
                  {steps.map((x, i) => {
                    const rate = stepRate(steps, i);
                    return (
                      <div key={x.key} className={s.fs}>
                        <span>{STEP_LABEL[x.key]}</span>
                        <div className={s.bar}><i style={{ width: `${((x.count ?? 0) / topStep) * 100}%` }} /></div>
                        <b>{x.count === null ? '—' : n(x.count)}</b>
                        <em>{rate === null ? '' : `${Math.round(rate)}%`}</em>
                        <em>{x.avgDaysAtStep === null ? '' : `${Math.round(x.avgDaysAtStep)} day${Math.round(x.avgDaysAtStep) === 1 ? '' : 's'}`}</em>
                      </div>
                    );
                  })}
                </div>
                {(per === 'm3' || per === 'm6') && <p className={s.caveat}>{SHORT_PERIOD}</p>}
                <div className={`${s.vrows} ${s.after}`}>
                  <div>
                    <span title={TERMS.reachedToLive}>First contact to live</span>
                    <b>{d.joining.reachedToLive.pct === null ? '—' : `${pctText(d.joining.reachedToLive.pct)}${d.joining.reachedToLive.avgDays === null ? '' : ` · ${Math.round(d.joining.reachedToLive.avgDays)} days`}`}</b>
                  </div>
                  <div><span>In progress now</span><b>{n(d.joining.inProgress)} course{d.joining.inProgress === 1 ? '' : 's'}</b></div>
                  <div><span title={TERMS.waitingOnUs}>Waiting on us</span><b className={d.joining.waitingOnUs > 0 ? g.down : undefined}>{n(d.joining.waitingOnUs)}</b></div>
                </div>
              </section>
            </div>

            <section className={`${g.glass} ${r.pad}`} aria-label="Courses">
              <div className={r.rh}>
                <h2>Courses</h2>
                <button type="button" className={r.ico} onClick={downloadCsv} aria-label="Download CSV" title="Download CSV" disabled={d.courses.length === 0}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                </button>
              </div>
              {d.courses.length === 0 ? <p className={r.muted}>No live courses in this period.</p> : (
                <div className={r.tw}>
                  <table className={r.rt}>
                    <thead><tr>
                      <th>Course</th><th className={r.n}>Online bookings</th><th className={r.n} title={TERMS.vsPrior}>vs before</th>
                      <th className={`${r.n} ${r.hideS}`} title={TERMS.fillCourse}>Tee sheet filled</th><th className={`${r.n} ${r.hideS}`} title={TERMS.share}>Booked online</th>
                      {showRevenue && <th className={r.n} title={TERMS.ourRevenue}>Our revenue</th>}
                    </tr></thead>
                    <tbody>
                      {d.courses.map(x => {
                        const ch = pct(x.online, x.onlinePrior);
                        return (
                          <tr key={x.courseId}>
                            <td>{x.name}</td>
                            <td className={r.n}>{n(x.online)}</td>
                            <td className={`${r.n} ${ch === null ? '' : Math.round(ch) > 0 ? g.up : Math.round(ch) < 0 ? g.down : ''}`}>{ch === null ? '—' : Math.round(ch) === 0 ? 'Same' : `${Math.round(ch) > 0 ? 'Up' : 'Down'} ${Math.abs(Math.round(ch))}%`}</td>
                            <td className={`${r.n} ${r.hideS}`}>{pctText(x.fillPct)}</td>
                            <td className={`${r.n} ${r.hideS}`}>{pctText(x.onlineSharePct)}</td>
                            {showRevenue && <td className={r.n}>{x.ourRevenueCents === null ? '—' : usd(x.ourRevenueCents)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
