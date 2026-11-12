'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../admin-glass.module.css';
import s from './courses.module.css';
import { TERMS, SESSION_ENDED, loadFailed, STRIPE_STATE, NO_CONTACT, NO_NOTES } from './terms';

// ADMIN-REDO page 2 — Golf Courses (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md).
// The directory with filters and a find box; a course opens its profile beside the list.
// Every number is counted by /api/admin/courses/directory; a field the login can't see
// comes back null and is left out. "Open full profile" is the existing course page.

type Status = 'live' | 'risk' | 'onboarding' | 'offline' | 'archived';
type Row = { id: string; name: string; slug: string; town: string; isTest: boolean; status: Status; bookings: number; bookingsPrior: number; feesCents: number | null; lastBookingAt: string | null };
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
type Tab = 'overview' | 'contact' | 'setup' | 'payments' | 'notes';

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
  const [tab, setTab] = useState<Tab>('overview');

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
      <div className={s.pbtns}>
        {error === SESSION_ENDED ? <Link className={s.btn} href="/admin/login">Sign in</Link>
          : <button type="button" className={s.btn} onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
      </div>
    </section>
  );
  if (!p) return <section className={`${g.glass} ${s.prof} ${s.skel}`} aria-busy="true" aria-label="Loading the course" />;

  const tabs: { v: Tab; label: string }[] = [
    { v: 'overview', label: 'Overview' }, { v: 'contact', label: 'Contact & agreement' }, { v: 'setup', label: 'Setup' },
    ...(p.money ? [{ v: 'payments' as Tab, label: 'Payments' }] : []),
    ...(p.notes !== null ? [{ v: 'notes' as Tab, label: 'Notes' }] : []),
  ];
  const t = tabs.some(x => x.v === tab) ? tab : 'overview';
  const failedCents = p.money ? p.money.failed.reduce((a, f) => a + f.cents, 0) : 0;

  return (
    <section id="course-profile" className={`${g.glass} ${s.prof}`} aria-label={`${p.name} profile`}>
      <div className={s.ph}>
        <span className={s.plogo}>{p.logoUrl ? <img src={p.logoUrl} alt="" loading="lazy" /> : initials(p.name)}</span>
        <div>
          <h2>{p.name}</h2>
          <p>{p.town && <>{p.town} · </>}<Status st={p.status} />{p.isTest && <span className={s.test}>Test course</span>}</p>
        </div>
      </div>
      <div className={s.ptabs} role="group" aria-label="Profile section">
        {tabs.map(x => <button key={x.v} type="button" aria-pressed={t === x.v} onClick={() => setTab(x.v)}>{x.label}</button>)}
      </div>

      {t === 'overview' && (
        <div className={s.pnums}>
          <div><small>Bookings this month</small><b>{p.bookings.cur}</b><em title={TERMS.vsPrior}>prior {p.bookings.prior}</em></div>
          {p.money && <div><small title={TERMS.fees}>Our fees this month</small><b>{money(p.money.feesCents)}</b><em title={TERMS.vsPrior}>prior {money(p.money.feesPriorCents)}</em></div>}
          {p.money && <div><small title={TERMS.missed}>Fees missed</small><b>{money(p.money.missedCents)}</b><em>{p.money.missedRounds} rounds</em></div>}
          {p.money && <div><small>Failed charges</small><b className={p.money.failedCount ? g.down : ''}>{p.money.failedCount}</b><em>{money(failedCents)}{p.money.failedCount > p.money.failed.length && ` (latest ${p.money.failed.length})`}</em></div>}
          <div><small>Last booking</small><b>{when(p.lastBookingAt)}</b><em title={p.status === 'risk' ? TERMS.risk(riskDays) : undefined}>{p.liveSince ? `live ${date(p.liveSince)}` : '—'}</em></div>
          <div><small>Joined</small><b>{date(p.joinedAt)}</b><em>setup {p.setup.done}/{p.setup.total}</em></div>
        </div>
      )}

      {t === 'contact' && (
        <dl className={s.kv}>
          {p.contact && <>
            <dt>Operator</dt><dd>{p.contact.operatorName ?? '—'}</dd>
            <dt>Email</dt><dd>{p.contact.operatorEmail ? <a href={`mailto:${p.contact.operatorEmail}`}>{p.contact.operatorEmail}</a> : '—'}{p.contact.operatorEmail && !p.contact.emailVerified && ' (not verified)'}</dd>
            <dt>Phone</dt><dd>{p.contact.operatorPhone ?? p.contact.coursePhone ?? '—'}</dd>
            <dt>Address</dt><dd>{p.contact.address ?? '—'}</dd>
            <dt>Website</dt><dd>{p.contact.website ? <a href={p.contact.website.startsWith('http') ? p.contact.website : `https://${p.contact.website}`} target="_blank" rel="noopener noreferrer">{p.contact.website}</a> : '—'}</dd>
            <dt>Signed in</dt><dd>{when(p.contact.lastLoginAt, '—')}</dd>
          </>}
          <dt>Agreement</dt>
          <dd>{p.agreement ? <>{p.agreement.version} · signed {date(p.agreement.signedAt)}{p.agreement.signer && <> by {p.agreement.signer}</>}</> : 'Not signed'}
            {p.agreementDue && <span className={`${s.vs} ${p.agreementDue.overdue ? g.down : g.wa}`}>{p.agreementDue.overdue ? 'New version overdue' : `New version by ${date(p.agreementDue.by)}`}</span>}</dd>
          {!p.contact && <><dt>Contact</dt><dd>{NO_CONTACT}</dd></>}
        </dl>
      )}

      {t === 'setup' && (
        <div className={s.steps}>
          {p.setup.steps.map(x => <div key={x.label} className={`${s.step} ${x.done ? s.done : ''}`}><i /><span>{x.label}</span></div>)}
        </div>
      )}

      {t === 'payments' && p.money && (
        <>
          <dl className={s.kv}>
            <dt>Stripe</dt><dd>{STRIPE_STATE(p.money.stripeActive, p.money.stripeConnected)}</dd>
            <dt>Our fees this month</dt><dd>{money(p.money.feesCents)} <span className={s.vs} title={TERMS.vsPrior}>prior {money(p.money.feesPriorCents)}</span></dd>
            <dt>Fees missed</dt><dd title={TERMS.missed}>{money(p.money.missedCents)} <span className={s.vs}>{p.money.missedRounds} rounds</span></dd>
            <dt>Failed charges</dt><dd>{p.money.failedCount} · {money(failedCents)}{p.money.failedCount > p.money.failed.length && ` (latest ${p.money.failed.length})`}</dd>
          </dl>
          {p.money.failed.length > 0 && (
            <div className={s.fails}>
              {p.money.failed.map(f => <div key={f.id}><span>{f.golferName} · {date(f.teeDate + 'T12:00:00Z')}<span className={s.vs}>{f.reason}</span></span><span>{money(f.cents)}</span></div>)}
            </div>
          )}
        </>
      )}

      {t === 'notes' && p.notes !== null && (p.notes.trim() ? <p className={s.notes}>{p.notes}</p> : <p className={s.muted}>{NO_NOTES}</p>)}

      <div className={s.pbtns}>
        {support && <Link className={`${s.btn} ${s.pri}`} href={`/admin/courses/${p.id}`}>Open full profile</Link>}
        {(p.status === 'live' || p.status === 'risk') && <a className={s.btn} href={`/courses/${p.slug}`} target="_blank" rel="noopener noreferrer">Open their booking page</a>}
      </div>
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
  const [q, setQ] = useState('');
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

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, live: 0, risk: 0, onboarding: 0, offline: 0 };
    for (const r of d?.rows ?? []) { c.all++; if (r.status in c) c[r.status as Filter]++; if (r.status === 'risk') c.live++; }
    return c;
  }, [d]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (d?.rows ?? [])
      .filter(r => archived || filter === 'all' || r.status === filter || (filter === 'live' && r.status === 'risk'))
      .filter(r => !term || r.name.toLowerCase().includes(term) || r.town.toLowerCase().includes(term) || r.slug.includes(term))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.bookings - a.bookings || a.name.localeCompare(b.name));
  }, [d, filter, q, archived]);
  // The first course opens once, when the list arrives; after that the profile follows clicks only
  // (never the find box's top row, which would load a profile per keystroke).
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
          <p>{d && <>updated {when(d.at)}</>}</p>
        </div>

        {error && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={g.down}>{error}</span>
            {error.startsWith('Your session') ? <Link href="/admin/login">Sign in</Link> : <button type="button" onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        <div className={s.filters}>
          {!archived && (
            <div role="group" aria-label="Show" style={{ display: 'contents' }}>
              {FILTERS.map(f => (
                <button key={f.v} type="button" className={s.chip} aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}
                  title={f.v === 'risk' && d ? TERMS.risk(d.riskDays) : undefined}>
                  {f.label}<b>{d ? counts[f.v] : '·'}</b>
                </button>
              ))}
            </div>
          )}
          <label className={`${g.glass} ${s.find}`}>
            <span className="sr-only">Find a course</span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a course" />
          </label>
        </div>

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
                    {shown.seesMoney && <th className={`${s.n} ${s.hideS}`} title={TERMS.fees}>Our fees this month</th>}
                    <th className={`${s.n} ${s.hideS}`}>Last booking</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className={s.row} tabIndex={0} aria-selected={r.id === picked}
                        onClick={() => open(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.id); } }}>
                        <td><span className={s.cname}>{r.name}</span>{r.isTest && <span className={s.test} title={TERMS.test}>Test</span>}<span className={s.csub}>{r.town || '—'}</span></td>
                        <td><Status st={r.status} /></td>
                        <td className={s.n}>{r.bookings}{versus(r.bookings, r.bookingsPrior)}</td>
                        {shown.seesMoney && <td className={`${s.n} ${s.hideS}`}>{money(r.feesCents ?? 0)}</td>}
                        <td className={`${s.n} ${s.hideS}`}>{when(r.lastBookingAt)}</td>
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
