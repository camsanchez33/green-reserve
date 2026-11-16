'use client';
// SCHEDULE-3 Hours and prices (Cam 2026-11-16): Weekdays and Weekends only — never an Every-day set that overlaps them.
// Each set's line says what it does (days, first and last tee, gap, the time-of-day prices). The round picker matches
// Bookable rounds; price columns are named by time of day ("Twilight / After 3:00 PM") with a Weekday or Weekend tag;
// Walking allowed is a switch per column; "Add a time-of-day price" opens a pop-up to name it and pick its start; the
// plus holds Senior and junior prices. Edits the page's CoursePlan (lib/course-plan); the page saves it.
// A course whose stored schedule has other sets of days (say Fridays with their own hours) keeps them, listed after
// Weekends with their own days, so nothing it sells is hidden.
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { toast } from '@/components/dashboard/Toast';
import { formatTeeTime as fmtTime } from '@/lib/format';
import { columnNames, daysOf, snap, isTime, autoName, type CoursePlan, type DayPlan, type PriceCell } from '@/lib/course-plan';
import { CardHead, PlusButton, ChevIcon, PlusIcon, PenIcon, Popup, PopupFoot, Block, Tiles, Switch, Money, FIELD, LABEL, LINK, LINK_BAD, PRIMARY } from './ui';
import type { PageRound } from './BookableRounds';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const sortDays = (d: number[]) => [...d].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
export const isWeekendSet = (d: DayPlan) => sortDays(d.days).join() === '6,0';

/** "Weekdays", "Weekends", "Every day", or the days themselves. */
export function setName(days: number[]): string {
  const s = sortDays(days).join();
  if (days.length === 7) return 'Every day';
  if (s === '1,2,3,4,5') return 'Weekdays';
  if (s === '6,0') return 'Weekends';
  return sortDays(days).map(d => DAY_SHORT[d]).join(', ') || 'No days left';
}
function daysLong(days: number[]): string {
  const s = sortDays(days).join();
  if (s === '1,2,3,4,5') return 'Monday to Friday';
  if (s === '6,0') return 'Saturday and Sunday';
  if (days.length === 7) return 'Every day';
  const n = sortDays(days).map(d => DAY_LONG[d]);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] ?? '';
}
/** The set's line: its days, first and last tee, gap, and where each time-of-day price starts. */
export function setLine(plan: CoursePlan, d: DayPlan): string {
  const days = daysLong(daysOf(plan, d));
  if (d.closed) return `${days} · closed`;
  const names = columnNames(d);
  const changes = d.changes.map((c, i) => `${names[i + 1].toLowerCase()} from ${fmtTime(c.at)}`);
  return [days, `tee times ${fmtTime(d.first)} to ${fmtTime(d.last)}, every ${d.interval} minutes`, ...changes].join(' · ');
}

type Kind = 'green' | 'cart' | 'member' | 'resident' | 'senior' | 'junior';
const KEYS: Record<Kind, [keyof PriceCell, keyof PriceCell]> = {
  green: ['weekday', 'weekend'], cart: ['cart', 'cartWeekend'], member: ['memberWeekday', 'memberWeekend'],
  resident: ['residentWeekday', 'residentWeekend'], senior: ['seniorWeekday', 'seniorWeekend'], junior: ['juniorWeekday', 'juniorWeekend'],
};
type ColDraft = { i: number; col: number | null; label: 'twilight' | 'early' | 'own'; name: string; at: string };

export function HoursPrices({ plan, edit, rounds, canEdit, perCart, showMember, showResident, showAges, onAddAges }: {
  plan: CoursePlan; edit: (f: (p: CoursePlan) => CoursePlan) => void; rounds: PageRound[]; canEdit: boolean;
  perCart: boolean; showMember: boolean; showResident: boolean; showAges: boolean; onAddAges: () => void;
}) {
  // Weekdays first, Weekends second, any other stored set after.
  const sets = [plan.usual, ...plan.different].map((d, i) => ({ d, i }))
    .sort((a, b) => (a.i === 0 ? -1 : b.i === 0 ? 1 : isWeekendSet(a.d) ? -1 : isWeekendSet(b.d) ? 1 : a.i - b.i));
  const [open, setOpen] = useState<number | null>(0);
  const sold = plan.rounds.filter(r => r.on && rounds.some(x => x.key === r.key));
  const [pick, setPick] = useState('');
  const round = sold.find(r => r.key === pick) ?? sold[0];
  const labelOf = (key: string) => rounds.find(r => r.key === key)?.label ?? 'Round';
  const [more, setMore] = useState(false);
  const [colDraft, setColDraft] = useState<ColDraft | null>(null);

  const dayAt = (p: CoursePlan, i: number) => (i === 0 ? p.usual : p.different[i - 1]);
  const put = (p: CoursePlan, i: number, next: DayPlan): CoursePlan => (i === 0 ? { ...p, usual: next } : { ...p, different: p.different.map((x, j) => (j === i - 1 ? next : x)) });
  const setDay = (i: number, patch: Partial<DayPlan>) => edit(p => put(p, i, { ...dayAt(p, i), ...patch }));
  function setCell(i: number, key: string, col: number, patch: Partial<PriceCell>) {
    edit(p => { const d = dayAt(p, i); return put(p, i, { ...d, prices: { ...d.prices, [key]: (d.prices[key] ?? []).map((c, j) => (j === col ? { ...c, ...patch } : c)) } }); });
  }
  /** A new price column from `at`, starting with the prices of the column it splits. */
  function addColumn(i: number, at: string, name: string | null, firstName?: string | null): boolean {
    const d = dayAt(plan, i);
    const t = snap(d, at);
    if (!isTime(at) || t <= d.first || t > d.last) { toast(`Pick a time after ${fmtTime(d.first)} and no later than ${fmtTime(d.last)}.`, 'warn'); return false; }
    if (d.changes.some(c => c.at === t)) { toast(`A price already starts at ${fmtTime(t)}.`, 'warn'); return false; }
    edit(p => {
      const d = dayAt(p, i);
      const changes = [...d.changes, { at: t, name }].sort((a, b) => a.at.localeCompare(b.at));
      const col = changes.findIndex(c => c.at === t) + 1;
      const prices = Object.fromEntries(Object.entries(d.prices).map(([k, cells]) => [k, [...cells.slice(0, col), { ...cells[col - 1] }, ...cells.slice(col)]]));
      return put(p, i, { ...d, changes, prices, ...(firstName !== undefined ? { firstName } : {}) });
    });
    return true;
  }
  function removeColumn(i: number, col: number) {
    edit(p => { const d = dayAt(p, i); return put(p, i, { ...d, changes: d.changes.filter((_, j) => j !== col - 1), prices: Object.fromEntries(Object.entries(d.prices).map(([k, cells]) => [k, cells.filter((_, j) => j !== col)])) }); });
  }
  function saveColumn(c: ColDraft) {
    const name = c.name.trim() || null;
    if (c.col === null) {
      const ok = c.label === 'early' ? addColumn(c.i, c.at, null, 'Early bird')
        : addColumn(c.i, c.at, c.label === 'twilight' ? (autoName(c.at, false) === 'Twilight' ? null : 'Twilight') : name);
      if (ok) setColDraft(null);
      return;
    }
    const d = dayAt(plan, c.i);
    if (c.col > 0) {
      const t = snap(d, c.at);
      const prev = c.col === 1 ? d.first : d.changes[c.col - 2].at, next = d.changes[c.col]?.at;
      if (!isTime(c.at) || t <= prev || (next && t >= next) || t > d.last) { toast(`Pick a time after ${fmtTime(prev)}${next ? ` and before ${fmtTime(next)}` : ` and no later than ${fmtTime(d.last)}`}.`, 'warn'); return; }
      edit(p => { const d = dayAt(p, c.i); return put(p, c.i, { ...d, changes: d.changes.map((x, j) => (j === c.col! - 1 ? { at: t, name } : x)) }); });
    } else setDay(c.i, { firstName: name });
    setColDraft(null);
  }
  function removeSet(i: number) { edit(p => ({ ...p, different: p.different.filter((_, k) => k !== i - 1) })); setOpen(0); }

  const priceTable = (i: number, d: DayPlan) => {
    if (!round) return <p className="text-[13.5px] text-ink-muted">Put a round on sale in Bookable rounds to price it.</p>;
    const names = columnNames(d);
    const starts = [d.first, ...d.changes.map(c => c.at)];
    const days = daysOf(plan, d);
    const wd = days.some(x => x >= 1 && x <= 5), we = days.some(x => x === 0 || x === 6);
    const tag = wd && we ? 'Weekday · weekend' : we ? 'Weekend' : 'Weekday';
    const from = round.from ?? d.first, to = round.to ?? d.last;
    const soldIn = (col: number) => { const end = starts[col + 1]; return end ? from < end && to >= starts[col] : from <= d.last && to >= starts[col]; };
    const cells = d.prices[round.key] ?? [];
    const pair = (col: number, kind: Kind, label: string) => {
      const c = cells[col];
      if (!c) return null;
      const [a, b] = KEYS[kind];
      const opt = kind !== 'green' && kind !== 'cart';
      const one = (k: keyof PriceCell, other: keyof PriceCell, both: boolean, when: string) => (
        <Money key={String(k)} label={`${label} ${names[col]} ${when}`} disabled={!canEdit} blank={opt}
          value={(c[k] ?? (kind === 'cart' && k === 'cartWeekend' ? c.cart : null)) as number | null}
          onChange={v => setCell(i, round.key, col, { [k]: opt ? v : (v ?? 0), ...(!both ? { [other]: opt ? v : (v ?? 0) } : {}) })} />
      );
      return <div className="flex gap-1.5">{wd && one(a, b, we, 'weekday')}{we && one(b, a, wd, 'weekend')}</div>;
    };
    const walk = (col: number) => {
      const c = cells[col];
      if (!c) return null;
      const sw = (k: 'walk' | 'walkWeekend', other: 'walk' | 'walkWeekend', both: boolean, when: string) => (
        <Switch key={k} label={`Walking allowed, ${names[col]}, ${when}`} disabled={!canEdit} checked={(c[k] ?? c.walk) !== false}
          onChange={v => setCell(i, round.key, col, { [k]: v, ...(!both ? { [other]: v } : {}) })} />
      );
      return <div className="flex gap-3">{wd && sw('walk', 'walkWeekend', we, 'weekday')}{we && sw('walkWeekend', 'walk', wd, 'weekend')}</div>;
    };
    const rows: { kind: Kind; label: string }[] = [
      { kind: 'green', label: 'Green fee' }, { kind: 'cart', label: perCart ? 'Cart, per cart (2 riders)' : 'Cart, per rider' },
      ...(showMember ? [{ kind: 'member' as const, label: 'Members' }] : []),
      ...(showResident ? [{ kind: 'resident' as const, label: 'Residents' }] : []),
      ...(showAges ? [{ kind: 'senior' as const, label: 'Seniors' }, { kind: 'junior' as const, label: 'Juniors' }] : []),
    ];
    const grid = { gridTemplateColumns: `minmax(76px,150px) repeat(${names.length}, minmax(${wd && we ? 200 : 92}px, 1fr))` };
    const sub = (col: number) => (names.length === 1 ? 'All day' : col === 0 ? `Until ${fmtTime(starts[1])}` : `After ${fmtTime(starts[col])}`);
    return (
      <div className="overflow-x-auto border border-line rounded-[12px] px-3.5 py-0.5">
        <div>
          <div className="grid gap-2.5 sm:gap-3.5 items-end pt-3 pb-2" style={grid}>
            <span />
            {names.map((n, col) => (
              <span key={col} className="min-w-0">
                <span className="flex items-center gap-1">
                  <b className="block font-semibold text-[13.5px] text-ink truncate">{n}</b>
                  {canEdit && <button type="button" aria-label={`Edit ${n}`} title="Edit" onClick={() => setColDraft({ i, col, label: 'own', name: col === 0 ? d.firstName ?? '' : d.changes[col - 1].name ?? '', at: starts[col] })}
                    className="w-6 h-6 grid place-items-center rounded-md text-ink-muted hover:text-ink hover:bg-paper"><PenIcon /></button>}
                </span>
                <small className="block text-[12px] text-ink-muted tabular-nums">{sub(col)}{soldIn(col) ? '' : ' · not sold'}</small>
                <em className="inline-block mt-1.5 not-italic text-[11.5px] text-ink-soft border border-line rounded-full px-2 py-px">{tag}</em>
              </span>
            ))}
          </div>
          {rows.map(r => (
            <div key={r.kind} className="grid gap-2.5 sm:gap-3.5 items-center py-2 border-t border-line text-[13px]" style={grid}>
              <span className="text-ink-soft">{r.label}</span>
              {names.map((_, col) => <span key={col}>{soldIn(col) ? pair(col, r.kind, r.label) : <span className="text-ink-muted">—</span>}</span>)}
            </div>
          ))}
          <div className="grid gap-2.5 sm:gap-3.5 items-center py-2.5 border-t border-line text-[13px]" style={grid}>
            <span className="text-ink-soft">Walking allowed</span>
            {names.map((_, col) => <span key={col}>{soldIn(col) ? walk(col) : <span className="text-ink-muted">—</span>}</span>)}
          </div>
        </div>
      </div>
    );
  };

  const body = (i: number, d: DayPlan) => (
    <div className="flex flex-col gap-2.5 px-3 pt-1 pb-3">
      {i > 0 && (
        <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
          <Switch label="Closed on these days" checked={d.closed} disabled={!canEdit} onChange={v => setDay(i, { closed: v })} />Closed on these days
        </label>
      )}
      {!d.closed && <>
        <div className="text-[12.5px] font-semibold text-ink-soft">Tee times</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
          <label className={LABEL}>First tee<input type="time" value={d.first} disabled={!canEdit} onChange={e => setDay(i, { first: e.target.value })} className={FIELD} /></label>
          <label className={LABEL}>Last tee<input type="time" value={d.last} disabled={!canEdit} onChange={e => setDay(i, { last: e.target.value })} className={FIELD} /></label>
          <label className={LABEL}>Minutes apart<input type="number" inputMode="numeric" min={1} max={60} value={d.interval || ''} disabled={!canEdit} onChange={e => setDay(i, { interval: Number(e.target.value) })} className={FIELD} /></label>
        </div>
        <div className="text-[12.5px] font-semibold text-ink-soft mt-1.5">Prices</div>
        {sold.length > 1 && (
          <div role="radiogroup" aria-label="Round" className="flex flex-wrap gap-2">
            {sold.map(r => {
              const pr = rounds.find(x => x.key === r.key)!;
              return (
                <button key={r.key} type="button" role="radio" aria-checked={round?.key === r.key} onClick={() => setPick(r.key)}
                  className={'text-left rounded-[12px] border px-3.5 py-2 ' + (round?.key === r.key ? 'border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-line bg-paper hover:border-ink-soft')}>
                  <b className="block text-[13px] font-semibold text-ink">{labelOf(r.key)}</b><small className="block text-[11.5px] text-ink-muted">{pr.holes} holes</small>
                </button>
              );
            })}
          </div>
        )}
        {priceTable(i, d)}
        {canEdit && (
          <button type="button" onClick={() => setColDraft({ i, col: null, label: 'twilight', name: '', at: d.first < '15:00' && d.last > '15:00' ? '15:00' : '' })}
            className="flex gap-3 items-center text-left border-[1.5px] border-dashed border-line rounded-[12px] px-3.5 py-3 hover:border-ink-soft text-ink">
            <PlusIcon /><span><b className="block font-semibold text-[13.5px]">Add a time-of-day price</b><small className="block text-[12px] text-ink-muted">A different price for part of the day, like twilight after 3 PM or an early-bird back nine</small></span>
          </button>
        )}
      </>}
      {i > 0 && !isWeekendSet(d) && canEdit && <button type="button" onClick={() => removeSet(i)} className={LINK_BAD}>Give these days the weekday hours and prices</button>}
    </div>
  );

  const colSet = colDraft ? dayAt(plan, colDraft.i) : null;
  return (
    <Card className="px-1.5 pt-1.5 pb-2.5">
      <CardHead title="Hours and prices" line="Weekdays and weekends each have their own tee times and prices.">
        {canEdit && !showAges && <PlusButton label="Add more" onClick={() => setMore(true)} />}
      </CardHead>
      {sets.map(({ d, i }) => {
        const isOpen = open === i;
        return (
          <div key={i} className="border-t border-line">
            <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
              className="w-full flex justify-between items-center gap-3 p-3 text-left rounded-[10px] hover:bg-paper">
              <span className="min-w-0"><b className="block font-semibold text-[14px] text-ink">{setName(daysOf(plan, d))}</b><small className="block text-[12.5px] text-ink-muted mt-0.5 tabular-nums">{setLine(plan, d)}</small></span>
              <ChevIcon open={isOpen} />
            </button>
            {isOpen && body(i, d)}
          </div>
        );
      })}

      {more && (
        <Popup title="Add to your prices" onClose={() => setMore(false)}>
          <button type="button" onClick={() => { onAddAges(); setMore(false); }} className="flex gap-2.5 items-start text-left rounded-[12px] border border-line bg-paper hover:border-ink-soft px-3 py-2.5">
            <span className="min-w-0"><b className="block text-[13.5px] font-semibold text-ink">Senior and junior prices</b><small className="block text-[12px] text-ink-muted mt-0.5">Adds Seniors and Juniors rows to every price table.</small></span>
          </button>
          <PopupFoot onCancel={() => setMore(false)} cancel="Close" />
        </Popup>
      )}
      {colDraft && colSet && (
        <Popup title={colDraft.col === null ? 'Add a time-of-day price' : `Edit ${columnNames(colSet)[colDraft.col]}`} onClose={() => setColDraft(null)}>
          {colDraft.col === null && <p className="text-[13px] text-ink-soft -mt-2">A different price for part of the day. It shows as its own column in the price table.</p>}
          {colDraft.col === null ? (
            <Block label="Label">
              <Tiles label="Label" value={colDraft.label} onChange={k => setColDraft({ ...colDraft, label: k })}
                options={[{ key: 'twilight', title: 'Twilight' }, { key: 'early', title: 'Early bird' }, { key: 'own', title: 'Your own' }]} />
              {colDraft.label === 'own' && <input aria-label="Name" value={colDraft.name} onChange={e => setColDraft({ ...colDraft, name: e.target.value })} className={FIELD} />}
            </Block>
          ) : (
            <Block label="Name"><input aria-label="Name" value={colDraft.name} onChange={e => setColDraft({ ...colDraft, name: e.target.value })} className={FIELD} /></Block>
          )}
          {(colDraft.col === null || colDraft.col > 0) && (
            <Block label={colDraft.col === null && colDraft.label === 'early' ? 'Ends at' : 'Starts at'}>
              <input type="time" aria-label="Time" value={colDraft.at} onChange={e => setColDraft({ ...colDraft, at: e.target.value })} className={FIELD + ' max-w-[160px]'} />
            </Block>
          )}
          {colDraft.col !== null && colDraft.col > 0 && (
            <button type="button" onClick={() => { removeColumn(colDraft.i, colDraft.col!); setColDraft(null); }} className={LINK_BAD}>Remove this price</button>
          )}
          <PopupFoot onCancel={() => setColDraft(null)}>
            <button type="button" onClick={() => saveColumn(colDraft)} className={PRIMARY}>{colDraft.col === null ? 'Add column' : 'Done'}</button>
          </PopupFoot>
        </Popup>
      )}
    </Card>
  );
}
