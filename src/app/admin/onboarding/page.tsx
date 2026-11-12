'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../admin-glass.module.css';
import s from '../courses/courses.module.css';
import o from './onboarding.module.css';
import { SESSION_ENDED, loadFailed, NO_CONTACT } from '../courses/terms';
import { overdueTitle, ACTION_FAILED, NO_CAL_LINK, FOOT_PIPELINE, FOOT_CSV } from './terms';

// ADMIN-REDO page 3 — Onboarding (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Page 3").
// No cards on top: one list of every course in onboarding, sorted by what it needs (overdue, then call or email,
// then our setup; the longest wait first), one Filter menu, and the picked course's profile beside it.
// One home per course: a course is here until it goes live, then on Golf courses.
// Everything comes from /api/admin/onboarding; a field the login can't see comes back null and is left out.

type Need = 'call' | 'setup';
type Steps = { steps: { label: string; done: boolean }[]; done: number; total: number; current: number | null; todo: string | null };
type Row = {
  key: string; inquiryId: string | null; courseId: string | null; name: string; town: string; isTest: boolean;
  status: string | null; stage: string; need: Need; daysWaiting: number; snoozed: boolean; overdue: boolean; next: string; steps: Steps;
};
type List = { at: string; overdueDays: number; support: boolean; rows: Row[] };
type Profile = Row & {
  contact: { name: string | null; title: string | null; email: string | null; phone: string | null } | null;
  source: string | null;
  agreement: { version: string; signedAt: string } | null;
  history: { at: string; text: string; detail: string | null }[];
  notes: string | null; canNote: boolean; canBookCall: boolean;
};
type Filter = 'all' | 'overdue' | 'call' | 'setup';

const TZ = 'America/New_York';
const FILTERS: { v: Filter; label: string; match: (r: Row) => boolean }[] = [
  { v: 'all', label: 'All', match: () => true },
  { v: 'overdue', label: 'Overdue', match: r => r.overdue },
  { v: 'call', label: 'Call or email', match: r => r.need === 'call' },
  { v: 'setup', label: 'Our setup', match: r => r.need === 'setup' },
];
const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
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

/** Inquiry actions on the existing pipeline route (manager+). */
async function inquiryAction(id: string, action: string, extra: Record<string, unknown> = {}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; msg: string }> {
  try {
    const r = await fetch('/api/admin/inquiries', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) });
    const body = await r.json().catch(() => null);
    if (r.status === 401) return { ok: false, msg: SESSION_ENDED };
    if (!r.ok || !body) return { ok: false, msg: body?.error ? `${body.error} — try again.` : ACTION_FAILED(r.status) };
    return { ok: true, data: body };
  } catch {
    return { ok: false, msg: ACTION_FAILED() };
  }
}

function Notes({ p, onSaved }: { p: Profile; onSaved: (notes: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    const note = text.trim();
    if (!note || busy || !p.inquiryId) return;
    setBusy(true); setMsg(null);
    const r = await inquiryAction(p.inquiryId, 'add_note', { note });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.msg }); return; }
    setText(''); setMsg({ ok: true, text: 'Note saved.' });
    onSaved(typeof r.data.adminNotes === 'string' ? r.data.adminNotes : note);
  };
  return (
    <div className={s.psec}>
      <h3>Notes</h3>
      {p.canNote && (
        <div className={o.addnote}>
          <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            placeholder="Add a note" aria-label="Add a note" maxLength={2000} disabled={busy} />
          <button type="button" onClick={save} disabled={busy || !text.trim()} aria-label={busy ? 'Saving the note' : 'Save the note'} aria-busy={busy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
      {busy && <p className={`${o.noteMsg} ${s.muted}`} role="status">Saving…</p>}
      {msg && <p className={`${o.noteMsg} ${msg.ok ? g.up : g.down}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      {p.notes?.trim() ? <p className={s.notes}>{p.notes}</p> : <p className={s.muted}>No notes yet.</p>}
    </div>
  );
}

function ProfilePanel({ rowKey, support }: { rowKey: string; support: boolean }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [calBusy, setCalBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await getJson<Profile>(`/api/admin/onboarding?key=${encodeURIComponent(rowKey)}`, 'This course');
    if (r.ok) setP(r.data); else setError(r.msg);
    setLoading(false);
  }, [rowKey]);
  useEffect(() => { setP(null); load(); }, [load]);

  // The pipeline's own Cal.com link, prefilled with their details; opened in a new tab.
  const bookOnCalcom = async () => {
    if (!p?.inquiryId) return;
    const tab = window.open('', '_blank');
    setCalBusy(true); setCalErr(null);
    const r = await inquiryAction(p.inquiryId, 'calcom_link');
    setCalBusy(false);
    if (!r.ok || typeof r.data.url !== 'string') { tab?.close(); setCalErr(r.ok ? NO_CAL_LINK : r.msg); return; }
    if (tab) tab.location.href = r.data.url; else window.location.href = r.data.url;
  };

  if (error) return (
    <section id="onboarding-profile" className={`${g.glass} ${s.prof}`} role="alert" aria-label="Onboarding profile">
      <p className={`${s.muted} ${g.down}`}>{error}</p>
      <div className={s.plinks}>
        {error === SESSION_ENDED ? <Link className={s.plink} href="/admin/login">Sign in</Link>
          : <button type="button" className={s.plink} onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
      </div>
    </section>
  );
  if (!p) return <section id="onboarding-profile" className={`${g.glass} ${s.prof} ${s.skel}`} aria-busy="true" aria-label="Loading the course" />;

  const st = p.steps;
  return (
    <section id="onboarding-profile" className={`${g.glass} ${s.prof}`} aria-label={`${p.name} onboarding`}>
      <div className={s.ph}>
        <span className={s.plogo}>{initials(p.name)}</span>
        <div className={s.pname}>
          <h2>{p.name}</h2>
          <p>{p.town || '—'}{p.isTest && <span className={s.test}>Test course</span>}</p>
        </div>
        <div className={s.plinks}>
          {p.inquiryId && <Link className={s.plink} href={`/admin/inquiries/${p.inquiryId}`}>Inquiry <span aria-hidden="true">→</span></Link>}
          {support && !p.inquiryId && p.courseId && <Link className={s.plink} href={`/admin/courses/${p.courseId}`}>Course <span aria-hidden="true">→</span></Link>}
          {p.canBookCall && <button type="button" className={s.plink} onClick={bookOnCalcom} disabled={calBusy} aria-busy={calBusy}>{calBusy ? 'Opening…' : <>Book on Cal.com <span aria-hidden="true">↗</span></>}</button>}
        </div>
      </div>
      {calErr && <p className={`${s.muted} ${g.down}`} role="alert">{calErr}</p>}

      <div className={o.where}>
        <small>{st.current === null ? `All ${st.total} steps done` : `Step ${st.current + 1} of ${st.total}`}</small>
        <b>{st.current === null ? 'Ready to go live' : st.steps[st.current].label}</b>
        <span>{p.next}</span>
        {p.overdue && <span className={o.late}>{p.daysWaiting} days waiting</span>}
      </div>

      <div className={s.psec}>
        <h3>Setup · {st.done} of {st.total} done</h3>
        <div className={s.steps}>
          {st.steps.map((x, i) => <div key={x.label} className={`${s.step} ${x.done ? s.done : i === st.current ? o.now : ''}`}><i /><span>{x.label}</span></div>)}
        </div>
      </div>

      <div className={s.psec}>
        <h3>Contact</h3>
        <dl className={s.kv}>
          {p.contact ? <>
            <dt>Main contact</dt><dd>{[p.contact.name, p.contact.title].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Email</dt><dd>{p.contact.email ? <a href={`mailto:${p.contact.email}`}>{p.contact.email}</a> : '—'}</dd>
            <dt>Phone</dt><dd>{p.contact.phone ?? '—'}</dd>
          </> : <><dt>Main contact</dt><dd className={s.muted}>{NO_CONTACT}</dd></>}
          <dt>Came from</dt><dd>{p.source ?? 'Not recorded'}</dd>
          <dt>Expected launch</dt><dd>Not set</dd>
          <dt>Agreement</dt><dd>{p.agreement ? `${p.agreement.version} · signed ${date(p.agreement.signedAt)}` : 'Not signed yet'}</dd>
        </dl>
      </div>

      <div className={s.psec}>
        <h3>History</h3>
        {p.history.length === 0 ? <p className={s.muted}>Nothing recorded yet.</p> : (
          <div className={o.log}>
            {p.history.map((h, i) => <div key={i}><small>{shortDate(h.at)}</small><span>{h.text}{h.detail && <em>{h.detail}</em>}</span></div>)}
          </div>
        )}
      </div>

      {p.notes !== null && <Notes p={p} onSaved={notes => setP(cur => cur ? { ...cur, notes } : cur)} />}
    </section>
  );
}

function OnboardingContent() {
  const [d, setD] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await getJson<List>('/api/admin/onboarding', 'The onboarding list');
    if (r.ok) setD(r.data); else setError(r.msg);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const match = FILTERS.find(f => f.v === filter)!.match;
  // The route sends the rows already in order (what each needs, then the longest wait).
  const rows = useMemo(() => (d?.rows ?? []).filter(match), [d, match]);
  const pickFilter = (f: Filter) => {
    setFilter(f); setMenuOpen(false);
    const m = FILTERS.find(x => x.v === f)!.match;
    const open = (d?.rows ?? []).find(r => r.key === pick);
    if (!open || !m(open)) setPick((d?.rows ?? []).find(m)?.key ?? null);
  };
  useEffect(() => { if (d && pick === null && rows[0]) setPick(rows[0].key); }, [d, pick, rows]);
  const open = (key: string) => {
    setPick(key);
    if (window.matchMedia('(max-width: 1150px)').matches) requestAnimationFrame(() => document.getElementById('onboarding-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <>
      <AdminSidebar active="inquiries" />
      <main className={g.main}>
        <div className={g.head}>
          <h1>Onboarding</h1>
        </div>

        {error && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={g.down}>{error}</span>
            {error === SESSION_ENDED ? <Link href="/admin/login">Sign in</Link> : <button type="button" onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        <div className={s.fwrap} ref={menuRef}>
          <button type="button" className={`${g.glass} ${s.fbtn}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            {filter === 'all' ? 'Filter' : `Filter: ${FILTERS.find(f => f.v === filter)!.label}`}
          </button>
          {menuOpen && (
            <div className={s.fmenu} role="group" aria-label="Show">
              {FILTERS.map(f => (
                <button key={f.v} type="button" aria-pressed={filter === f.v} onClick={() => pickFilter(f.v)}
                  title={f.v === 'overdue' && d ? overdueTitle(d.overdueDays) : undefined}>
                  <span>{f.label}</span><b>{d ? d.rows.filter(f.match).length : '·'}</b>
                </button>
              ))}
            </div>
          )}
        </div>

        {!d && !error && <div className={`${g.glass} ${s.skel}`} aria-busy="true" aria-label="Loading onboarding" />}

        {d && (
          <div className={s.split}>
            <section className={`${g.glass} ${s.dir}`} aria-label="Courses in onboarding">
              {rows.length === 0 ? (
                <p className={s.empty}>{d.rows.length === 0 ? 'No courses in onboarding.' : 'No match.'}</p>
              ) : (
                <table>
                  <thead><tr><th>Course</th><th>Stage</th><th>Next step</th><th className={`${s.n} ${s.hideS}`}>Launch</th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key} className={s.row} tabIndex={0} aria-selected={r.key === pick}
                        onClick={() => open(r.key)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.key); } }}>
                        <td><span className={s.cname}>{r.name}</span>{r.isTest && <span className={s.test}>Test</span>}<span className={s.csub}>{r.town || '—'}</span></td>
                        <td>{r.stage}<div className={o.bar} role="img" aria-label={`${r.steps.done} of ${r.steps.total} setup steps done`}><i style={{ width: `${(r.steps.done / r.steps.total) * 100}%` }} /></div></td>
                        <td><span className={o.next}>{r.next}</span>{r.overdue && <span className={o.late} title={overdueTitle(d.overdueDays)}>{r.daysWaiting} days waiting</span>}</td>
                        <td className={`${s.n} ${s.hideS}`}>Not set</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            {pick && <ProfilePanel key={pick} rowKey={pick} support={d.support} />}
          </div>
        )}

        <div className={s.foot}>
          <Link href="/admin/inquiries">{FOOT_PIPELINE}</Link>
          <a href="/api/admin/inquiries?format=csv">{FOOT_CSV}</a>
        </div>
      </main>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}
