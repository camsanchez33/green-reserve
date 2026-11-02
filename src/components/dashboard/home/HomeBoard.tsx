'use client';
// DASH-D Home (Cam 2026-11-01, mockup S1): the shift handoff note, the course
// conditions, the week ahead by hour and the month against its goal. Data comes
// with /api/operator/home; each card writes through its own route and shows its
// own pending / error state (no silent failures).
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';
import { CONDITION_FIELDS, conditionLabel, type CourseConditions, type ConditionKey } from '@/lib/course-conditions';

export type ShiftNote = { id: string; body: string; authorName: string; createdAt: string };
export type WeekAhead = { hours: number[]; days: { date: string; cells: { booked: number; offered: number }[] }[] };
export type MonthGoal = { month: string; goalCents: number | null; collectedCents: number; daysLeft: number; neededPerDayCents: number | null; lastMonth: string; lastMonthPerDayCents: number };
export type Conditions = { detail: CourseConditions; alert: string; updatedAt: string | null };

const usd0 = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}`;
const dayLabel = (d: string, i: number) => i === 0 ? 'Today' : `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${Number(d.slice(8, 10))}`;
const monthName = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
const BTN = 'px-3 min-h-[36px] rounded-[7px] bg-white border border-line text-[13px] font-medium text-ink hover:bg-paper disabled:opacity-50';

/** The note the last shift left — and a box to leave one for the next. */
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
    <Card className="px-5 py-4">
      {notes.length === 0 && !writing && (
        <div className="flex items-center gap-3"><span className="flex-1 text-[14px] text-ink-muted">No note from the last shift.</span><button className={BTN} onClick={() => setWriting(true)}>Leave a note</button></div>
      )}
      {notes.map(n => (
        <div key={n.id} className="flex gap-4 items-start py-1 [&+&]:border-t [&+&]:border-line [&+&]:pt-3 [&+&]:mt-2">
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] text-ink-muted"><span className="font-semibold text-ink">Shift note</span>{n.authorName ? ` · ${n.authorName}` : ''} · {when(n.createdAt)}</div>
            <p className="mt-1 text-[14px] leading-relaxed text-ink whitespace-pre-line break-words">{n.body}</p>
          </div>
          <button className={BTN} disabled={busy === n.id} onClick={() => send('PATCH', { id: n.id }, n.id)}>{busy === n.id ? 'Saving…' : 'Done'}</button>
        </div>
      ))}
      {notes.length > 0 && !writing && <button className="mt-2 text-[13px] font-medium text-ink-soft hover:text-ink" onClick={() => setWriting(true)}>Leave a note</button>}
      {writing && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={1000} autoFocus aria-label="Note for the next shift"
            className="w-full bg-paper border border-line rounded-[7px] px-3 py-2.5 text-[14px] text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10" placeholder="For the next shift" />
          <div className="flex justify-end gap-2">
            <button className={BTN} onClick={() => { setWriting(false); setText(''); setError(''); }}>Cancel</button>
            <button className="px-3.5 min-h-[36px] rounded-[7px] bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50" disabled={!text.trim() || busy === 'new'}
              onClick={async () => { if (await send('POST', { body: text }, 'new')) { setWriting(false); setText(''); } }}>{busy === 'new' ? 'Saving…' : 'Save note'}</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-bad">{error}</p>}
    </Card>
  );
}

/** Carts, range, greens, pins — two taps each — and the alert golfers see. */
export function ConditionsCard({ initial, canEdit }: { initial: Conditions; canEdit: boolean }) {
  const [c, setC] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CourseConditions>(initial.detail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    const r = await dfetch<{ detail: CourseConditions; updatedAt: string | null }>('/api/operator/conditions', { method: 'PATCH', body: JSON.stringify({ detail: draft }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setC(x => ({ ...x, detail: r.data.detail, updatedAt: r.data.updatedAt })); setEditing(false);
  }
  return (
    <Card className="px-5 py-4 flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Course conditions</h2>
        {c.updatedAt && <span className="text-[12px] text-ink-muted">{when(c.updatedAt)}</span>}
        {canEdit && !editing && <button className="ml-auto text-[13px] font-medium text-pine" onClick={() => { setDraft(c.detail); setEditing(true); }}>Update</button>}
      </div>
      {!editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CONDITION_FIELDS.map(f => (
            <div key={f.key}><div className="text-[12px] text-ink-muted">{f.label}</div><div className="mt-0.5 text-[14px] font-semibold text-ink">{conditionLabel(f.key, c.detail[f.key]) || <span className="font-normal text-ink-faint">Not set</span>}</div></div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {CONDITION_FIELDS.map(f => (
            <div key={f.key} className="flex flex-wrap items-center gap-2">
              <span className="w-16 text-[13px] text-ink-soft">{f.label}</span>
              <div role="radiogroup" aria-label={f.label} className="flex flex-wrap gap-1 p-1 rounded-[7px] bg-paper">
                {f.options.map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={draft[f.key as ConditionKey] === k}
                    onClick={() => setDraft(d => ({ ...d, [f.key]: d[f.key as ConditionKey] === k ? undefined : k }))}
                    className={'px-2.5 min-h-[32px] rounded-[5px] text-[13px] ' + (draft[f.key as ConditionKey] === k ? 'bg-white text-ink font-semibold shadow-card' : 'text-ink-muted hover:text-ink')}>{label}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <button className={BTN} onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
            <button className="px-3.5 min-h-[36px] rounded-[7px] bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
      {c.alert && <div className="text-[13px] rounded-[7px] bg-paper px-3 py-2"><span className="text-ink-muted">Golfers see: </span>{c.alert}</div>}
      {error && <p className="text-[13px] text-bad">{error}</p>}
    </Card>
  );
}

/** The next seven days by hour: darker is fuller. A quiet run links to a last-minute deal. */
export function WeekAheadCard({ week, canDeal }: { week: WeekAhead; canDeal: boolean }) {
  if (week.hours.length === 0) return <Card className="px-5 py-4"><h2 className="text-[15px] font-semibold text-ink">Week ahead</h2><p className="mt-2 text-[14px] text-ink-muted">No tee times in the next seven days.</p></Card>;
  return (
    <Card className="px-5 py-4 min-w-0">
      <div className="flex items-baseline gap-3"><h2 className="text-[15px] font-semibold text-ink">Week ahead</h2><span className="ml-auto text-[12px] text-ink-muted">Players booked of spots · darker is fuller</span></div>
      <div className="mt-3 grid gap-[3px] items-center" style={{ gridTemplateColumns: `52px repeat(${week.hours.length}, minmax(0,1fr))` }} role="table" aria-label="Week ahead by hour">
        <div />
        {week.hours.map(h => <div key={h} className="text-[11px] text-ink-muted text-center" role="columnheader">{hourLabel(h)}</div>)}
        {week.days.map((d, i) => (
          <div key={d.date} className="contents" role="row">
            <div className="text-[12px] text-ink-soft truncate" role="rowheader">{dayLabel(d.date, i)}</div>
            {d.cells.map((c, j) => {
              const pct = c.offered ? c.booked / c.offered : 0;
              return <div key={j} role="cell" title={`${dayLabel(d.date, i)} ${hourLabel(week.hours[j])}:00 · ${c.offered ? `${c.booked} of ${c.offered}` : 'no tee times'}`}
                className="h-5 rounded-[3px]" style={c.offered ? { backgroundColor: `color-mix(in oklab, var(--color-pine) ${Math.round(8 + pct * 84)}%, var(--color-line-soft))` } : { backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 1px var(--color-line-soft)' }} />;
            })}
          </div>
        ))}
      </div>
      {canDeal && <div className="mt-3 text-right"><Link href="/dashboard/schedules" className="text-[13px] font-medium text-pine">Set a last-minute deal</Link></div>}
    </Card>
  );
}

/** This month against its goal — collected so far (Analytics' definition), what's needed a day, last month's pace. */
export function MonthGoalCard({ goal, canSet, onSaved }: { goal: MonthGoal; canSet: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goal.goalCents ? String(goal.goalCents / 100) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    const dollars = Number(value.replace(/[$,\s]/g, ''));
    if (!(dollars > 0)) { setError('Enter the goal in dollars.'); return; }
    setBusy(true); setError('');
    const r = await dfetch('/api/operator/month-goal', { method: 'PUT', body: JSON.stringify({ month: goal.month, cents: Math.round(dollars * 100) }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setEditing(false); onSaved();
  }
  const pct = goal.goalCents ? Math.min(100, (goal.collectedCents / goal.goalCents) * 100) : 0;
  return (
    <Card className="px-5 py-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-baseline gap-3"><h2 className="text-[15px] font-semibold text-ink">{monthName(goal.month)} vs goal</h2>
        {canSet && !editing && <button className="ml-auto text-[13px] font-medium text-pine" onClick={() => setEditing(true)}>{goal.goalCents ? 'Change' : 'Set a goal'}</button>}</div>
      <div className="text-[24px] font-semibold tracking-[-0.02em] text-ink tabular-nums">{usd0(goal.collectedCents)}{goal.goalCents != null && <span className="text-[13px] font-normal text-ink-muted"> of {usd0(goal.goalCents)}</span>}</div>
      {goal.goalCents != null && <div className="h-1.5 rounded-full bg-line-soft"><div className="h-full rounded-full bg-pine" style={{ width: `${pct}%` }} /></div>}
      {editing && (
        <div className="flex gap-2">
          <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} aria-label={`Goal for ${monthName(goal.month)} in dollars`} placeholder="60000"
            className="flex-1 min-w-0 bg-paper border border-line rounded-[7px] px-3 py-2 text-[14px] text-ink tabular-nums focus:border-pine/40 focus:ring-2 focus:ring-pine/10" />
          <button className={BTN} onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
          <button className="px-3.5 min-h-[36px] rounded-[7px] bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}
      <div className="flex flex-col text-[13px]">
        <div className="flex justify-between py-1"><span className="text-ink-soft">Days left</span><span className="font-semibold tabular-nums">{goal.daysLeft}</span></div>
        {goal.neededPerDayCents != null && <div className="flex justify-between py-1"><span className="text-ink-soft">Needed a day from here</span><span className="font-semibold tabular-nums">{usd0(goal.neededPerDayCents)}</span></div>}
        <div className="flex justify-between py-1"><span className="text-ink-soft">{monthName(goal.lastMonth)} averaged</span><span className="font-semibold tabular-nums">{usd0(goal.lastMonthPerDayCents)} a day</span></div>
      </div>
      {goal.goalCents != null && goal.collectedCents >= goal.goalCents && <p className="text-[13px] text-ink"><StatusDot status="ok" label="" /> Goal reached</p>}
      {error && <p className="text-[13px] text-bad">{error}</p>}
    </Card>
  );
}
