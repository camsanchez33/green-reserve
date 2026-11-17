'use client';
// Inquiries → one call (Cam approved the mockup 2026-11-17). An upcoming call shows the prep card (time and countdown,
// Join and Reschedule or cancel from Cal.com, who's on the call, key facts), the agenda from inquiry-call.ts with a note
// per item (notes save as you type), and "How it went": the outcome and the next step. A logged call reads back the
// same, read only. Viewers see the prep card without notes or Cal.com links (the API blanks them). Writes are manager
// and up. Data: GET/POST /api/admin/outreach/calls/[id] (save_notes, log).
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { profileStyles as s, Msg } from '@/components/admin/ProfileCard';
import g from '../../../admin-glass.module.css';
import iq from '../../inquiries.module.css';
import { api, useCanWrite, LoadError, whenLabel, dateLabel, countdown, directionLabel, dateInputToIso, todayInput, type Res } from '../../shared';

type Agenda = { key: string; label: string; short: string; onAgenda: boolean; known: string | null; captured: string | null; note: string };
type Who = { name: string; role: string; email: string; phone: string; decides: boolean };
type Call = {
  id: string; inquiryId: string; courseName: string; town: string; kind: string; scheduledAt: string; durationMin: number; direction: string; phone: string;
  outcome: string; result: string | null; resultLabel: string | null; nextStep: string | null; followUpAt: string | null; notes: string | null;
  upcoming: boolean; notLogged: boolean; stage: string; inquiryStatus: string; joinUrl: string | null; calcom: { reschedule: string; cancel: string } | null;
  who: Who; contacts: (Omit<Who, 'decides'> & { decisionMaker: boolean })[];
  facts: { kind: string; booksToday: string; town: string; lastTouch: string }; agenda: Agenda[]; agendaExtra: string;
};
type Result = 'said_yes' | 'follow_up' | 'not_now' | 'no_answer';
const RESULTS: [Result, string][] = [['said_yes', 'Said yes → Onboarding'], ['follow_up', 'Follow up on a date'], ['not_now', 'Not now'], ['no_answer', 'No answer']];
const EARLY_MS = 15 * 60_000; // the route refuses a log more than 15 minutes before the call starts

function CallInner() {
  const { id } = useParams() as { id: string };
  const [r, setR] = useState<Res<Call> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setR(await api<Call>(`/api/admin/outreach/calls/${encodeURIComponent(id)}`));
    setBusy(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <AdminSidebar active="outreach" />
      <main className={g.main}>
        <div className={iq.col}>
          <Link href="/admin/inquiries?tab=calls" className={`${s.lnk} ${iq.back}`}>‹ Calls</Link>
          {!r && <div className={`${g.glass} ${iq.skel}`} aria-busy="true" aria-label="Loading the call" />}
          {r && !r.ok && <LoadError error={r.error} status={r.status} retry={load} busy={busy} />}
          {r && r.ok && <CallPage k={r.data} reload={load} />}
        </div>
      </main>
    </>
  );
}

function CallPage({ k, reload }: { k: Call; reload: () => void }) {
  const canWrite = useCanWrite();
  const open = k.upcoming && canWrite && k.notes !== null; // notes null = a viewer's read
  const past = !k.upcoming;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  // Notes save as you type (one POST a second at most; the route keeps no audit row for them).
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(k.agenda.map(a => [a.key, a.note])));
  const [general, setGeneral] = useState(k.notes ?? '');
  // A note box shows for the items picked for the agenda (or already noted); the rest open on "Add a note".
  const [shown, setShown] = useState<Set<string>>(() => new Set(k.agenda.filter(a => a.onAgenda || a.note.trim()).map(a => a.key)));
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ state: 'idle' });
  const dirty = useRef<{ agenda: Record<string, string>; notes?: string }>({ agenda: {} });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async () => {
    const d = dirty.current; dirty.current = { agenda: {} };
    if (!Object.keys(d.agenda).length && d.notes === undefined) return;
    setSave({ state: 'saving' });
    const res = await api(`/api/admin/outreach/calls/${encodeURIComponent(k.id)}`, { method: 'POST', body: { action: 'save_notes', agendaNotes: d.agenda, ...(d.notes !== undefined ? { notes: d.notes } : {}) } });
    if (res.ok) setSave({ state: 'saved' });
    else { dirty.current = { agenda: { ...d.agenda, ...dirty.current.agenda }, notes: dirty.current.notes ?? d.notes }; setSave({ state: 'error', msg: res.error }); }
  }, [k.id]);
  const queue = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(flush, 1000); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const editNote = (key: string, v: string) => { setNotes(n => ({ ...n, [key]: v })); dirty.current.agenda[key] = v; queue(); };
  const editGeneral = (v: string) => { setGeneral(v); dirty.current.notes = v; queue(); };

  // How it went
  const [result, setResult] = useState<Result | null>(null);
  const [nextStep, setNextStep] = useState('');
  const [when, setWhen] = useState(todayInput(7));
  const [email, setEmail] = useState('');
  const [needEmail, setNeedEmail] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [logErr, setLogErr] = useState('');
  const [logged, setLogged] = useState<{ result: string; handoff: { ok: boolean; error?: string } | null } | null>(null);
  const tooEarly = new Date(k.scheduledAt).getTime() - EARLY_MS > now;

  async function log() {
    if (!result) { setLogErr('Pick how it went.'); return; }
    if (result === 'follow_up' && !when) { setLogErr('Pick the follow-up date.'); return; }
    if (needEmail && !email.trim()) { setLogErr('Add their email first.'); return; }
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setLogBusy(true); setLogErr('');
    const res = await api<{ result: string; handoff: { ok: boolean; error?: string } | null }>(`/api/admin/outreach/calls/${encodeURIComponent(k.id)}`, {
      method: 'POST', body: {
        action: 'log', result, agendaNotes: notes, notes: general,
        ...(nextStep.trim() ? { nextStep: nextStep.trim() } : {}),
        ...(result === 'follow_up' ? { followUpAt: dateInputToIso(when) } : {}),
        ...(result === 'not_now' && when ? { recheckAt: dateInputToIso(when) } : {}),
        ...(needEmail ? { email: email.trim() } : {}),
      },
    });
    setLogBusy(false);
    if (res.ok) { setLogged(res.data); dirty.current = { agenda: {} }; return; }
    if (res.body.code === 'email_needed') { setNeedEmail(true); setLogErr(res.error); return; }
    setLogErr(res.error);
  }

  const status = past ? (k.resultLabel ?? k.outcome.replace(/_/g, ' ')) : k.notLogged ? 'Not logged' : k.agenda.some(a => a.onAgenda) ? 'Prep ready' : 'Not prepared';
  const others = k.contacts.filter(c => c.name !== k.who.name);

  return (
    <>
      <div className={iq.title}><h2>{k.courseName}</h2><span>{status}</span></div>
      <p className={iq.sub}>{whenLabel(k.scheduledAt)} · {k.durationMin} min · {directionLabel(k.direction, past)}</p>
      <div className={iq.grid}>
        <div className={iq.side}>
          <section className={`${g.glass} ${iq.sec}`} aria-label="Agenda">
            <div className={iq.st}><b>Agenda</b>
              {open && <span className={iq.right} role="status">{save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved' : ''}</span>}
            </div>
            {save.state === 'error' && <div style={{ padding: '0 12px' }}><Msg ok={false}>Notes not saved: {save.msg}</Msg></div>}
            {k.agenda.map(a => (
              <div key={a.key} className={iq.ag}>
                <div><b>{a.label}</b>{a.onAgenda && <span className={iq.on}>On the agenda</span>}
                  {a.known && <small>Already known: {a.known}</small>}
                  {a.captured && <small>Captured: {a.captured}</small>}
                </div>
                {open && !logged
                  ? shown.has(a.key)
                    ? <textarea className={iq.agt} rows={1} aria-label={`Notes for ${a.short}`} value={notes[a.key] ?? ''} onChange={e => editNote(a.key, e.target.value)} />
                    : <button type="button" className={s.lnk} style={{ alignSelf: 'flex-start', fontWeight: 500 }} onClick={() => setShown(v => new Set(v).add(a.key))}>Add a note</button>
                  : (notes[a.key] ?? '').trim() ? <p className={iq.agn}>{notes[a.key]}</p> : null}
              </div>
            ))}
            {open && !logged ? (
              <div className={iq.ag}><label className={iq.f}>Other notes<textarea className={iq.agt} rows={2} value={general} onChange={e => editGeneral(e.target.value)} /></label></div>
            ) : general.trim() ? <div className={iq.ag}><b>Other notes</b><p className={iq.agn}>{general}</p></div> : null}
          </section>

          <section className={`${g.glass} ${iq.sec}`} aria-label={past || logged ? 'Outcome' : 'How it went'}>
            <div className={iq.st}><b>{past || logged ? 'Outcome' : 'How it went'}</b></div>
            {logged ? (
              <div style={{ padding: '0 12px 8px' }}>
                <Msg ok>Logged: {RESULTS.find(x => x[0] === logged.result)?.[1] ?? logged.result}.</Msg>
                {logged.result === 'said_yes' && logged.handoff?.ok !== false && <p className={iq.hint} style={{ margin: '8px 0 0' }}><Link href={`/admin/onboarding?key=i:${k.inquiryId}`}>Open in Onboarding ›</Link></p>}
                {logged.handoff && !logged.handoff.ok && <Msg ok={false}>The call is logged, but the hand-off didn&apos;t finish: {logged.handoff.error ?? 'try Said yes from the course page'}.</Msg>}
                <div className={iq.btns} style={{ padding: '8px 0 0' }}><button type="button" className={s.lnk} onClick={reload}>Refresh the call</button></div>
              </div>
            ) : past ? (
              <>
                <div className={iq.kv}><span>Outcome</span><b>{k.resultLabel ?? k.outcome.replace(/_/g, ' ')}</b></div>
                <div className={iq.kv}><span>Next</span><b>{[k.nextStep, k.followUpAt ? dateLabel(k.followUpAt) : ''].filter(Boolean).join(' · ') || '—'}</b></div>
              </>
            ) : open ? (
              <>
                <div className={iq.out} role="group" aria-label="Outcome">
                  {RESULTS.map(([v, l]) => <button key={v} type="button" aria-pressed={result === v} onClick={() => { setResult(v); setLogErr(''); }}>{l}</button>)}
                </div>
                <div className={iq.g2}>
                  <label className={iq.f}>Next step<input value={nextStep} maxLength={300} onChange={e => setNextStep(e.target.value)} /></label>
                  {(result === 'follow_up' || result === 'not_now') && <label className={iq.f}>{result === 'not_now' ? 'Recheck on' : 'When'}<input type="date" min={todayInput(1)} value={when} onChange={e => setWhen(e.target.value)} /></label>}
                  {needEmail && result === 'said_yes' && <label className={iq.f}>Their email (Onboarding needs one)<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
                </div>
                {tooEarly && <p className={iq.hint}>You can log it from 15 minutes before the call.</p>}
                {logErr && <div style={{ padding: '0 12px' }}><Msg ok={false}>{logErr}</Msg></div>}
                <div className={iq.btns}><button type="button" className={`${s.btn} ${s.pri}`} onClick={log} disabled={logBusy || tooEarly}>{logBusy ? 'Saving…' : 'Save'}</button></div>
              </>
            ) : <p className={iq.empty} style={{ borderTop: 0 }}>Not logged yet.</p>}
          </section>
        </div>

        <div className={iq.side}>
          <section className={`${g.glass} ${iq.sec} ${iq.prep}`} aria-label="The call">
            <div className={iq.st}><b>{past ? 'Call details' : 'The call'}</b></div>
            <div className={iq.pblk}>
              <small>{past ? 'When' : 'Starts'}</small><b>{whenLabel(k.scheduledAt)}</b>
              <span className={iq.cd}>{past ? '' : `${countdown(k.scheduledAt, now)} · `}{k.durationMin} min · {directionLabel(k.direction, past)}{k.phone ? ` · ${k.phone}` : ''}</span>
              {!past && (k.joinUrl || k.calcom) && (
                <div className={iq.pb}>
                  {k.joinUrl && <a className={`${s.btn} ${s.pri}`} href={k.joinUrl} target="_blank" rel="noopener noreferrer">Join in Cal.com</a>}
                  {k.calcom && <a className={s.btn} href={k.calcom.reschedule} target="_blank" rel="noopener noreferrer">Reschedule or cancel</a>}
                </div>
              )}
            </div>
            <div className={iq.pblk}>
              <small>On the call</small>
              <div className={iq.prow}><b>{k.who.name || 'Name not known'}</b><span>{[k.who.role, k.who.decides ? 'decides' : ''].filter(Boolean).join(' · ')}</span>{k.who.email && <span>{k.who.email}</span>}{k.who.phone && <span>{k.who.phone}</span>}</div>
              {others.map(c => <div key={c.name + c.email} className={iq.prow}><b>{c.name}</b><span>{[c.role, c.decisionMaker ? 'decides' : ''].filter(Boolean).join(' · ')}</span></div>)}
            </div>
            <div className={iq.pblk}>
              <small>Key facts</small>
              {([['Type', k.facts.kind], ['Books today by', k.facts.booksToday], ['Town', k.facts.town], ['Stage', k.stage], ['Last touch', k.facts.lastTouch]] as [string, string][])
                .map(([l, v]) => <div key={l} className={iq.pf}><span>{l}</span><b>{v || '—'}</b></div>)}
              <Link className={s.lnk} style={{ alignSelf: 'flex-start', marginTop: 6 }} href={`/admin/inquiries/${k.inquiryId}`}>Open course page ›</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default function CallPageRoute() {
  return (
    <Suspense fallback={null}>
      <CallInner />
    </Suspense>
  );
}
