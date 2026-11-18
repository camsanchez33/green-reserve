'use client';
// Inquiries (Cam approved the mockup 2026-11-17, lanes/admin/inquiries-mockup.html; lanes/admin.md "Inquiries —
// APPROVED"). INTERNAL outreach only: the courses we contact, from Target to Said yes, and our calls. "Said yes" hands
// a course to Onboarding (same inquiry id), which owns setup; Golf courses owns live courses. Two sliding tabs:
// Outreach (courses grouped by stage, one line each) and Calls (Cal.com bookings and calls set by hand, past ones
// collapsed). A wordless filter icon, and a bare plus to add a course (managers and up; the routes enforce it).
// Data: GET /api/admin/outreach and /api/admin/outreach/calls (Build's Inquiries data).
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { profileStyles as s } from '@/components/admin/ProfileCard';
import { Dialog } from '../security/Dialog';
import g from '../admin-glass.module.css';
import iq from './inquiries.module.css';
import { api, useCanWrite, LoadError, useToast, dueLabel, dateLabel, whenLabel, directionLabel, ICON, Chevron, ExtIcon, type Res } from './shared';
import { AddCourse } from './AddCourse';

type Next = { key: string; label: string; dueAt: string; due: boolean };
type Row = { id: string; courseName: string; town: string; kind: string; stage: string; last: string; next: Next; snoozedUntil: string | null; source: string | null; booksToday: string };
type Outreach = { stages: { key: string; label: string; hint: string; rows: Row[] }[]; dueToday: number; saidYesThisMonth: number; notNow: { id: string; courseName: string; town: string; recheckAt: string | null }[] };
type Who = { name: string; role: string; email: string; phone: string; decides: boolean };
export type CallRow = {
  id: string; inquiryId: string; courseName: string; town: string; scheduledAt: string; durationMin: number; direction: string;
  who: Who; stage: string; prepReady: boolean; notLogged: boolean; outcome: string; result: string | null; resultLabel: string | null;
  nextStep: string | null; followUpAt: string | null;
};
type Calls = { upcoming: CallRow[]; past: CallRow[]; calcomUrl: string | null };
type Tab = 'outreach' | 'calls';
type Filter = 'all' | 'due' | 'snoozed' | 'unprepared' | 'unlogged';
const FILTERS: Record<Tab, [Filter, string][]> = {
  outreach: [['all', 'Everything'], ['due', 'Due now'], ['snoozed', 'Snoozed']],
  calls: [['all', 'Everything'], ['unprepared', 'Not prepared'], ['unlogged', 'Not logged yet']],
};
// Stage dots, as the mockup: Targets grey, Contacted a lighter green, Replied and Call booked the brand green.
const STAGE_DOT: Record<string, string> = { target: '', contacted: iq.dOk, replied: iq.dBrand, call: iq.dBrand };

function InquiriesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = params.get('tab') === 'calls' ? 'calls' : 'outreach';
  const canWrite = useCanWrite();
  const [o, setO] = useState<Res<Outreach> | null>(null);
  const [c, setC] = useState<Res<Calls> | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [showNotNow, setShowNotNow] = useState(false);
  const [toast, say] = useToast();

  const load = useCallback(async () => {
    setBusy(true);
    const [a, b] = await Promise.all([api<Outreach>('/api/admin/outreach'), api<Calls>('/api/admin/outreach/calls')]);
    setO(a); setC(b); setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setTab = (t: Tab) => { setFilter('all'); router.replace(t === 'calls' ? '/admin/inquiries?tab=calls' : '/admin/inquiries'); };
  const outreach = o?.ok ? o.data : null;
  const calls = c?.ok ? c.data : null;
  const courseCount = outreach ? outreach.stages.reduce((n, st) => n + st.rows.length, 0) : null;
  const err = tab === 'outreach' ? (o && !o.ok ? o : null) : (c && !c.ok ? c : null);

  return (
    <>
      <AdminSidebar active="outreach" />
      <main className={g.main}>
        <div className={g.head}><h1>Inquiries</h1></div>
        <div className={iq.col}>
          <div className={iq.head}>
            <div className={iq.seg} role="tablist" aria-label="Inquiries view">
              <i className={iq.pill} style={{ transform: tab === 'outreach' ? 'none' : 'translateX(100%)' }} aria-hidden="true" />
              <button type="button" role="tab" aria-selected={tab === 'outreach'} onClick={() => setTab('outreach')}>Outreach{courseCount !== null && <em>{courseCount}</em>}</button>
              <button type="button" role="tab" aria-selected={tab === 'calls'} onClick={() => setTab('calls')}>Calls{calls && <em>{calls.upcoming.length}</em>}</button>
            </div>
            <span className={iq.tools}>
              <button type="button" className={`${iq.ibtn} ${filter !== 'all' ? iq.fon : ''}`} onClick={() => setFilterOpen(true)} aria-label={filter === 'all' ? 'Filter' : `Filter: ${FILTERS[tab].find(f => f[0] === filter)?.[1]}`} title="Filter">
                <svg {...ICON}><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></svg>{filter !== 'all' && <i className={iq.fdot} />}
              </button>
              {canWrite && <button type="button" className={iq.ibtn} onClick={() => setAdding(true)} aria-label="Add a course" title="Add a course"><svg {...ICON}><path d="M12 5v14M5 12h14" /></svg></button>}
            </span>
          </div>

          {err && <LoadError error={err.error} status={err.status} retry={load} busy={busy} />}
          {tab === 'outreach' && !o && <div className={`${g.glass} ${iq.skel}`} aria-busy="true" aria-label="Loading outreach" />}
          {tab === 'calls' && !c && <div className={`${g.glass} ${iq.skel}`} aria-busy="true" aria-label="Loading calls" />}

          {tab === 'outreach' && outreach && (() => {
            const pass = (r: Row) => filter === 'due' ? r.next.due : filter === 'snoozed' ? !!r.snoozedUntil : true;
            const stages = outreach.stages.map(st => ({ ...st, rows: st.rows.filter(pass) })).filter(st => st.rows.length);
            return (
              <>
                {stages.length === 0 && (
                  <section className={`${g.glass} ${iq.sec}`}><p className={iq.empty} style={{ borderTop: 0 }}>
                    {filter !== 'all' ? 'Nothing matches that filter.' : canWrite ? 'No courses in outreach yet. Add one with the plus.' : 'No courses in outreach yet.'}
                  </p></section>
                )}
                {stages.map(st => (
                  <section key={st.key} className={`${g.glass} ${iq.sec}`} aria-label={st.label}>
                    <div className={iq.st} title={st.hint}><i className={`${iq.dot} ${STAGE_DOT[st.key] ?? ''}`} aria-hidden="true" /><b>{st.label}</b><span>{st.rows.length}</span></div>
                    {st.rows.map(r => (
                      <Link key={r.id} href={`/admin/inquiries/${r.id}`} className={iq.row}>
                        <span className={iq.n}><b>{r.courseName}</b>{r.town && <small>{r.town}</small>}</span>
                        <span className={iq.soft}>{r.last || 'Not contacted yet'}</span>
                        <span className={`${iq.x} ${r.next.due ? iq.due : ''}`}>
                          {r.snoozedUntil ? `Snoozed until ${dateLabel(r.snoozedUntil)}` : `${r.next.label} · ${dueLabel(r.next.dueAt)}`}
                        </span>
                      </Link>
                    ))}
                  </section>
                ))}
                <p className={iq.foot}>
                  <span>{outreach.saidYesThisMonth === 1 ? '1 course' : `${outreach.saidYesThisMonth} courses`} said yes this month and moved to Onboarding.</span>
                  <Link href="/admin/onboarding">Open Onboarding ›</Link>
                  {outreach.notNow.length > 0 && <button type="button" aria-expanded={showNotNow} onClick={() => setShowNotNow(v => !v)}>Not now · {outreach.notNow.length}</button>}
                </p>
                {showNotNow && outreach.notNow.length > 0 && (
                  <section className={`${g.glass} ${iq.sec}`} aria-label="Not now">
                    <div className={iq.st}><b>Not now</b><span>{outreach.notNow.length}</span></div>
                    {outreach.notNow.map(n => (
                      <Link key={n.id} href={`/admin/inquiries/${n.id}`} className={iq.row}>
                        <span className={iq.n}><b>{n.courseName}</b>{n.town && <small>{n.town}</small>}</span>
                        <span />
                        <span className={iq.x}>{n.recheckAt ? `Recheck ${dateLabel(n.recheckAt)}` : 'No recheck date'}</span>
                      </Link>
                    ))}
                  </section>
                )}
                {/* The old Pipeline board (bulk Send sheet and Archive, closed inquiries, the export) until
                    Build and Cam give those a home. */}
                <p className={iq.foot}><Link href="/admin/inquiries/all">All inquiries ›</Link></p>
              </>
            );
          })()}

          {tab === 'calls' && calls && (() => {
            const up = calls.upcoming.filter(k => filter === 'unprepared' ? !k.prepReady : filter === 'unlogged' ? k.notLogged : true);
            const past = filter === 'all' ? calls.past : [];
            return (
              <>
                <section className={`${g.glass} ${iq.sec}`} aria-label="Upcoming calls">
                  <div className={iq.st}><b>Upcoming</b><span>{up.length}</span>
                    {calls.calcomUrl && <a className={`${s.lnk} ${iq.right}`} href={calls.calcomUrl} target="_blank" rel="noopener noreferrer">Open Cal.com <ExtIcon /></a>}
                  </div>
                  {up.length > 0 && <div className={`${iq.row} ${iq.calls} ${iq.hd}`} aria-hidden="true"><span>When</span><span>Course and who</span><span>Stage</span><span className={iq.x}>Prep</span></div>}
                  {up.length === 0 && <p className={iq.empty}>{filter === 'all' ? 'No calls on the calendar.' : 'Nothing matches that filter.'}</p>}
                  {up.map(k => (
                    <Link key={k.id} href={`/admin/inquiries/calls/${k.id}`} className={`${iq.row} ${iq.calls}`}>
                      <span><b className={iq.b2}>{whenLabel(k.scheduledAt)}</b><small className={iq.s2}>{k.durationMin} min · {directionLabel(k.direction)}</small></span>
                      <span><b className={iq.b2}>{k.courseName}</b><small className={iq.s2}>{[k.who.name, k.who.role].filter(Boolean).join(' · ') || 'No name yet'}</small></span>
                      <span className={iq.soft}>{k.stage}</span>
                      <span className={`${iq.x} ${k.notLogged ? iq.late : ''}`}>
                        {k.notLogged ? 'Not logged' : <><i className={`${iq.dot} ${k.prepReady ? iq.dBrand : iq.dWarn}`} aria-hidden="true" /> {k.prepReady ? 'Prep ready' : 'Not prepared'}</>}
                      </span>
                    </Link>
                  ))}
                  <p className={iq.hint}>Booked through your Cal.com link. They show up as soon as Cal.com tells us, matched to the course by email.</p>
                </section>
                {filter === 'all' && (
                  <section className={`${g.glass} ${iq.sec}`} aria-label="Past calls">
                    <button type="button" className={iq.disc} aria-expanded={showPast} onClick={() => setShowPast(v => !v)}><Chevron /><b>Past calls</b><span>{past.length}</span></button>
                    {showPast && (
                      <>
                        {past.length > 0 && <div className={`${iq.row} ${iq.calls} ${iq.hd}`} aria-hidden="true"><span>When</span><span>Course and who</span><span>Outcome</span><span className={iq.x}>Next</span></div>}
                        {past.length === 0 && <p className={iq.empty}>No past calls.</p>}
                        {past.map(k => (
                          <Link key={k.id} href={`/admin/inquiries/calls/${k.id}`} className={`${iq.row} ${iq.calls}`}>
                            <span><b className={iq.b2}>{whenLabel(k.scheduledAt)}</b><small className={iq.s2}>{k.durationMin} min</small></span>
                            <span><b className={iq.b2}>{k.courseName}</b><small className={iq.s2}>{[k.who.name, k.who.role].filter(Boolean).join(' · ')}</small></span>
                            <span className={iq.soft}>{k.resultLabel ?? '—'}</span>
                            <span className={iq.x}>{[k.nextStep, k.followUpAt ? dateLabel(k.followUpAt) : ''].filter(Boolean).join(' · ') || '—'}</span>
                          </Link>
                        ))}
                      </>
                    )}
                  </section>
                )}
              </>
            );
          })()}
        </div>
      </main>
      {filterOpen && <FilterDialog tab={tab} value={filter} onClose={() => setFilterOpen(false)} onApply={f => { setFilter(f); setFilterOpen(false); }} />}
      {adding && <AddCourse onClose={() => setAdding(false)} onAdded={id => { setAdding(false); load(); say(id ? <>Added to Targets. <Link href={`/admin/inquiries/${id}`}>Open the course page</Link></> : 'Import done.'); }} />}
      {toast}
    </>
  );
}

function FilterDialog({ tab, value, onClose, onApply }: { tab: Tab; value: Filter; onClose: () => void; onApply: (f: Filter) => void }) {
  const [f, setF] = useState(value);
  return (
    <Dialog labelId="iq-filter-t" onClose={onClose}>
      <h4 id="iq-filter-t">Filter</h4>
      <label className={iq.f}>Show
        <select value={f} onChange={e => setF(e.target.value as Filter)}>
          {FILTERS[tab].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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

export default function InquiriesPage() {
  return (
    <Suspense fallback={null}>
      <InquiriesInner />
    </Suspense>
  );
}
