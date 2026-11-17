'use client';
// The security checker's parts of Settings → Security (Cam 2026-11-17, lanes/admin.md "Security — APPROVED"): the
// status box, Your courses, the Incidents tab and its timeline, Ask, Undo and Approve fix. The checker itself (cron,
// model call, action allowlist, audit log) is Build's job; until GET /api/admin/security/checker exists (a 404), every
// part here stays hidden. Nothing is made up: what shows is what that route returns. Any other failure says so.
import { useCallback, useState } from 'react';
import { ProfileCard, Msg, profileStyles as s } from '@/components/admin/ProfileCard';
import { stepUpFetch } from '@/lib/step-up-client';
import g from '../admin-glass.module.css';
import { Dialog } from './Dialog';
import ss from './security.module.css';
import { NETWORK, CHECKER_NETWORK, TOAST, NEXT_RUN, INCIDENTS_LEAD, RULES_LEAD, RULES } from './terms';
import { type CheckerData, type CheckerIncident, type CheckerAction, INCIDENT_STATUS, FIXED_HOW, when, plural } from './logic';

export const CHECKER_URL = '/api/admin/security/checker';
type Verb = 'undo' | 'approve' | 'dismiss';

export type CheckerState =
  | { phase: 'loading' } | { phase: 'absent' }
  | { phase: 'error'; message: string } | { phase: 'ready'; data: CheckerData };

/** Loads the checker. A 404 means Build hasn't shipped it yet, so the page hides it; anything else is shown. */
export function useChecker() {
  const [state, setState] = useState<CheckerState>({ phase: 'loading' });
  const load = useCallback(async () => {
    try {
      const r = await fetch(CHECKER_URL, { cache: 'no-store' });
      if (r.status === 404) { setState({ phase: 'absent' }); return; }
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !Array.isArray(d.actions) || !Array.isArray(d.incidents) || !Array.isArray(d.courses)) {
        setState({ phase: 'error', message: (d && typeof d.error === 'string' && d.error) || `Couldn’t load the security checker (${r.status}).` });
        return;
      }
      setState({ phase: 'ready', data: d as CheckerData });
    } catch {
      setState({ phase: 'error', message: CHECKER_NETWORK });
    }
  }, []);
  return { state, load };
}

const DONE_TOAST: Record<Verb, (label: string | null) => string> = {
  undo: () => TOAST.undo,
  approve: label => (label === 'Approve fix' ? TOAST.approveFix : TOAST.approve),
  dismiss: () => TOAST.dismiss,
};

/** Undo / Approve / Not now on one checker action. Returns the toast on success, or throws the route's message. */
export async function actOn(id: string, verb: Verb, label: string | null): Promise<string> {
  let r: Response;
  try {
    r = await stepUpFetch(`${CHECKER_URL}/actions/${encodeURIComponent(id)}/${verb}`, { method: 'POST' });
  } catch {
    throw new Error(NETWORK);
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Couldn’t do that (${r.status}).`);
  return DONE_TOAST[verb](label);
}

const AI_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9z" /><path d="M18.5 15.5l.8 1.9 1.7.8-1.7.8-.8 1.9-.8-1.9-1.7-.8 1.7-.8z" />
  </svg>
);

const isToday = (iso: string) => when(iso).startsWith('Today');

/** The status box at the top: plain-English status, when it ran and runs next, Ask, and today's actions. */
export function CheckerBox({ data, busy, errors, onAsk, onAct }: {
  data: CheckerData; busy: string | null; errors: Record<string, string>;
  onAsk: () => void; onAct: (a: CheckerAction, verb: Verb) => void;
}) {
  const proposed = data.actions.filter(a => a.kind === 'proposed').length;
  const needs = data.status === 'needs_you' || proposed > 0;
  const title = !needs ? 'All clear' : proposed ? `Needs you: ${plural(proposed, 'fix', 'fixes')} to approve` : 'Needs you';
  const ran = data.lastRunAt ? `last ran ${when(data.lastRunAt).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}` : 'hasn’t run yet';
  const next = data.nextRunAt ? ` · next ${when(data.nextRunAt).replace(/^Today /, '').replace(/^Tomorrow/, 'tomorrow')}${NEXT_RUN}` : '';
  const today = data.actions.filter(a => a.kind !== 'note' && isToday(a.at));
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
        {data.summary.happened && <p><b>Since last night:</b> {data.summary.happened}</p>}
        {data.summary.didOnItsOwn && <p><b>What I did on my own:</b> {data.summary.didOnItsOwn}</p>}
        {data.summary.needsYou && <p><b>What I need from you:</b> {data.summary.needsYou}</p>}
      </div>
      {today.length > 0 && (
        <div className={ss.aiacts}>
          {today.map(a => (
            <div key={a.id} className={ss.aiact}>
              {a.kind === 'done' ? <span className={`${ss.aitag} ${ss.tok}`}>Done</span> : <span className={`${ss.aitag} ${ss.twn}`}>Needs OK</span>}
              <p>{a.text}</p>
              {a.kind === 'done' ? (
                a.canUndo ? <button type="button" className={s.lnk} disabled={busy === a.id} onClick={() => onAct(a, 'undo')}>{busy === a.id ? 'Undoing…' : 'Undo'}</button> : <span />
              ) : (
                <span className={ss.aibtns}>
                  <button type="button" className={s.lnk} disabled={busy === a.id} onClick={() => onAct(a, 'dismiss')}>Not now</button>
                  <button type="button" className={`${s.btn} ${s.pri} ${s.sm}`} disabled={busy === a.id} onClick={() => onAct(a, 'approve')}>{busy === a.id ? 'Working…' : (a.approveLabel ?? 'Approve')}</button>
                </span>
              )}
              {errors[a.id] && <p className={ss.inlineErr} role="alert">{errors[a.id]}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** One row per course: OK, or what's wrong, linked to its incident. */
export function CoursesCard({ data, onOpen }: { data: CheckerData; onOpen: (incidentId: string) => void }) {
  const list = data.courses;
  const off = list.filter(c => c.state !== 'ok').length;
  const lead = !list.length ? 'No live courses yet.' : off ? `${list.length - off} of ${list.length} OK. ${off} had something today.` : `All ${plural(list.length, 'course')} OK.`;
  return (
    <ProfileCard title="Your courses" labelId="sc-courses" lead={lead}>
      {list.map(c => (
        <div key={c.courseId} className={ss.crow}>
          <span className={ss.cnm}><span className={`${ss.sdt} ${ss[c.state]}`} aria-hidden="true" />{c.name}</span>
          <span className={`${ss.cst} ${c.state === 'ok' ? ss.cstOk : ''}`}>{c.state === 'ok' ? 'OK' : c.text}</span>
          {c.incidentId ? <button type="button" className={s.lnk} onClick={() => onOpen(c.incidentId!)}>See incident</button> : <span />}
        </div>
      ))}
    </ProfileCard>
  );
}


/** The Incidents tab: the log, then what the checker may do on its own (the approved policy, not data). */
export function IncidentsTab({ data, onOpen }: { data: CheckerData; onOpen: (incidentId: string) => void }) {
  return (
    <>
      <ProfileCard title="Incident log" labelId="sc-inc" lead={INCIDENTS_LEAD}>
        {data.incidents.length === 0 ? <p className={ss.empty}>Nothing noticed yet.</p> : (
          <>
            <div className={`${ss.igr} ${ss.agh}`}><span>What happened</span><span className={ss.hideS}>Course</span><span className={ss.hideS}>When</span><span>Status</span></div>
            {data.incidents.map(i => {
              const [label, tone] = INCIDENT_STATUS[i.status] ?? [i.status, 'neutral'];
              return (
                <button key={i.id} type="button" className={`${ss.igr} ${ss.irow}`} onClick={() => onOpen(i.id)}>
                  <span className={ss.iw}>{i.title}</span>
                  <span className={ss.ic}>{i.courseName ?? 'Platform'}</span>
                  <span className={ss.iwhen}>{when(i.at)}</span>
                  <span className={ss.ist}><span className={`${ss.sdt} ${tone === 'neutral' ? '' : ss[tone]}`} aria-hidden="true" />{label}</span>
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

/** One incident: detected → what the checker did → result, who was affected, whether it's fixed, Undo and Approve. */
export function IncidentDialog({ incident: i, onClose, onAct, busy, error }: {
  incident: CheckerIncident; onClose: () => void; busy: boolean; error: string;
  onAct: (verb: 'undo' | 'approve') => void;
}) {
  const [label, tone] = INCIDENT_STATUS[i.status] ?? [i.status, 'neutral'];
  const canApprove = !!(i.actionId && i.approveLabel && i.status === 'needs_you');
  const canUndo = !!(i.actionId && i.canUndo);
  return (
    <Dialog labelId="sc-inc-t" onClose={onClose} busy={busy}>
      <h4 id="sc-inc-t">{i.title}</h4>
      <p className={ss.imeta}><span className={`${ss.sdt} ${tone === 'neutral' ? '' : ss[tone]}`} aria-hidden="true" />{label} · {i.courseName ?? 'Platform'} · {when(i.at)}</p>
      {i.timeline.length > 0 && (
        <div className={ss.itl}>
          {i.timeline.map((t, n) => <div key={n}><small>{t.at ? when(t.at) : ''}</small><b>{t.step}</b><p>{t.text}</p></div>)}
        </div>
      )}
      <div className={ss.iblk}><b>Who was affected</b><p>{i.affected}</p></div>
      <div className={ss.iblk}><b>Fixed?</b><p>{FIXED_HOW[i.fixedHow] ?? ''}</p></div>
      {error && <Msg ok={false}>{error}</Msg>}
      <div className={s.line}>
        {canUndo && <button type="button" className={s.lnk} disabled={busy} onClick={() => onAct('undo')}>Undo what the checker did</button>}
        {canApprove && !canUndo && <button type="button" className={s.lnk} disabled={busy} onClick={onClose}>Close</button>}
        <span className={ss.spring} />
        {canApprove
          ? <button type="button" className={`${s.btn} ${s.pri}`} disabled={busy} onClick={() => onAct('approve')}>{busy ? 'Working…' : i.approveLabel}</button>
          : <button type="button" className={s.btn} onClick={onClose} disabled={busy}>Close</button>}
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
      const r = await fetch(`${CHECKER_URL}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
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
