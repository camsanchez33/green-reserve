'use client';
// Schedule rework (Cam 2026-10-19: "this page sucks … think of what is needed
// to be known, ease and understanding and functionality … rework the whole
// thing"; OPERATOR_REWORK_SPEC "Schedule, Members, Money, Messages — round 1").
//   1. Your week — each day's tee times as bands: when they run, how far apart,
//      what they cost. Click one to change it.
//   2. Prices — every price period in one table. Periods are the course's own
//      (Cam: "up to the course if they want twilight times and morning times").
//   3. Closed days — a month calendar; click a day to close or reopen it.
// A price period is a TeeTimeSchedule row (tierName = its name). W2-4 (Cam
// 2026-10-19): a SCHEDULE is the hours for one round on some days, split into
// any number of price periods, edited and saved as one (lib/schedule-plans.ts
// groups the rows; PUT /api/operator/schedule saves them together). Saving applies
// to the tee sheet straight away (lib/schedule-service regenerates), and every
// save, pause and delete first shows what it will change (lib/schedule-preview).
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
import { groupSchedules, snapToGrid, checkPeriods, type PlanGroup } from '@/lib/schedule-plans';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first, the way a course reads its week
const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full';
const lCls = 'text-[13px] font-semibold text-ink block mb-1.5';
const money = (n: number | null | undefined) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const isWeekend = (d: number) => d === 0 || d === 6;

type Schedule = {
  id: string; tierName: string; daysOfWeek: number[]; startTime: string; endTime: string;
  /** L2: the bookable round this period generates slots for (null = the course as a whole). */
  productId?: string | null; productLabel?: string | null;
  intervalMinutes: number; holes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number | null; memberRateWeekend: number | null;
  residentRateWeekday: number | null; residentRateWeekend: number | null;
  cartFee: number; walkingAllowed: boolean; active: boolean; createdAt: string;
};
type ProductOpt = { id: string; label: string; holes: number; active: boolean } & RoundRules;
type Preview = { days: number; added: number; removed: number; repriced: number; bookedKept: number; refusal?: string | null; warnings?: string[] };
type Pending = { title: string; doing: string; preview: Preview | null; error: string; run: () => Promise<void> };

type PeriodForm = {
  id?: string; tierName: string; from: string;
  greenFeeWeekday: number; greenFeeWeekend: number; memberRateWeekday: string; memberRateWeekend: string;
  residentRateWeekday: string; residentRateWeekend: string; cartFee: number; walkingAllowed: boolean;
};
const emptyPeriod = (from: string): PeriodForm => ({ tierName: '', from, greenFeeWeekday: 65, greenFeeWeekend: 85, memberRateWeekday: '', memberRateWeekend: '', residentRateWeekday: '', residentRateWeekend: '', cartFee: 18, walkingAllowed: true });
const emptyForm = () => ({ productId: '' as string, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] as number[], startTime: '06:30', endTime: '17:30', intervalMinutes: 8, holes: 18, periods: [emptyPeriod('06:30')] });
const str = (n: number | null) => n == null ? '' : n.toString();
const periodFromRow = (s: Schedule): PeriodForm => ({ id: s.id, tierName: s.tierName === 'standard' ? '' : s.tierName, from: s.startTime, greenFeeWeekday: s.greenFeeWeekday, greenFeeWeekend: s.greenFeeWeekend, memberRateWeekday: str(s.memberRateWeekday), memberRateWeekend: str(s.memberRateWeekend), residentRateWeekday: str(s.residentRateWeekday), residentRateWeekend: str(s.residentRateWeekend), cartFee: s.cartFee, walkingAllowed: s.walkingAllowed });
const groupName = (g: PlanGroup<Schedule>) => g.periods.length > 1 ? g.periods.map(p => p.tierName === 'standard' ? 'Tee times' : p.tierName).join(' · ') : (g.periods[0].tierName === 'standard' ? 'these tee times' : `"${g.periods[0].tierName}"`);

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

function dayRange(rows: Schedule[]) {
  if (!rows.length) return { from: 6 * 60, to: 18 * 60 };
  const from = Math.min(...rows.map(r => toMin(r.startTime)));
  const to = Math.max(...rows.map(r => toMin(r.endTime)));
  return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 };
}

export default function SchedulesPage() {
  const pageAccess = useDashboardAccess();
  const canEdit = pageAccess.can('schedule.edit');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editGroup, setEditGroup] = useState<PlanGroup<Schedule> | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [hasMember, setHasMember] = useState(false);
  const [hasResident, setHasResident] = useState(false);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productsError, setProductsError] = useState('');
  const [productView, setProductView] = useState<string>('');
  const [blackouts, setBlackouts] = useState<{ id: string; date: string; reason: string }[]>([]);
  const [blackoutError, setBlackoutError] = useState('');
  const [closing, setClosing] = useState<{ date: string; reason: string } | null>(null);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 8) + '01');
  const [windows, setWindows] = useState<{ publicAdvanceDays: number | null; memberAdvanceDays: number | null }>({ publicAdvanceDays: null, memberAdvanceDays: null });
  const [windowsError, setWindowsError] = useState('');
  const [courseRules, setCourseRules] = useState<CourseRules | null>(null);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const r = await dfetch<Schedule[]>('/api/operator/schedule');
    if (r.ok) { setSchedules(Array.isArray(r.data) ? r.data : []); setLoadError(''); }
    else { setSchedules([]); setLoadError(r.error); }
    setLoading(false);
  }, []);
  const loadWindows = useCallback(async () => {
    const r = await dfetch<{ hasMemberPricing?: boolean; hasResidentPricing?: boolean; publicAdvanceDays?: number; memberAdvanceDays?: number; walkingAllowed?: string; cartRequired?: boolean; minPlayers?: number; maxPlayers?: number }>('/api/operator/settings');
    if (!r.ok || !r.data) { setWindowsError(r.ok ? 'Settings came back empty — refresh.' : r.error); return; }
    const c = r.data;
    setHasMember(!!c.hasMemberPricing); setHasResident(!!c.hasResidentPricing);
    setWindows({ publicAdvanceDays: typeof c.publicAdvanceDays === 'number' ? c.publicAdvanceDays : null, memberAdvanceDays: typeof c.memberAdvanceDays === 'number' ? c.memberAdvanceDays : null });
    setCourseRules({ walkingAllowed: c.walkingAllowed ?? 'always', cartRequired: !!c.cartRequired, minPlayers: c.minPlayers ?? 1, maxPlayers: c.maxPlayers ?? 4, publicAdvanceDays: c.publicAdvanceDays ?? 7 });
    setWindowsError('');
  }, []);
  const loadProducts = useCallback(async () => {
    const r = await dfetch<ProductOpt[]>('/api/operator/course-products');
    if (r.ok && Array.isArray(r.data)) { setProducts(r.data); setProductsError(''); }
    else if (!r.ok) setProductsError(r.error);
  }, []);
  const loadBlackouts = useCallback(async () => {
    const r = await dfetch<{ id: string; date: string; reason: string }[]>('/api/operator/blackouts');
    if (r.ok && Array.isArray(r.data)) { setBlackouts(r.data.slice().sort((a, b) => a.date.localeCompare(b.date))); setBlackoutError(''); }
    else if (!r.ok) setBlackoutError(r.error);
  }, []);
  useEffect(() => { loadSchedules(); loadProducts(); loadWindows(); loadBlackouts(); }, [loadProducts, loadSchedules, loadBlackouts, loadWindows]);

  const activeProducts = products.filter(p => p.active);
  const multi = activeProducts.length > 0;
  // A schedule for no round, or for a round that's switched off, still has to be
  // findable (and deletable) — it gets its own "Other" tab.
  const orphans = multi ? schedules.filter(s => !s.productId || !activeProducts.some(p => p.id === s.productId)) : [];
  const view = multi ? (productView || activeProducts[0]?.id || '') : '';
  const inView = schedules.filter(s => !multi || (view === 'other' ? orphans.includes(s) : s.productId === view));
  const showMember = hasMember || schedules.some(s => s.memberRateWeekday != null);
  const showResident = hasResident || schedules.some(s => s.residentRateWeekday != null);

  const groups = groupSchedules(schedules);
  const groupOf = (id: string) => groups.find(g => g.ids.includes(id)) ?? null;
  function openAdd() { setForm({ ...emptyForm(), productId: view === 'other' ? '' : view }); setEditGroup(null); setShowForm(true); }
  function openEdit(s: Schedule) {
    if (!canEdit) return;
    const g = groupOf(s.id);
    if (!g) return;
    setForm({ productId: g.productId ?? '', daysOfWeek: g.daysOfWeek, startTime: g.startTime, endTime: g.endTime, intervalMinutes: g.intervalMinutes, holes: g.holes, periods: g.periods.map(periodFromRow) });
    setEditGroup(g); setShowForm(true);
  }
  const toggleDay = (d: number) => setForm(f => ({ ...f, daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x => x !== d) : [...f.daysOfWeek, d].sort() }));
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v, ...(k === 'startTime' ? { periods: f.periods.map((p, i) => i === 0 ? { ...p, from: String(v) } : p) } : {}) }));
  const setPeriod = (i: number, k: keyof PeriodForm, v: unknown) => setForm(f => ({ ...f, periods: f.periods.map((p, j) => j === i ? { ...p, [k]: v } : p) }));
  /** Split the last period: the new one starts at 3pm when that falls inside it (a twilight), else halfway, on a tee time. */
  function addPeriod() {
    setForm(f => {
      const last = f.periods[f.periods.length - 1];
      const a = toMin(last.from), b = toMin(f.endTime);
      const pick = a < 15 * 60 && 15 * 60 < b ? 15 * 60 : Math.round((a + b) / 2);
      const from = snapToGrid(f.startTime, Number(f.intervalMinutes), `${String(Math.floor(pick / 60)).padStart(2, '0')}:${String(pick % 60).padStart(2, '0')}`);
      if (from <= last.from || from >= f.endTime) { toast('There is no room for another price period — move the last tee time later first.', 'warn'); return f; }
      return { ...f, periods: [...f.periods, { ...last, id: undefined, tierName: '', from }] };
    });
  }
  const removePeriod = (i: number) => setForm(f => ({ ...f, periods: f.periods.filter((_, j) => j !== i) }));

  /** Ask the server what a change would do, then show it before anything is saved. */
  async function confirmWithPreview(title: string, doing: string, change: Record<string, unknown>, run: () => Promise<void>) {
    setPending({ title, doing, preview: null, error: '', run });
    const r = await dfetch<Preview>('/api/operator/schedule/preview', { method: 'POST', body: JSON.stringify(change) });
    setPending(p => p && p.title === title ? { ...p, preview: r.ok ? r.data : null, error: r.ok ? '' : r.error } : p);
  }

  /** The schedule as the server stores it: each period runs to where the next starts, the last to the last tee time. */
  function plan(over: { active?: boolean; periods?: [] } = {}) {
    const first = form.startTime, iv = Number(form.intervalMinutes);
    const froms = form.periods.map((p, i) => i === 0 ? first : snapToGrid(first, iv, p.from));
    return {
      replaces: editGroup?.ids ?? [],
      productId: form.productId || null,
      daysOfWeek: form.daysOfWeek, intervalMinutes: iv, holes: form.holes,
      active: over.active ?? (editGroup ? editGroup.active : true),
      periods: over.periods ?? form.periods.map((p, i) => ({
        id: p.id, tierName: p.tierName.trim() || 'standard', startTime: froms[i], endTime: froms[i + 1] ?? form.endTime,
        greenFeeWeekday: p.greenFeeWeekday, greenFeeWeekend: p.greenFeeWeekend, cartFee: p.cartFee, walkingAllowed: p.walkingAllowed,
        memberRateWeekday: p.memberRateWeekday || null, memberRateWeekend: p.memberRateWeekend || null,
        residentRateWeekday: p.residentRateWeekday || null, residentRateWeekend: p.residentRateWeekend || null,
      })),
    };
  }

  /** Preview, then PUT the whole schedule. */
  function submit(title: string, doing: string, body: ReturnType<typeof plan>, done: string) {
    confirmWithPreview(title, doing, { op: 'plan', plan: body }, async () => {
      const r = await dfetch<Schedule[]>('/api/operator/schedule', { method: 'PUT', body: JSON.stringify(body) });
      if (!r.ok || !Array.isArray(r.data)) { toast(r.ok ? 'It came back empty — refresh and check.' : r.error); return; }
      setSchedules(r.data);
      setShowForm(false); setEditGroup(null);
      toast(done, 'ok');
    });
  }

  function save() {
    if (!form.daysOfWeek.length) return toast('Pick at least one day.', 'warn');
    if (multi && !form.productId) return toast('Pick which round these times are for.', 'warn');
    if (form.startTime >= form.endTime) return toast('The last tee time has to be after the first.', 'warn');
    if (!(Number(form.intervalMinutes) >= 1)) return toast('Set how many minutes apart tee times are.', 'warn');
    const body = plan();
    const why = checkPeriods(body.periods, body.intervalMinutes);
    if (why) return toast(why, 'warn');
    // W2-6: overlaps are the server's call — the preview refuses one tee time sold twice and notes the rest.
    submit(editGroup ? 'Save this schedule?' : 'Add this schedule?', 'Saving', body, 'Saved. Your tee sheet is updated.');
  }

  function toggleActive(g: PlanGroup<Schedule>) {
    const body = plan({ active: !g.active });
    submit(g.active ? `Pause ${groupName(g)}?` : `Turn ${groupName(g)} back on?`, g.active ? 'Pausing' : 'Turning it on', body,
      g.active ? 'Paused. Its open times are off the sheet.' : 'Back on. Your tee sheet is updated.');
  }

  function del(g: PlanGroup<Schedule>) {
    submit(`Delete ${groupName(g)}?`, 'Deleting', plan({ periods: [] }), 'Deleted. Its open times are off the sheet.');
  }

  async function runPending() {
    if (!pending) return;
    setBusy(true);
    try { await pending.run(); } finally { setBusy(false); setPending(null); }
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
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="schedule" />
      <main className="flex-1 md:overflow-y-auto"><StaffNotice what="the schedule" view="schedule.view" /></main>
    </div>
  );

  // Prices table: each schedule's periods together, in the order of the day.
  const tableRows = groups.flatMap(g => g.periods.filter(s => inView.includes(s)).map((s, i) => ({ s, first: i === 0 })));

  // ── Your week ──────────────────────────────────────────────────────────────
  const live = inView.filter(s => s.active);
  const range = dayRange(live);
  const span = Math.max(60, range.to - range.from);
  const hours: number[] = []; for (let m = range.from; m <= range.to; m += 60) hours.push(m);
  const PX = 0.9; // px per minute on the week view

  // ── Closed days calendar ───────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA');
  const monthStart = month;
  const monthDate = new Date(monthStart + 'T12:00:00Z');
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (monthDate.getUTCDay() + 6) % 7; // Monday-first grid
  const shiftMonth = (n: number) => { const d = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + n, 1)); setMonth(d.toISOString().slice(0, 10)); };
  const closedByDate = new Map(blackouts.map(b => [b.date, b]));

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="schedule" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="the schedule" view="schedule.view" edit="schedule.edit" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-[46em]">
              <h1 className="text-[30px] font-serif font-semibold leading-none tracking-tight text-ink">Schedule</h1>
              <p className="text-[14px] text-ink-soft mt-2.5 leading-snug">When your tee times run and what they cost. Saving updates your tee sheet straight away, and times that already have bookings never change.</p>
            </div>
            {canEdit && <button onClick={openAdd} className="shrink-0 bg-pine hover:bg-pine-hover text-white text-[13px] font-medium px-4 py-2 rounded-md">Add a schedule</button>}
          </div>

          {loadError && <LoadError message={loadError} onRetry={loadSchedules} />}
          {productsError && <LoadError message={`Couldn't load your rounds — ${productsError}`} onRetry={loadProducts} />}

          {multi && (
            <div className="flex gap-5 border-b border-line" role="tablist" aria-label="Round">
              {[...activeProducts.map(p => ({ id: p.id, label: p.label })), ...(orphans.length ? [{ id: 'other', label: `Other (${orphans.length})` }] : [])].map(p => (
                <button key={p.id} role="tab" aria-selected={view === p.id} onClick={() => setProductView(p.id)}
                  className={'pb-2 -mb-px text-[14px] font-semibold border-b-2 ' + (view === p.id ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>{p.label}</button>
              ))}
            </div>
          )}

          {/* 1. Your week */}
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <h2 className="text-[17px] font-semibold text-ink">Your week</h2>
              <span className="text-[12.5px] text-ink-muted">{canEdit ? 'Click a block to change it' : ''}</span>
            </div>
            <p className="text-[13px] text-ink-soft mb-4">Each block is a price period: when its tee times run, how far apart they are, and the public price that day. Click one to change its schedule.</p>
            {loading ? <p className="py-8 text-center text-[13px] text-ink-muted">Loading your schedule…</p>
              : live.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-ink">No tee times set up{multi ? ' for this round' : ''} yet.</p>
                  <p className="text-[13px] text-ink-soft mt-1">Add your hours, the gap between tee times and your prices, and the tee sheet fills itself in.</p>
                  {canEdit && <button onClick={openAdd} className="mt-4 bg-pine hover:bg-pine-hover text-white text-[13px] font-medium px-4 py-2 rounded-md">Add a schedule</button>}
                </div>
              ) : (<>
                {/* Laptop: the week side by side on a time axis */}
                <div className="hidden md:grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-x-1.5">
                  <div />
                  {WEEK.map(d => <div key={d} className="text-center text-[13px] font-semibold text-ink pb-2">{DAYS[d]}</div>)}
                  <div className="relative" style={{ height: span * PX }}>
                    {hours.map(m => <span key={m} className="absolute right-1 -translate-y-1/2 text-[11.5px] text-ink-muted tabular-nums" style={{ top: (m - range.from) * PX }}>{fmtTime(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`).replace(':00', '')}</span>)}
                  </div>
                  {WEEK.map(d => (
                    <div key={d} className="relative bg-paper/70 rounded-md" style={{ height: span * PX }}>
                      {hours.map(m => <div key={m} className="absolute left-0 right-0 border-t border-line-soft" style={{ top: (m - range.from) * PX }} />)}
                      {live.filter(s => s.daysOfWeek.length === 0 || s.daysOfWeek.includes(d)).map(s => {
                        const top = (toMin(s.startTime) - range.from) * PX;
                        const h = Math.max(36, (toMin(s.endTime) - toMin(s.startTime)) * PX - 2);
                        return (
                          <button key={s.id} onClick={() => openEdit(s)} disabled={!canEdit}
                            title={`${s.tierName === 'standard' ? 'Tee times' : s.tierName}: ${fmtTime(s.startTime)} – ${fmtTime(s.endTime)}, every ${s.intervalMinutes} min, ${money(isWeekend(d) ? s.greenFeeWeekend : s.greenFeeWeekday)}`}
                            className="absolute left-1 right-1 flex flex-col items-start justify-start rounded-md bg-white border border-line border-l-[3px] border-l-pine px-2 py-1.5 text-left overflow-hidden hover:border-line-strong disabled:cursor-default"
                            style={{ top, height: h }}>
                            <span className="block text-[12.5px] font-semibold text-ink truncate">{s.tierName === 'standard' ? 'Tee times' : s.tierName}</span>
                            <span className="block text-[12px] text-ink tabular-nums">{money(isWeekend(d) ? s.greenFeeWeekend : s.greenFeeWeekday)}</span>
                            {h > 60 && <span className="block text-[11.5px] text-ink-soft tabular-nums">{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</span>}
                            {h > 80 && <span className="block text-[11.5px] text-ink-soft">every {s.intervalMinutes} min</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {/* Phone: one line per run of times, per day */}
                <ul className="md:hidden divide-y divide-line-soft">
                  {WEEK.map(d => {
                    const rows = live.filter(s => s.daysOfWeek.length === 0 || s.daysOfWeek.includes(d)).sort((a, b) => a.startTime.localeCompare(b.startTime));
                    return (
                      <li key={d} className="py-2.5 flex gap-3">
                        <span className="w-10 shrink-0 text-[13px] font-semibold text-ink">{DAYS[d]}</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          {rows.length === 0 ? <span className="text-[13px] text-ink-muted">Closed</span> : rows.map(s => (
                            <button key={s.id} onClick={() => openEdit(s)} disabled={!canEdit} className="block w-full text-left text-[13px] text-ink">
                              <span className="font-medium">{s.tierName === 'standard' ? 'Tee times' : s.tierName}</span>{' '}
                              <span className="tabular-nums text-ink-soft">{fmtTime(s.startTime)}–{fmtTime(s.endTime)} · every {s.intervalMinutes} min · {money(isWeekend(d) ? s.greenFeeWeekend : s.greenFeeWeekday)}</span>
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>)}
          </Card>

          {/* 2. Prices */}
          {inView.length > 0 && (
            <Card className="p-5">
              <h2 className="text-[17px] font-semibold text-ink">Prices</h2>
              <p className="text-[13px] text-ink-soft mt-1 mb-4">Each schedule and its price periods, per player. Name periods however your course does: Morning, Twilight, Nine-hole evenings.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead><tr className="text-left border-b border-line">
                    {['Name', 'Days', 'Hours', 'Every', 'Weekday', 'Weekend', ...(showMember ? ['Member'] : []), ...(showResident ? ['Resident'] : []), 'Cart', ''].map((h, i) => <th key={i} className={'py-2 pr-4 text-[12.5px] font-semibold text-ink ' + (i >= 4 && h !== '' ? 'text-right' : '')}>{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-line-soft">
                    {tableRows.map(({ s, first }) => (
                      <tr key={s.id} className={(s.active ? '' : 'text-ink-muted') + (first ? ' border-t-2 border-t-line' : '')}>
                        <td className="py-2.5 pr-4 font-medium text-ink">{s.tierName === 'standard' ? 'Tee times' : s.tierName}{!s.active && <span className="ml-2 text-[12px] font-normal text-ink-muted">Paused</span>}</td>
                        <td className="py-2.5 pr-4">{s.daysOfWeek.length === 7 || s.daysOfWeek.length === 0 ? 'Every day' : WEEK.filter(d => s.daysOfWeek.includes(d)).map(d => DAYS[d]).join(', ')}</td>
                        <td className="py-2.5 pr-4 tabular-nums whitespace-nowrap">{fmtTime(s.startTime)} – {fmtTime(s.endTime)}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{s.intervalMinutes} min</td>
                        <td className="py-2.5 pr-4 tabular-nums text-right">{money(s.greenFeeWeekday)}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-right">{money(s.greenFeeWeekend)}</td>
                        {showMember && <td className="py-2.5 pr-4 tabular-nums text-right">{s.memberRateWeekday == null ? '—' : `${money(s.memberRateWeekday)} / ${money(s.memberRateWeekend)}`}</td>}
                        {showResident && <td className="py-2.5 pr-4 tabular-nums text-right">{s.residentRateWeekday == null ? '—' : `${money(s.residentRateWeekday)} / ${money(s.residentRateWeekend)}`}</td>}
                        <td className="py-2.5 pr-4 tabular-nums text-right">{money(s.cartFee)}</td>
                        <td className="py-2.5 text-right whitespace-nowrap">{canEdit && <button onClick={() => openEdit(s)} className="text-[13px] font-medium text-pine hover:underline">Edit</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[12.5px] text-ink-muted mt-3">Member and resident prices show weekday / weekend. Golfers also pay GreenReserve&apos;s booking fee on top when they book online.</p>
            </Card>
          )}

          {/* 3. Closed days + booking windows */}
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
              <p className="text-[13px] text-ink-soft mt-1 mb-3">Outings, maintenance, holidays. {canEdit ? 'Click a day to close it; click a closed day to reopen it. ' : ''}Booked times stay — to cancel bookings for weather, use Weather on the tee sheet.</p>
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

            {(() => {
              const round = multi && view !== 'other' ? activeProducts.find(p => p.id === view) : null;
              return round ? (
                <RoundRulesCard productId={round.id} label={round.label} course={courseRules} canEdit={!pageAccess.isStaff}
                  rules={{ walkingPolicy: round.walkingPolicy ?? null, minPlayers: round.minPlayers ?? null, maxPlayers: round.maxPlayers ?? null, publicAdvanceDays: round.publicAdvanceDays ?? null }}
                  onSaved={r => setProducts(ps => ps.map(p => p.id === round.id ? { ...p, ...r } : p))} />
              ) : null;
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
      </main>

      {/* The editor — one schedule: its hours, then its price periods (W2-4). */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={editGroup ? 'Change this schedule' : 'Add a schedule'}>
          <Card className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6 rounded-b-none sm:rounded-b-lg">
            <h3 className="font-serif font-semibold text-ink text-[22px]">{editGroup ? 'Change this schedule' : 'Add a schedule'}</h3>
            <p className="text-[13px] text-ink-soft mt-1 mb-5">Your hours and how far apart tee times are, then your prices. For a twilight or early-bird rate, add a price period.</p>
            <div className="space-y-4">
              {multi && (
                <div><label className={lCls} htmlFor="f-round">Which round</label>
                  <select id="f-round" value={form.productId} onChange={e => set('productId', e.target.value)} className={iCls}>
                    <option value="">Pick a round…</option>
                    {activeProducts.map(p => <option key={p.id} value={p.id}>{p.label} · {p.holes} holes</option>)}
                  </select></div>
              )}
              <div><span className={lCls}>Days</span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK.map(d => <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={form.daysOfWeek.includes(d)}
                    className={'w-12 py-2 rounded-md text-[13px] font-medium border ' + (form.daysOfWeek.includes(d) ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:border-line-strong')}>{DAYS[d]}</button>)}
                </div></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={lCls} htmlFor="f-start">First tee time</label><input id="f-start" type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} className={iCls} /></div>
                <div><label className={lCls} htmlFor="f-end">Last tee time</label><input id="f-end" type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} className={iCls} /></div>
                <div><label className={lCls} htmlFor="f-int">Minutes apart</label><input id="f-int" type="number" min={1} value={form.intervalMinutes} onChange={e => set('intervalMinutes', Number(e.target.value))} className={iCls} /></div>
              </div>
              <p className="text-[12.5px] text-ink-muted -mt-2">The last group goes off at this time, if it falls on the interval.</p>
              {!form.productId && <div className="max-w-[12rem]"><label className={lCls} htmlFor="f-holes">Holes</label><select id="f-holes" value={form.holes} onChange={e => set('holes', Number(e.target.value))} className={iCls}><option value={9}>9 holes</option><option value={18}>18 holes</option></select></div>}

              <div className="pt-2">
                <h4 className="text-[15px] font-semibold text-ink">Prices</h4>
                <p className="text-[12.5px] text-ink-soft mt-0.5">Per player. {form.periods.length > 1 ? 'Each price period runs until the next one starts.' : 'One price all day, or add a period for a different rate later in the day.'}</p>
              </div>
              {form.periods.map((p, i) => {
                const starts = i === 0 ? form.startTime : snapToGrid(form.startTime, Number(form.intervalMinutes), p.from);
                const ends = i + 1 < form.periods.length ? snapToGrid(form.startTime, Number(form.intervalMinutes), form.periods[i + 1].from) : form.endTime;
                return (
                  <div key={i} className="bg-paper/70 rounded-md p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem] gap-3">
                      <div><label className={lCls} htmlFor={`p-name-${i}`}>Name {form.periods.length === 1 && <span className="font-normal text-ink-muted">(optional)</span>}</label>
                        <input id={`p-name-${i}`} value={p.tierName} onChange={e => setPeriod(i, 'tierName', e.target.value)} placeholder={i === 0 ? 'Morning, All day…' : 'Twilight, Nine-hole evening…'} className={iCls} /></div>
                      {i === 0
                        ? <div><span className={lCls}>Starts</span><p className="py-2 text-sm text-ink tabular-nums">{fmtTime(form.startTime)}</p></div>
                        : <div><label className={lCls} htmlFor={`p-from-${i}`}>Starts at</label><input id={`p-from-${i}`} type="time" value={p.from} onChange={e => setPeriod(i, 'from', e.target.value)} className={iCls} /></div>}
                    </div>
                    {i > 0 && starts !== p.from && <p className="text-[12.5px] text-ink-muted -mt-1">Starts with the {fmtTime(starts)} tee time.</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div><label className={lCls} htmlFor={`p-wd-${i}`}>Weekday price</label><input id={`p-wd-${i}`} type="number" min={0} value={p.greenFeeWeekday} onChange={e => setPeriod(i, 'greenFeeWeekday', Number(e.target.value))} className={iCls} /></div>
                      <div><label className={lCls} htmlFor={`p-we-${i}`}>Weekend price</label><input id={`p-we-${i}`} type="number" min={0} value={p.greenFeeWeekend} onChange={e => setPeriod(i, 'greenFeeWeekend', Number(e.target.value))} className={iCls} /></div>
                      <div><label className={lCls} htmlFor={`p-cart-${i}`}>Cart, per player</label><input id={`p-cart-${i}`} type="number" min={0} value={p.cartFee} onChange={e => setPeriod(i, 'cartFee', Number(e.target.value))} className={iCls} /></div>
                    </div>
                    {(hasMember || p.memberRateWeekday !== '') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className={lCls} htmlFor={`p-mwd-${i}`}>Member, weekday</label><input id={`p-mwd-${i}`} type="number" min={0} value={p.memberRateWeekday} onChange={e => setPeriod(i, 'memberRateWeekday', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                        <div><label className={lCls} htmlFor={`p-mwe-${i}`}>Member, weekend</label><input id={`p-mwe-${i}`} type="number" min={0} value={p.memberRateWeekend} onChange={e => setPeriod(i, 'memberRateWeekend', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                        <p className="sm:col-span-2 text-[12.5px] text-ink-muted -mt-1">For memberships that don&apos;t set their own price in Members.</p>
                      </div>
                    )}
                    {(hasResident || p.residentRateWeekday !== '') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className={lCls} htmlFor={`p-rwd-${i}`}>Resident, weekday</label><input id={`p-rwd-${i}`} type="number" min={0} value={p.residentRateWeekday} onChange={e => setPeriod(i, 'residentRateWeekday', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                        <div><label className={lCls} htmlFor={`p-rwe-${i}`}>Resident, weekend</label><input id={`p-rwe-${i}`} type="number" min={0} value={p.residentRateWeekend} onChange={e => setPeriod(i, 'residentRateWeekend', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
                        <input type="checkbox" checked={p.walkingAllowed} onChange={e => setPeriod(i, 'walkingAllowed', e.target.checked)} className="w-4 h-4 accent-pine" />Golfers can walk
                      </label>
                      <span className="text-[12.5px] text-ink-muted tabular-nums">{fmtTime(starts)} – {fmtTime(ends)}</span>
                      {i > 0 && <button type="button" onClick={() => removePeriod(i)} className="text-[13px] font-medium text-ink-soft hover:text-ink">Remove this period</button>}
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={addPeriod} className="text-[13px] font-medium text-pine hover:underline">Add a price period</button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-line-soft">
              <div className="flex gap-4">
                {editGroup && <>
                  <button onClick={() => toggleActive(editGroup)} className="text-[13px] font-medium text-ink-soft hover:text-ink">{editGroup.active ? 'Pause' : 'Turn back on'}</button>
                  <button onClick={() => del(editGroup)} className="text-[13px] font-medium text-bad hover:underline">Delete</button>
                </>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setEditGroup(null); }} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                <button onClick={save} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium">{editGroup ? 'Save changes' : 'Add'}</button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* What a save will do — shown before anything is written */}
      {pending && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={pending.title}>
          <Card className="w-full max-w-md p-6">
            <h3 className="font-serif font-semibold text-ink text-[20px]">{pending.title}</h3>
            {pending.error ? <p className="text-[13.5px] text-bad mt-3">Couldn&apos;t work out what this changes — {pending.error}. You can still go ahead; booked times never change.</p>
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
                    <p className="text-[13px] text-ink">You can still save — this is a note, not a block.</p>
                  </div>
                )}
              </>)}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPending(null)} disabled={busy} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Go back</button>
              <button onClick={runPending} disabled={busy || (!pending.preview && !pending.error) || !!pending.preview?.refusal} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{busy ? `${pending.doing}…` : 'Go ahead'}</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
