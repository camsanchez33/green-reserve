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
import { goalMetric, formatGoal, neededPerDay, type GoalMetric } from '@/lib/course-goals';
import { CONDITION_FIELDS, CONDITION_SUGGESTIONS, CONDITION_LINES_MAX, CONDITION_LINE_CHARS, conditionLabel, conditionsOffBookingPage, type CourseConditions, type ConditionKey } from '@/lib/course-conditions';

export type ShiftNote = { id: string; body: string; authorName: string; createdAt: string };
export type WeekAhead = { hours: number[]; days: { date: string; cells: { booked: number; offered: number }[] }[] };
export type Goals = { month: string; daysLeft: number; lastMonth: string; goals: { metric: GoalMetric; target: number; actual: number; lastMonth: number }[]; metrics: GoalMetric[] };
export type Conditions = { detail: CourseConditions; alert: string; updatedAt: string | null; detailAt: string | null };

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
const dayLabel = (d: string, i: number) => i === 0 ? 'Today' : `${new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${Number(d.slice(8, 10))}`;
const monthName = (m: string) => new Date(m + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
/** The heat map's shade for a share booked (0–1). */
const fill = (pct: number) => `color-mix(in oklab, var(--color-pine) ${Math.round(8 + pct * 84)}%, var(--color-line-soft))`;
const initials = (name: string) => (name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || 'S');
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
      {/* Cam 2026-11-05 ("make the notes thing look better"): staff notes — what the last one left, and a box for the next. */}
      <div className="flex items-baseline gap-3 mb-3"><h2 className="text-[15px] font-semibold text-ink">Staff notes</h2>
        {notes.length > 0 && <span className="text-[12px] text-ink-muted tabular-nums">{notes.length}</span>}</div>
      {notes.length === 0 && !writing && <p className="mb-2 text-[13.5px] text-ink-muted">Nothing from the last shift.</p>}
      {notes.map(n => (
        <div key={n.id} className="flex gap-3 items-start rounded-[7px] bg-paper/70 px-3 py-2.5 mb-2">
          <span aria-hidden className="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-pine/10 text-pine text-[11.5px] font-semibold grid place-items-center">{initials(n.authorName)}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] text-ink-muted"><span className="font-medium text-ink">{n.authorName || 'Staff'}</span> · {when(n.createdAt)}</div>
            <p className="mt-0.5 text-[14px] leading-relaxed text-ink whitespace-pre-line break-words">{n.body}</p>
          </div>
          <button className={BTN} disabled={busy === n.id} onClick={() => send('PATCH', { id: n.id }, n.id)}>{busy === n.id ? 'Saving…' : 'Done'}</button>
        </div>
      ))}
      {!writing && (
        <button type="button" onClick={() => setWriting(true)}
          className="w-full text-left rounded-[7px] border border-dashed border-line-strong px-3 py-2.5 text-[13.5px] text-ink-muted hover:text-ink hover:border-pine/40">Leave a note for the next shift…</button>
      )}
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

/** Carts, range, greens, pins — two taps each — the course's own lines (HOME-2), and the alert golfers see. */
export function ConditionsCard({ initial, canEdit }: { initial: Conditions; canEdit: boolean }) {
  const [c, setC] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CourseConditions>(initial.detail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [line, setLine] = useState('');
  const lines = draft.lines ?? [];
  const addLine = () => { const t = line.trim(); if (!t || lines.length >= CONDITION_LINES_MAX) return; if (lines.some(x => x.toLowerCase() === t.toLowerCase())) { setLine(''); return; } setDraft(d => ({ ...d, lines: [...(d.lines ?? []), t] })); setLine(''); };
  async function save() {
    setBusy(true); setError('');
    const r = await dfetch<{ detail: CourseConditions; updatedAt: string | null }>('/api/operator/conditions', { method: 'PATCH', body: JSON.stringify({ detail: line.trim() && lines.length < CONDITION_LINES_MAX ? { ...draft, lines: [...lines, line.trim()] } : draft }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setC(x => ({ ...x, detail: r.data.detail, updatedAt: r.data.updatedAt, detailAt: r.data.updatedAt })); setLine(''); setEditing(false);
  }
  return (
    <Card className="px-5 py-4 flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Course conditions</h2>
        {c.updatedAt && <span className="text-[12px] text-ink-muted">{when(c.updatedAt)}</span>}
        {canEdit && !editing && <button className="ml-auto text-[13px] font-medium text-pine" onClick={() => { setDraft(c.detail); setEditing(true); }}>Update</button>}
      </div>
      {/* Golfers see these for 18 hours from when they were set (golferConditionLines) — say so when they've gone. */}
      {conditionsOffBookingPage(c.detail, c.detailAt) && (
        <p className="-mt-1 text-[12.5px] text-ink-soft"><StatusDot status="warn" label="" /> Off your booking page — update to show today&apos;s</p>
      )}
      {!editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CONDITION_FIELDS.map(f => (
            <div key={f.key}><div className="text-[12px] text-ink-muted">{f.label}</div><div className="mt-0.5 text-[14px] font-semibold text-ink">{conditionLabel(f.key, c.detail[f.key]) || <span className="font-normal text-ink-faint">Not set</span>}</div></div>
          ))}
          {(c.detail.lines ?? []).length > 0 && (
            <ul className="col-span-full flex flex-col gap-1 border-t border-line-soft pt-2.5">
              {c.detail.lines!.map(l => <li key={l} className="text-[14px] text-ink">{l}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {CONDITION_FIELDS.map(f => (
            // Cam 2026-11-06 ("can be a little different"): label above, the options share the row equally — every row lines up.
            <div key={f.key} className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-ink-muted">{f.label}</span>
              <div role="radiogroup" aria-label={f.label} className="grid gap-1 p-1 rounded-[7px] bg-paper" style={{ gridTemplateColumns: `repeat(${f.options.length}, minmax(0, 1fr))` }}>
                {f.options.map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={draft[f.key as ConditionKey] === k}
                    onClick={() => setDraft(d => ({ ...d, [f.key]: d[f.key as ConditionKey] === k ? undefined : k }))}
                    className={'px-1 py-1 min-h-[32px] rounded-[5px] text-[13px] leading-tight whitespace-normal break-words ' + (draft[f.key as ConditionKey] === k ? 'bg-white text-ink font-semibold shadow-card' : 'text-ink-muted hover:text-ink')}>{label}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
            <span className="text-[12.5px] text-ink-muted">Your own · golfers see these too</span>
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 rounded-[7px] bg-paper px-3 py-1.5 text-[14px] text-ink">
                <span className="flex-1 min-w-0 break-words">{l}</span>
                <button type="button" className="text-[12.5px] font-medium text-ink-soft hover:text-bad" onClick={() => setDraft(d => ({ ...d, lines: (d.lines ?? []).filter((_, j) => j !== i) }))}>Remove</button>
              </div>
            ))}
            {lines.length < CONDITION_LINES_MAX && <>
              <div className="flex gap-2">
                <input value={line} onChange={e => setLine(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLine(); } }} maxLength={CONDITION_LINE_CHARS}
                  aria-label="Add a condition" placeholder="Type a condition"
                  className="flex-1 min-w-0 bg-paper border border-line rounded-[7px] px-3 py-2 text-[14px] text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10" />
                <button type="button" className={BTN} disabled={!line.trim()} onClick={addLine}>Add</button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                {CONDITION_SUGGESTIONS.filter(x => !lines.includes(x)).map(x => (
                  <button key={x} type="button" onClick={() => setLine(x)} className="text-pine hover:underline underline-offset-2">+ {x}</button>
                ))}
              </div>
            </>}
          </div>
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
      {/* HOME-1 (Cam 2026-11-05, "clearer about what it shows"): how full each hour is, a scale, and each day's total. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-[15px] font-semibold text-ink">Week ahead · how full each hour is</h2>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-muted">Empty
          {[0, 0.25, 0.5, 0.75, 1].map(p => <span key={p} className="inline-block w-3.5 h-3 rounded-[2px]" style={{ backgroundColor: fill(p) }} />)}
          Full <span className="inline-block w-3.5 h-3 rounded-[2px] ml-2" style={{ boxShadow: 'inset 0 0 0 1px var(--color-line)' }} /> no tee times</span></div>
      <div className="mt-3 grid gap-[3px] items-center" style={{ gridTemplateColumns: `52px repeat(${week.hours.length}, minmax(0,1fr)) 64px` }} role="table" aria-label="Week ahead: players booked of spots, by hour">
        <div />
        {week.hours.map(h => <div key={h} className="text-[11px] text-ink-muted text-center" role="columnheader">{hourLabel(h)}</div>)}
        <div className="text-[11px] text-ink-muted text-right" role="columnheader">Booked</div>
        {week.days.map((d, i) => (
          <div key={d.date} className="contents" role="row">
            <div className="text-[12px] text-ink-soft truncate" role="rowheader">{dayLabel(d.date, i)}</div>
            {d.cells.map((c, j) => {
              const pct = c.offered ? c.booked / c.offered : 0;
              return <div key={j} role="cell" title={`${dayLabel(d.date, i)} ${hourLabel(week.hours[j])} · ${c.offered ? `${c.booked} of ${c.offered} spots booked (${Math.round(pct * 100)}%)` : 'no tee times'}`}
                className="h-6 rounded-[3px]" style={c.offered ? { backgroundColor: fill(pct) } : { backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 1px var(--color-line)' }} />;
            })}
            {(() => { const b = d.cells.reduce((s, c) => s + c.booked, 0), o = d.cells.reduce((s, c) => s + c.offered, 0);
              return <div role="cell" className="text-[12px] text-right tabular-nums text-ink">{o ? <>{b}<span className="text-ink-muted"> / {o}</span></> : <span className="text-ink-faint">—</span>}</div>; })()}
          </div>
        ))}
      </div>
      {/* Cam 2026-11-06 ("have our technology set updated prices with your parameters"): this is demand pricing —
          quiet hours priced down, busy ones up, inside the course's floor and ceiling. The link lands on it. */}
      {canDeal && <div className="mt-3 flex flex-wrap items-center justify-end gap-x-2 text-[13px]"><span className="text-ink-muted">Quiet hours?</span><Link href="/dashboard/schedules#demand-pricing" className="font-medium text-pine">Let GreenReserve price them for you</Link></div>}
    </Card>
  );
}

/** HOME-2 (Cam 2026-11-05): this month's goals on the numbers the course picked — each against its target, with what's needed a day and last month's. */
export function GoalsCard({ goals, canSet, onSaved }: { goals: Goals; canSet: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState<GoalMetric | 'new' | null>(null);
  const [metric, setMetric] = useState<GoalMetric | ''>('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unset = goals.metrics.filter(m => !goals.goals.some(g => g.metric === m));
  const open = (m: GoalMetric | 'new', v = '') => { setEditing(m); setMetric(m === 'new' ? (unset[0] ?? '') : m); setValue(v); setError(''); };
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
        <select value={metric} onChange={e => setMetric(e.target.value as GoalMetric)} aria-label="What the goal is for"
          className="flex-1 min-w-[150px] bg-paper border border-line rounded-[7px] px-2.5 py-2 text-[14px] text-ink focus:border-pine/40 focus:ring-2 focus:ring-pine/10">
          {unset.map(m => <option key={m} value={m}>{goalMetric(m).label}</option>)}
        </select>
      )}
      <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} autoFocus aria-label="Goal"
        placeholder={unit === 'cents' ? '$60,000' : unit === 'pct' ? '75%' : '1,000'}
        className="w-28 min-w-0 bg-paper border border-line rounded-[7px] px-3 py-2 text-[14px] text-ink tabular-nums focus:border-pine/40 focus:ring-2 focus:ring-pine/10" />
      <button className={BTN} onClick={() => { setEditing(null); setError(''); }}>Cancel</button>
      <button className="px-3.5 min-h-[36px] rounded-[7px] bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50" disabled={busy || !metric} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
  return (
    <Card className="px-5 py-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-baseline gap-3"><h2 className="text-[15px] font-semibold text-ink">{monthName(goals.month)} goals</h2>
        <span className="text-[12px] text-ink-muted tabular-nums">{goals.daysLeft} days left</span>
        {canSet && unset.length > 0 && editing !== 'new' && <button className="ml-auto text-[13px] font-medium text-pine" onClick={() => open('new')}>Add a goal</button>}</div>
      {goals.goals.length === 0 && editing !== 'new' && <p className="text-[13.5px] text-ink-muted">No goals set.</p>}
      {goals.goals.map(g => {
        const m = goalMetric(g.metric);
        const pct = Math.min(100, g.target ? (g.actual / g.target) * 100 : 0);
        const done = g.actual >= g.target;
        const need = neededPerDay(g.metric, g.target, g.actual, goals.daysLeft);
        return (
          <div key={g.metric} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[13.5px] text-ink" title={m.def}>{m.label}</span>
              <span className="ml-auto text-[14px] font-semibold tabular-nums text-ink">{formatGoal(g.metric, g.actual)}<span className="font-normal text-ink-muted"> of {formatGoal(g.metric, g.target)}</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-line-soft"><div className={`h-full rounded-full ${done ? 'bg-ok' : 'bg-pine'}`} style={{ width: `${pct}%` }} /></div>
            <div className="flex flex-wrap gap-x-3 text-[12px] text-ink-muted tabular-nums">
              {done ? <span className="text-ink"><StatusDot status="ok" label="" /> Reached</span> : need != null ? <span>{formatGoal(g.metric, need)} a day to go</span> : null}
              <span>{monthName(goals.lastMonth)}: {formatGoal(g.metric, g.lastMonth)}</span>
              {canSet && editing !== g.metric && <span className="ml-auto flex gap-3"><button className="font-medium text-pine" onClick={() => open(g.metric, toInput(g.metric, g.target))}>Change</button>
                <button className="font-medium text-ink-soft hover:text-bad" disabled={busy} onClick={() => put(g.metric, null)}>Remove</button></span>}
            </div>
            {editing === g.metric && form}
          </div>
        );
      })}
      {editing === 'new' && form}
      {error && <p className="text-[13px] text-bad">{error}</p>}
    </Card>
  );
}
