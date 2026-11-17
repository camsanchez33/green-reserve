'use client';
// The security checker's parts of Settings → Security (Cam 2026-11-17, lanes/admin.md "Security — APPROVED"): the
// status box, Your courses, the Incidents tab and its timeline, Ask, Undo, Approve fix and Not now. The checker itself
// (cron, model call, action allowlist, audit log) is Build's job and its routes are the source of truth (Build,
// 2026-11-17). Until GET /api/admin/security/checker exists (a 404), every part here stays hidden; the same for
// courses and incidents on their own routes. Nothing is made up: what shows is what those routes return. Any other
// failure says so. Undo, Approve and Not now need a fresh second factor, so they go through stepUpFetch.
import { useCallback, useEffect, useState } from 'react';
import { ProfileCard, Msg, profileStyles as s } from '@/components/admin/ProfileCard';
import { stepUpFetch } from '@/lib/step-up-client';
import g from '../admin-glass.module.css';
import { Dialog } from './Dialog';
import ss from './security.module.css';
import { NETWORK, CHECKER_NETWORK, TOAST, NEXT_RUN, AI_UNAVAILABLE, NO_CHECK_YET, SPIKE, SPIKE_OTHER, INCIDENTS_LEAD, RULES_LEAD, RULES } from './terms';
import { type CheckerData, type CheckerCourse, type CheckerIncidentRow, type CheckerIncident, INCIDENT_STATUS, FIXED_HOW, when, plural } from './logic';

const API = '/api/admin/security';

export type CheckerState =
  | { phase: 'loading' } | { phase: 'absent' } | { phase: 'error'; message: string }
  | { phase: 'ready'; data: CheckerData; courses: CheckerCourse[] | null; incidents: CheckerIncidentRow[] | null; partError: string };

type Got<T> = { kind: 'ok'; value: T } | { kind: 'absent' } | { kind: 'error'; message: string };

/** GET one checker route: a 404 is "not built yet"; anything else that isn't the expected shape is an error. */
async function get<T>(path: string, ok: (d: unknown) => d is T, what: string): Promise<Got<T>> {
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (r.status === 404) return { kind: 'absent' };
    const d: unknown = await r.json().catch(() => null);
    if (!r.ok || !ok(d)) {
      const err = isObj(d) && typeof d.error === 'string' ? d.error : '';
      return { kind: 'error', message: err || `Couldn’t load ${what} (${r.status}).` };
    }
    return { kind: 'ok', value: d };
  } catch {
    return { kind: 'error', message: CHECKER_NETWORK };
  }
}

const isObj = (d: unknown): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d);
const isChecker = (d: unknown): d is CheckerData => isObj(d) && Array.isArray(d.done) && Array.isArray(d.proposals) && (d.state === 'all_clear' || d.state === 'needs_you');
const isCourses = (d: unknown): d is CheckerCourse[] => Array.isArray(d);
const isIncidents = (d: unknown): d is CheckerIncidentRow[] => Array.isArray(d);
const isIncident = (d: unknown): d is CheckerIncident => isObj(d) && typeof d.title === 'string' && Array.isArray(d.timeline) && Array.isArray(d.actions);

/** Loads the checker, then courses and incidents (from the checker GET if Build folds them in, else their own routes). */
export function useChecker() {
  const [state, setState] = useState<CheckerState>({ phase: 'loading' });
  const load = useCallback(async () => {
    const ck = await get(`${API}/checker`, isChecker, 'the security checker');
    if (ck.kind === 'absent') { setState({ phase: 'absent' }); return; }
    if (ck.kind === 'error') { setState({ phase: 'error', message: ck.message }); return; }
    const folded = ck.value as CheckerData & { courses?: unknown; incidents?: unknown };
    const [co, inc] = await Promise.all([
      isCourses(folded.courses) ? Promise.resolve<Got<CheckerCourse[]>>({ kind: 'ok', value: folded.courses }) : get(`${API}/courses`, isCourses, 'Your courses'),
      isIncidents(folded.incidents) ? Promise.resolve<Got<CheckerIncidentRow[]>>({ kind: 'ok', value: folded.incidents }) : get(`${API}/incidents`, isIncidents, 'the incident log'),
    ]);
    const partError = [co, inc].map(x => (x.kind === 'error' ? x.message : '')).filter(Boolean).join(' ');
    setState({ phase: 'ready', data: ck.value, courses: co.kind === 'ok' ? co.value : null, incidents: inc.kind === 'ok' ? inc.value : null, partError });
  }, []);
  return { state, load };
}

export type Act = { kind: 'undo'; actionId: string } | { kind: 'approve' | 'decline'; incidentId: string; button?: string };
export const actKey = (a: Act) => (a.kind === 'undo' ? `a:${a.actionId}` : `i:${a.incidentId}`);

/** Undo / Approve / Not now. Returns the toast on success, or throws the route's message. */
export async function runAct(a: Act): Promise<string> {
  const path = a.kind === 'undo'
    ? `${API}/actions/${encodeURIComponent(a.actionId)}/undo`
    : `${API}/incidents/${encodeURIComponent(a.incidentId)}/${a.kind}`;
  let r: Response;
  try { r = await stepUpFetch(path, { method: 'POST' }); } catch { throw new Error(NETWORK); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Couldn’t do that (${r.status}).`);
  if (a.kind === 'undo') return TOAST.undo;
  if (a.kind === 'decline') return TOAST.dismiss;
  return TOAST.approve;
}

const AI_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9z" /><path d="M18.5 15.5l.8 1.9 1.7.8-1.7.8-.8 1.9-.8-1.9-1.7-.8 1.7-.8z" />
  </svg>
);

const clock = (iso: string) => when(iso).replace(/^Today /, '').replace(/^Yesterday/, 'yesterday');

/** "Last 12 hours · checked 7:00 AM" for a scheduled run; "Checked 2:14 PM after a burst of failed sign-ins" for a spike. */
function runLabel(lastRunAt: string, trigger: string | null | undefined): string {
  if (trigger && trigger.startsWith('spike:')) return `Checked ${clock(lastRunAt)} after ${SPIKE[trigger.slice(6)] ?? SPIKE_OTHER}`;
  return `Last 12 hours · checked ${clock(lastRunAt)}`;
}

/** The status box at the top: plain-English status, when it ran and runs next, Ask, what it did and what needs an OK. */
export function CheckerBox({ data, busy, errors, onAsk, onAct }: {
  data: CheckerData; busy: string | null; errors: Record<string, string>;
  onAsk: () => void; onAct: (a: Act) => void;
}) {
  const n = data.proposals.length;
  const needs = data.state === 'needs_you' || n > 0;
  const title = !needs ? 'All clear' : n ? `Needs you: ${n} to approve` : 'Needs you';
  const ran = data.lastRunAt ? `last ran ${when(data.lastRunAt).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}` : 'hasn’t run yet';
  const next = data.nextRunAt ? ` · next ${when(data.nextRunAt).replace(/^Today /, '').replace(/^Tomorrow/, 'tomorrow')}${NEXT_RUN}` : '';
  return (
    <section className={`${g.glass} ${ss.aib}`} aria-labelledby="sc-status">
      <div className={ss.aih}>
        <span className={ss.aiico}>{AI_ICON}</span>
        <div className={ss.aiw}>
          <div className={ss.ait}><span className={`${ss.sdt} ${needs ? ss.warn : ss.ok}`} aria-hidden="true" /><b id="sc-status">{title}</b></div>
          <small>Security checker · {ran}{next}</small>
        </div>
        <button type="button" className={`${s.btn} ${s.sm}`} onClick={onAsk}>Ask</button>
      </div>
      <div className={ss.aisum}>
        {!data.lastRunAt && !data.summary ? <p>{NO_CHECK_YET}</p>
          : <p>{data.lastRunAt && <b>{runLabel(data.lastRunAt, data.lastTrigger)}:</b>} {data.aiAvailable ? (data.summary || NO_CHECK_YET) : AI_UNAVAILABLE}</p>}
      </div>
      {(data.done.length > 0 || n > 0) && (
        <div className={ss.aiacts}>
          {data.done.map(d => {
            const a: Act = { kind: 'undo', actionId: d.id };
            const k = actKey(a);
            return (
              <div key={k} className={ss.aiact}>
                <span className={`${ss.aitag} ${ss.tok}`}>Done</span>
                <p>{d.text}</p>
                {d.undoable ? <button type="button" className={s.lnk} disabled={busy === k} onClick={() => onAct(a)}>{busy === k ? 'Undoing…' : 'Undo'}</button> : <span />}
                {errors[k] && <p className={ss.inlineErr} role="alert">{errors[k]}</p>}
              </div>
            );
          })}
          {data.proposals.map(p => {
            const k = actKey({ kind: 'approve', incidentId: p.incidentId });
            return (
              <div key={k} className={ss.aiact}>
                <span className={`${ss.aitag} ${ss.twn}`}>Needs OK</span>
                <p>{p.text}</p>
                <span className={ss.aibtns}>
                  <button type="button" className={s.lnk} disabled={busy === k} onClick={() => onAct({ kind: 'decline', incidentId: p.incidentId })}>Not now</button>
                  <button type="button" className={`${s.btn} ${s.pri} ${s.sm}`} disabled={busy === k} onClick={() => onAct({ kind: 'approve', incidentId: p.incidentId, button: p.button })}>{busy === k ? 'Working…' : (p.button || 'Approve')}</button>
                </span>
                {errors[k] && <p className={ss.inlineErr} role="alert">{errors[k]}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** One row per course: OK, or what's wrong, linked to its incident. */
export function CoursesCard({ courses, onOpen }: { courses: CheckerCourse[]; onOpen: (incidentId: string) => void }) {
  const off = courses.filter(c => c.state !== 'ok').length;
  const lead = !courses.length ? 'No live courses yet.' : off ? `${courses.length - off} of ${courses.length} OK. ${off} had something today.` : `All ${plural(courses.length, 'course')} OK.`;
  return (
    <ProfileCard title="Your courses" labelId="sc-courses" lead={lead}>
      {courses.map(c => (
        <div key={c.courseId} className={ss.crow}>
          <span className={ss.cnm}><span className={`${ss.sdt} ${ss[c.state] ?? ''}`} aria-hidden="true" />{c.name}</span>
          <span className={`${ss.cst} ${c.state === 'ok' ? ss.cstOk : ''}`}>{c.state === 'ok' ? 'OK' : c.note}</span>
          {c.incidentId ? <button type="button" className={s.lnk} onClick={() => onOpen(c.incidentId!)}>See incident</button> : <span />}
        </div>
      ))}
    </ProfileCard>
  );
}

const statusOf = (st: string): [string, string] => {
  const [label, tone] = INCIDENT_STATUS[st as keyof typeof INCIDENT_STATUS] ?? [st, 'neutral'];
  return [label, tone === 'neutral' ? '' : ss[tone]];
};

/** The Incidents tab: the log, then what the checker may do on its own (the approved policy, not data). */
export function IncidentsTab({ incidents, onOpen }: { incidents: CheckerIncidentRow[]; onOpen: (incidentId: string) => void }) {
  return (
    <>
      <ProfileCard title="Incident log" labelId="sc-inc" lead={INCIDENTS_LEAD}>
        {incidents.length === 0 ? <p className={ss.empty}>Nothing noticed yet.</p> : (
          <>
            <div className={`${ss.igr} ${ss.agh}`}><span>What happened</span><span className={ss.hideS}>Course</span><span className={ss.hideS}>When</span><span>Status</span></div>
            {incidents.map(i => {
              const [label, cls] = statusOf(i.status);
              return (
                <button key={i.id} type="button" className={`${ss.igr} ${ss.irow}`} onClick={() => onOpen(i.id)}>
                  <span className={ss.iw}>{i.title}</span>
                  <span className={ss.ic}>{i.course ?? 'Platform'}</span>
                  <span className={ss.iwhen}>{when(i.at)}</span>
                  <span className={ss.ist}><span className={`${ss.sdt} ${cls}`} aria-hidden="true" />{label}</span>
                </button>
              );
            })}
          </>
        )}
      </ProfileCard>
      <ProfileCard title="What it may do on its own" labelId="sc-rules" lead={RULES_LEAD}>
        {RULES.map(([tone, t, sub]) => (
          <div key={t} className={ss.prow}>
            <span className={`${ss.sdt} ${ss[tone]}`} aria-hidden="true" />
            <span className={ss.pm2}>{t}<small>{sub}</small></span>
          </div>
        ))}
      </ProfileCard>
    </>
  );
}

/** One incident, loaded on open: detected → what the checker did → result, who was affected, fixed?, Undo, Approve. */
export function IncidentDialog({ id, onClose, onAct, busy, errors, version }: {
  id: string; onClose: () => void; busy: string | null; errors: Record<string, string>;
  onAct: (a: Act) => Promise<boolean>; version: number;
}) {
  const [inc, setInc] = useState<CheckerIncident | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const load = useCallback(async () => {
    setLoadErr('');
    const r = await get(`${API}/incidents/${encodeURIComponent(id)}`, isIncident, 'this incident');
    if (r.kind === 'ok') setInc(r.value);
    else setLoadErr(r.kind === 'absent' ? 'This incident is no longer there.' : r.message);
  }, [id]);
  // Reloads whenever the page reloads the checker, so an Undo elsewhere shows here too.
  useEffect(() => { load(); }, [load, version]);

  const approveKey = actKey({ kind: 'approve', incidentId: id });
  const anyBusy = busy !== null;
  const titleId = 'sc-inc-t';
  if (!inc) {
    return (
      <Dialog labelId={titleId} onClose={onClose}>
        <h4 id={titleId}>Incident</h4>
        {loadErr ? <Msg ok={false}>{loadErr}</Msg> : <p>Loading…</p>}
        <div className={s.line}>
          {loadErr && <button type="button" className={s.lnk} onClick={() => load()}>Try again</button>}
          <span className={ss.spring} />
          <button type="button" className={s.btn} onClick={onClose}>Close</button>
        </div>
      </Dialog>
    );
  }
  const [label, cls] = statusOf(inc.status);
  const proposal = inc.proposal ?? null;
  return (
    <Dialog labelId={titleId} onClose={onClose} busy={anyBusy}>
      <h4 id={titleId}>{inc.title}</h4>
      <p className={ss.imeta}><span className={`${ss.sdt} ${cls}`} aria-hidden="true" />{label} · {inc.course ?? 'Platform'} · {when(inc.at)}</p>
      {inc.timeline.length > 0 && (
        <div className={ss.itl}>
          {inc.timeline.map((t, n) => <div key={n}><small>{t.at ? when(t.at) : ''}</small><b>{t.step}</b><p>{t.text}</p></div>)}
        </div>
      )}
      {inc.actions.length > 0 && (
        <div className={ss.iblk}>
          <b>What the checker did</b>
          {inc.actions.map(a => {
            const k = actKey({ kind: 'undo', actionId: a.id });
            return (
              <div key={a.id} className={ss.iact}>
                <p>{a.text}{a.undoneAt ? ` · undone ${when(a.undoneAt)}` : ''}</p>
                {a.undoable && !a.undoneAt && (
                  <button type="button" className={s.lnk} disabled={anyBusy} onClick={() => onAct({ kind: 'undo', actionId: a.id })}>{busy === k ? 'Undoing…' : 'Undo'}</button>
                )}
                {errors[k] && <Msg ok={false}>{errors[k]}</Msg>}
              </div>
            );
          })}
        </div>
      )}
      <div className={ss.iblk}><b>Who was affected</b><p>{inc.affected}</p></div>
      <div className={ss.iblk}><b>Fixed?</b><p>{FIXED_HOW[inc.fixed] ?? ''}</p></div>
      {proposal && <div className={ss.iblk}><b>Waiting for your OK</b><p>{proposal.text}</p></div>}
      {loadErr && <Msg ok={false}>{loadErr}</Msg>}
      {errors[approveKey] && <Msg ok={false}>{errors[approveKey]}</Msg>}
      <div className={s.line}>
        {proposal && <button type="button" className={s.lnk} disabled={anyBusy} onClick={async () => { if (await onAct({ kind: 'decline', incidentId: id })) onClose(); }}>Not now</button>}
        <span className={ss.spring} />
        {proposal
          ? <button type="button" className={`${s.btn} ${s.pri}`} disabled={anyBusy} onClick={async () => { if (await onAct({ kind: 'approve', incidentId: id, button: proposal.button })) onClose(); }}>{busy === approveKey ? 'Working…' : (proposal.button || 'Approve')}</button>
          : <button type="button" className={s.btn} onClick={onClose} disabled={anyBusy}>Close</button>}
      </div>
    </Dialog>
  );
}

/** Ask the security checker a question; the answers stay in the box until it closes. */
export function AskDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question) { setError('Type a question first.'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch(`${API}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || typeof d.answer !== 'string') setError(d.error || `Couldn’t get an answer (${r.status}).`);
      else { setQa(x => [...x, { q: question, a: d.answer }]); setQ(''); }
    } catch {
      setError(NETWORK);
    }
    setBusy(false);
  }
  return (
    <Dialog labelId="sc-ask-t" onClose={onClose} busy={busy}>
      <form onSubmit={ask} noValidate style={{ display: 'contents' }}>
        <h4 id="sc-ask-t">Ask the security checker</h4>
        {qa.map((x, n) => <div key={n} className={ss.qa}><p className={ss.q}>{x.q}</p><p className={ss.a}>{x.a}</p></div>)}
        <input className={s.fld} aria-label="Your question" value={q} onChange={e => setQ(e.target.value)} disabled={busy} maxLength={500} />
        {error && <Msg ok={false}>{error}</Msg>}
        <div className={s.line}>
          <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Close</button>
          <span className={ss.spring} />
          <button type="submit" className={`${s.btn} ${s.pri}`} disabled={busy}>{busy ? 'Asking…' : 'Ask'}</button>
        </div>
      </form>
    </Dialog>
  );
}
