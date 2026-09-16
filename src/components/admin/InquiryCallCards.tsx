'use client';
// INQUIRY_CALL_SPEC IC-2 — the two discovery-call cards on the inquiry
// detail page. Stage-independent: the call can happen at any active stage.
//
//   Set up the call  — shows when nothing is scheduled and nothing was talked.
//   Log the call     — shows when a call is scheduled (opens 30 min before
//                      its time; earlier only on request — never a dead end).
//
// The cards own their pending/error state (no-silent-failures) and call the
// same PATCH /api/admin/inquiries actions IC-1 added. The page passes back the
// two things only it can do: run `request_details` (so the Setup-sheet result
// box shows) and open the Reject drawer.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, PhoneOff, CalendarClock, Check, AlertTriangle, ChevronDown, ChevronRight, RotateCw, Send } from 'lucide-react';
import {
  AGENDA, agendaStatus, defaultAgenda, nextCall, overdueCall, latestCall, parseJson,
  fmtCallTime, easternToIso, easternParts, OUTCOME_LABEL, DIRECTION_LABEL,
  type CallLike, type InquiryLike,
} from '@/lib/inquiry-call';
import { stillNeed } from '@/lib/inquiry-needs';
import {
  CALL_FIELDS, DAY_SHORT, parseCallAnswers, summarize, hasAnyCapture,
  type CallAnswers, type ItemAnswers, type FieldSpec,
} from '@/lib/call-answers';

export type CallRow = CallLike & {
  id: string; scheduledAt: string; outcome: string; durationMin: number; direction: string; phone: string;
  agendaJson: string; agendaExtra: string; answersJson: string; notes: string;
  followUpAt: string | null; completedAt: string | null;
};

type InquiryForCards = InquiryLike & {
  id: string; contactName: string; email: string; phone: string;
  /** SC-3: when the "pick a call time" link went out. */
  callInviteSentAt?: string | null;
  detailsJson?: string | null; needsJson?: string | null;
  events?: { toStatus?: string; fromStatus?: string }[] | null;
  calls?: CallRow[] | null;
};

export type CallFocus = { what: 'setup' | 'log' | 'skip'; n: number } | null;

type Props = {
  inquiry: InquiryForCards;
  /** page-level busy flag — disables the buttons while the page itself is acting */
  processing: boolean;
  onRefresh: () => Promise<void>;
  /** the page's own request_details action (it shows the sheet-link result box) */
  onRequestSheet: () => Promise<void>;
  /** open the Reject drawer with "Not a fit" preselected */
  onNotAFit: () => void;
  focus: CallFocus;
};

const H = { 'Content-Type': 'application/json' };
const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10 focus:outline-none transition-colors';
const lbl = 'block text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-1';
const btnP = 'bg-pine hover:bg-pine-hover disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors';
const btnO = 'bg-paper hover:bg-line border border-line text-ink disabled:opacity-50 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors';
const LENGTHS = [15, 30, 45, 60];
const THIRTY_MIN = 30 * 60_000;

type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };
async function patch(id: string, action: string, extra: Record<string, unknown>): Promise<ApiResult> {
  const r = await fetch('/api/admin/inquiries', { method: 'PATCH', headers: H, body: JSON.stringify({ id, action, ...extra }) });
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, data };
}
const errText = (r: ApiResult) => `Failed (${r.status}): ${String(r.data.error || 'unknown error')}`;

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex border border-line rounded-md overflow-hidden">
      {options.map(([v, label]) => (
        <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
          className={'px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ' + (
            value === v ? 'bg-pine text-white' : 'bg-white text-ink-soft hover:text-ink hover:bg-paper'
          )}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Notice({ tone, children, onClose }: { tone: 'ok' | 'bad' | 'warn'; children: React.ReactNode; onClose?: () => void }) {
  const cls = tone === 'ok' ? 'bg-ok/5 border-ok/20 text-ok' : tone === 'bad' ? 'bg-bad/5 border-bad/20 text-bad' : 'bg-warn/5 border-warn/20 text-warn';
  return (
    <div className={'mt-3 rounded-md border px-3 py-2 text-xs leading-relaxed flex items-start justify-between gap-3 ' + cls}>
      <span>{children}</span>
      {onClose && <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100">Dismiss</button>}
    </div>
  );
}

/** "Skip the call" — the reason field + confirm, shared by both cards. */
function SkipInline({ inquiryId, contactFirst, busy, setBusy, onDone, onError, open, setOpen }: {
  inquiryId: string; contactFirst: string; busy: boolean; setBusy: (b: boolean) => void;
  onDone: () => Promise<void>; onError: (m: string) => void; open: boolean; setOpen: (o: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={busy} className={btnO}>
        <PhoneOff className="w-3.5 h-3.5" />Skip the call
      </button>
    );
  }
  const submit = async () => {
    setBusy(true); onError('');
    try {
      const r = await patch(inquiryId, 'skip_call', { reason });
      if (!r.ok) { onError(errText(r)); return; }
      setOpen(false); setReason('');
      await onDone();
    } catch (e) { onError('Error: ' + e); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex items-end gap-2 flex-1 min-w-[280px]">
      <div className="flex-1">
        <label className={lbl}>Why skip the call with {contactFirst}?</label>
        <input ref={ref} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Met in person at the course on Sep 10" className={iCls}
          onKeyDown={e => { if (e.key === 'Enter' && reason.trim().length >= 5) submit(); }} />
      </div>
      <button type="button" onClick={submit} disabled={busy || reason.trim().length < 5} className={btnP}>Skip</button>
      <button type="button" onClick={() => { setOpen(false); setReason(''); }} disabled={busy} className="text-xs text-ink-muted hover:text-ink px-1 py-1.5">Cancel</button>
    </div>
  );
}

export default function InquiryCallCards({ inquiry, processing, onRefresh, onRequestSheet, onNotAFit, focus }: Props) {
  const calls = useMemo(() => inquiry.calls ?? [], [inquiry.calls]);
  const sheet = useMemo(() => parseJson<Record<string, unknown> | null>(inquiry.detailsJson, null), [inquiry.detailsJson]);
  const needs = useMemo(() => parseJson<Record<string, unknown> | null>(inquiry.needsJson, null), [inquiry.needsJson]);
  const scheduled = nextCall(calls) ?? overdueCall(calls);
  const talked = latestCall(calls.filter(c => c.outcome === 'talked'));
  const skipped = !!(inquiry.callSkippedReason && inquiry.callSkippedReason.trim());
  const contactFirst = (inquiry.contactName || '').split(' ')[0] || 'them';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [forceSetup, setForceSetup] = useState(false);
  const [forceLog, setForceLog] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // The build-gate notice points here ("Log the call" / "skip it") — open
  // whichever card that needs and bring it into view.
  useEffect(() => {
    if (!focus) return;
    if (focus.what === 'log') setForceLog(true);
    if (focus.what === 'setup') setForceSetup(true);
    if (focus.what === 'skip') { setSkipOpen(true); if (!scheduled) setForceSetup(true); }
    wrap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const disabled = busy || processing;
  const refresh = async () => { await onRefresh(); };

  // ── which card ─────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (scheduled) {
    body = (
      <LogCard key={scheduled.id} call={scheduled} inquiry={inquiry} calls={calls} sheet={sheet} needs={needs}
        disabled={disabled} busy={busy} setBusy={setBusy} setError={setError} setNotice={setNotice}
        forceOpen={forceLog} onForceOpen={() => setForceLog(true)}
        onRefresh={refresh} onRequestSheet={onRequestSheet} onNotAFit={onNotAFit}
        skipOpen={skipOpen} setSkipOpen={setSkipOpen} contactFirst={contactFirst} />
    );
  } else if (talked && !forceSetup) {
    body = (
      <div className="flex items-center gap-3 text-sm text-ink">
        <Phone className="w-4 h-4 text-ok shrink-0" />
        <span>Call logged — {fmtCallTime(talked.scheduledAt)} · Talked · {talked.durationMin} min.</span>
        <button onClick={() => setForceSetup(true)} className="text-xs font-medium text-pine hover:underline ml-auto">Set up another call</button>
      </div>
    );
  } else if (skipped && !forceSetup) {
    body = (
      <div className="flex items-center gap-3 text-sm text-ink">
        <PhoneOff className="w-4 h-4 text-ink-muted shrink-0" />
        <span>Call skipped — {inquiry.callSkippedReason}</span>
        <button onClick={() => setForceSetup(true)} className="text-xs font-medium text-pine hover:underline ml-auto">Set one up anyway</button>
      </div>
    );
  } else {
    body = (
      <SetupCard inquiry={inquiry} sheet={sheet} needs={needs} calls={calls} disabled={disabled} busy={busy} setBusy={setBusy}
        setError={setError} setNotice={setNotice} onRefresh={async () => { setForceSetup(false); await refresh(); }}
        skipOpen={skipOpen} setSkipOpen={setSkipOpen} contactFirst={contactFirst} showSkip={!talked && !skipped} />
    );
  }

  return (
    <div ref={wrap} className="mt-4 max-w-3xl bg-white border border-line rounded-lg px-5 py-4">
      {body}
      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {error && <Notice tone="bad" onClose={() => setError('')}>{error}</Notice>}
    </div>
  );
}

// ── Set up the call ───────────────────────────────────────────────────
function SetupCard({ inquiry, sheet, needs, calls, disabled, busy, setBusy, setError, setNotice, onRefresh, skipOpen, setSkipOpen, contactFirst, showSkip }: {
  inquiry: InquiryForCards; sheet: Record<string, unknown> | null; needs: Record<string, unknown> | null; calls: CallRow[];
  disabled: boolean; busy: boolean; setBusy: (b: boolean) => void; setError: (m: string) => void;
  setNotice: (n: { tone: 'ok' | 'warn'; text: string } | null) => void; onRefresh: () => Promise<void>;
  skipOpen: boolean; setSkipOpen: (o: boolean) => void; contactFirst: string; showSkip: boolean;
}) {
  const tomorrow = useMemo(() => easternParts(new Date(Date.now() + 86_400_000)).date, []);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState('10:00');
  const [durationMin, setDurationMin] = useState(30);
  const [direction, setDirection] = useState<'we_call' | 'they_call'>('we_call');
  const [phone, setPhone] = useState(inquiry.phone || '');
  const [agenda, setAgenda] = useState<Set<string>>(() => new Set(defaultAgenda(inquiry, sheet, needs)));
  const [agendaExtra, setAgendaExtra] = useState('');
  const [emailContact, setEmailContact] = useState(true);
  const status = useMemo(() => agendaStatus(inquiry, sheet, needs, calls), [inquiry, sheet, needs, calls]);

  const iso = easternToIso(date, time);
  const toggle = (k: string) => setAgenda(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // SC-3 §1: let them pick from Cam's calendar instead.
  const sendLink = async () => {
    setBusy(true); setError(''); setNotice(null);
    try {
      const r = await patch(inquiry.id, 'send_call_invite', {});
      if (!r.ok) { setError(errText(r)); return; }
      if (r.data.sent !== true) {
        setError(`The booking link did not send (${String(r.data.error || 'unknown')}). Try Resend in a minute, or set the call up by hand below.`);
        await onRefresh();
        return;
      }
      setNotice({ tone: 'ok', text: `Booking link emailed to ${inquiry.email}. It is good for 21 days — the time shows here once ${contactFirst} picks one.` });
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };
  const inviteDay = inquiry.callInviteSentAt
    ? new Date(inquiry.callInviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    : null;

  const submit = async () => {
    if (!iso) { setError('Pick a date and a time for the call.'); return; }
    setBusy(true); setError(''); setNotice(null);
    try {
      const r = await patch(inquiry.id, 'schedule_call', {
        scheduledAt: iso, durationMin, direction, phone, agenda: Array.from(agenda), agendaExtra, emailContact,
      });
      if (!r.ok) { setError(errText(r)); return; }
      const when = fmtCallTime(iso);
      if (r.data.emailSent === true) setNotice({ tone: 'ok', text: `Call set up for ${when}. Confirmation emailed to ${inquiry.email}.` });
      else if (r.data.emailSent === false) setNotice({ tone: 'warn', text: `Call set up for ${when}, but the confirmation email did not send (${String(r.data.emailError || 'unknown')}). Tell ${contactFirst} the time yourself.` });
      else setNotice({ tone: 'ok', text: `Call set up for ${when}. No email was sent.` });
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink"><Phone className="w-4 h-4 text-pine" />Set up the call</div>
          <p className="text-xs text-ink-muted mt-0.5">Required before the draft course is built — you can send the setup sheet before or after.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 px-3 py-2 border border-line rounded-md bg-paper">
        <div className="text-xs text-ink-soft min-w-0">
          {inviteDay
            ? <><span className="font-medium text-ink">Booking link sent {inviteDay}</span> · not booked yet</>
            : <>Or let {contactFirst} pick a time from your calendar.</>}
        </div>
        <button type="button" onClick={sendLink} disabled={disabled} className={btnO}>
          <Send className="w-3.5 h-3.5" />{busy ? 'Sending…' : inviteDay ? 'Resend the link' : 'Send a booking link'}
        </button>
      </div>

      <div className="grid grid-cols-[1fr_1fr_120px] gap-3 mb-4">
        <div><label className={lbl}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={iCls} disabled={disabled} /></div>
        <div><label className={lbl}>Time (ET)</label><input type="time" value={time} onChange={e => setTime(e.target.value)} className={iCls} disabled={disabled} /></div>
        <div>
          <label className={lbl}>Length</label>
          <select value={durationMin} onChange={e => setDurationMin(Number(e.target.value))} className={iCls} disabled={disabled}>
            {LENGTHS.map(n => <option key={n} value={n}>{n} min</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-end gap-4 mb-4 flex-wrap">
        <div>
          <label className={lbl}>Who calls whom</label>
          <Segmented value={direction} onChange={setDirection} disabled={disabled}
            options={[['we_call', 'I call them'], ['they_call', 'They call me']]} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className={lbl}>{direction === 'we_call' ? 'Number to dial' : 'Number they should dial from'}</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" className={iCls} disabled={disabled} />
        </div>
      </div>

      <div className="mb-4">
        <label className={lbl}>To go over on the call</label>
        <div className="border border-line rounded-md divide-y divide-line-soft">
          {status.map(row => {
            const item = AGENDA.find(a => a.key === row.key)!;
            // IF-1 §4a: an always-on item with a form answer reads as "confirm and dig", not "ask".
            const hint = item.always ? (row.answered ? `They said: ${row.answered}` : 'always') : row.answered ? `answered: ${row.answered}` : 'not on form';
            return (
              <label key={row.key} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-paper">
                <input type="checkbox" checked={agenda.has(row.key)} onChange={() => toggle(row.key)} disabled={disabled} className="shrink-0" />
                <span className="text-sm text-ink flex-1 min-w-0">{row.label}</span>
                <span className={'text-[11px] shrink-0 max-w-[40%] truncate ' + (row.answered && !item.always ? 'text-ink-faint' : 'text-ink-muted')} title={hint}>{hint}</span>
              </label>
            );
          })}
        </div>
        <input value={agendaExtra} onChange={e => setAgendaExtra(e.target.value)} placeholder="Add something specific to this course…" className={iCls + ' mt-2'} disabled={disabled} />
      </div>

      <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-line-soft">
        <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
          <input type="checkbox" checked={emailContact} onChange={e => setEmailContact(e.target.checked)} disabled={disabled} />
          Email {contactFirst} a confirmation
        </label>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {!skipOpen && (
            <button type="button" onClick={submit} disabled={disabled || !iso} className={btnP}>
              <CalendarClock className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Set up call'}
            </button>
          )}
          {showSkip && (
            <SkipInline inquiryId={inquiry.id} contactFirst={contactFirst} busy={disabled} setBusy={setBusy}
              onDone={onRefresh} onError={setError} open={skipOpen} setOpen={setSkipOpen} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Log the call ──────────────────────────────────────────────────────
function LogCard({ call, inquiry, calls, sheet, needs, disabled, busy, setBusy, setError, setNotice, forceOpen, onForceOpen, onRefresh, onRequestSheet, onNotAFit, skipOpen, setSkipOpen, contactFirst }: {
  call: CallRow; inquiry: InquiryForCards; calls: CallRow[]; sheet: Record<string, unknown> | null; needs: Record<string, unknown> | null;
  disabled: boolean; busy: boolean; setBusy: (b: boolean) => void; setError: (m: string) => void;
  setNotice: (n: { tone: 'ok' | 'warn'; text: string } | null) => void;
  forceOpen: boolean; onForceOpen: () => void; onRefresh: () => Promise<void>; onRequestSheet: () => Promise<void>; onNotAFit: () => void;
  skipOpen: boolean; setSkipOpen: (o: boolean) => void; contactFirst: string;
}) {
  const at = new Date(call.scheduledAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const open = forceOpen || now >= at - THIRTY_MIN;

  const [outcome, setOutcome] = useState<'talked' | 'no_answer' | 'not_a_fit'>('talked');
  // IC-5: structured answers, hydrated from the call so a half-logged call
  // survives a reload (the card autosaves as Cam types — see below).
  const [answers, setAnswers] = useState<CallAnswers>(() => parseCallAnswers(call.answersJson));
  const [notes, setNotes] = useState(call.notes || '');
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [emailRecap, setEmailRecap] = useState(true);
  const setItem = (key: string, item: ItemAnswers) => {
    dirty.current = true;
    setAnswers(a => ({ v: 2, items: { ...a.items, [key]: item } }));
  };
  const setNotesDirty = (v: string) => { dirty.current = true; setNotes(v); };
  const toggleOpen = (key: string) => setOpenKeys(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // Autosave: 800 ms after the last change → save_call_draft. The status line
  // says so, and a failure is shown with a retry (no-silent-failures).
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftState, setDraftState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'failed'; at?: string; err?: string }>({ status: 'idle' });
  // Each draft request carries a sequence number; a response that comes back
  // after a newer request (or after the final Save) is ignored, so a slow
  // autosave can never repaint over what was logged.
  const draftSeq = useRef(0);
  const saveDraftNow = async () => {
    const seq = ++draftSeq.current;
    setDraftState({ status: 'saving' });
    try {
      const r = await patch(inquiry.id, 'save_call_draft', { callId: call.id, answers, notes });
      if (seq !== draftSeq.current) return;
      if (!r.ok) { setDraftState({ status: 'failed', err: errText(r) }); return; }
      dirty.current = false;
      setDraftState({ status: 'saved', at: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) });
    } catch (e) { if (seq === draftSeq.current) setDraftState({ status: 'failed', err: String(e) }); }
  };
  useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveDraftNow, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [answers, notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [followUp, setFollowUp] = useState(() => easternParts(new Date(at + 3 * 86_400_000)).date);
  const [moving, setMoving] = useState(false);
  const [reDate, setReDate] = useState(() => easternParts(call.scheduledAt).date);
  const [reTime, setReTime] = useState(() => easternParts(call.scheduledAt).time);
  const [emailNew, setEmailNew] = useState(true);

  const agendaKeys = useMemo(() => {
    const on = parseJson<string[]>(call.agendaJson, []);
    const keys = on.length ? on : AGENDA.map(a => a.key);
    return AGENDA.filter(a => keys.includes(a.key));
  }, [call.agendaJson]);
  const status = useMemo(() => agendaStatus(inquiry, sheet, needs, calls.filter(c => c.id !== call.id)), [inquiry, sheet, needs, calls, call.id]);
  const sheetAlreadySent = !(inquiry.status === 'pending' || inquiry.status === 'in_review');

  // "Still need from them" recomputed live as answers are typed — the draft
  // call stands in for this one so the list shrinks while Cam types.
  const still = useMemo(() => {
    const draft: CallLike = { ...call, outcome: 'talked', answersJson: JSON.stringify(answers) };
    return stillNeed(inquiry, sheet, needs, [...calls.filter(c => c.id !== call.id), draft]);
  }, [inquiry, sheet, needs, calls, call, answers]);

  const header = `${fmtCallTime(call.scheduledAt)} · ${call.durationMin} min · ${DIRECTION_LABEL[call.direction] || call.direction}${call.phone ? ' · ' + call.phone : ''}`;
  const overdue = now > at + 12 * 3600_000;

  const move = async () => {
    const iso = easternToIso(reDate, reTime);
    if (!iso) { setError('Pick a date and a time.'); return; }
    setBusy(true); setError(''); setNotice(null);
    try {
      const r = await patch(inquiry.id, 'reschedule_call', { callId: call.id, scheduledAt: iso });
      if (!r.ok) { setError(errText(r)); return; }
      setMoving(false);
      setNotice({ tone: 'ok', text: `Call moved to ${fmtCallTime(iso)}. No email was sent — tell ${contactFirst} if they need to know.` });
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };

  const followUpIso = followUp ? new Date(followUp + 'T12:00:00').toISOString() : null;

  const saveTalked = async (sendSheet: boolean) => {
    setBusy(true); setError(''); setNotice(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      draftSeq.current++; // any autosave still in flight is now stale
      const r = await patch(inquiry.id, 'log_call', { callId: call.id, outcome: 'talked', answers, notes, followUpAt: followUpIso, emailRecap });
      if (!r.ok) { setError(errText(r)); return; }
      setDraftState({ status: 'idle' });
      const recap = r.data.emailSent === true ? ` Recap emailed to ${inquiry.email}.`
        : r.data.emailSent === false ? ` The recap email did not send (${String(r.data.emailError || 'unknown')}).`
        : emailRecap ? ' No recap was sent — nothing was captured to send.' : '';
      if (sendSheet) { if (recap) setNotice({ tone: r.data.emailSent === false ? 'warn' : 'ok', text: 'Call logged.' + recap }); await onRequestSheet(); return; }
      setNotice({ tone: r.data.emailSent === false ? 'warn' : 'ok', text: 'Call logged.' + recap });
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };

  const noAnswerReschedule = async () => {
    const iso = easternToIso(reDate, reTime);
    if (!iso) { setError('Pick a new date and time.'); return; }
    setBusy(true); setError(''); setNotice(null);
    try {
      const logged = await patch(inquiry.id, 'log_call', { callId: call.id, outcome: 'no_answer', notes });
      if (!logged.ok) { setError(errText(logged)); return; }
      const r = await patch(inquiry.id, 'schedule_call', {
        scheduledAt: iso, durationMin: call.durationMin, direction: call.direction, phone: call.phone,
        agenda: parseJson<string[]>(call.agendaJson, []), agendaExtra: call.agendaExtra, emailContact: emailNew,
      });
      if (!r.ok) { setError('The no-answer was logged, but the new call was not set up — ' + errText(r)); await onRefresh(); return; }
      const when = fmtCallTime(iso);
      if (r.data.emailSent === true) setNotice({ tone: 'ok', text: `No answer logged. New call set for ${when}; confirmation emailed to ${inquiry.email}.` });
      else if (r.data.emailSent === false) setNotice({ tone: 'warn', text: `No answer logged. New call set for ${when}, but the email did not send (${String(r.data.emailError || 'unknown')}). Tell ${contactFirst} yourself.` });
      else setNotice({ tone: 'ok', text: `No answer logged. New call set for ${when}. No email was sent.` });
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };

  const notAFit = async () => {
    setBusy(true); setError(''); setNotice(null);
    try {
      const r = await patch(inquiry.id, 'log_call', { callId: call.id, outcome: 'not_a_fit', answers, notes });
      if (!r.ok) { setError(errText(r)); return; }
      await onRefresh();
      onNotAFit();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <Phone className={'w-4 h-4 ' + (overdue ? 'text-warn' : 'text-pine')} />
            {open ? 'Log the call' : 'Call set up'}
          </div>
          <p className="text-xs text-ink-muted mt-0.5">{header}{overdue ? ' · went by without a log' : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!open && <button onClick={onForceOpen} className="text-xs font-medium text-pine hover:underline">Log it now</button>}
          {!moving && <button onClick={() => setMoving(true)} disabled={disabled} className="text-xs text-ink-muted hover:text-ink">Move the call</button>}
        </div>
      </div>

      {moving && (
        <div className="mt-3 flex items-end gap-2 flex-wrap">
          <div><label className={lbl}>New date</label><input type="date" value={reDate} onChange={e => setReDate(e.target.value)} className={iCls} disabled={disabled} /></div>
          <div><label className={lbl}>Time (ET)</label><input type="time" value={reTime} onChange={e => setReTime(e.target.value)} className={iCls} disabled={disabled} /></div>
          <button onClick={move} disabled={disabled} className={btnP}>{busy ? 'Saving…' : 'Move'}</button>
          <button onClick={() => setMoving(false)} disabled={disabled} className="text-xs text-ink-muted hover:text-ink px-1 py-1.5">Cancel</button>
        </div>
      )}

      {open && (
        <div className="mt-4">
          <div className="mb-4">
            <label className={lbl}>Outcome</label>
            <Segmented value={outcome} onChange={setOutcome} disabled={disabled}
              options={[['talked', 'Talked'], ['no_answer', 'No answer — reschedule'], ['not_a_fit', 'Not a fit — close']]} />
          </div>

          {outcome === 'no_answer' ? (
            <div>
              <div className="flex items-end gap-2 flex-wrap mb-3">
                <div><label className={lbl}>Try again on</label><input type="date" value={reDate} onChange={e => setReDate(e.target.value)} className={iCls} disabled={disabled} /></div>
                <div><label className={lbl}>Time (ET)</label><input type="time" value={reTime} onChange={e => setReTime(e.target.value)} className={iCls} disabled={disabled} /></div>
                <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer pb-2.5">
                  <input type="checkbox" checked={emailNew} onChange={e => setEmailNew(e.target.checked)} disabled={disabled} />
                  Email {contactFirst} the new time
                </label>
              </div>
              <textarea rows={2} value={notes} onChange={e => setNotesDirty(e.target.value)} placeholder="Notes (optional) — left a voicemail, wrong number…" className={iCls + ' mb-3'} disabled={disabled} />
              <div className="flex items-center gap-2">
                <button onClick={noAnswerReschedule} disabled={disabled || !easternToIso(reDate, reTime)} className={btnP}>
                  <CalendarClock className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Reschedule'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className={lbl + ' mb-0'}>What you got <span className="normal-case tracking-normal text-ink-faint">— the course sees these on their setup sheet; notes below stay private</span></label>
                <DraftStatus state={draftState} onRetry={saveDraftNow} />
              </div>
              <div className="border border-line rounded-md divide-y divide-line-soft mb-3">
                {agendaKeys.map(item => (
                  <AnswerRow key={item.key} agendaKey={item.key} short={item.short} label={item.label}
                    prior={status.find(s => s.key === item.key)?.answered ?? null}
                    value={answers.items[item.key] ?? { fields: {}, note: '' }}
                    open={openKeys.has(item.key)} onToggle={() => toggleOpen(item.key)}
                    onChange={it => setItem(item.key, it)} disabled={disabled} />
                ))}
                {call.agendaExtra && (
                  <div className="px-3 py-2 text-xs text-ink-soft"><span className="text-ink-muted">Also on the agenda:</span> {call.agendaExtra}</div>
                )}
              </div>

              <label className={lbl}>Notes</label>
              <textarea rows={3} value={notes} onChange={e => setNotesDirty(e.target.value)} placeholder="Anything else from the call" className={iCls + ' mb-3'} disabled={disabled} />

              <div className="flex items-start gap-6 flex-wrap mb-4">
                <div className="flex-1 min-w-[240px]">
                  <label className={lbl}>Still need from them</label>
                  {still.length === 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-ok"><Check className="w-3.5 h-3.5" />Nothing outstanding</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {still.map(s => <span key={s.key} className="text-[11px] text-ink-soft bg-paper border border-line rounded-md px-2 py-0.5">{s.label}</span>)}
                    </div>
                  )}
                </div>
                <div>
                  <label className={lbl}>Follow up by</label>
                  <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} className={iCls} disabled={disabled} />
                </div>
              </div>
              {outcome === 'talked' && (
                <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer mb-4">
                  <input type="checkbox" checked={emailRecap} onChange={e => setEmailRecap(e.target.checked)} disabled={disabled} />
                  Email {contactFirst} a recap of what we captured
                </label>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-line-soft">
                {outcome === 'talked' && !sheetAlreadySent && (
                  <>
                    <button onClick={() => saveTalked(true)} disabled={disabled} className={btnP}>
                      <Check className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save + send pre-filled sheet'}
                    </button>
                    <button onClick={() => saveTalked(false)} disabled={disabled} className={btnO}>Save, don’t send yet</button>
                  </>
                )}
                {outcome === 'talked' && sheetAlreadySent && (
                  <button onClick={() => saveTalked(false)} disabled={disabled} className={btnP}>
                    <Check className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save'}
                  </button>
                )}
                {outcome === 'not_a_fit' && (
                  <button onClick={notAFit} disabled={disabled} className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 disabled:opacity-50 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save and close as not a fit'}
                  </button>
                )}
                <div className="ml-auto">
                  <SkipInline inquiryId={inquiry.id} contactFirst={contactFirst} busy={disabled} setBusy={setBusy}
                    onDone={onRefresh} onError={setError} open={skipOpen} setOpen={setSkipOpen} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── IC-5: structured answer rows ──────────────────────────────────────
function DraftStatus({ state, onRetry }: { state: { status: 'idle' | 'saving' | 'saved' | 'failed'; at?: string; err?: string }; onRetry: () => void }) {
  if (state.status === 'idle') return null;
  if (state.status === 'saving') return <span className="text-[11px] text-ink-faint shrink-0">Saving…</span>;
  if (state.status === 'saved') return <span className="text-[11px] text-ink-faint shrink-0">Saved · {state.at}</span>;
  return (
    <span className="text-[11px] text-bad shrink-0 flex items-center gap-1.5" title={state.err}>
      Not saved
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-medium hover:underline"><RotateCw className="w-3 h-3" />retry</button>
    </span>
  );
}

function AnswerRow({ agendaKey, short, label, prior, value, open, onToggle, onChange, disabled }: {
  agendaKey: string; short: string; label: string; prior: string | null; value: ItemAnswers;
  open: boolean; onToggle: () => void; onChange: (v: ItemAnswers) => void; disabled: boolean;
}) {
  const specs = CALL_FIELDS[agendaKey] ?? [];
  const summary = summarize(agendaKey, value);
  const captured = hasAnyCapture(value);
  const setField = (k: string, v: unknown) => {
    const fields = { ...value.fields };
    if (v === undefined || v === '' || v === null || (Array.isArray(v) && v.length === 0)) delete fields[k]; else fields[k] = v;
    onChange({ ...value, fields });
  };
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full grid grid-cols-[16px_minmax(0,1fr)] gap-2 items-start px-3 py-2 text-left hover:bg-paper transition-colors">
        {open ? <ChevronDown className="w-4 h-4 text-ink-muted mt-0.5" /> : <ChevronRight className="w-4 h-4 text-ink-muted mt-0.5" />}
        <div className="min-w-0">
          <div className="text-sm text-ink">{short}</div>
          {captured
            ? <div className="text-[11px] text-ink-soft truncate" title={summary}>{summary}</div>
            : prior
              ? <div className="text-[11px] text-ink-faint truncate" title={prior}>Not captured · on file: {prior}</div>
              : <div className="text-[11px] italic text-ink-faint">Not captured — still needed</div>}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-9">
          <div className="text-[11px] text-ink-muted mb-2">{label}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
            {specs.map(spec => (
              <div key={spec.key} className={spec.type === 'days' || spec.type === 'text' ? 'sm:col-span-2' : ''}>
                <label className={lbl}>{spec.label}</label>
                <FieldInput spec={spec} value={value.fields[spec.key]} onChange={v => setField(spec.key, v)} disabled={disabled} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className={lbl}>Note</label>
              <input value={value.note} onChange={e => onChange({ ...value, note: e.target.value })} placeholder="Anything else on this" className={iCls} disabled={disabled} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({ spec, value, onChange, disabled }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  switch (spec.type) {
    case 'money': return <MoneyInput cents={typeof value === 'number' ? value : undefined} onChange={onChange} disabled={disabled} />;
    case 'time': return <input type="time" value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} className={iCls} disabled={disabled} />;
    case 'date': return <input type="date" value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} className={iCls} disabled={disabled} />;
    case 'days': {
      const days = Array.isArray(value) ? (value as number[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={spec.label}>
          {DAY_SHORT.map((d, i) => {
            const on = days.includes(i);
            return (
              <button key={d} type="button" aria-pressed={on} disabled={disabled}
                onClick={() => onChange(on ? days.filter(x => x !== i) : [...days, i].sort())}
                className={'px-2.5 py-1 rounded-md border text-xs transition-colors ' + (on ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line bg-paper text-ink hover:border-pine/40')}>
                {d}
              </button>
            );
          })}
        </div>
      );
    }
    case 'bool':
      return (
        <div className="flex gap-1.5" role="group" aria-label={spec.label}>
          {([true, false] as const).map(b => {
            const on = value === b;
            return (
              <button key={String(b)} type="button" aria-pressed={on} disabled={disabled}
                onClick={() => onChange(on ? undefined : b)}
                className={'px-3 py-1 rounded-md border text-xs transition-colors ' + (on ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line bg-paper text-ink hover:border-pine/40')}>
                {b ? 'Yes' : 'No'}
              </button>
            );
          })}
        </div>
      );
    case 'enum':
      return (
        <select value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} className={iCls} disabled={disabled}>
          <option value="">—</option>
          {(spec.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      );
    default:
      return <input value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} className={iCls} disabled={disabled} />;
  }
}

/** Dollars in the box, integer cents in the record. Local text so "45.50" can be typed. */
const parseDollars = (v: string): number | undefined => {
  const s = v.trim().replace(/^\$/, '').replace(/,/g, '');
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

function MoneyInput({ cents, onChange, disabled }: { cents: number | undefined; onChange: (cents: number | undefined) => void; disabled: boolean }) {
  const [text, setText] = useState(() => (cents === undefined ? '' : (cents / 100).toFixed(2).replace(/\.00$/, '')));
  // Typed but not a usable amount → say so, rather than quietly saving nothing.
  const invalid = text.trim() !== '' && parseDollars(text) === undefined;
  return (
    <div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint">$</span>
        <input inputMode="decimal" value={text} disabled={disabled} aria-invalid={invalid || undefined}
          className={iCls + ' pl-6' + (invalid ? ' border-bad focus:border-bad/60 focus:ring-bad/10' : '')} placeholder="0"
          onChange={e => { const v = e.target.value; setText(v); onChange(parseDollars(v)); }} />
      </div>
      {invalid && <p className="mt-1 text-[11px] text-bad">Not a valid amount — nothing saved for this field.</p>}
    </div>
  );
}

/** Human one-liner for the Activity tab: "Call · Fri Sep 12, 2:00 PM · Talked · 30 min". */
export function describeCall(c: CallRow): string {
  return `Call · ${fmtCallTime(c.scheduledAt)} · ${OUTCOME_LABEL[c.outcome] || c.outcome} · ${c.durationMin} min`;
}
