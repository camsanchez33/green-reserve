'use client';
// Schedule rework (Cam 2026-10-19: "this page sucks … think of what is needed
// to be known, ease and understanding and functionality … rework the whole
// thing"; OPERATOR_REWORK_SPEC "Schedule, Members, Money, Messages — round 1").
//   1. Your week — each day's tee times as bands: when they run, how far apart,
//      what they cost. Click one to change it.
//   2. Prices — every price period in one table. Periods are the course's own
//      (Cam: "up to the course if they want twilight times and morning times").
//   3. Closed days — a month calendar; click a day to close or reopen it.
// A price period is a TeeTimeSchedule row (tierName = its name). Saving applies
// to the tee sheet straight away (lib/schedule-service regenerates), and every
// save, pause and delete first shows what it will change (lib/schedule-preview).
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { Card } from '@/components/ui/Card';
import { formatTeeTime as fmtTime } from '@/lib/format';

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
type ProductOpt = { id: string; label: string; holes: number; active: boolean };
type Preview = { days: number; added: number; removed: number; repriced: number; bookedKept: number };
type Pending = { title: string; doing: string; preview: Preview | null; error: string; run: () => Promise<void> };

const emptyForm = () => ({ productId: '' as string, tierName: '', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] as number[], startTime: '06:30', endTime: '17:30', intervalMinutes: 8, holes: 18, greenFeeWeekday: 65, greenFeeWeekend: 85, memberRateWeekday: '', memberRateWeekend: '', residentRateWeekday: '', residentRateWeekend: '', cartFee: 18, walkingAllowed: true });

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
  const [editId, setEditId] = useState<string | null>(null);
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

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const r = await dfetch<Schedule[]>('/api/operator/schedule');
    if (r.ok) { setSchedules(Array.isArray(r.data) ? r.data : []); setLoadError(''); }
    else { setSchedules([]); setLoadError(r.error); }
    setLoading(false);
  }, []);
  const loadWindows = useCallback(async () => {
    const r = await dfetch<{ hasMemberPricing?: boolean; hasResidentPricing?: boolean; publicAdvanceDays?: number; memberAdvanceDays?: number }>('/api/operator/settings');
    if (!r.ok || !r.data) { setWindowsError(r.ok ? 'Settings came back empty — refresh.' : r.error); return; }
    const c = r.data;
    setHasMember(!!c.hasMemberPricing); setHasResident(!!c.hasResidentPricing);
    setWindows({ publicAdvanceDays: typeof c.publicAdvanceDays === 'number' ? c.publicAdvanceDays : null, memberAdvanceDays: typeof c.memberAdvanceDays === 'number' ? c.memberAdvanceDays : null });
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

  function openAdd() { setForm({ ...emptyForm(), productId: view === 'other' ? '' : view }); setEditId(null); setShowForm(true); }
  function openEdit(s: Schedule) {
    if (!canEdit) return;
    setForm({ productId: s.productId ?? '', tierName: s.tierName === 'standard' ? '' : s.tierName, daysOfWeek: s.daysOfWeek, startTime: s.startTime, endTime: s.endTime, intervalMinutes: s.intervalMinutes, holes: s.holes, greenFeeWeekday: s.greenFeeWeekday, greenFeeWeekend: s.greenFeeWeekend, memberRateWeekday: s.memberRateWeekday?.toString() ?? '', memberRateWeekend: s.memberRateWeekend?.toString() ?? '', residentRateWeekday: s.residentRateWeekday?.toString() ?? '', residentRateWeekend: s.residentRateWeekend?.toString() ?? '', cartFee: s.cartFee, walkingAllowed: s.walkingAllowed });
    setEditId(s.id); setShowForm(true);
  }
  const toggleDay = (d: number) => setForm(f => ({ ...f, daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x => x !== d) : [...f.daysOfWeek, d].sort() }));
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  /** Ask the server what a change would do, then show it before anything is saved. */
  async function confirmWithPreview(title: string, doing: string, change: Record<string, unknown>, run: () => Promise<void>) {
    setPending({ title, doing, preview: null, error: '', run });
    const r = await dfetch<Preview>('/api/operator/schedule/preview', { method: 'POST', body: JSON.stringify(change) });
    setPending(p => p && p.title === title ? { ...p, preview: r.ok ? r.data : null, error: r.ok ? '' : r.error } : p);
  }

  function payload() {
    return { ...form, tierName: form.tierName.trim() || 'standard', productId: form.productId || null, memberRateWeekday: form.memberRateWeekday || null, memberRateWeekend: form.memberRateWeekend || null, residentRateWeekday: form.residentRateWeekday || null, residentRateWeekend: form.residentRateWeekend || null };
  }

  function save() {
    if (!form.daysOfWeek.length) return toast('Pick at least one day.', 'warn');
    if (multi && !form.productId) return toast('Pick which round these times are for.', 'warn');
    if (form.startTime >= form.endTime) return toast('The last tee time has to be after the first.', 'warn');
    if (!(Number(form.intervalMinutes) >= 1)) return toast('Set how many minutes apart tee times are.', 'warn');
    const clash = schedules.find(s => {
      if (editId && s.id === editId) return false;
      if (!s.active || (s.productId ?? '') !== (form.productId ?? '')) return false;
      if (!s.daysOfWeek.some(d => form.daysOfWeek.includes(d))) return false;
      return form.startTime < s.endTime && s.startTime < form.endTime;
    });
    if (clash) {
      const days = clash.daysOfWeek.filter(d => form.daysOfWeek.includes(d)).map(d => DAYS[d]).join(', ');
      return toast(`That overlaps "${clash.tierName === 'standard' ? 'your tee times' : clash.tierName}" on ${days} (${fmtTime(clash.startTime)} – ${fmtTime(clash.endTime)}). Change the hours so they don't overlap, or edit that one instead.`, 'warn');
    }
    const body = payload();
    const name = body.tierName === 'standard' ? 'these tee times' : `"${body.tierName}"`;
    confirmWithPreview(editId ? `Save ${name}?` : `Add ${name}?`, 'Saving', editId ? { op: 'update', id: editId, data: body } : { op: 'create', body }, async () => {
      const r = editId
        ? await dfetch<Schedule>('/api/operator/schedule', { method: 'PATCH', body: JSON.stringify({ id: editId, ...body }) })
        : await dfetch<Schedule>('/api/operator/schedule', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok || !r.data) { toast(r.ok ? 'It came back empty — refresh and check.' : r.error); return; }
      const row = r.data;
      setSchedules(s => editId ? s.map(x => x.id === editId ? row : x) : [...s, row]);
      setShowForm(false); setEditId(null);
      toast('Saved. Your tee sheet is updated.', 'ok');
    });
  }

  function toggleActive(s: Schedule) {
    confirmWithPreview(s.active ? `Pause "${s.tierName === 'standard' ? 'these tee times' : s.tierName}"?` : `Turn "${s.tierName === 'standard' ? 'these tee times' : s.tierName}" back on?`, s.active ? 'Pausing' : 'Turning it on', { op: 'update', id: s.id, data: { active: !s.active } }, async () => {
      const r = await dfetch<Schedule>('/api/operator/schedule', { method: 'PATCH', body: JSON.stringify({ id: s.id, active: !s.active }) });
      if (!r.ok || !r.data) { toast(r.ok ? 'No response — refresh and check.' : r.error); return; }
      const row = r.data;
      setSchedules(prev => prev.map(x => x.id === s.id ? row : x));
      setShowForm(false); setEditId(null);
      toast(row.active ? 'Back on. Your tee sheet is updated.' : 'Paused. Its open times are off the sheet.', 'ok');
    });
  }

  function del(s: Schedule) {
    confirmWithPreview(`Delete "${s.tierName === 'standard' ? 'these tee times' : s.tierName}"?`, 'Deleting', { op: 'delete', id: s.id }, async () => {
      const r = await dfetch('/api/operator/schedule', { method: 'DELETE', body: JSON.stringify({ id: s.id }) });
      if (!r.ok) { toast(r.error); return; }
      setSchedules(prev => prev.filter(x => x.id !== s.id));
      setShowForm(false); setEditId(null);
      toast('Deleted. Its open times are off the sheet.', 'ok');
    });
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
            {canEdit && <button onClick={openAdd} className="shrink-0 bg-pine hover:bg-pine-hover text-white text-[13px] font-medium px-4 py-2 rounded-md">Add tee times</button>}
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
            <p className="text-[13px] text-ink-soft mb-4">Each block is a run of tee times: when the first and last go off, how far apart they are, and the public price that day.</p>
            {loading ? <p className="py-8 text-center text-[13px] text-ink-muted">Loading your schedule…</p>
              : live.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-ink">No tee times set up{multi ? ' for this round' : ''} yet.</p>
                  <p className="text-[13px] text-ink-soft mt-1">Add your hours, the gap between tee times and your prices, and the tee sheet fills itself in.</p>
                  {canEdit && <button onClick={openAdd} className="mt-4 bg-pine hover:bg-pine-hover text-white text-[13px] font-medium px-4 py-2 rounded-md">Add tee times</button>}
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
              <p className="text-[13px] text-ink-soft mt-1 mb-4">Every run of tee times and what it costs per player. Name them however your course does: Morning, Twilight, Nine-hole evenings.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead><tr className="text-left border-b border-line">
                    {['Name', 'Days', 'Hours', 'Every', 'Weekday', 'Weekend', ...(showMember ? ['Member'] : []), ...(showResident ? ['Resident'] : []), 'Cart', ''].map((h, i) => <th key={i} className={'py-2 pr-4 text-[12.5px] font-semibold text-ink ' + (i >= 4 && h !== '' ? 'text-right' : '')}>{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-line-soft">
                    {inView.map(s => (
                      <tr key={s.id} className={s.active ? '' : 'text-ink-muted'}>
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

      {/* The editor */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={editId ? 'Change tee times' : 'Add tee times'}>
          <Card className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6 rounded-b-none sm:rounded-b-lg">
            <h3 className="font-serif font-semibold text-ink text-[22px]">{editId ? 'Change tee times' : 'Add tee times'}</h3>
            <p className="text-[13px] text-ink-soft mt-1 mb-5">A run of tee times with one set of prices. Add another run for different hours, like a twilight rate.</p>
            <div className="space-y-4">
              {multi && (
                <div><label className={lCls} htmlFor="f-round">Which round</label>
                  <select id="f-round" value={form.productId} onChange={e => set('productId', e.target.value)} className={iCls}>
                    <option value="">Pick a round…</option>
                    {activeProducts.map(p => <option key={p.id} value={p.id}>{p.label} · {p.holes} holes</option>)}
                  </select></div>
              )}
              <div><label className={lCls} htmlFor="f-name">Name <span className="font-normal text-ink-muted">(optional)</span></label>
                <input id="f-name" value={form.tierName} onChange={e => set('tierName', e.target.value)} placeholder="Morning, Twilight, Weekend…" className={iCls} /></div>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={lCls} htmlFor="f-wd">Weekday price</label><input id="f-wd" type="number" min={0} value={form.greenFeeWeekday} onChange={e => set('greenFeeWeekday', Number(e.target.value))} className={iCls} /></div>
                <div><label className={lCls} htmlFor="f-we">Weekend price</label><input id="f-we" type="number" min={0} value={form.greenFeeWeekend} onChange={e => set('greenFeeWeekend', Number(e.target.value))} className={iCls} /></div>
                <div><label className={lCls} htmlFor="f-cart">Cart, per player</label><input id="f-cart" type="number" min={0} value={form.cartFee} onChange={e => set('cartFee', Number(e.target.value))} className={iCls} /></div>
              </div>
              {(hasMember || form.memberRateWeekday !== '') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={lCls} htmlFor="f-mwd">Member, weekday</label><input id="f-mwd" type="number" min={0} value={form.memberRateWeekday} onChange={e => set('memberRateWeekday', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                  <div><label className={lCls} htmlFor="f-mwe">Member, weekend</label><input id="f-mwe" type="number" min={0} value={form.memberRateWeekend} onChange={e => set('memberRateWeekend', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                </div>
              )}
              {(hasResident || form.residentRateWeekday !== '') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={lCls} htmlFor="f-rwd">Resident, weekday</label><input id="f-rwd" type="number" min={0} value={form.residentRateWeekday} onChange={e => set('residentRateWeekday', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                  <div><label className={lCls} htmlFor="f-rwe">Resident, weekend</label><input id="f-rwe" type="number" min={0} value={form.residentRateWeekend} onChange={e => set('residentRateWeekend', e.target.value)} placeholder="Same as public" className={iCls} /></div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!form.productId && <div><label className={lCls} htmlFor="f-holes">Holes</label><select id="f-holes" value={form.holes} onChange={e => set('holes', Number(e.target.value))} className={iCls}><option value={9}>9 holes</option><option value={18}>18 holes</option></select></div>}
                <label className="flex items-center gap-2.5 text-[13.5px] text-ink self-end pb-2">
                  <input type="checkbox" checked={form.walkingAllowed} onChange={e => set('walkingAllowed', e.target.checked)} className="w-4 h-4 accent-pine" />Golfers can walk
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-line-soft">
              <div className="flex gap-4">
                {editId && (() => { const s = schedules.find(x => x.id === editId); return s ? <>
                  <button onClick={() => toggleActive(s)} className="text-[13px] font-medium text-ink-soft hover:text-ink">{s.active ? 'Pause' : 'Turn back on'}</button>
                  <button onClick={() => del(s)} className="text-[13px] font-medium text-bad hover:underline">Delete</button>
                </> : null; })()}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                <button onClick={save} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium">{editId ? 'Save changes' : 'Add'}</button>
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
                <p className="text-[13.5px] text-ink-soft mt-2">On your tee sheet over the next {pending.preview.days} days, this:</p>
                <ul className="mt-2 space-y-1.5">{previewLines(pending.preview).map(l => <li key={l} className="text-[14px] text-ink leading-snug pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-2 before:h-0.5 before:bg-fairway">{l}</li>)}</ul>
              </>)}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPending(null)} disabled={busy} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Go back</button>
              <button onClick={runPending} disabled={busy || (!pending.preview && !pending.error)} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{busy ? `${pending.doing}…` : 'Go ahead'}</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
