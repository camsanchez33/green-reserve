'use client';
// DASH-D Home (Cam 2026-11-01, mockup S1): the shift handoff note, the course conditions, the week ahead by hour
// and the month against its goal. HOME-3 (Cam 2026-11-12, the approved charcoal Home mockup): staff notes as a
// plain list with "Add a note", conditions as cart path / greens / pins with a detail line each (no "set by"
// line), the week ahead in four clear steps of red with each cell's % printed, goals coloured by how close they
// are to hitting their target at today's pace (lib/goal-pace; no line, no key), and the next events. Data comes with /api/operator/home;
// each card writes through its own route and shows its own pending / error state (no silent failures).
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';
import { goalMetric, formatGoal, type GoalMetric } from '@/lib/course-goals';
import { CONDITION_FIELDS, HOME_CONDITIONS, CONDITION_NOTE_CHARS, mergeHomeConditions, conditionLabel, conditionsOffBookingPage, type CourseConditions, type ConditionKey } from '@/lib/course-conditions';
import { CONDITION_TONE, type GoalTone } from '@/lib/home-today';
import { goalPace, elapsedShare, type PaceTone } from '@/lib/goal-pace';
import type { HomeEvent } from '@/lib/home-board';

export type ShiftNote = { id: string; body: string; authorName: string; createdAt: string };
export type WeekAhead = { hours: number[]; days: { date: string; cells: { booked: number; offered: number }[] }[] };
export type Goals = { month: string; daysLeft: number; elapsed?: number; lastMonth: string; goals: { metric: GoalMetric; target: number; actual: number; lastMonth: number }[]; metrics: GoalMetric[] };
export type Conditions = { detail: CourseConditions; alert: string; updatedAt: string | null; detailAt: string | null };
export type { HomeEvent };

const when = (iso: string) => {
  const d = new Date(iso), t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  return days === 0 ? t : days === 1 ? `yesterday ${t}` : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${t}`;
};
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
const dayLabel = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const monthName = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
const fmtTime = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const shortDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const BTN = 'px-3 min-h-[36px] rounded-[7px] bg-white border border-line text-[13px] font-medium text-ink hover:bg-paper disabled:opacity-50';
const PRIMARY = 'px-3.5 min-h-[36px] rounded-[7px] bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50';
const INPUT = 'bg-paper border border-line rounded-[7px] px-3 py-2 text-[14px] text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10';
const LINK = 'text-[13px] font-semibold text-pine hover:underline underline-offset-4';
const TONE_TEXT: Record<PaceTone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', early: 'text-ink' };
const TONE_BG: Record<PaceTone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', early: 'bg-dot-neutral' };

/** The notes the last shift left — and a box to leave one for the next. */
export function ShiftNotes({ initial }: { initial: ShiftNote[] }) {
  const [notes, setNotes] = useState(initial);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function send(method: 'POST' | 'PATCH', body: object, key: string) {
    setBusy(key); setError('');
    const r = await dfetch<{ notes: ShiftNote[] }>('/api/operator/shift-notes', { method, body: JSON.stringify(body) });
    setBusy('');
    if (!r.ok) { setError(r.error); return false; }
    setNotes(r.data.notes); return true;
  }
  return (
    <Card className="px-5 py-4" aria-label="Staff notes">
      <div className="flex items-baseline gap-3 mb-3"><h2 className="text-[15px] font-semibold text-ink">Staff notes</h2>
        {!writing && <button type="button" className={'ml-auto ' + LINK} onClick={() => setWriting(true)}>Add a note</button>}</div>
      {notes.length === 0 && !writing && <p className="text-[13.5px] text-ink-muted">Nothing from the last shift.</p>}
      <div className="flex flex-col gap-2.5">
        {notes.map(n => (
          <div key={n.id} className="flex gap-3 items-start border-l-2 border-line pl-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-[14px] leading-snug text-ink whitespace-pre-line break-words">{n.body}</p>
              <div className="mt-0.5 text-[12px] text-ink-muted">{n.authorName || 'Staff'} · {when(n.createdAt)}</div>
            </div>
            <button type="button" className="text-[12.5px] font-medium text-ink-soft hover:text-ink disabled:opacity-50" disabled={busy === n.id} onClick={() => send('PATCH', { id: n.id }, n.id)}>{busy === n.id ? 'Saving…' : 'Done'}</button>
          </div>
        ))}
      </div>
      {writing && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={1000} autoFocus aria-label="Note for the next shift"
            className={'w-full ' + INPUT} placeholder="For the next shift" />
          <div className="flex justify-end gap-2">
            <button className={BTN} onClick={() => { setWriting(false); setText(''); setError(''); }}>Cancel</button>
            <button className={PRIMARY} disabled={!text.trim() || busy === 'new'}
              onClick={async () => { if (await send('POST', { body: text }, 'new')) { setWriting(false); setText(''); } }}>{busy === 'new' ? 'Saving…' : 'Save note'}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
    </Card>
  );
}

/** Cart path, greens, pins — a choice and a detail line each (HOME-3). Saving merges: what Home doesn't show is kept. */
export function ConditionsCard({ initial, canEdit }: { initial: Conditions; canEdit: boolean }) {
  const [c, setC] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CourseConditions>(initial.detail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = () => { setDraft(c.detail); setEditing(true); setError(''); };
  async function save() {
    setBusy(true); setError('');
    // Range and the course's own lines aren't shown here, so they are kept as they were (mergeHomeConditions).
    const detail = mergeHomeConditions(c.detail, draft);
    const r = await dfetch<{ detail: CourseConditions; updatedAt: string | null }>('/api/operator/conditions', { method: 'PATCH', body: JSON.stringify({ detail }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setC(x => ({ ...x, detail: r.data.detail, updatedAt: r.data.updatedAt, detailAt: r.data.updatedAt })); setEditing(false);
  }
  const options = (k: ConditionKey) => CONDITION_FIELDS.find(f => f.key === k)!.options;
  return (
    <Card className="px-5 py-4 flex flex-col gap-3" aria-label="Course conditions">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Course conditions</h2>
        {canEdit && !editing && <button type="button" className={'ml-auto ' + LINK} onClick={start}>Change</button>}
      </div>
      {/* Golfers see these for 18 hours from when they were set (golferConditionLines) — say so when they've gone. */}
      {conditionsOffBookingPage(c.detail, c.detailAt) && (
        <p className="-mt-1 text-[12.5px] text-ink-soft"><StatusDot status="warn" label="" /> Off your booking page — change them to show today&apos;s</p>
      )}
      {!editing ? (
        <div className="flex flex-col">
          {HOME_CONDITIONS.map((f, i) => {
            const v = c.detail[f.key];
            const tone = v ? CONDITION_TONE[f.key]?.[v] ?? 'ok' : null;
            return (
              <div key={f.key} className={'grid grid-cols-[8px_88px_minmax(0,1fr)] gap-x-2.5 items-baseline py-2 ' + (i ? 'border-t border-line' : 'pt-0')}>
                {tone ? <StatusDot status={tone} label="" /> : <span />}
                <span className="text-[13px] text-ink-muted">{f.label}</span>
                <b className={'text-[13.5px] ' + (v ? 'font-semibold text-ink' : 'font-normal text-ink-muted')}>{v ? conditionLabel(f.key, v) : 'Not set'}</b>
                {c.detail.notes?.[f.key] && <small className="col-start-3 text-[12.5px] text-ink-muted">{c.detail.notes[f.key]}</small>}
              </div>
            );
          })}
          {/* Not edited here, but golfers see them too — shown so nothing reaches the booking page unseen. */}
          {c.detail.range && <div className="grid grid-cols-[8px_88px_minmax(0,1fr)] gap-x-2.5 items-baseline py-2 border-t border-line"><span /><span className="text-[13px] text-ink-muted">Range</span><b className="text-[13.5px] font-semibold text-ink">{conditionLabel('range', c.detail.range)}</b></div>}
          {(c.detail.lines ?? []).map(l => <div key={l} className="grid grid-cols-[8px_minmax(0,1fr)] gap-x-2.5 py-2 border-t border-line text-[13px] text-ink"><span />{l}</div>)}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {HOME_CONDITIONS.map(f => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-ink-muted">{f.label}</span>
              <div role="radiogroup" aria-label={f.label} className="grid gap-1 p-1 rounded-[7px] bg-paper" style={{ gridTemplateColumns: `repeat(${options(f.key).length}, minmax(0, 1fr))` }}>
                {options(f.key).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={draft[f.key] === k}
                    onClick={() => setDraft(d => ({ ...d, [f.key]: d[f.key] === k ? undefined : k }))}
                    className={'px-1 py-1 min-h-[32px] rounded-[5px] text-[13px] leading-tight whitespace-normal break-words ' + (draft[f.key] === k ? 'bg-white text-ink font-semibold shadow-card' : 'text-ink-muted hover:text-ink')}>{label}</button>
                ))}
              </div>
              {draft[f.key] && (
                <input value={draft.notes?.[f.key] ?? ''} maxLength={CONDITION_NOTE_CHARS} aria-label={`${f.label} detail`} placeholder="Detail (optional)"
                  onChange={e => setDraft(d => ({ ...d, notes: { ...(d.notes ?? {}), [f.key]: e.target.value } }))} className={INPUT} />
              )}
            </div>
          ))}
          {(draft.range || (draft.lines ?? []).length > 0) && (
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              {draft.range && <div className="flex items-center gap-2 text-[13.5px] text-ink"><span className="flex-1">Range: {conditionLabel('range', draft.range)}</span>
                <button type="button" className="text-[12.5px] font-medium text-ink-soft hover:text-bad" onClick={() => setDraft(d => ({ ...d, range: undefined }))}>Remove</button></div>}
              {(draft.lines ?? []).map(l => <div key={l} className="flex items-center gap-2 text-[13.5px] text-ink"><span className="flex-1 min-w-0 break-words">{l}</span>
                <button type="button" className="text-[12.5px] font-medium text-ink-soft hover:text-bad" onClick={() => setDraft(d => ({ ...d, lines: (d.lines ?? []).filter(x => x !== l) }))}>Remove</button></div>)}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className={BTN} onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
            <button className={PRIMARY} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
      {c.alert && <div className="text-[13px] rounded-[7px] bg-paper px-3 py-2"><span className="text-ink-muted">Golfers see: </span>{c.alert}</div>}
      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
    </Card>
  );
}

/** Four clear steps (Cam 2026-11-12, "easier to differentiate"): under a quarter, half, three-quarters, nearly full. */
export const heatStep = (pct: number) => pct < 0.05 ? 0 : pct < 0.25 ? 1 : pct < 0.5 ? 2 : pct < 0.75 ? 3 : 4;
const HEAT = ['', '16%', '38%', '66%', '95%'];

/** The next seven days by hour: how full each hour is, the % in each cell, in red. */
export function WeekAheadCard({ week, canDeal }: { week: WeekAhead; canDeal: boolean }) {
  if (week.hours.length === 0) return <Card className="px-5 py-4"><h2 className="text-[15px] font-semibold text-ink">Week ahead</h2><p className="mt-2 text-[14px] text-ink-muted">No tee times in the next seven days.</p></Card>;
  return (
    <Card className="px-5 py-4 min-w-0" aria-label="Week ahead">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3"><h2 className="text-[15px] font-semibold text-ink">Week ahead</h2>
        <span className="ml-auto text-[12.5px] text-ink-muted">How full each hour is</span></div>
      <div className="overflow-x-auto">
        <div className="grid gap-[3px] items-center text-[11.5px] min-w-[420px]" style={{ gridTemplateColumns: `40px repeat(${week.hours.length}, minmax(22px,1fr)) 52px` }} role="table" aria-label="Week ahead: share of spots booked, by hour">
          <div role="row" className="contents">
            <div />
            {week.hours.map(h => <div key={h} className="text-ink-muted text-center" role="columnheader">{hourLabel(h)}</div>)}
            <div className="text-ink-muted text-right" role="columnheader">Booked</div>
          </div>
          {week.days.map(d => (
            <div key={d.date} className="contents" role="row">
              <div className="text-ink-muted truncate" role="rowheader">{dayLabel(d.date)}</div>
              {d.cells.map((c, j) => {
                const pct = c.offered ? c.booked / c.offered : 0;
                const lv = c.offered ? heatStep(pct) : 0;
                return <div key={j} role="cell" title={`${dayLabel(d.date)} ${hourLabel(week.hours[j])} · ${c.offered ? `${c.booked} of ${c.offered} spots booked (${Math.round(pct * 100)}%)` : 'no tee times'}`}
                  className="h-[22px] rounded-[5px] grid place-items-center text-[10.5px] font-semibold tabular-nums"
                  style={!c.offered ? { boxShadow: 'inset 0 0 0 1px var(--color-line)' }
                    : { backgroundColor: lv ? `color-mix(in srgb, var(--color-bad) ${HEAT[lv]}, transparent)` : 'var(--op-heat0)', color: lv >= 3 ? `var(--op-heat-ink${lv})` : 'var(--color-ink)' }}>
                  {lv ? Math.round(pct * 100) : ''}</div>;
              })}
              {(() => { const b = d.cells.reduce((s, c) => s + c.booked, 0), o = d.cells.reduce((s, c) => s + c.offered, 0);
                return <div role="cell" className="text-right tabular-nums text-ink-muted">{o ? b : '—'}</div>; })()}
            </div>
          ))}
        </div>
      </div>
      {/* Cam 2026-11-06 ("have our technology set updated prices with your parameters"): demand pricing. */}
      {canDeal && <div className="mt-3 flex flex-wrap items-center justify-end gap-x-2 text-[12.5px]"><span className="text-ink-muted">Quiet hours?</span><Link href="/dashboard/schedules#demand-pricing" className="font-medium text-pine hover:underline underline-offset-4">Let GreenReserve price them for you</Link></div>}
    </Card>
  );
}

/** HOME-3 (Cam 2026-11-12, "maybe an events coming up thing"): the next events and how full they are. No money. */
export function EventsCard({ events }: { events: HomeEvent[] }) {
  return (
    <Card className="px-5 py-4" aria-label="Events coming up">
      <div className="flex items-baseline gap-3 mb-2"><h2 className="text-[15px] font-semibold text-ink">Events coming up</h2>
        <Link href="/dashboard/events" className={'ml-auto ' + LINK}>All events</Link></div>
      {events.length === 0 ? <p className="text-[13.5px] text-ink-muted">None planned.</p> : (
        <div className="flex flex-col divide-y divide-line">
          {events.map(e => (
            <Link key={e.id} href="/dashboard/events" className="py-2.5 first:pt-1 last:pb-0 min-w-0 hover:opacity-80">
              <div className="text-[14px] text-ink truncate">{e.name}</div>
              <div className="text-[12.5px] text-ink-muted truncate tabular-nums">{shortDay(e.date)} · {fmtTime(e.startTime)}{e.format === 'shotgun' ? ' shotgun' : ''} · {e.capacity ? `${e.onList} of ${e.capacity} players` : `${e.onList} player${e.onList === 1 ? '' : 's'}`}</div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/** HOME-2/HOME-3: this month's goals; each bar is progress and its colour where the month ends at today's pace (lib/goal-pace). */
export function GoalsCard({ goals, canSet, onSaved }: { goals: Goals; canSet: boolean; onSaved: () => void }) {
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<GoalMetric | 'new' | null>(null);
  const [metric, setMetric] = useState<GoalMetric | ''>('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unset = goals.metrics.filter(m => !goals.goals.some(g => g.metric === m));
  const open = (m: GoalMetric | 'new', v = '') => { setEditing(m); setMetric(m === 'new' ? (unset[0] ?? '') : m); setValue(v); setError(''); };
  const [y, mo] = goals.month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const dayOfMonth = daysInMonth - goals.daysLeft + 1;
  async function put(m: GoalMetric, target: number | null) {
    setBusy(true); setError('');
    const r = await dfetch('/api/operator/goals', { method: 'PUT', body: JSON.stringify({ month: goals.month, metric: m, target }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setEditing(null); onSaved();
  }
  function save() {
    if (!metric) return;
    const n = Number(value.replace(/[$,%\s]/g, ''));
    const u = goalMetric(metric).unit;
    if (!(n > 0) || (u === 'pct' && n > 100)) { setError(u === 'pct' ? 'Enter a percent from 1 to 100.' : 'Enter a number more than 0.'); return; }
    put(metric, Math.round(u === 'cents' ? n * 100 : n));
  }
  const toInput = (m: GoalMetric, v: number) => String(goalMetric(m).unit === 'cents' ? Math.round(v / 100) : v);
  const unit = metric ? goalMetric(metric).unit : 'count';
  const form = (
    <div className="flex flex-wrap gap-2">
      {editing === 'new' && (
        <select value={metric} onChange={e => setMetric(e.target.value as GoalMetric)} aria-label="What the goal is for" className={'flex-1 min-w-[150px] ' + INPUT}>
          {unset.map(m => <option key={m} value={m}>{goalMetric(m).label}</option>)}
        </select>
      )}
      <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} autoFocus aria-label="Goal"
        placeholder={unit === 'cents' ? '$60,000' : unit === 'pct' ? '75%' : '1,000'} className={'w-28 min-w-0 tabular-nums ' + INPUT} />
      <button className={BTN} onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
      <button className={PRIMARY} disabled={busy || !metric} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
  return (
    <Card className="px-5 py-4 flex flex-col gap-3 min-w-0" aria-label={`${monthName(goals.month)} goals`}>
      <div className="flex items-baseline gap-3"><h2 className="text-[15px] font-semibold text-ink">{monthName(goals.month)} goals</h2>
        {canSet && <button type="button" className={'ml-auto ' + LINK} onClick={() => { setManaging(m => !m); setEditing(null); setError(''); }}>{managing ? 'Done' : 'Set'}</button>}</div>
      {goals.goals.length === 0 && editing !== 'new' && <p className="text-[13.5px] text-ink-muted">No goals set.</p>}
      {goals.goals.map(g => {
        const m = goalMetric(g.metric);
        const pct = Math.min(100, g.target ? (g.actual / g.target) * 100 : 0);
        // GOAL-PACE (Cam 2026-11-12): the bar is progress; the colour is where the month ends at today's pace — grey for the first 3 days.
        const { tone } = goalPace({ progress: g.actual, target: g.target, share: elapsedShare(goals.elapsed ?? dayOfMonth, daysInMonth), rate: m.unit === 'pct', daysElapsed: goals.elapsed ?? dayOfMonth });
        return (
          <div key={g.metric} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[13.5px] text-ink" title={`${m.def} ${monthName(goals.lastMonth)}: ${formatGoal(g.metric, g.lastMonth)}.`}>{m.label}</span>
              <b className={'ml-auto text-[13.5px] font-semibold tabular-nums ' + TONE_TEXT[tone]}>{formatGoal(g.metric, g.actual)} of {formatGoal(g.metric, g.target)}</b>
            </div>
            <div className="h-1.5 rounded-full bg-line-soft"><div className={'h-full rounded-full ' + TONE_BG[tone]} style={{ width: `${pct}%` }} /></div>
            {managing && editing !== g.metric && <div className="flex gap-3 text-[12.5px]"><button className="font-medium text-pine" onClick={() => open(g.metric, toInput(g.metric, g.target))}>Change</button>
              <button className="font-medium text-ink-soft hover:text-bad" disabled={busy} onClick={() => put(g.metric, null)}>Remove</button></div>}
            {editing === g.metric && form}
          </div>
        );
      })}
      {managing && unset.length > 0 && editing !== 'new' && <button type="button" className="self-start text-[13px] font-medium text-pine" onClick={() => open('new')}>Add a goal</button>}
      {editing === 'new' && form}
      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
    </Card>
  );
}
