'use client';
// COURSES_SHEET_SPEC CS-3 §2 — the "Next check-in" card on a live course's
// Overview. The IC-2 cards' shape with the check-in agenda: schedule a call
// (date/time/length/direction/number, agenda pre-checked, free text) or just
// set a date; log it (Talked / No answer, one answer per agenda item, notes,
// the next check-in date defaulting to +90 days). Owns its pending/error
// state (no-silent-failures) and calls POST /api/admin/course-calls.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, CalendarClock, Check } from 'lucide-react';
import {
  CHECKIN_AGENDA, CHECKIN_EVERY_DAYS, checkInSignal, scheduledCheckIn, lastContact, fmtLastContact,
  type CheckinCallLike,
} from '@/lib/course-checkin';
import { fmtCallTime, easternToIso, easternParts, parseJson, DIRECTION_LABEL, OUTCOME_LABEL } from '@/lib/inquiry-call';

export type CourseCallRow = CheckinCallLike & {
  id: string; kind: string; scheduledAt: string; outcome: string; durationMin: number; direction: string; phone: string;
  agendaJson: string; agendaExtra: string; answersJson: string; notes: string; completedAt: string | null;
};

type Props = {
  courseId: string;
  operatorName: string;
  phone: string;
  nextCheckInAt: string | null;
  /** every call for this course — check-ins, plus the linked inquiry's discovery calls (they count as contact) */
  calls: CourseCallRow[];
  onRefresh: () => Promise<void>;
  /** bump to open the schedule form and scroll here (?checkin=1) */
  focus: { n: number } | null;
};

const H = { 'Content-Type': 'application/json' };
const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10 focus:outline-none transition-colors';
const lbl = 'block text-[10px] uppercase tracking-[0.1em] text-ink-muted mb-1';
const btnP = 'bg-pine hover:bg-pine-hover disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors';
const btnO = 'bg-paper hover:bg-line border border-line text-ink disabled:opacity-50 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors';
const LENGTHS = [15, 20, 30, 45];
const THIRTY_MIN = 30 * 60_000;
const DAY = 86_400_000;

type ApiResult = { ok: boolean; status: number; data: Record<string, unknown> };
async function post(courseId: string, action: string, extra: Record<string, unknown>): Promise<ApiResult> {
  const r = await fetch('/api/admin/course-calls', { method: 'POST', headers: H, body: JSON.stringify({ courseId, action, ...extra }) });
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
          className={'px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ' + (value === v ? 'bg-pine text-white' : 'bg-white text-ink-soft hover:text-ink hover:bg-paper')}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function CourseCheckInCard({ courseId, operatorName, phone, nextCheckInAt, calls, onRefresh, focus }: Props) {
  const checkins = useMemo(() => calls.filter(c => c.kind === 'checkin'), [calls]);
  const scheduled = scheduledCheckIn(checkins);
  const signal = checkInSignal({ nextCheckInAt }, checkins);
  const last = lastContact(calls);
  const first = (operatorName || '').split(' ')[0] || 'them';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [forceSchedule, setForceSchedule] = useState(false);
  const [forceLog, setForceLog] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    if (scheduled) setForceLog(true); else setForceSchedule(true);
    wrap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const stateLine = signal.state === 'none' ? 'No check-in set'
    : signal.state === 'overdue' ? `Overdue by ${signal.days} day${signal.days === 1 ? '' : 's'} — was ${fmtCallTime(signal.at!)}`
    : signal.state === 'due' ? `Due ${signal.days === 0 ? 'today' : 'in ' + signal.days + ' day' + (signal.days === 1 ? '' : 's')} — ${fmtCallTime(signal.at!)}`
    : `Next ${fmtCallTime(signal.at!)}`;

  return (
    <div ref={wrap} className="bg-white border border-line rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-ink-muted">
            <Phone className={'w-3.5 h-3.5 ' + (signal.state === 'overdue' ? 'text-bad' : signal.state === 'due' ? 'text-warn' : 'text-pine')} />Next check-in
          </div>
          <div className={'text-sm font-medium mt-1 ' + (signal.state === 'overdue' ? 'text-bad' : signal.state === 'due' ? 'text-warn' : 'text-ink')}>{stateLine}</div>
          <div className="text-xs text-ink-muted mt-0.5">{fmtLastContact(last)}</div>
        </div>
      </div>

      {scheduled ? (
        <LogCard key={scheduled.id} call={scheduled} courseId={courseId} first={first} busy={busy} setBusy={setBusy} setError={setError} setNotice={setNotice}
          forceOpen={forceLog} onForceOpen={() => setForceLog(true)} onRefresh={onRefresh} />
      ) : (
        <ScheduleCard courseId={courseId} first={first} phone={phone} nextCheckInAt={nextCheckInAt} busy={busy} setBusy={setBusy} setError={setError} setNotice={setNotice}
          open={forceSchedule || signal.state !== 'scheduled'} onOpen={() => setForceSchedule(true)} onRefresh={async () => { setForceSchedule(false); await onRefresh(); }} />
      )}

      {notice && (
        <div className="mt-3 rounded-md border bg-ok/5 border-ok/20 text-ok px-3 py-2 text-xs leading-relaxed flex items-start justify-between gap-3">
          <span>{notice}</span><button onClick={() => setNotice('')} className="shrink-0 opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-md border bg-bad/5 border-bad/20 text-bad px-3 py-2 text-xs leading-relaxed flex items-start justify-between gap-3">
          <span>{error}</span><button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}
    </div>
  );
}

// ── Schedule a check-in (or just set the date) ────────────────────────
function ScheduleCard({ courseId, first, phone, nextCheckInAt, busy, setBusy, setError, setNotice, open, onOpen, onRefresh }: {
  courseId: string; first: string; phone: string; nextCheckInAt: string | null;
  busy: boolean; setBusy: (b: boolean) => void; setError: (m: string) => void; setNotice: (m: string) => void;
  open: boolean; onOpen: () => void; onRefresh: () => Promise<void>;
}) {
  const seed = nextCheckInAt ? easternParts(nextCheckInAt) : easternParts(new Date(Date.now() + DAY));
  const [date, setDate] = useState(seed.date);
  const [time, setTime] = useState(nextCheckInAt ? seed.time : '10:00');
  const [durationMin, setDurationMin] = useState(20);
  const [direction, setDirection] = useState<'we_call' | 'they_call'>('we_call');
  const [num, setNum] = useState(phone || '');
  const [agenda, setAgenda] = useState<Set<string>>(() => new Set(CHECKIN_AGENDA.map(a => a.key)));
  const [agendaExtra, setAgendaExtra] = useState('');
  const [dateOnly, setDateOnly] = useState(false);
  const iso = easternToIso(date, time);
  const toggle = (k: string) => setAgenda(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  if (!open) {
    return (
      <div className="mt-3 flex items-center gap-3">
        <button onClick={onOpen} className={btnO}><CalendarClock className="w-3.5 h-3.5" />Turn it into a call</button>
        <span className="text-xs text-ink-faint">A date is set but no call is on the books yet.</span>
      </div>
    );
  }

  const schedule = async () => {
    if (!iso) { setError('Pick a date and a time.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await post(courseId, 'schedule_checkin', { scheduledAt: iso, durationMin, direction, phone: num, agenda: Array.from(agenda), agendaExtra });
      if (!r.ok) { setError(errText(r)); return; }
      setNotice(`Check-in call set for ${fmtCallTime(iso)}.`);
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };
  const setDateOnlyNow = async () => {
    const at = easternToIso(date, '12:00');
    if (!at) { setError('Pick a date.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await post(courseId, 'set_next_checkin', { at });
      if (!r.ok) { setError(errText(r)); return; }
      setNotice(`Next check-in set to ${fmtCallTime(at)} — no call on the books.`);
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-4 pt-4 border-t border-line-soft">
      <div className="flex items-center gap-3 mb-3">
        <Segmented value={dateOnly ? 'date' : 'call'} onChange={v => setDateOnly(v === 'date')} disabled={busy}
          options={[['call', 'Schedule a call'], ['date', 'Just set a date']]} />
        {dateOnly && <span className="text-xs text-ink-faint">for “{first} said call back in November”</span>}
      </div>
      <div className={'grid gap-3 mb-3 ' + (dateOnly ? 'grid-cols-[1fr]' : 'grid-cols-[1fr_1fr_120px]')}>
        <div><label className={lbl}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={iCls} disabled={busy} /></div>
        {!dateOnly && <div><label className={lbl}>Time (ET)</label><input type="time" value={time} onChange={e => setTime(e.target.value)} className={iCls} disabled={busy} /></div>}
        {!dateOnly && (
          <div>
            <label className={lbl}>Length</label>
            <select value={durationMin} onChange={e => setDurationMin(Number(e.target.value))} className={iCls} disabled={busy}>
              {LENGTHS.map(n => <option key={n} value={n}>{n} min</option>)}
            </select>
          </div>
        )}
      </div>
      {!dateOnly && (
        <>
          <div className="flex items-end gap-4 mb-3 flex-wrap">
            <div>
              <label className={lbl}>Who calls whom</label>
              <Segmented value={direction} onChange={setDirection} disabled={busy} options={[['we_call', 'I call them'], ['they_call', 'They call me']]} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className={lbl}>Number</label>
              <input value={num} onChange={e => setNum(e.target.value)} placeholder="(555) 555-5555" className={iCls} disabled={busy} />
            </div>
          </div>
          <label className={lbl}>To go over</label>
          <div className="border border-line rounded-md divide-y divide-line-soft mb-2">
            {CHECKIN_AGENDA.map(a => (
              <label key={a.key} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-paper">
                <input type="checkbox" checked={agenda.has(a.key)} onChange={() => toggle(a.key)} disabled={busy} className="shrink-0" />
                <span className="text-sm text-ink">{a.label}</span>
              </label>
            ))}
          </div>
          <input value={agendaExtra} onChange={e => setAgendaExtra(e.target.value)} placeholder="Add something specific to this course…" className={iCls + ' mb-3'} disabled={busy} />
        </>
      )}
      <div className="flex items-center gap-2">
        {dateOnly
          ? <button onClick={setDateOnlyNow} disabled={busy} className={btnP}><CalendarClock className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Set the date'}</button>
          : <button onClick={schedule} disabled={busy || !iso} className={btnP}><CalendarClock className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Schedule check-in'}</button>}
      </div>
    </div>
  );
}

// ── Log the check-in ──────────────────────────────────────────────────
function LogCard({ call, courseId, first, busy, setBusy, setError, setNotice, forceOpen, onForceOpen, onRefresh }: {
  call: CourseCallRow; courseId: string; first: string;
  busy: boolean; setBusy: (b: boolean) => void; setError: (m: string) => void; setNotice: (m: string) => void;
  forceOpen: boolean; onForceOpen: () => void; onRefresh: () => Promise<void>;
}) {
  const at = new Date(call.scheduledAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const open = forceOpen || now >= at - THIRTY_MIN;
  const [outcome, setOutcome] = useState<'talked' | 'no_answer'>('talked');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState(() => easternParts(new Date(Date.now() + CHECKIN_EVERY_DAYS * DAY)).date);
  const [moving, setMoving] = useState(false);
  const [reDate, setReDate] = useState(() => easternParts(call.scheduledAt).date);
  const [reTime, setReTime] = useState(() => easternParts(call.scheduledAt).time);

  const agendaItems = useMemo(() => {
    const on = parseJson<string[]>(call.agendaJson, []);
    const keys = on.length ? on : CHECKIN_AGENDA.map(a => a.key);
    return CHECKIN_AGENDA.filter(a => keys.includes(a.key));
  }, [call.agendaJson]);

  const header = `${fmtCallTime(call.scheduledAt)} · ${call.durationMin} min · ${DIRECTION_LABEL[call.direction] || call.direction}${call.phone ? ' · ' + call.phone : ''}`;

  const move = async () => {
    const iso = easternToIso(reDate, reTime);
    if (!iso) { setError('Pick a date and a time.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await post(courseId, 'reschedule_checkin', { callId: call.id, scheduledAt: iso });
      if (!r.ok) { setError(errText(r)); return; }
      setMoving(false); setNotice(`Check-in moved to ${fmtCallTime(iso)}.`);
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };
  const saveTalked = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const nextIso = easternToIso(nextDate, '12:00');
      const r = await post(courseId, 'log_checkin', { callId: call.id, outcome: 'talked', answers, notes, nextCheckInAt: nextIso });
      if (!r.ok) { setError(errText(r)); return; }
      setNotice(`Logged. Next check-in ${r.data.nextCheckInAt ? fmtCallTime(String(r.data.nextCheckInAt)) : 'set'}.`);
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };
  const noAnswer = async () => {
    const iso = easternToIso(reDate, reTime);
    if (!iso) { setError('Pick a new date and time.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const logged = await post(courseId, 'log_checkin', { callId: call.id, outcome: 'no_answer', notes });
      if (!logged.ok) { setError(errText(logged)); return; }
      const r = await post(courseId, 'schedule_checkin', { scheduledAt: iso, durationMin: call.durationMin, direction: call.direction, phone: call.phone, agenda: parseJson<string[]>(call.agendaJson, []), agendaExtra: call.agendaExtra });
      if (!r.ok) { setError('The no-answer was logged, but the new call was not set up — ' + errText(r)); await onRefresh(); return; }
      setNotice(`No answer logged. Trying again ${fmtCallTime(iso)}.`);
      await onRefresh();
    } catch (e) { setError('Error: ' + e); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-4 pt-4 border-t border-line-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">{open ? 'Log the check-in' : 'Check-in call set'}</div>
          <p className="text-xs text-ink-muted mt-0.5">{header}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!open && <button onClick={onForceOpen} className="text-xs font-medium text-pine hover:underline">Log it now</button>}
          {!moving && <button onClick={() => setMoving(true)} disabled={busy} className="text-xs text-ink-muted hover:text-ink">Move the call</button>}
        </div>
      </div>
      {moving && (
        <div className="mt-3 flex items-end gap-2 flex-wrap">
          <div><label className={lbl}>New date</label><input type="date" value={reDate} onChange={e => setReDate(e.target.value)} className={iCls} disabled={busy} /></div>
          <div><label className={lbl}>Time (ET)</label><input type="time" value={reTime} onChange={e => setReTime(e.target.value)} className={iCls} disabled={busy} /></div>
          <button onClick={move} disabled={busy} className={btnP}>{busy ? 'Saving…' : 'Move'}</button>
          <button onClick={() => setMoving(false)} disabled={busy} className="text-xs text-ink-muted hover:text-ink px-1 py-1.5">Cancel</button>
        </div>
      )}
      {open && (
        <div className="mt-4">
          <div className="mb-4">
            <label className={lbl}>Outcome</label>
            <Segmented value={outcome} onChange={setOutcome} disabled={busy} options={[['talked', 'Talked'], ['no_answer', 'No answer — reschedule']]} />
          </div>
          {outcome === 'no_answer' ? (
            <div>
              <div className="flex items-end gap-2 flex-wrap mb-3">
                <div><label className={lbl}>Try again on</label><input type="date" value={reDate} onChange={e => setReDate(e.target.value)} className={iCls} disabled={busy} /></div>
                <div><label className={lbl}>Time (ET)</label><input type="time" value={reTime} onChange={e => setReTime(e.target.value)} className={iCls} disabled={busy} /></div>
              </div>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" className={iCls + ' mb-3'} disabled={busy} />
              <button onClick={noAnswer} disabled={busy || !easternToIso(reDate, reTime)} className={btnP}><CalendarClock className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Reschedule'}</button>
            </div>
          ) : (
            <div>
              <label className={lbl}>What {first} said</label>
              <div className="border border-line rounded-md divide-y divide-line-soft mb-3">
                {agendaItems.map(a => (
                  <div key={a.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 items-center px-3 py-2">
                    <div className="text-sm text-ink">{a.short}<div className="text-[11px] text-ink-faint">{a.label}</div></div>
                    <input value={answers[a.key] ?? ''} onChange={e => setAnswers(p => ({ ...p, [a.key]: e.target.value }))} placeholder="—" className={iCls} disabled={busy} />
                  </div>
                ))}
                {call.agendaExtra && <div className="px-3 py-2 text-xs text-ink-soft"><span className="text-ink-muted">Also:</span> {call.agendaExtra}</div>}
              </div>
              <label className={lbl}>Notes</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else from the call" className={iCls + ' mb-3'} disabled={busy} />
              <div className="flex items-end gap-3 flex-wrap pt-3 border-t border-line-soft">
                <div>
                  <label className={lbl}>Next check-in</label>
                  <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className={iCls} disabled={busy} />
                </div>
                <span className="text-[11px] text-ink-faint pb-2.5">defaults to {CHECKIN_EVERY_DAYS} days out</span>
                <button onClick={saveTalked} disabled={busy} className={btnP + ' ml-auto'}><Check className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Human one-liner for the Records tab: "Check-in call · Nov 3 · Talked · 20 min". */
export function describeCheckIn(c: CourseCallRow): string {
  const d = new Date(c.completedAt ?? c.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  return `${c.kind === 'discovery' ? 'Discovery call' : 'Check-in call'} · ${d} · ${OUTCOME_LABEL[c.outcome] || c.outcome} · ${c.durationMin} min`;
}
