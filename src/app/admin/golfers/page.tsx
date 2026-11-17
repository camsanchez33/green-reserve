'use client';
// Golfers (Cam approved the mockup 2026-11-17, lanes/admin/golfers-mockup.html; lanes/admin.md "Golfers — APPROVED").
// Every golfer who has used GreenReserve, one line each (name, home course, rounds, last played, a status dot), with a
// wordless search and one filter icon. A golfer opens to their numbers, contact, where they've played and every
// booking with its history, with Resend confirmation and Resend receipt ONLY: admin never charges, retries, refunds or
// cancels a golfer's booking; the course is the seller (CLAUDE.md). The API is /api/admin/golfers (list, record, the
// two resends). Shown only when the data exists: texts consent, the saved card's brand, the last sign-in, emails
// sent and the Stripe link aren't on the record yet, so they stay off the page.
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { Msg, profileStyles as s } from '@/components/admin/ProfileCard';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { formatMoney, formatTeeDate, formatTeeTime } from '@/lib/format';
import { Dialog } from '../security/Dialog';
import g from '../admin-glass.module.css';
import gs from './golfers.module.css';

type Tone = 'ok' | 'warn' | 'bad' | 'neutral';
type Filter = 'all' | 'account' | 'guest' | 'noshow' | 'failed';
const FILTERS: [Filter, string][] = [['all', 'Everyone'], ['account', 'Golfers with an account'], ['guest', 'Guests, no account'], ['noshow', 'No-shows or late cancels'], ['failed', 'Failed charges']];
type Line = { key: string; id: string | null; guestEmail: string | null; name: string; homeCourse: string | null; rounds: number; lastPlayed: string | null; tone: Tone };
type List = { filter: Filter; q: string; total: number; nextOffset: number | null; golfers: Line[] };

interface PaymentEvent { id: string; kind: string; amount: number; actor: string; actorName: string | null; detail: string; at: string }
interface Booking {
  id: string; status: string; paymentStatus: string; players: number; totalAmount: number; accessFeeTotal: number;
  refundedTotal: number; checkedInAt: string | null; cancelledAt: string | null; cancellationFeeChargedAt: string | null;
  checkInFailReason: string; hasCard: boolean; isGuest: boolean; noShow: boolean; createdAt: string; number: string;
  termsAcceptedAt: string | null; termsVersion: string | null;
  courseId: string; courseName: string; teeDate: string; teeTime: string; holes: number; events: PaymentEvent[];
}
interface Trust { rounds: number; noShows: number; lateCancels: number; failedCharges: number; upcoming: number; lifetimeCollected: number; refunded: number }
interface Golfer { id: string | null; email: string; firstName: string; lastName: string; phone: string; createdAt: string | null; isGuest: boolean; bookings: Booking[]; trust: Trust }

const TZ = 'America/New_York';
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayE = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', year: 'numeric' });
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const dotClass = (t: Tone) => `${gs.dot} ${t === 'neutral' ? '' : gs[t]}`;

const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const SearchIcon = () => <svg {...ICON} width={14} height={14}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const FilterIcon = () => <svg {...ICON}><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></svg>;
const Chevron = () => <svg {...ICON} width={14} height={14} className={gs.ch}><path d="m9 6 6 6-6 6" /></svg>;

function statusOf(b: Booking): { tone: Tone; label: string } {
  if (b.status === 'cancelled') return b.paymentStatus === 'cancellation_fee_charged' ? { tone: 'warn', label: 'Cancelled late, fee kept' } : { tone: 'neutral', label: 'Cancelled, no fee kept' };
  if (b.paymentStatus === 'refunded') return { tone: 'neutral', label: 'Refunded' };
  if (b.status === 'completed') return { tone: 'ok', label: b.refundedTotal > 0 ? 'Checked in · part refunded' : 'Checked in and paid' };
  if (b.checkInFailReason) return { tone: 'bad', label: 'Card declined at check-in' };
  if (b.noShow) return { tone: 'warn', label: 'No-show' };
  if (b.paymentStatus === 'cancellation_fee_charged') return { tone: 'warn', label: 'Late fee charged · not checked in' };
  if (b.paymentStatus === 'paid') return { tone: 'ok', label: 'Paid · not checked in yet' };
  return { tone: 'neutral', label: b.hasCard ? 'Confirmed · card on file' : 'Confirmed · no card' };
}

const BY: Record<string, string> = { operator: 'by the course', admin: 'by GreenReserve', system: 'automatically', cron: 'automatically', stripe: 'by Stripe' };
const EVENT_WORDS: Record<string, string> = {
  refund: 'Refunded', refund_failed: 'Refund failed', charge_failed: 'Charge failed',
  dispute_opened: 'Chargeback opened', dispute_closed: 'Chargeback closed',
};

/** What happened to a booking, oldest first, from what the record holds. */
function history(b: Booking): [string, string][] {
  const rows: [string, string][] = [[b.createdAt, `Booked · ${b.hasCard ? 'card saved' : 'no card saved'}`]];
  if (b.checkedInAt) rows.push([b.checkedInAt, 'Checked in']);
  if (b.cancelledAt) rows.push([b.cancelledAt, 'Cancelled']);
  // The same column holds a cutoff hold on a booking still on (given back at check-in), so it's a late-cancel fee only
  // on a cancelled booking that kept it.
  if (b.cancellationFeeChargedAt && b.status === 'cancelled') rows.push([b.cancellationFeeChargedAt, b.paymentStatus === 'cancellation_fee_charged' ? 'Late-cancel fee charged' : 'Late-cancel fee charged, later given back']);
  // Who did it, as the record has it: the course's staff, GreenReserve, the system or Stripe.
  for (const e of b.events) rows.push([e.at, [EVENT_WORDS[e.kind] ?? e.kind.replace(/_/g, ' '), e.amount ? formatMoney(e.amount) : '', BY[e.actor] ?? '', e.actorName ?? '', e.detail].filter(Boolean).join(' · ')]);
  return rows.sort((a, z) => a[0].localeCompare(z[0]));
}

function GolfersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const guest = params.get('guest') ?? '';
  const open = (l: Line) => router.push(l.id ? `/admin/golfers?id=${encodeURIComponent(l.id)}` : `/admin/golfers?guest=${encodeURIComponent(l.guestEmail ?? '')}`);
  return (
    <>
      <AdminSidebar active="golfers" />
      <main className={g.main}>
        <div className={g.head}><h1>Golfers</h1></div>
        <div className={gs.col}>
          {id || guest ? <Record key={id + '|' + guest} id={id} guest={guest} onBack={() => router.push('/admin/golfers')} /> : <Everyone onOpen={open} />}
        </div>
      </main>
    </>
  );
}

function LoadError({ msg, kind, retry, busy }: { msg: string; kind: AdminFetchFailure; retry: () => void; busy: boolean }) {
  return (
    <div className={`${g.glass} ${g.note}`} role="alert">
      <span className={g.down}>{msg}</span>
      {kind === 'unauthorized' ? <Link href="/admin/login">Sign in</Link>
        : kind === 'forbidden' ? null : <button type="button" onClick={retry} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>}
    </div>
  );
}

function Everyone({ onOpen }: { onOpen: (l: Line) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [d, setD] = useState<List | null>(null);
  const [err, setErr] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const seq = useRef(0);

  const url = (query: string, f: Filter, offset = 0) => '/api/admin/golfers?' + new URLSearchParams({ list: '1', filter: f, ...(query.trim() ? { q: query.trim() } : {}), ...(offset ? { offset: String(offset) } : {}) });
  const load = useCallback(async (query: string, f: Filter) => {
    const mine = ++seq.current;
    setLoading(true); setErr(null);
    const r = await adminFetch<List>(url(query, f), { subject: 'golfers' });
    if (mine !== seq.current) return;
    if (r.ok) setD(r.data); else setErr({ msg: r.message, kind: r.kind });
    setLoading(false);
  }, []);
  // Typing searches after a short pause; a new filter loads straight away.
  useEffect(() => { const t = setTimeout(() => load(q, filter), q ? 300 : 0); return () => clearTimeout(t); }, [q, filter, load]);

  async function loadMore() {
    if (!d || d.nextOffset === null) return;
    const mine = seq.current;
    setMore({ busy: true, error: '' });
    const r = await adminFetch<List>(url(q, filter, d.nextOffset), { subject: 'more golfers' });
    if (mine !== seq.current) { setMore({ busy: false, error: '' }); return; } // the search or filter changed meanwhile
    if (r.ok) { setD(cur => (cur ? { ...cur, golfers: [...cur.golfers, ...r.data.golfers], nextOffset: r.data.nextOffset } : r.data)); setMore({ busy: false, error: '' }); }
    else setMore({ busy: false, error: r.message });
  }

  const shown = d?.golfers ?? [];
  return (
    <>
      {err && <LoadError msg={err.msg} kind={err.kind} retry={() => load(q, filter)} busy={loading} />}
      <section className={`${g.glass} ${s.card}`} aria-labelledby="gf-t">
        <div className={`${s.ch} ${gs.head}`}>
          <div>
            <h3 id="gf-t">Every golfer who has used GreenReserve{d && <span className={gs.cnt}>{d.total.toLocaleString('en-US')}</span>}</h3>
            <p>Sorted by last played. Open someone to see where they’ve played, every booking, payment and receipt. Their course handles refunds and cancellations.</p>
          </div>
          <div className={gs.tools}>
            <label className={gs.sr}><SearchIcon /><input value={q} onChange={e => setQ(e.target.value)} aria-label="Search golfers by name, email or phone" type="search" autoComplete="off" /></label>
            <button type="button" className={`${gs.ibtn} ${filter !== 'all' ? gs.fon : ''}`} onClick={() => setFilterOpen(true)} aria-label={filter === 'all' ? 'Filter' : `Filter: ${FILTERS.find(f => f[0] === filter)?.[1]}`} title="Filter">
              <FilterIcon />{filter !== 'all' && <i className={gs.fdot} />}
            </button>
          </div>
        </div>
        <div className={s.cb}>
          {!d && !err && <div className={gs.skel} aria-busy="true" aria-label="Loading golfers" />}
          {d && (
            <>
              <div className={gs.hd} aria-hidden="true"><span /><span>Name</span><span>Home course</span><span>Rounds</span><span>Last played</span><span /></div>
              {shown.length === 0 && <p className={gs.empty}>{q || filter !== 'all' ? 'No golfer matches that.' : 'No golfer has booked yet.'}</p>}
              {shown.map(l => (
                <button key={l.key} type="button" className={gs.row} onClick={() => onOpen(l)}>
                  <i className={dotClass(l.tone)} aria-hidden="true" />
                  <span className={gs.n}>{l.name}{!l.id && <em>Guest</em>}</span>
                  <span className={`${gs.soft} ${gs.hideS}`}>{l.homeCourse ?? '—'}</span>
                  <span className={`${gs.num} ${gs.hideS}`}>{l.rounds}</span>
                  <span className={`${gs.soft} ${gs.hideS}`}>{l.lastPlayed ? formatTeeDate(l.lastPlayed) : 'Not yet'}</span>
                  <Chevron />
                </button>
              ))}
              {d.nextOffset !== null && (
                <div className={gs.more}>
                  <button type="button" className={s.lnk} onClick={loadMore} disabled={more.busy} aria-busy={more.busy}>{more.busy ? 'Loading…' : 'Show 50 more'}</button>
                  {more.error && <span className={g.down} role="alert">{more.error}</span>}
                </div>
              )}
              <p className={gs.priv}>Golfers’ details are shown here only to help them.</p>
            </>
          )}
        </div>
      </section>
      {filterOpen && <FilterDialog value={filter} onClose={() => setFilterOpen(false)} onApply={f => { setFilterOpen(false); if (f !== filter) { setD(null); setFilter(f); } }} />}
    </>
  );
}

function FilterDialog({ value, onClose, onApply }: { value: Filter; onClose: () => void; onApply: (f: Filter) => void }) {
  const [f, setF] = useState(value);
  return (
    <Dialog labelId="gf-filter-t" onClose={onClose}>
      <h4 id="gf-filter-t">Filter</h4>
      <label className={gs.flab}>Show
        <select className={s.fld} value={f} onChange={e => setF(e.target.value as Filter)}>
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <div className={s.line}>
        <button type="button" className={s.lnk} onClick={() => onApply('all')}>Clear</button>
        <span style={{ flex: 1 }} />
        <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => onApply(f)}>Show</button>
      </div>
    </Dialog>
  );
}

function Record({ id, guest, onBack }: { id: string; guest: string; onBack: () => void }) {
  const [p, setP] = useState<Golfer | null>(null);
  const [err, setErr] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const r = await adminFetch<{ golfer: Golfer }>(id ? `/api/admin/golfers?id=${encodeURIComponent(id)}` : `/api/admin/golfers?guest=${encodeURIComponent(guest)}`, { subject: 'this golfer' });
    if (r.ok) setP(r.data.golfer); else setErr({ msg: r.message, kind: r.kind });
    setLoading(false);
  }, [id, guest]);
  useEffect(() => { load(); }, [load]);

  const back = <button type="button" className={`${s.lnk} ${gs.back}`} onClick={onBack}>‹ Golfers</button>;
  if (err) return <>{back}<LoadError msg={err.msg} kind={err.kind} retry={load} busy={loading} /></>;
  if (!p) return <>{back}<div className={`${g.glass} ${gs.skel}`} aria-busy="true" aria-label="Loading the golfer" /></>;

  const t = p.trust;
  const name = `${p.firstName} ${p.lastName}`.trim() || p.email;
  // Where they've played: completed rounds by course, most first.
  const per = new Map<string, { n: number; last: string }>();
  for (const b of p.bookings) if (b.status === 'completed') { const c = per.get(b.courseName) ?? { n: 0, last: '' }; c.n++; if (b.teeDate > c.last) c.last = b.teeDate; per.set(b.courseName, c); }
  const played = [...per.entries()].sort((a, z) => z[1].n - a[1].n || z[1].last.localeCompare(a[1].last));
  const home = played[0]?.[0] ?? p.bookings[0]?.courseName ?? null;
  const tone: Tone = t.failedCharges ? 'bad' : t.noShows || t.lateCancels ? 'warn' : p.isGuest ? 'neutral' : 'ok';
  // The newest problem, in one sentence (bookings come newest tee time first).
  const failed = p.bookings.find(b => b.checkInFailReason && !b.checkedInAt);
  const noShow = p.bookings.find(b => b.noShow);
  const problem = failed ? `Card declined at check-in on ${formatTeeDate(failed.teeDate)} at ${failed.courseName}.${t.failedCharges > 1 ? ` ${t.failedCharges} failed charges in all.` : ''}`
    : noShow ? `${t.noShows > 1 ? `${t.noShows} no-shows, the last` : 'One no-show'} on ${formatTeeDate(noShow.teeDate)} at ${noShow.courseName}.` : null;
  const terms = p.bookings.filter(b => b.termsAcceptedAt && b.termsVersion).sort((a, z) => (z.termsAcceptedAt ?? '').localeCompare(a.termsAcceptedAt ?? ''))[0];
  const stat = (k: string, v: string | number, cls = '') => <div className={gs.t}><span>{k}</span><b className={cls}>{v}</b></div>;
  const kv = (k: string, v: string) => <div className={gs.kv}><span>{k}</span><span>{v}</span></div>;

  return (
    <>
      {back}
      {problem && <div className={`${g.glass} ${gs.prob}`}><i className={dotClass(failed ? 'bad' : 'warn')} aria-hidden="true" /><span>{problem}</span></div>}
      <section className={`${g.glass} ${s.card}`} aria-labelledby="gr-name">
        <div className={s.ch}>
          <div><h3 id="gr-name">{name}</h3><p>{p.isGuest ? 'Guest, no account' : p.createdAt ? `Account since ${monthYear(p.createdAt)}` : 'Account'}{home ? ` · home course ${home}` : ''}</p></div>
          <i className={dotClass(tone)} aria-hidden="true" />
        </div>
        <div className={s.cb}>
          <div className={gs.ts}>
            {stat('Rounds played', t.rounds)}
            {stat('Upcoming', t.upcoming)}
            {stat('No-shows', t.noShows, t.noShows ? gs.tw : '')}
            {stat('Late cancels', t.lateCancels, t.lateCancels ? gs.tw : '')}
            {stat('Failed charges', t.failedCharges, t.failedCharges ? gs.tb : '')}
            {stat('Paid in total', formatMoney(t.lifetimeCollected))}
          </div>
        </div>
      </section>

      <div className={gs.two}>
        <section className={`${g.glass} ${s.card}`} aria-labelledby="gr-contact">
          <div className={s.ch}><div><h3 id="gr-contact">Contact and account</h3></div></div>
          <div className={s.cb}>
            {kv('Email', p.email)}
            {kv('Phone', p.phone || 'Not given')}
            {terms && kv('Terms accepted', `Version ${terms.termsVersion} · ${dayE(terms.termsAcceptedAt ?? '')}`)}
          </div>
        </section>
        <section className={`${g.glass} ${s.card}`} aria-labelledby="gr-played">
          <div className={s.ch}><div><h3 id="gr-played">Where they’ve played</h3></div></div>
          <div className={s.cb}>
            {played.length === 0 ? <p className={gs.empty}>No rounds played yet.</p>
              : played.map(([course, c]) => <div key={course} className={`${gs.kv} ${gs.played}`}><span>{course}</span><span>{plural(c.n, 'round')} · last {formatTeeDate(c.last)}</span></div>)}
          </div>
        </section>
      </div>

      <section className={`${g.glass} ${s.card}`} aria-labelledby="gr-bk">
        <div className={s.ch}><div><h3 id="gr-bk">Bookings, payments and receipts</h3><p>Newest first. Open one for its history, refunds and receipt.</p></div></div>
        <div className={s.cb}>
          {p.bookings.length === 0 && <p className={gs.empty}>No bookings.</p>}
          {p.bookings.map((b, i) => <BookingRow key={b.id} b={b} open={i === 0} />)}
          <p className={gs.note}>Refunds and cancellations are done by the course. Point the golfer to them, or message the course from Course support.</p>
        </div>
      </section>
    </>
  );
}

function BookingRow({ b, open }: { b: Booking; open: boolean }) {
  const [busy, setBusy] = useState<'' | 'confirmation' | 'receipt'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const st = statusOf(b);
  const canConfirm = b.status === 'confirmed';
  const canReceipt = b.status !== 'cancelled' && (b.paymentStatus === 'paid' || b.paymentStatus === 'refunded');

  async function resend(what: 'confirmation' | 'receipt') {
    setBusy(what); setNote(null);
    const r = await adminFetch<{ ok: boolean; sentTo: string }>('/api/admin/golfers', {
      method: 'POST', body: JSON.stringify({ bookingId: b.id, action: what === 'receipt' ? 'resend_receipt' : 'resend_confirmation' }), subject: 'this email', action: 'send',
    });
    setBusy('');
    setNote(r.ok ? { ok: true, text: `${what === 'receipt' ? 'Receipt' : 'Confirmation'} sent again to ${r.data.sentTo}.` } : { ok: false, text: r.message });
  }

  return (
    <details className={gs.bk} open={open}>
      <summary>
        <i className={dotClass(st.tone)} aria-hidden="true" />
        <span className={gs.n}>{formatTeeDate(b.teeDate)} · {formatTeeTime(b.teeTime)}</span>
        <span className={`${gs.soft} ${gs.hideS}`}>{b.courseName}</span>
        <span className={`${gs.soft} ${gs.hideS}`}>{st.label}</span>
        <Chevron />
      </summary>
      <div className={gs.bd}>
        <div>{b.courseName} · {plural(b.players, 'player')} · {b.holes} holes · {formatMoney(b.totalAmount)}{b.refundedTotal > 0 ? ` (${formatMoney(b.refundedTotal)} refunded)` : ''} · ref {b.number}</div>
        {b.checkInFailReason && <div className={gs.fail}>{b.checkInFailReason}</div>}
        <ol className={gs.tl}>{history(b).map(([at, what], i) => <li key={i}><span>{stamp(at)}</span><span>{what}</span></li>)}</ol>
        <div className={gs.acts}>
          {canConfirm && <button type="button" className={s.lnk} onClick={() => resend('confirmation')} disabled={!!busy}>{busy === 'confirmation' ? 'Sending…' : 'Resend confirmation'}</button>}
          {canReceipt && <button type="button" className={s.lnk} onClick={() => resend('receipt')} disabled={!!busy}>{busy === 'receipt' ? 'Sending…' : 'Resend receipt'}</button>}
          <a className={s.lnk} href={`/receipt/${b.id}`} target="_blank" rel="noreferrer">Receipt page</a>
        </div>
        {note && <Msg ok={note.ok}>{note.text}</Msg>}
      </div>
    </details>
  );
}

export default function GolfersPage() {
  return (
    <Suspense fallback={null}>
      <GolfersInner />
    </Suspense>
  );
}
