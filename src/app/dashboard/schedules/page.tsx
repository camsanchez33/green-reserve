'use client';
// W2-6 Schedule simplification (Cam 2026-10-21: "keep what it can do, make it
// more efficient and simple"; OPERATOR_REWORK_SPEC "W2-6 Schedule
// simplification — decisions"). The course thinks in three things, not
// schedules, and the page reads that way:
//   1. When you're open — first tee, last tee, minutes apart; "Different hours
//      on some days" gives any days their own hours and prices, or closes them.
//   2. What golfers can book — each round on or off, all day or between times.
//   3. What it costs — ONE price table per set of days: a row per round, a
//      column per price change ("+ Add a price change" asks only the time);
//      names are automatic (Morning / Midday / Afternoon / Twilight) and can be
//      renamed. Member and resident prices only when the course has them.
// The page edits a CoursePlan (lib/course-plan.ts); saving writes it as the
// course's TeeTimeSchedule rows in one go (PUT /api/operator/schedule with
// coursePlan), after a preview of what it changes on the tee sheet. Closed
// days, per-round booking rules and booking windows are unchanged.
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import RoundRulesCard, { type RoundRules, type CourseRules } from '@/components/dashboard/RoundRulesCard';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { Card } from '@/components/ui/Card';
import { formatTeeTime as fmtTime } from '@/lib/format';
import { readPlan, checkPlan, columnNames, daysOf, snap, emptyCell, isTime, setRoundSale, type CoursePlan, type DayPlan, type PlanRound, type PriceCell } from '@/lib/course-plan';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first, the way a course reads its week
const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full disabled:opacity-60';
const lCls = 'text-[13px] font-semibold text-ink block mb-1.5';
const cellIn = 'w-[4.5rem] bg-paper border border-line rounded-md pl-5 pr-1.5 py-1.5 text-[13.5px] text-ink tabular-nums outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 disabled:opacity-60';

type Row = {
  id: string; tierName: string; daysOfWeek: number[]; startTime: string; endTime: string; productId: string | null;
  intervalMinutes: number; holes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number | null; memberRateWeekend: number | null;
  residentRateWeekday: number | null; residentRateWeekend: number | null;
  cartFee: number; walkingAllowed: boolean; active: boolean;
};
type ProductOpt = { id: string; label: string; holes: number; active: boolean } & RoundRules;
type Preview = { days: number; added: number; removed: number; repriced: number; bookedKept: number; refusal?: string | null; warnings?: string[] };
type Pending = { preview: Preview | null; error: string };

/** "Adds 24 tee times, changes the price on 40 …" — what a save does to the next days. */
function previewLines(p: Preview): string[] {
  const out: string[] = [];
  if (p.added) out.push(`Adds ${p.added} tee time${p.added === 1 ? '' : 's'} golfers can book.`);
  if (p.repriced) out.push(`Changes the price on ${p.repriced} open tee time${p.repriced === 1 ? '' : 's'}.`);
  if (p.removed) out.push(`Takes ${p.removed} open tee time${p.removed === 1 ? '' : 's'} off the sheet.`);
  if (p.bookedKept) out.push(`Leaves ${p.bookedKept} booked or blocked time${p.bookedKept === 1 ? '' : 's'} exactly as ${p.bookedKept === 1 ? 'it is' : 'they are'}.`);
  if (out.length === 0) out.push('Nothing on the tee sheet changes in the next days; it applies further out as the days come up.');
  return out;
}

const dayList = (days: number[]) => {
  const s = [...days].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
  if (s.length === 7) return 'Every day';
  if (s.join() === '1,2,3,4,5') return 'Weekdays';
  if (s.join() === '6,0') return 'Weekends';
  return s.map(d => DAYS[d]).join(', ');
};
const num = (v: string) => v === '' ? 0 : Math.max(0, Number(v));
const optNum = (v: string) => v === '' ? null : Math.max(0, Number(v));

export default function SchedulesPage() {
  const pageAccess = useDashboardAccess();
  const canEdit = pageAccess.can('schedule.edit');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [hasMember, setHasMember] = useState(false);
  const [hasResident, setHasResident] = useState(false);
  const [courseHoles, setCourseHoles] = useState(18);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productsError, setProductsError] = useState('');
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [rulesView, setRulesView] = useState('');
  const [adding, setAdding] = useState<{ d: number; at: string } | null>(null);
  const [renaming, setRenaming] = useState<{ d: number; col: number; name: string } | null>(null);
  const [blackouts, setBlackouts] = useState<{ id: string; date: string; reason: string }[]>([]);
  const [blackoutError, setBlackoutError] = useState('');
  const [closing, setClosing] = useState<{ date: string; reason: string } | null>(null);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 8) + '01');
  const [windows, setWindows] = useState<{ publicAdvanceDays: number | null; memberAdvanceDays: number | null }>({ publicAdvanceDays: null, memberAdvanceDays: null });
  const [windowsError, setWindowsError] = useState('');
  const [courseRules, setCourseRules] = useState<CourseRules | null>(null);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const r = await dfetch<Row[]>('/api/operator/schedule');
    if (r.ok) { setRows(Array.isArray(r.data) ? r.data : []); setLoadError(''); }
    else { setRows([]); setLoadError(r.error); }
    setLoading(false);
  }, []);
  const loadWindows = useCallback(async () => {
    const r = await dfetch<{ holes?: number; hasMemberPricing?: boolean; hasResidentPricing?: boolean; publicAdvanceDays?: number; memberAdvanceDays?: number; minPlayers?: number; maxPlayers?: number }>('/api/operator/settings');
    if (!r.ok || !r.data) { setWindowsError(r.ok ? 'Settings came back empty — refresh.' : r.error); return; }
    const c = r.data;
    setHasMember(!!c.hasMemberPricing); setHasResident(!!c.hasResidentPricing);
    if (typeof c.holes === 'number') setCourseHoles(c.holes);
    setWindows({ publicAdvanceDays: typeof c.publicAdvanceDays === 'number' ? c.publicAdvanceDays : null, memberAdvanceDays: typeof c.memberAdvanceDays === 'number' ? c.memberAdvanceDays : null });
    setCourseRules({ minPlayers: c.minPlayers ?? 1, maxPlayers: c.maxPlayers ?? 4, publicAdvanceDays: c.publicAdvanceDays ?? 7 });
    setWindowsError('');
  }, []);
  const loadProducts = useCallback(async () => {
    const r = await dfetch<ProductOpt[]>('/api/operator/course-products');
    if (r.ok && Array.isArray(r.data)) { setProducts(r.data); setProductsError(''); }
    else if (!r.ok) setProductsError(r.error);
    setProductsLoaded(true);
  }, []);
  const loadBlackouts = useCallback(async () => {
    const r = await dfetch<{ id: string; date: string; reason: string }[]>('/api/operator/blackouts');
    if (r.ok && Array.isArray(r.data)) { setBlackouts(r.data.slice().sort((a, b) => a.date.localeCompare(b.date))); setBlackoutError(''); }
    else if (!r.ok) setBlackoutError(r.error);
  }, []);
  useEffect(() => { loadSchedules(); loadProducts(); loadWindows(); loadBlackouts(); }, [loadProducts, loadSchedules, loadBlackouts, loadWindows]);

  const activeProducts = products.filter(p => p.active);
  // What golfers can book: the course's live rounds, or the course as a whole when it has none (the server's planRounds).
  const rounds: PlanRound[] = activeProducts.length ? activeProducts.map(p => ({ key: p.id, label: p.label, holes: p.holes })) : [{ key: '', label: 'Tee times', holes: courseHoles }];

  // Read the stored rows into a plan once rows and rounds are both in.
  const roundsKey = rounds.map(r => r.key).join(',');
  useEffect(() => {
    if (loading || !productsLoaded || loadError) return;
    const p = readPlan(rows, rounds);
    // Nothing saved yet: the suggested plan counts as unsaved, so the save bar shows.
    setPlan(p); setSaved(rows.length ? JSON.stringify(p) : '');
  }, [rows, loading, productsLoaded, loadError, roundsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!plan && JSON.stringify(plan) !== saved;
  const showMember = hasMember || rows.some(s => s.memberRateWeekday != null);
  const showResident = hasResident || rows.some(s => s.residentRateWeekday != null);

  // ── Editing the plan ───────────────────────────────────────────────────────
  const edit = (f: (p: CoursePlan) => CoursePlan) => setPlan(p => p ? f(p) : p);
  const dayAt = (p: CoursePlan, i: number) => i === 0 ? p.usual : p.different[i - 1];
  const setDay = (i: number, patch: Partial<DayPlan>) => edit(p => i === 0 ? { ...p, usual: { ...p.usual, ...patch } } : { ...p, different: p.different.map((d, j) => j === i - 1 ? { ...d, ...patch } : d) });
  const defaultCell = (key: string): PriceCell => {
    const holes = rounds.find(r => r.key === key)?.holes ?? 18;
    return { ...emptyCell(), weekday: holes <= 9 ? 30 : 55, weekend: holes <= 9 ? 35 : 65, cart: holes <= 9 ? 12 : 20, cartWeekend: holes <= 9 ? 12 : 20 };
  };
  function addDifferentDays() {
    edit(p => {
      const taken = new Set(p.different.flatMap(d => d.days));
      const free = WEEK.find(d => !taken.has(d));
      if (free === undefined) { toast('Every day already has its own hours.', 'warn'); return p; }
      const copy: DayPlan = JSON.parse(JSON.stringify(p.usual));
      return { ...p, different: [...p.different, { ...copy, days: [free] }] };
    });
  }
  function toggleDiffDay(i: number, day: number) {
    edit(p => {
      const d = p.different[i - 1];
      if (!d.days.includes(day) && p.different.some((x, j) => j !== i - 1 && x.days.includes(day))) { toast(`${DAYS[day]} is already in another set of days.`, 'warn'); return p; }
      const days = d.days.includes(day) ? d.days.filter(x => x !== day) : [...d.days, day];
      return { ...p, different: p.different.map((x, j) => j === i - 1 ? { ...x, days } : x) };
    });
  }
  function addChange(i: number, at: string) {
    edit(p => {
      const d = dayAt(p, i);
      const t = snap(d, at);
      if (!isTime(at) || t <= d.first || t > d.last) { toast(`Pick a time after ${fmtTime(d.first)} and no later than ${fmtTime(d.last)}.`, 'warn'); return p; }
      if (d.changes.some(c => c.at === t)) { toast(`There is already a price change at ${fmtTime(t)}.`, 'warn'); return p; }
      const changes = [...d.changes, { at: t, name: null }].sort((a, b) => a.at.localeCompare(b.at));
      const col = changes.findIndex(c => c.at === t) + 1;
      // The new column starts with the prices of the one it splits.
      const prices = Object.fromEntries(Object.entries(d.prices).map(([k, cells]) => [k, [...cells.slice(0, col), { ...cells[col - 1] }, ...cells.slice(col)]]));
      const next = { ...d, changes, prices };
      return i === 0 ? { ...p, usual: next } : { ...p, different: p.different.map((x, j) => j === i - 1 ? next : x) };
    });
    setAdding(null);
  }
  function removeChange(i: number, col: number) {
    edit(p => {
      const d = dayAt(p, i);
      const next = { ...d, changes: d.changes.filter((_, j) => j !== col - 1), prices: Object.fromEntries(Object.entries(d.prices).map(([k, cells]) => [k, cells.filter((_, j) => j !== col)])) };
      return i === 0 ? { ...p, usual: next } : { ...p, different: p.different.map((x, j) => j === i - 1 ? next : x) };
    });
  }
  function rename(i: number, col: number, name: string) {
    edit(p => {
      const d = dayAt(p, i);
      const next = col === 0 ? { ...d, firstName: name.trim() || null } : { ...d, changes: d.changes.map((c, j) => j === col - 1 ? { ...c, name: name.trim() || null } : c) };
      return i === 0 ? { ...p, usual: next } : { ...p, different: p.different.map((x, j) => j === i - 1 ? next : x) };
    });
    setRenaming(null);
  }
  function setCell(i: number, key: string, col: number, patch: Partial<PriceCell>) {
    edit(p => {
      const d = dayAt(p, i);
      const cells = (d.prices[key] ?? []).map((c, j) => j === col ? { ...c, ...patch } : c);
      const next = { ...d, prices: { ...d.prices, [key]: cells } };
      return i === 0 ? { ...p, usual: next } : { ...p, different: p.different.map((x, j) => j === i - 1 ? next : x) };
    });
  }
  const setRound = (key: string, patch: Partial<CoursePlan['rounds'][number]>) => edit(p => setRoundSale(p, key, patch, defaultCell));


  // ── Saving ─────────────────────────────────────────────────────────────────
  async function review() {
    if (!plan) return;
    const why = checkPlan(plan, rounds);
    if (why) return toast(why, 'warn');
    setPending({ preview: null, error: '' });
    const r = await dfetch<Preview>('/api/operator/schedule/preview', { method: 'POST', body: JSON.stringify({ op: 'course', plan }) });
    setPending({ preview: r.ok ? r.data : null, error: r.ok ? '' : r.error });
  }
  async function save() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await dfetch<Row[]>('/api/operator/schedule', { method: 'PUT', body: JSON.stringify({ coursePlan: plan }) });
      if (!r.ok || !Array.isArray(r.data)) { toast(r.ok ? 'It came back empty — refresh and check.' : r.error); return; }
      setRows(r.data);
      setPending(null);
      toast('Saved. Your tee sheet is updated.', 'ok');
    } finally { setBusy(false); }
  }

  async function closeDay() {
    if (!closing) return;
    setBusy(true);
    const r = await dfetch('/api/operator/blackouts', { method: 'POST', body: JSON.stringify(closing) });
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setClosing(null);
    await loadBlackouts();
    toast('Closed. Open tee times that day are off the sheet; booked ones stay.', 'ok');
  }
  async function reopenDay(id: string) {
    setBusy(true);
    const r = await dfetch<{ created?: number }>('/api/operator/blackouts', { method: 'DELETE', body: JSON.stringify({ id }) });
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setBlackouts(prev => prev.filter(b => b.id !== id));
    toast('Reopened. That day’s tee times are back on the sheet.', 'ok');
  }

  if (pageAccess.loaded && !pageAccess.can('schedule.view')) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="schedule" />
      <main className="flex-1 md:overflow-y-auto"><StaffNotice what="the schedule" view="schedule.view" /></main>
    </div>
  );

  // ── Closed days calendar ───────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA');
  const monthStart = month;
  const monthDate = new Date(monthStart + 'T12:00:00Z');
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (monthDate.getUTCDay() + 6) % 7; // Monday-first grid
  const shiftMonth = (n: number) => { const d = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + n, 1)); setMonth(d.toISOString().slice(0, 10)); };
  const closedByDate = new Map(blackouts.map(b => [b.date, b]));

  const dayPlans = plan ? [plan.usual, ...plan.different] : [];
  const sold = plan ? plan.rounds.filter(r => r.on && rounds.some(x => x.key === r.key)) : [];
  const labelOf = (key: string) => rounds.find(r => r.key === key)?.label ?? 'Round';

  /** One set of days' hours: first tee, last tee, minutes apart. */
  const hoursFields = (i: number, d: DayPlan) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-md">
      <div><label className={lCls} htmlFor={`first-${i}`}>First tee</label><input id={`first-${i}`} type="time" value={d.first} disabled={!canEdit} onChange={e => setDay(i, { first: e.target.value })} className={iCls} /></div>
      <div><label className={lCls} htmlFor={`last-${i}`}>Last tee</label><input id={`last-${i}`} type="time" value={d.last} disabled={!canEdit} onChange={e => setDay(i, { last: e.target.value })} className={iCls} /></div>
      <div><label className={lCls} htmlFor={`gap-${i}`}>Minutes apart</label><input id={`gap-${i}`} type="number" min={1} max={60} value={d.interval || ''} disabled={!canEdit} onChange={e => setDay(i, { interval: Number(e.target.value) })} className={iCls} /></div>
    </div>
  );

  /** The price table for one set of days: a row per round sold, a column per price change. */
  const priceTable = (i: number, d: DayPlan) => {
    const names = columnNames(d);
    const starts = [d.first, ...d.changes.map(c => c.at)];
    const days = plan ? daysOf(plan, d) : [];
    const wd = days.some(x => x >= 1 && x <= 5), we = days.some(x => x === 0 || x === 6);
    const soldIn = (key: string, col: number) => {
      const r = plan?.rounds.find(x => x.key === key);
      const from = r?.from ?? d.first, to = r?.to ?? d.last;
      const end = starts[col + 1];
      return end ? from < end && to >= starts[col] : from <= d.last && to >= starts[col];
    };
    const money = (label: string, v: number | null, set: (s: string) => void, req: boolean) => (
      <label className="relative inline-block">
        <span className="sr-only">{label}</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-ink-muted pointer-events-none">$</span>
        <input type="number" min={0} step="0.01" value={v ?? ''} placeholder={req ? '0' : '—'} disabled={!canEdit} onChange={e => set(e.target.value)} className={cellIn} />
      </label>
    );
    // CART-1: walking per cell, weekday and weekend — off means a cart is required (and charged).
    const walkPair = (key: string, col: number) => {
      const c = d.prices[key]?.[col];
      if (!c) return null;
      const box = (k: 'walk' | 'walkWeekend', other: 'walk' | 'walkWeekend', show: boolean, when: string) => show && (
        <label className="inline-flex items-center gap-1.5 w-[5.5rem] text-[13px] text-ink">
          <input type="checkbox" checked={(c[k] ?? c.walk) !== false} disabled={!canEdit} aria-label={`${labelOf(key)} ${names[col]} walking ${when}`}
            onChange={e => setCell(i, key, col, { [k]: e.target.checked, ...(!(wd && we) ? { [other]: e.target.checked } : {}) })} className="w-4 h-4 accent-pine" />
          {(c[k] ?? c.walk) !== false ? 'Yes' : 'Cart only'}
        </label>
      );
      return <div className="flex gap-1.5">{box('walk', 'walkWeekend', wd, 'weekday')}{box('walkWeekend', 'walk', we, 'weekend')}</div>;
    };
    const pair = (key: string, col: number, kind: 'green' | 'cart' | 'member' | 'resident') => {
      const c = d.prices[key]?.[col];
      if (!c) return null;
      const [a, b] = kind === 'green' ? ['weekday', 'weekend'] as const : kind === 'cart' ? ['cart', 'cartWeekend'] as const : kind === 'member' ? ['memberWeekday', 'memberWeekend'] as const : ['residentWeekday', 'residentWeekend'] as const;
      const req = kind === 'green' || kind === 'cart';
      const parse = req ? num : optNum;
      return (
        <div className="flex gap-1.5">
          {wd && money(`${labelOf(key)} ${names[col]} ${kind} weekday`, c[a] as number | null, s => setCell(i, key, col, { [a]: parse(s), ...(!we ? { [b]: parse(s) } : {}) }), req)}
          {we && money(`${labelOf(key)} ${names[col]} ${kind} weekend`, (c[b] ?? (kind === 'cart' ? c.cart : null)) as number | null, s => setCell(i, key, col, { [b]: parse(s), ...(!wd ? { [a]: parse(s) } : {}) }), req)}
        </div>
      );
    };
    const subRows: { kind: 'green' | 'cart' | 'walk' | 'member' | 'resident'; label: string }[] = [
      { kind: 'green', label: 'Green fee' }, { kind: 'cart', label: 'Cart, per rider' }, { kind: 'walk', label: 'Can walk' },
      ...(showMember ? [{ kind: 'member' as const, label: 'Members' }] : []),
      ...(showResident ? [{ kind: 'resident' as const, label: 'Residents' }] : []),
    ];
    return (
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="text-[13.5px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left font-semibold text-ink pr-4 pb-2 align-bottom min-w-[9rem]">{wd && we ? <span className="text-[12px] font-normal text-ink-muted">Weekday · weekend</span> : null}</th>
              {names.map((n, col) => (
                <th key={col} className="text-left font-normal pr-4 pb-2 align-bottom">
                  {renaming && renaming.d === i && renaming.col === col ? (
                    <input autoFocus value={renaming.name} onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                      onBlur={() => rename(i, col, renaming.name)} onKeyDown={e => { if (e.key === 'Enter') rename(i, col, renaming.name); if (e.key === 'Escape') setRenaming(null); }}
                      aria-label="Price name" className="w-32 bg-paper border border-line rounded-md px-2 py-1 text-[13.5px] text-ink" />
                  ) : (
                    <button type="button" disabled={!canEdit} onClick={() => setRenaming({ d: i, col, name: n })} title={canEdit ? 'Tap to rename' : undefined}
                      className="font-semibold text-ink hover:text-pine text-left disabled:hover:text-ink">{n}</button>
                  )}
                  <div className="text-[12px] text-ink-muted flex items-center gap-2">
                    {col === 0 ? `from ${fmtTime(d.first)}` : `from ${fmtTime(starts[col])}`}
                    {col > 0 && canEdit && <button type="button" onClick={() => removeChange(i, col)} className="text-ink-muted hover:text-bad underline underline-offset-2">remove</button>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sold.map(r => subRows.map((sr, k) => (
              <tr key={`${r.key}-${sr.kind}`}>
                <td className={'pr-4 py-1.5 align-middle ' + (k === 0 ? 'border-t border-line-soft' : '')}>
                  {k === 0 ? <span className="font-semibold text-ink">{labelOf(r.key)}</span> : <span className="text-ink-soft pl-3">{sr.label}</span>}
                </td>
                {names.map((_, col) => (
                  <td key={col} className={'pr-4 py-1.5 align-middle ' + (k === 0 ? 'border-t border-line-soft' : '')}>
                    {!soldIn(r.key, col) ? (k === 0 ? <span className="text-ink-muted">not sold</span> : null)
                      : sr.kind === 'walk' ? walkPair(r.key, col)
                      : pair(r.key, col, sr.kind)}
                  </td>
                ))}
              </tr>
            )))}
          </tbody>
        </table>
        {canEdit && (
          adding && adding.d === i ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div><label className={lCls} htmlFor={`chg-${i}`}>From what time?</label><input id={`chg-${i}`} type="time" autoFocus value={adding.at} onChange={e => setAdding({ ...adding, at: e.target.value })} className={iCls} /></div>
              <button type="button" onClick={() => setAdding(null)} className="px-3 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Cancel</button>
              <button type="button" onClick={() => addChange(i, adding.at)} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium">Add</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding({ d: i, at: d.changes.length === 0 && d.first < '15:00' && d.last > '15:00' ? '15:00' : '' })} className="mt-3 text-[13px] font-medium text-pine hover:underline">+ Add a price change</button>
          )
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="schedule" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="the schedule" view="schedule.view" edit="schedule.edit" />
        <div className="px-4 sm:px-10 py-7 space-y-6">
          <div className="min-w-0 max-w-[46em]">
            <h1 className="font-serif text-[32px] leading-none text-ink">Schedule</h1>
            <p className="text-[14px] text-ink-soft mt-2.5 leading-snug">Saving updates your tee sheet straight away; booked times never change.</p>
          </div>

          {loadError && <LoadError message={loadError} onRetry={loadSchedules} />}
          {productsError && <LoadError message={`Couldn't load your rounds — ${productsError}`} onRetry={loadProducts} />}
          {!plan && !loadError && <Card className="p-5 text-[14px] text-ink-muted">Loading your schedule…</Card>}
          {plan && !loading && rows.length === 0 && !loadError && (
            <p className="bg-warn/5 border border-warn/20 rounded-md px-4 py-3 text-[13.5px] text-ink">No tee times yet — set hours and prices, then save.</p>
          )}

          {plan && (
            <>
              {/* 1. When you're open */}
              <Card className="p-5 space-y-5">
                <div>
                  <h2 className="text-[17px] font-semibold text-ink">When you&apos;re open</h2>
                  <p className="text-[13px] text-ink-soft mt-1" title="The last tee time goes off at the time you give.">{plan.different.length ? dayList(daysOf(plan, plan.usual)) : 'Every day'}</p>
                </div>
                {plan.usual.closed ? null : hoursFields(0, plan.usual)}
                {plan.different.map((d, j) => (
                  <div key={j} className="bg-paper/70 rounded-md p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
                        {WEEK.map(day => (
                          <button key={day} type="button" disabled={!canEdit} onClick={() => toggleDiffDay(j + 1, day)} aria-pressed={d.days.includes(day)}
                            className={'px-2.5 py-1 rounded-md text-[13px] border ' + (d.days.includes(day) ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:text-ink')}>{DAYS[day]}</button>
                        ))}
                      </div>
                      {canEdit && <button type="button" onClick={() => edit(p => ({ ...p, different: p.different.filter((_, k) => k !== j) }))} className="text-[13px] text-ink-muted hover:text-bad">Remove</button>}
                    </div>
                    <label className="flex items-center gap-2 text-[13.5px] text-ink">
                      <input type="checkbox" checked={d.closed} disabled={!canEdit} onChange={e => setDay(j + 1, { closed: e.target.checked })} className="w-4 h-4 accent-pine" />
                      Closed these days
                    </label>
                    {!d.closed && hoursFields(j + 1, d)}
                  </div>
                ))}
                {canEdit && <button type="button" onClick={addDifferentDays} className="text-[13px] font-medium text-pine hover:underline">Different hours on some days</button>}
              </Card>

              {/* 2. What golfers can book */}
              <Card className="p-5">
                <h2 className="text-[17px] font-semibold text-ink">What golfers can book</h2>
                <p className="text-[13px] text-ink-soft mt-1 mb-3"><Link href="/dashboard/settings?section=Your+course" className="text-pine hover:underline">Rounds you offer</Link></p>
                <div className="divide-y divide-line-soft">
                  {plan.rounds.filter(r => rounds.some(x => x.key === r.key)).map(r => (
                    <div key={r.key} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <label className="flex items-center gap-2 min-w-[10rem]">
                        <input type="checkbox" checked={r.on} disabled={!canEdit || rounds.length === 1} onChange={e => setRound(r.key, { on: e.target.checked })} className="w-4 h-4 accent-pine" />
                        <span className="text-[14px] font-semibold text-ink">{labelOf(r.key)}</span>
                      </label>
                      {r.on && (
                        <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink">
                          <select value={r.from || r.to ? 'between' : 'all'} disabled={!canEdit}
                            onChange={e => setRound(r.key, e.target.value === 'all' ? { from: null, to: null } : { from: plan.usual.first, to: plan.usual.last })}
                            aria-label={`When ${labelOf(r.key)} is sold`} className="bg-paper border border-line rounded-md px-2 py-1.5 text-[13.5px]">
                            <option value="all">All day</option>
                            <option value="between">Between</option>
                          </select>
                          {(r.from || r.to) && <>
                            <input type="time" aria-label="Sold from" value={r.from ?? plan.usual.first} disabled={!canEdit} onChange={e => setRound(r.key, { from: e.target.value })} className="bg-paper border border-line rounded-md px-2 py-1.5" />
                            <span className="text-ink-soft">and</span>
                            <input type="time" aria-label="Sold until" value={r.to ?? plan.usual.last} disabled={!canEdit} onChange={e => setRound(r.key, { to: e.target.value })} className="bg-paper border border-line rounded-md px-2 py-1.5" />
                          </>}
                        </div>
                      )}
                      {!r.on && <span className="text-[13px] text-ink-muted">Not sold</span>}
                    </div>
                  ))}
                </div>
              </Card>

              {/* 3. What it costs */}
              <Card className="p-5 space-y-6">
                <div>
                  <h2 className="text-[17px] font-semibold text-ink">What it costs</h2>
                  {!showMember && !showResident && <p className="text-[13px] text-ink-muted mt-1">Member and resident prices: <Link href="/dashboard/members" className="text-pine hover:underline">add a membership or resident list</Link></p>}
                </div>
                {dayPlans.map((d, i) => d.closed ? null : (
                  <section key={i}>
                    {plan.different.length > 0 && <h3 className="text-[14px] font-semibold text-ink mb-2">{dayList(daysOf(plan, d))}</h3>}
                    {sold.length === 0 ? <p className="text-[13.5px] text-ink-muted">No rounds on sale</p> : priceTable(i, d)}
                  </section>
                ))}
              </Card>
            </>
          )}

          {/* Closed days + booking rules + booking windows */}
          <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
            <Card className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-semibold text-ink">Closed days</h2>
                <div className="flex items-center gap-1">
                  <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="w-8 h-8 rounded-md hover:bg-paper text-ink-soft text-[18px] leading-none">‹</button>
                  <span className="text-[14px] font-semibold text-ink w-36 text-center">{monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                  <button onClick={() => shiftMonth(1)} aria-label="Next month" className="w-8 h-8 rounded-md hover:bg-paper text-ink-soft text-[18px] leading-none">›</button>
                </div>
              </div>
              <p className="text-[13px] text-ink-muted mt-1 mb-3" title="Booked times stay — to cancel bookings for weather, use Weather on the tee sheet.">{canEdit ? 'Tap a day to close or reopen it · ' : ''}Booked times stay · weather: Weather on the tee sheet</p>
              {blackoutError && <LoadError message={blackoutError} onRetry={loadBlackouts} />}
              <div className="grid grid-cols-7 text-center text-[12px] text-ink-muted mb-1">{WEEK.map(d => <span key={d}>{DAYS[d]}</span>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const date = monthStart.slice(0, 8) + String(i + 1).padStart(2, '0');
                  const closed = closedByDate.get(date);
                  const past = date < today;
                  return (
                    <button key={date} disabled={!canEdit || past || busy}
                      onClick={() => closed ? reopenDay(closed.id) : setClosing({ date, reason: '' })}
                      title={closed ? `Closed${closed.reason ? `: ${closed.reason}` : ''} — click to reopen` : past ? '' : 'Click to close this day'}
                      className={'h-10 rounded-md text-[13px] tabular-nums ' + (closed ? 'bg-bad/[0.08] text-bad font-semibold border border-bad/20' : past ? 'text-ink-faint' : 'text-ink hover:bg-paper border border-transparent')}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              {closing && (
                <div className="mt-4 flex flex-wrap items-end gap-2 bg-paper/70 rounded-md p-3">
                  <div className="min-w-0 flex-1">
                    <label className={lCls} htmlFor="close-reason">Close {new Date(closing.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</label>
                    <input id="close-reason" value={closing.reason} onChange={e => setClosing({ ...closing, reason: e.target.value })} placeholder="Why (member outing, aeration…)" className={iCls} />
                  </div>
                  <button onClick={() => setClosing(null)} className="px-3 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                  <button onClick={closeDay} disabled={busy} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{busy ? 'Closing…' : 'Close this day'}</button>
                </div>
              )}
              {blackouts.filter(b => b.date >= today).length > 0 && (
                <ul className="mt-4 divide-y divide-line-soft">
                  {blackouts.filter(b => b.date >= today).map(b => (
                    <li key={b.id} className="flex items-baseline justify-between gap-3 py-2 text-[13.5px]">
                      <span className="text-ink">{new Date(b.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}<span className="text-ink-soft">{b.reason ? ` · ${b.reason}` : ''}</span></span>
                      {canEdit && <button onClick={() => reopenDay(b.id)} disabled={busy} className="text-[13px] font-medium text-pine hover:underline disabled:opacity-50">Reopen</button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              {/* W2-6 slice 3: per-round booking rules (group size, how far ahead). */}
              {activeProducts.length > 0 && (() => {
                const round = activeProducts.find(p => p.id === rulesView) ?? activeProducts[0];
                return (
                  <div>
                    {activeProducts.length > 1 && (
                      <select value={round.id} onChange={e => setRulesView(e.target.value)} aria-label="Booking rules for" className="mb-2 bg-white border border-line rounded-md px-2 py-1.5 text-[13.5px] text-ink">
                        {activeProducts.map(p => <option key={p.id} value={p.id}>Booking rules · {p.label}</option>)}
                      </select>
                    )}
                    <RoundRulesCard key={round.id} productId={round.id} label={round.label} course={courseRules} canEdit={!pageAccess.isStaff}
                      rules={{ minPlayers: round.minPlayers ?? null, maxPlayers: round.maxPlayers ?? null, publicAdvanceDays: round.publicAdvanceDays ?? null }}
                      onSaved={r => setProducts(ps => ps.map(p => p.id === round.id ? { ...p, ...r } : p))} />
                  </div>
                );
              })()}

              <Card className="p-5">
                <h2 className="text-[15px] font-semibold text-ink">How far ahead golfers can book</h2>
                {windowsError ? <div className="mt-2"><LoadError message={windowsError} onRetry={loadWindows} /></div> : (
                  <div className="mt-2 divide-y divide-line-soft text-[13.5px]">
                    <div className="flex justify-between py-2"><span className="text-ink">Public</span><span className="tabular-nums text-ink">{windows.publicAdvanceDays ?? '—'} days</span></div>
                    <div className="flex justify-between py-2"><span className="text-ink">Members</span><span className="tabular-nums text-ink">{windows.memberAdvanceDays ?? '—'} days</span></div>
                  </div>
                )}
                <Link href="/dashboard/settings?section=Booking+rules" className="inline-block mt-2 text-[13px] font-medium text-pine hover:underline">Change in Settings</Link>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Unsaved changes: one save for the whole page, with a preview first. */}
      {dirty && canEdit && (
        <div className="fixed bottom-16 md:bottom-0 inset-x-0 md:left-[var(--op-rail-w)] z-40 bg-white border-t border-line">
          <div className="px-4 sm:px-10 py-3 flex items-center justify-between gap-3">
            <span className="text-[13.5px] text-ink">Unsaved changes</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPlan(JSON.parse(saved))} className="px-3 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Undo changes</button>
              <button type="button" onClick={review} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium">Review and save</button>
            </div>
          </div>
        </div>
      )}

      {/* What a save will do — shown before anything is written */}
      {pending && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Save your schedule?">
          <Card className="w-full max-w-md p-6">
            <h3 className="font-serif font-semibold text-ink text-[20px]">Save your schedule?</h3>
            {pending.error ? <p className="text-[13.5px] text-bad mt-3" role="alert">This can&apos;t be saved yet: {pending.error}</p>
              : !pending.preview ? <p className="text-[13.5px] text-ink-muted mt-3">Checking what this changes on your tee sheet…</p>
              : (<>
                {!pending.preview.refusal && <>
                  <p className="text-[13.5px] text-ink-soft mt-2">On your tee sheet over the next {pending.preview.days} days, this:</p>
                  <ul className="mt-2 space-y-1.5">{previewLines(pending.preview).map(l => <li key={l} className="text-[14px] text-ink leading-snug pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-2 before:h-0.5 before:bg-fairway">{l}</li>)}</ul>
                </>}
                {pending.preview.refusal && (
                  <p className="mt-4 bg-bad/5 border border-bad/20 rounded-md px-3 py-2.5 text-[13.5px] text-ink leading-snug" role="alert">This can&apos;t be saved: {pending.preview.refusal}</p>
                )}
                {!pending.preview.refusal && !!pending.preview.warnings?.length && (
                  <div className="mt-4 bg-warn/5 border border-warn/20 rounded-md px-3 py-2.5 space-y-1.5">
                    <p className="text-[13.5px] font-semibold text-ink">Worth a look before you save</p>
                    {pending.preview.warnings.map(w => <p key={w} className="text-[13.5px] text-ink leading-snug">{w}</p>)}
                  </div>
                )}
              </>)}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPending(null)} disabled={busy} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Go back</button>
              <button onClick={save} disabled={busy || !pending.preview || !!pending.preview.refusal} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
