'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../admin-glass.module.css';
import s from '../courses/courses.module.css';
import b from './bookings.module.css';
import { SESSION_ENDED, loadFailed } from '../courses/terms';
import { FILTER_LABEL, FILTER_TITLE, FEE_TITLE, PAID_TITLE, EVENT_WORDS, BY_WORDS, WHAT_WORDS, METHOD_WORDS, PROBLEM_WORDS, SOURCE_WORDS, DISPUTE_OUT, DISPUTE_BACK, FEE_LINES, payLine } from './terms';

// ADMIN-REDO page 4 — Bookings (Cam 2026-11-12, ADMIN_REDO_SPEC.md "Page 4"). A READ-ONLY record: every booking,
// newest booked first; a booking opens a card that says first whether it's paid, then the whole booking, the money
// (with our service fee and whether it was collected) and its history. The only links are Course → and Stripe ↗
// (view only). No charge, retry, refund, dispute or message action belongs on this page.
// The top-bar search finds a booking by its number; ?q= filters the list, ?id= opens a booking.

type Filter = keyof typeof FILTER_LABEL;
type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
type Row = { id: string; number: string; golferName: string; course: string; courseId: string; teeDate: string; teeTime: string; players: number; bookedAt: string; amountCents: number | null; pay: { key: string; short: string; tone: Tone } };
type List = { at: string; filter: Filter; q: string; seesCourses: boolean; counts: Record<Filter, number>; nextCursor: string | null; rows: Row[] };
type Profile = {
  id: string; number: string; golferName: string; course: string; courseId: string; teeDate: string; teeTime: string; holes: number; players: number; riding: boolean;
  bookedAt: string; source: string; status: string; splitFromId: string | null;
  contact: { email: string | null; phone: string | null; accountId: string | null } | null;
  policy: string; checkedIn: { at: string; players: number | null } | null; noShowAt: string | null; cancelledAt: string | null; declineReason: string | null;
  pay: { key: string; short: string; headline: string; tone: Tone };
  fee: { key: 'collected' | 'not_collected' | 'when_paid' | 'none'; cents: number };
  owed: { greenCents: number; cartCents: number; rangeCents: number; shopCents: number; discountCents: number; feeCents: number; roundCents: number | null };
  paid: { inCents: number; outCents: number; beforeDisputeCents: number; disputeOutCents: number };
  seesCourses: boolean;
  moves: { at: string; what: string; direction: string; method: string; account: string; cents: number; feeCents: number; dispute: boolean }[];
  events: { at: string; type: string; by: string; cents: number | null; players: number | null }[];
  problems: { at: string; kind: string; cents: number; detail: string }[];
  stripeUrl: string | null;
};

const TZ = 'America/New_York';
const FILTERS = Object.keys(FILTER_LABEL) as Filter[];
const FEE_WORDS = { collected: 'collected', not_collected: 'not collected', when_paid: 'collected when they pay', none: 'none' } as const;
const usd = (c: number) => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toFixed(2);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
const dayTime = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const shortTee = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const teeDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

async function getJson<T>(url: string, what: string): Promise<{ ok: true; data: T } | { ok: false; msg: string }> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const body = await r.json().catch(() => null);
    if (r.status === 401) return { ok: false, msg: SESSION_ENDED };
    if (!r.ok || !body) return { ok: false, msg: body?.error ?? loadFailed(what, r.status) };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, msg: loadFailed(what) };
  }
}

function ProfilePanel({ id }: { id: string }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await getJson<Profile>(`/api/admin/bookings?id=${encodeURIComponent(id)}`, 'This booking');
    if (r.ok) setP(r.data); else setError(r.msg);
    setLoading(false);
  }, [id]);
  useEffect(() => { setP(null); load(); }, [load]);

  if (error) return (
    <section className={`${g.glass} ${s.prof}`} role="alert" aria-label="Booking">
      <p className={`${s.muted} ${g.down}`}>{error}</p>
      <div className={s.plinks}>
        {error === SESSION_ENDED ? <Link className={s.plink} href="/admin/login">Sign in</Link>
          : <button type="button" className={s.plink} onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
      </div>
    </section>
  );
  if (!p) return <section className={`${g.glass} ${s.prof} ${s.skel}`} aria-busy="true" aria-label="Loading the booking" />;

  const history = [
    ...p.events.map(e => ({ at: e.at, text: EVENT_WORDS[e.type] ?? e.type, detail: [BY_WORDS[e.by], e.cents ? usd(e.cents) : null].filter(Boolean).join(' · ') || null })),
    ...p.moves.map(m => ({ at: m.at, text: m.dispute ? `${m.direction === 'out' ? DISPUTE_OUT : DISPUTE_BACK}, ${usd(m.cents)}` : `${WHAT_WORDS[m.what] ?? m.what} ${m.direction === 'out' ? 'given back' : 'paid'}, ${usd(m.cents)}`, detail: [METHOD_WORDS[m.method] ?? m.method, m.feeCents ? `our fee ${usd(m.feeCents)}` : null].filter(Boolean).join(' · ') })),
    ...p.problems.map(x => ({ at: x.at, text: PROBLEM_WORDS[x.kind] ?? x.kind, detail: x.detail || null })),
  ].sort((a, z) => a.at.localeCompare(z.at));
  const o = p.owed;
  // The course's own fees that were charged (a hold, a late cancellation, a no-show), from the ledger.
  const feeLines = FEE_LINES.flatMap(([what, label]) => { const c = p.moves.filter(m => m.what === what && !m.dispute).reduce((a, m) => a + (m.direction === 'out' ? -m.cents : m.cents), 0); return c !== 0 ? [[label, c] as const] : []; });

  return (
    <section id="booking-card" className={`${g.glass} ${s.prof}`} aria-label={`Booking #${p.number}`}>
      <div className={s.ph}>
        <div className={s.pname}>
          <h2>{p.golferName}</h2>
          <p>{p.course}</p>
        </div>
        <div className={s.plinks}>
          {p.seesCourses && <Link className={s.plink} href={`/admin/courses/${p.courseId}`}>Course <span aria-hidden="true">→</span></Link>}
          {p.stripeUrl && <a className={s.plink} href={p.stripeUrl} target="_blank" rel="noopener noreferrer">Stripe <span aria-hidden="true">↗</span></a>}
        </div>
      </div>

      <div className={`${b.pay} ${b[p.pay.tone] ?? ''}`}>
        <b>{p.pay.headline}</b>
        <span>{payLine(p)}</span>
      </div>

      <div className={s.psec}>
        <h3>Booking</h3>
        <dl className={s.kv}>
          <dt>Tee time</dt><dd>{teeDay(p.teeDate)}, {clock(p.teeTime)}</dd>
          <dt>Course</dt><dd>{p.course}</dd>
          <dt>Round</dt><dd>{p.holes} holes · {p.players} {p.players === 1 ? 'player' : 'players'} · {p.riding ? 'riding' : 'walking'}</dd>
          <dt>Booked</dt><dd>{dayTime(p.bookedAt)} · {SOURCE_WORDS[p.source] ?? p.source}</dd>
          <dt>Booking number</dt><dd>{p.number}{p.splitFromId && <span className={s.vs}>split off another group</span>}</dd>
          <dt>Golfer</dt><dd>{p.contact ? [p.contact.email, p.contact.phone].filter(Boolean).join(' · ') || 'No contact taken' : "Your login doesn't include Golfers."}</dd>
          <dt>Course policy</dt><dd>{p.policy}</dd>
          <dt>Checked in</dt><dd>{p.checkedIn ? `Yes, ${dayTime(p.checkedIn.at)}${p.checkedIn.players != null && p.checkedIn.players < p.players ? ` · ${p.checkedIn.players} of ${p.players}` : ''}`
            : p.declineReason ? "No — the card was declined, so check-in didn't go through" : p.noShowAt ? `No — marked a no-show ${day(p.noShowAt)}` : p.cancelledAt ? `No — cancelled ${day(p.cancelledAt)}` : 'No'}</dd>
        </dl>
      </div>

      <div className={s.psec}>
        <h3>Money</h3>
        <div className={b.lines}>
          {o.greenCents > 0 && <div><span>Green fees</span><span>{usd(o.greenCents)}</span></div>}
          {o.cartCents > 0 && <div><span>Carts</span><span>{usd(o.cartCents)}</span></div>}
          {o.rangeCents > 0 && <div><span>Range balls</span><span>{usd(o.rangeCents)}</span></div>}
          {o.shopCents > 0 && <div><span>Shop items</span><span>{usd(o.shopCents)}</span></div>}
          {feeLines.map(([label, cents]) => <div key={label}><span>{label}</span><span>{usd(cents)}</span></div>)}
          {o.discountCents > 0 && <div><span>Promo discount</span><span>−{usd(o.discountCents)}</span></div>}
          <div className={b.ours} title={FEE_TITLE}><span>Our service fee · {FEE_WORDS[p.fee.key]}</span><span>{usd(p.fee.key === 'collected' ? p.fee.cents : p.fee.key === 'none' ? 0 : o.feeCents)}</span></div>
          {o.roundCents !== null && <div className={b.tot}><span>Round comes to</span><span>{usd(o.roundCents)}</span></div>}
          <div className={b.tot} title={PAID_TITLE}><span>Paid</span><span>{usd(p.paid.inCents - p.paid.outCents)}</span></div>
        </div>
      </div>

      <div className={s.psec}>
        <h3>History</h3>
        {history.length === 0 ? <p className={s.muted}>Nothing recorded.</p> : (
          <div className={b.log}>{history.map((h, i) => <div key={i}><small>{dayTime(h.at)}</small><span>{h.text}{h.detail && <em>{h.detail}</em>}</span></div>)}</div>
        )}
      </div>
    </section>
  );
}

function BookingsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const openId = params.get('id');
  const [filter, setFilter] = useState<Filter>('all');
  const [d, setD] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<string | null>(openId);
  // The top search opens another booking while this page stays mounted: follow ?id=.
  useEffect(() => { if (openId) setPick(openId); }, [openId]);
  // A new search from the top bar is a new list: open its first booking, not the last list's.
  const lastQ = useRef(q);
  useEffect(() => { if (lastQ.current !== q) { lastQ.current = q; if (!openId) setPick(null); } }, [q, openId]);

  const url = (cursor?: string) => '/api/admin/bookings?' + new URLSearchParams({ filter, ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) }).toString();
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    const r = await getJson<List>(url(), 'The booking list');
    if (mine !== seq.current) return;
    if (r.ok) setD(r.data); else setError(r.msg);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q]);
  useEffect(() => { setD(null); load(); }, [load]);
  const loadMore = async () => {
    if (!d?.nextCursor) return;
    setMore({ busy: true, error: null });
    const mine = seq.current;
    const r = await getJson<List>(url(d.nextCursor), 'More bookings');
    if (mine !== seq.current) { setMore({ busy: false, error: null }); return; } // the filter or search changed meanwhile
    if (r.ok) { setD(cur => cur ? { ...cur, rows: [...cur.rows, ...r.data.rows], nextCursor: r.data.nextCursor } : r.data); setMore({ busy: false, error: null }); }
    else setMore({ busy: false, error: r.msg });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const rows = d?.rows ?? [];
  // Only once the list for this filter and search has arrived, never the previous one.
  useEffect(() => { if (d && d.filter === filter && d.q === q.trim().slice(0, 100) && pick === null && rows[0]) setPick(rows[0].id); }, [d, filter, q, pick, rows]);
  const open = (id: string) => {
    setPick(id);
    if (window.matchMedia('(max-width: 1150px)').matches) requestAnimationFrame(() => document.getElementById('booking-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const pickFilter = (f: Filter) => { if (f === filter) { setMenuOpen(false); return; } setD(null); setFilter(f); setMenuOpen(false); setPick(null); };

  return (
    <>
      <AdminSidebar active="bookings" />
      <main className={g.main}>
        <div className={g.head}>
          <h1>Bookings</h1>
        </div>

        {error && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={g.down}>{error}</span>
            {error === SESSION_ENDED ? <Link href="/admin/login">Sign in</Link> : <button type="button" onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        <div className={b.bar}>
          <div className={s.fwrap} ref={menuRef}>
            <button type="button" className={`${g.glass} ${s.fbtn}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              {filter === 'all' ? 'Filter' : `Filter: ${FILTER_LABEL[filter]}`}
            </button>
            {menuOpen && (
              <div className={s.fmenu} role="group" aria-label="Show">
                {FILTERS.map(f => (
                  <button key={f} type="button" aria-pressed={filter === f} onClick={() => pickFilter(f)} title={FILTER_TITLE[f]}>
                    <span>{FILTER_LABEL[f]}</span><b>{d ? d.counts[f] : '·'}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          {q && <span className={b.qline}>“{q}”<button type="button" onClick={() => { setD(null); setPick(null); router.replace('/admin/bookings'); }}>Clear</button></span>}
        </div>

        {!d && !error && <div className={`${g.glass} ${s.skel}`} aria-busy="true" aria-label="Loading bookings" />}

        {d && (
          <div className={s.split}>
            <section className={`${g.glass} ${s.dir}`} aria-label="Bookings">
              {rows.length === 0 ? <p className={s.empty}>{q || filter !== 'all' ? 'No match.' : 'No bookings yet.'}</p> : (
                <table>
                  <thead><tr>
                    <th>Booking</th><th>Golfer</th><th className={s.hideS}>Course</th><th>Tee time</th>
                    <th className={`${s.n} ${s.hideS}`}>Players</th><th className={s.hideS}>Booked</th><th className={s.n}>Money</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className={s.row} tabIndex={0} aria-selected={r.id === pick}
                        onClick={() => open(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.id); } }}>
                        <td className={b.num}>{r.number}</td>
                        <td><span className={s.cname}>{r.golferName}</span><span className={`${s.csub} ${b.showS}`}>{r.course}</span></td>
                        <td className={s.hideS}>{r.course}</td>
                        <td className={b.nowrap}>{shortTee(r.teeDate)}<span className={s.csub}>{clock(r.teeTime)}</span></td>
                        <td className={`${s.n} ${s.hideS}`}>{r.players}</td>
                        <td className={`${s.hideS} ${b.nowrap}`}>{day(r.bookedAt)}</td>
                        <td className={s.n}><span className={`${b.money} ${b[r.pay.tone] ?? ''}`}><span className={b.amt}>{r.amountCents === null ? '—' : usd(r.amountCents)}</span><span className={b.ms}><i />{r.pay.short}</span></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {d.nextCursor && (
                <div className={b.more}>
                  <button type="button" className={s.plink} onClick={loadMore} disabled={more.busy} aria-busy={more.busy}>{more.busy ? 'Loading…' : 'Show more'}</button>
                  {more.error && <span className={g.down} role="alert">&nbsp;{more.error}</span>}
                </div>
              )}
            </section>
            {pick && <ProfilePanel key={pick} id={pick} />}
          </div>
        )}
      </main>
    </>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsContent />
    </Suspense>
  );
}
