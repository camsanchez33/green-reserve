'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../admin-glass.module.css';
import s from './courses.module.css';
import { TERMS, SESSION_ENDED, loadFailed, STRIPE_STATE, NO_CONTACT, NO_NOTES } from './terms';

// ADMIN-REDO page 2 — Golf Courses (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md).
// The directory with one Filter menu (the top-bar search finds courses); a course opens its profile beside the list.
// Every number is counted by /api/admin/courses/directory; a field the login can't see
// comes back null and is left out. "Open full profile" is the existing course page.

type Status = 'live' | 'risk' | 'onboarding' | 'offline' | 'archived';
type Row = { id: string; name: string; slug: string; town: string; isTest: boolean; status: Status; bookings: number; bookingsPrior: number; feesCents: number | null; onlinePct: number | null; lastBookingAt: string | null };
type Directory = { at: string; riskDays: number; archivedCount: number | null; seesMoney: boolean; support: boolean; rows: Row[]; view: 'all' | 'archived' };
type Profile = {
  id: string; name: string; slug: string; town: string; isTest: boolean; logoUrl: string | null; status: Status;
  bookings: { cur: number; prior: number }; lastBookingAt: string | null; joinedAt: string; liveSince: string | null;
  setup: { done: number; total: number; steps: { label: string; done: boolean }[] };
  agreement: { version: string; signedAt: string; signer: string | null; signerEmail: string | null } | null;
  agreementDue: { by: string; overdue: boolean } | null;
  contact: { operatorName: string | null; operatorEmail: string | null; operatorPhone: string | null; emailVerified: boolean; lastLoginAt: string | null; coursePhone: string | null; website: string | null; address: string | null } | null;
  notes: string | null;
  money: { stripeConnected: boolean; stripeActive: boolean; feesCents: number; feesPriorCents: number; missedCents: number; missedRounds: number; failedCount: number; failed: { id: string; golferName: string; cents: number; teeDate: string; reason: string }[] } | null;
};
type Filter = 'all' | 'live' | 'risk' | 'onboarding' | 'offline';

const TZ = 'America/New_York';
const LABEL: Record<Status, string> = { live: 'Live', risk: 'At risk', onboarding: 'Onboarding', offline: 'Offline', archived: 'Archived' };
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'all', label: 'All' }, { v: 'live', label: 'Live' }, { v: 'risk', label: 'At risk' }, { v: 'onboarding', label: 'Onboarding' }, { v: 'offline', label: 'Offline' },
];
const ORDER: Record<Status, number> = { risk: 0, live: 1, onboarding: 2, offline: 3, archived: 4 };

const money = (cents: number) => (cents < 0 ? '−' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: Math.abs(cents) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
function when(iso: string | null, empty = 'None yet') {
  if (!iso) return empty;
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-US', { timeZone: TZ });
  if (day(d) === day(new Date())) return 'Today, ' + d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  if (day(d) === day(new Date(Date.now() - 86_400_000))) return 'Yesterday';
  return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
}
function versus(cur: number, prior: number) {
  const d = cur - prior;
  if (d === 0) return <span className={s.vs} title={TERMS.vsPrior}>same</span>;
  return <span className={s.vs} title={TERMS.vsPrior}><b className={d > 0 ? g.up : g.down}>{d > 0 ? '+' : '−'}{Math.abs(d)}</b></span>;
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

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

function Status({ st }: { st: Status }) {
  return <span className={`${s.st} ${s[st] ?? ''}`}><i />{LABEL[st]}</span>;
}

function ProfilePanel({ id, riskDays, support }: { id: string; riskDays: number; support: boolean }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await getJson<Profile>(`/api/admin/courses/directory?id=${encodeURIComponent(id)}`, 'This course');
    if (r.ok) setP(r.data); else setError(r.msg);
    setLoading(false);
  }, [id]);
  useEffect(() => { setP(null); load(); }, [load]);

  if (error) return (
    <section className={`${g.glass} ${s.prof}`} role="alert" aria-label="Course profile">
      <p className={`${s.muted} ${g.down}`}>{error}</p>
      <div className={s.plinks}>
        {error === SESSION_ENDED ? <Link className={s.plink} href="/admin/login">Sign in</Link>
          : <button type="button" className={s.plink} onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
      </div>
    </section>
  );
  if (!p) return <section className={`${g.glass} ${s.prof} ${s.skel}`} aria-busy="true" aria-label="Loading the course" />;

  const failedCents = p.money ? p.money.failed.reduce((a, f) => a + f.cents, 0) : 0;
  const live = p.status === 'live' || p.status === 'risk';
  const unfinished = p.setup.steps.filter(x => !x.done);
  // ADMIN FORMAT 8: one column, the most useful part first; Setup only while unfinished, first for an onboarding course.
  const setup = unfinished.length > 0 && (
    <div className={s.psec}>
      <h3>Setup · {p.setup.done} of {p.setup.total} done</h3>
      <div className={s.steps}>{unfinished.map(x => <div key={x.label} className={s.step}><i /><span>{x.label}</span></div>)}</div>
    </div>
  );

  return (
    <section id="course-profile" className={`${g.glass} ${s.prof}`} aria-label={`${p.name} profile`}>
      <div className={s.ph}>
        <span className={s.plogo}>{p.logoUrl ? <img src={p.logoUrl} alt="" loading="lazy" /> : initials(p.name)}</span>
        <div className={s.pname}>
          <h2>{p.name}</h2>
          <p>{p.town && <>{p.town} · </>}<Status st={p.status} />{p.isTest && <span className={s.test}>Test course</span>}</p>
        </div>
        <div className={s.plinks}>
          {support && <Link className={s.plink} href={`/admin/courses/${p.id}`}>Full profile <span aria-hidden="true">→</span></Link>}
          {live && <a className={s.plink} href={`/courses/${p.slug}`} target="_blank" rel="noopener noreferrer">Booking page <span aria-hidden="true">↗</span></a>}
        </div>
      </div>

      {p.status === 'onboarding' && setup}

      <div className={s.rows}>
        <div><span>Bookings this month</span><b>{p.bookings.cur}</b><em title={TERMS.vsPrior}>prior {p.bookings.prior}</em></div>
        {p.money && <div><span title={TERMS.fees}>Our fees this month</span><b>{money(p.money.feesCents)}</b><em title={TERMS.vsPrior}>prior {money(p.money.feesPriorCents)}</em></div>}
        {p.money && <div><span title={TERMS.missed}>Fees missed (paid cash)</span><b>{money(p.money.missedCents)}</b><em>{p.money.missedRounds} rounds</em></div>}
        {p.money && <div><span>Failed card charges</span><b className={p.money.failedCount ? g.down : ''}>{p.money.failedCount}</b><em>{money(failedCents)}{p.money.failedCount > p.money.failed.length && ` (latest ${p.money.failed.length})`}</em></div>}
      </div>
      {p.money && p.money.failed.length > 0 && (
        <div className={s.fails}>
          {p.money.failed.map(f => <div key={f.id}><span>{f.golferName} · {date(f.teeDate + 'T12:00:00Z')}<span className={s.vs}>{f.reason}</span></span><span>{money(f.cents)}</span></div>)}
        </div>
      )}

      {p.status !== 'onboarding' && setup}

      <div className={s.psec}>
        <h3>Contact</h3>
        {p.contact ? (
          <dl className={s.kv}>
            <dt>Operator</dt><dd>{p.contact.operatorName ?? '—'}</dd>
            <dt>Email</dt><dd>{p.contact.operatorEmail ? <a href={`mailto:${p.contact.operatorEmail}`}>{p.contact.operatorEmail}</a> : '—'}{p.contact.operatorEmail && !p.contact.emailVerified && ' (not verified)'}</dd>
            <dt>Phone</dt><dd>{p.contact.operatorPhone ?? p.contact.coursePhone ?? '—'}</dd>
            <dt>Address</dt><dd>{p.contact.address ?? '—'}</dd>
            <dt>Website</dt><dd>{p.contact.website ? <a href={p.contact.website.startsWith('http') ? p.contact.website : `https://${p.contact.website}`} target="_blank" rel="noopener noreferrer">{p.contact.website}</a> : '—'}</dd>
            <dt>Signed in</dt><dd>{when(p.contact.lastLoginAt, '—')}</dd>
          </dl>
        ) : <p className={s.muted}>{NO_CONTACT}</p>}
      </div>

      <div className={s.psec}>
        <h3>Agreement &amp; payments</h3>
        <dl className={s.kv}>
          <dt>Agreement</dt>
          <dd>{p.agreement ? <>{p.agreement.version} · signed {date(p.agreement.signedAt)}{p.agreement.signer && <> by {p.agreement.signer}</>}</> : 'Not signed'}
            {p.agreementDue && <span className={`${s.vs} ${p.agreementDue.overdue ? g.down : g.wa}`}>{p.agreementDue.overdue ? 'New version overdue' : `New version by ${date(p.agreementDue.by)}`}</span>}</dd>
          {p.money && <><dt>Stripe</dt><dd>{STRIPE_STATE(p.money.stripeActive, p.money.stripeConnected)}</dd></>}
          <dt>Joined</dt><dd>{date(p.joinedAt)}{p.liveSince && <span className={s.vs}>live since {date(p.liveSince)}</span>}</dd>
          <dt>Last booking</dt><dd title={p.status === 'risk' ? TERMS.risk(riskDays) : undefined}>{when(p.lastBookingAt)}</dd>
        </dl>
      </div>

      {p.notes !== null && (
        <div className={s.psec}>
          <h3>Notes</h3>
          {p.notes.trim() ? <p className={s.notes}>{p.notes}</p> : <p className={s.muted}>{NO_NOTES}</p>}
        </div>
      )}
    </section>
  );
}

function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const archived = params.get('view') === 'archived';
  const [d, setD] = useState<Directory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<string | null>(null);

  // Old links (/admin/courses?courseId=…&tab=…) still open the course page.
  useEffect(() => {
    const courseId = params.get('courseId');
    const tab = params.get('tab');
    if (courseId) router.replace('/admin/courses/' + courseId + (tab ? '?tab=' + encodeURIComponent(tab) : ''));
  }, [params, router]);

  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    const r = await getJson<Omit<Directory, 'view'>>('/api/admin/courses/directory' + (archived ? '?archived=1' : ''), 'The course list');
    if (mine !== seq.current) return; // a later load (the other view) won
    if (r.ok) setD({ ...r.data, view: archived ? 'archived' : 'all' }); else setError(r.msg);
    setLoading(false);
  }, [archived]);
  // Switching views: never show the other view's list under this title.
  useEffect(() => { setD(null); setPick(null); }, [archived]);
  useEffect(() => { load(); }, [load]);

  // The filter menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, live: 0, risk: 0, onboarding: 0, offline: 0 };
    for (const r of d?.rows ?? []) { c.all++; if (r.status in c) c[r.status as Filter]++; if (r.status === 'risk') c.live++; }
    return c;
  }, [d]);
  const rows = useMemo(() => {
    return (d?.rows ?? [])
      .filter(r => archived || filter === 'all' || r.status === filter || (filter === 'live' && r.status === 'risk'))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.bookings - a.bookings || a.name.localeCompare(b.name));
  }, [d, filter, archived]);
  // A filter that leaves the open course out of the list opens the first course it shows (the mockup's rule).
  const pickFilter = (f: Filter) => {
    setFilter(f); setMenuOpen(false);
    const inView = (st: Status) => f === 'all' || st === f || (f === 'live' && st === 'risk');
    const open = (d?.rows ?? []).find(r => r.id === pick);
    if (!open || !inView(open.status)) {
      const first = (d?.rows ?? []).filter(r => inView(r.status)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.bookings - a.bookings || a.name.localeCompare(b.name))[0];
      setPick(first?.id ?? null);
    }
  };
  // The first course opens once, when the list arrives; after that the profile follows clicks only.
  const shown = d && d.view === (archived ? 'archived' : 'all') ? d : null;
  useEffect(() => { if (shown && pick === null && rows[0]) setPick(rows[0].id); }, [shown, pick, rows]);
  const picked = pick;
  // One column (phone, narrow window): the profile sits under the list, so bring it into view.
  const open = (id: string) => {
    setPick(id);
    if (window.matchMedia('(max-width: 1150px)').matches) requestAnimationFrame(() => document.getElementById('course-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <>
      <AdminSidebar active="courses" />
      <main className={g.main}>
        <div className={g.head}>
          <h1>{archived ? 'Archived courses' : 'Golf courses'}</h1>
        </div>

        {error && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={g.down}>{error}</span>
            {error === SESSION_ENDED ? <Link href="/admin/login">Sign in</Link> : <button type="button" onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        {!archived && (
          <div className={s.fwrap} ref={menuRef}>
            <button type="button" className={`${g.glass} ${s.fbtn}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              {filter === 'all' ? 'Filter' : `Filter: ${FILTERS.find(f => f.v === filter)!.label}`}
            </button>
            {menuOpen && (
              <div className={s.fmenu} role="group" aria-label="Show">
                {FILTERS.map(f => (
                  <button key={f.v} type="button" aria-pressed={filter === f.v} onClick={() => pickFilter(f.v)}
                    title={f.v === 'risk' && d ? TERMS.risk(d.riskDays) : undefined}>
                    <span>{f.label}</span><b>{d ? counts[f.v] : '·'}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!shown && !error && <div className={`${g.glass} ${s.skel}`} aria-busy="true" aria-label="Loading courses" />}

        {shown && (
          <div className={s.split}>
            <section className={`${g.glass} ${s.dir}`} aria-label="Course directory">
              {rows.length === 0 ? (
                <p className={s.empty}>{shown.rows.length === 0 ? 'No courses.' : 'No match.'}</p>
              ) : (
                <table>
                  <thead><tr>
                    <th>Course</th><th>Status</th><th className={s.n}>Bookings this month</th>
                    {shown.seesMoney && <th className={s.n} title={TERMS.fees}>Our fees this month</th>}
                    <th className={`${s.n} ${s.hideS}`} title={TERMS.online}>Booked online</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className={s.row} tabIndex={0} aria-selected={r.id === picked}
                        onClick={() => open(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.id); } }}>
                        <td><span className={s.cname}>{r.name}</span>{r.isTest && <span className={s.test} title={TERMS.test}>Test</span>}<span className={s.csub}>{r.town || '—'}</span></td>
                        <td><Status st={r.status} /></td>
                        <td className={s.n}>{r.bookings}{versus(r.bookings, r.bookingsPrior)}</td>
                        {shown.seesMoney && <td className={s.n}>{money(r.feesCents ?? 0)}</td>}
                        <td className={`${s.n} ${s.hideS}`}>{r.onlinePct === null ? '—' : `${r.onlinePct}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            {picked && <ProfilePanel key={picked} id={picked} riskDays={shown.riskDays} support={shown.support} />}
          </div>
        )}

        <div className={s.foot}>
          {d?.support && <Link href="/admin/groups">Course groups</Link>}
          {!archived && <a href="/api/admin/courses?format=csv">Download as CSV</a>}
          {archived ? <Link href="/admin/courses">Back to every course</Link>
            : d?.archivedCount ? <Link href="/admin/courses?view=archived">Archived courses ({d.archivedCount})</Link> : null}
        </div>
      </main>
    </>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={null}>
      <CoursesContent />
    </Suspense>
  );
}
