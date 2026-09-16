'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Pencil, Check, X, Power, RefreshCw } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { TabIntroButton, TabIntroCard } from '@/components/dashboard/TabIntro';
import { useTabIntro } from '@/lib/use-tab-intro';
import { StatusDot } from '@/components/ui/StatusDot';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full';

type Schedule = {
  id: string; tierName: string; daysOfWeek: number[]; startTime: string; endTime: string;
  /** L2: the bookable product this schedule generates slots for (null = the course as a whole). */
  productId?: string | null; productLabel?: string | null;
  intervalMinutes: number; holes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number|null; memberRateWeekend: number|null;
  residentRateWeekday: number|null; residentRateWeekend: number|null;
  cartFee: number; walkingAllowed: boolean; active: boolean; createdAt: string;
};

function fmtTime(t: string) { const [h,m]=t.split(':').map(Number); return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
type ProductOpt = { id: string; label: string; holes: number; active: boolean; scheduleCount?: number };
const emptyForm = () => ({ productId: '' as string, tierName:'standard', daysOfWeek:[0,1,2,3,4,5,6] as number[], startTime:'06:30', endTime:'17:30', intervalMinutes:8, holes:18, greenFeeWeekday:65, greenFeeWeekend:85, memberRateWeekday:'', memberRateWeekend:'', residentRateWeekday:'', residentRateWeekend:'', cartFee:18, walkingAllowed:true });

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [hasMember, setHasMember] = useState(false);
  // L2: the course's bookable products (empty on a simple course — no selector, no grouping).
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productsError, setProductsError] = useState('');
  const [hasResident, setHasResident] = useState(false);
  // B-7: blocks + booking windows sit beside the rate table. Blocks are the
  // existing blackouts API; the windows are read from Settings (edited there).
  const [blackouts, setBlackouts] = useState<{ id: string; date: string; reason: string }[]>([]);
  const [blackoutForm, setBlackoutForm] = useState({ date: '', reason: '', closeDay: false });
  const [blackoutBusy, setBlackoutBusy] = useState(false);
  const [blackoutError, setBlackoutError] = useState('');
  const [windows, setWindows] = useState<{ publicAdvanceDays: number | null; memberAdvanceDays: number | null }>({ publicAdvanceDays: null, memberAdvanceDays: null });
  const [windowsError, setWindowsError] = useState('');
  const intro = useTabIntro('schedule');

  // SD-10: a 403 (staff by URL) or 500 here used to render "No schedules yet".
  const loadSchedules = useCallback(async () => {
    setLoading(true);
    const r = await dfetch<Schedule[]>('/api/operator/schedule');
    if (r.ok) { setSchedules(Array.isArray(r.data) ? r.data : []); setLoadError(''); }
    else { setSchedules([]); setLoadError(r.error); }
    setLoading(false);
  }, []);
  // Review (no-silent-failures): this used to be fetch().catch(() => {}) — a
  // failed settings load rendered as "not configured" and hid rate columns.
  const loadWindows = useCallback(async () => {
    const r = await dfetch<{ hasMemberPricing?: boolean; hasResidentPricing?: boolean; publicAdvanceDays?: number; memberAdvanceDays?: number }>('/api/operator/settings');
    if (!r.ok || !r.data) { setWindowsError(r.ok ? 'Settings came back empty — refresh.' : r.error); return; }
    const c = r.data;
    setHasMember(!!c.hasMemberPricing); setHasResident(!!c.hasResidentPricing);
    setWindows({ publicAdvanceDays: typeof c.publicAdvanceDays === 'number' ? c.publicAdvanceDays : null, memberAdvanceDays: typeof c.memberAdvanceDays === 'number' ? c.memberAdvanceDays : null });
    setWindowsError('');
  }, []);

  // Review (B-7): the cards showed a rate whenever a schedule had one; the
  // table must not hide saved rates behind the course-level flag.
  // L2: group under the product; an unscoped schedule on a multi-product course is
  // shown under "Whole course" so it is never invisible.
  const scheduleGroups = (() => {
    if (!products.some(p => p.active) && !schedules.some(s => s.productId)) return [{ key: 'all', title: 'Schedules', holes: 0, rows: schedules }];
    const groups = products.map(p => ({ key: p.id, title: p.label, holes: p.holes, rows: schedules.filter(s => s.productId === p.id) }));
    const rest = schedules.filter(s => !s.productId || !products.some(p => p.id === s.productId));
    if (rest.length) groups.push({ key: 'none', title: 'Whole course (no product)', holes: 0, rows: rest });
    return groups;
  })();
  const showMember = hasMember || schedules.some(s => s.memberRateWeekday != null);
  const showResident = hasResident || schedules.some(s => s.residentRateWeekday != null);

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

  async function addBlackout() {
    if (!blackoutForm.date) { toast('Pick a date to block.', 'warn'); return; }
    const msg = blackoutForm.closeDay
      ? `Close ${blackoutForm.date}?\n\nEvery tee time on that day comes off the sheet, EVERY booking on it is cancelled, each golfer gets an email saying why, and no cancellation fee is kept. This cannot be undone.`
      : `Block ${blackoutForm.date}?\n\nEvery open tee time on that day comes off the sheet. Times that already have bookings are kept.`;
    if (!confirm(msg)) return;
    setBlackoutBusy(true);
    const r = await dfetch<{ closed: { cancelled: number; feeRefundsFailed: number; failed: { golferName: string; error: string }[] } | null }>('/api/operator/blackouts', { method: 'POST', body: JSON.stringify(blackoutForm) });
    setBlackoutBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setBlackoutForm({ date: '', reason: '', closeDay: false });
    await loadBlackouts();
    const c = r.data?.closed;
    if (c) {
      const parts = [`Day closed — ${c.cancelled} booking${c.cancelled === 1 ? '' : 's'} cancelled and emailed.`];
      if (c.feeRefundsFailed > 0) parts.push(`${c.feeRefundsFailed} fee refund${c.feeRefundsFailed === 1 ? '' : 's'} failed — issue them in Stripe.`);
      if (c.failed.length > 0) parts.push(`${c.failed.length} could not be cancelled: ${c.failed.map(f => f.golferName + ' (' + f.error + ')').join('; ')}`);
      toast(parts.join(' '), c.feeRefundsFailed > 0 || c.failed.length > 0 ? 'warn' : 'ok');
    } else {
      toast('Day blocked — its open times are off the sheet.', 'ok');
    }
  }

  async function removeBlackout(id: string) {
    setBlackoutBusy(true);
    const r = await dfetch('/api/operator/blackouts', { method: 'DELETE', body: JSON.stringify({ id }) });
    setBlackoutBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setBlackouts(prev => prev.filter(b => b.id !== id));
    toast('Block removed — run "Apply to Tee Sheet" to put its times back.', 'ok');
  }

  useEffect(() => {
    loadSchedules(); loadProducts();
    loadWindows();
    loadBlackouts();
  }, [loadProducts, loadSchedules, loadBlackouts, loadWindows]);

  function openAdd() { setForm(emptyForm()); setEditId(null); setShowAdd(true); }
  function openEdit(s: Schedule) {
    setForm({ productId: s.productId ?? '', tierName:s.tierName, daysOfWeek:s.daysOfWeek, startTime:s.startTime, endTime:s.endTime, intervalMinutes:s.intervalMinutes, holes:s.holes, greenFeeWeekday:s.greenFeeWeekday, greenFeeWeekend:s.greenFeeWeekend, memberRateWeekday:s.memberRateWeekday?.toString()??'', memberRateWeekend:s.memberRateWeekend?.toString()??'', residentRateWeekday:s.residentRateWeekday?.toString()??'', residentRateWeekend:s.residentRateWeekend?.toString()??'', cartFee:s.cartFee, walkingAllowed:s.walkingAllowed });
    setEditId(s.id); setShowAdd(true);
  }

  const toggleDay = (d: number) => setForm(f=>({ ...f, daysOfWeek: f.daysOfWeek.includes(d)?f.daysOfWeek.filter(x=>x!==d):[...f.daysOfWeek,d].sort() }));
  const set = (k: string, v: unknown) => setForm(f=>({...f,[k]:v}));

  const activeProducts = products.filter(p => p.active);
  const productFor = (id: string | null | undefined) => products.find(p => p.id === id);

  async function save() {
    if (!form.daysOfWeek.length) return toast('Select at least one day.', 'warn');
    // L2: on a multi-product course every schedule belongs to one product.
    if (activeProducts.length > 0 && !form.productId) return toast('Pick which round this schedule is for.', 'warn');
    const clash = schedules.find(s => {
      if (editId && s.id === editId) return false;
      if (!s.active) return false;
      // Different products are judged by the server (they may share a nine or not).
      if ((s.productId ?? '') !== (form.productId ?? '')) return false;
      const sharesDay = s.daysOfWeek.some(d => form.daysOfWeek.includes(d));
      if (!sharesDay) return false;
      return form.startTime < s.endTime && s.startTime < form.endTime;
    });
    if (clash) {
      const days = clash.daysOfWeek.filter(d => form.daysOfWeek.includes(d)).map(d => DAYS[d]).join(', ');
      toast(`This overlaps your "${clash.tierName}" schedule on ${days} (${fmtTime(clash.startTime)} – ${fmtTime(clash.endTime)}).\n\nTwo schedules can't cover the same time on the same day. Adjust the times or edit the existing schedule instead.`, 'warn');
      return;
    }
    if (form.startTime >= form.endTime) { toast('End time must be after start time.', 'warn'); return; }
    setSaving(true);
    const payload = { ...form, productId: form.productId || null, memberRateWeekday:form.memberRateWeekday||null, memberRateWeekend:form.memberRateWeekend||null, residentRateWeekday:form.residentRateWeekday||null, residentRateWeekend:form.residentRateWeekend||null };
    // SD-10: the `{error}` body used to be written into schedules[] as a row and
    // the page went blank on `daysOfWeek.map`. Check first; keep the modal open.
    const r = editId
      ? await dfetch<Schedule>('/api/operator/schedule', { method: 'PATCH', body: JSON.stringify({ id: editId, ...payload }) })
      : await dfetch<Schedule>('/api/operator/schedule', { method: 'POST', body: JSON.stringify(payload) });
    setSaving(false);
    // A 409 carries the plain-English reason ("South is in use by North + South until 12:00 PM …").
    if (!r.ok || !r.data) { toast(r.ok ? 'The schedule came back empty — refresh and check.' : r.error); return; }
    const row = r.data;
    setSchedules(s => editId ? s.map(x => x.id === editId ? row : x) : [...s, row]);
    toast(editId ? 'Schedule updated — the tee sheet was rebuilt.' : 'Schedule saved — tee times generated for the next 8 days.', 'ok');
    setShowAdd(false); setEditId(null);
  }

  async function regenerate() {
    if (!confirm('Update the tee sheet now?\n\nThis rebuilds open tee times for the next 8 days from your current schedules. Times that already have bookings are never touched.')) return;
    setRegenerating(true);
    const r = await dfetch<{ created?: number; errors?: string[] }>('/api/operator/regenerate-tee-times', { method: 'POST' });
    setRegenerating(false);
    if (!r.ok) { toast(r.error); return; }
    const data = r.data ?? {};
    if (data.errors?.length) toast(`Done with some errors: ${data.errors.join(', ')}`, 'warn');
    else toast(`Done — ${data.created ?? 0} new tee time slot${data.created !== 1 ? 's' : ''} created across the next 8 days.`, 'ok');
  }

  async function del(id: string) {
    if (!confirm('Delete this schedule?\n\nOpen tee times it was creating are removed from the sheet straight away. Times that already have bookings are kept.')) return;
    const r = await dfetch('/api/operator/schedule', { method: 'DELETE', body: JSON.stringify({ id }) });
    if (!r.ok) { toast(r.error); return; } // the row stays; the server refused
    setSchedules(s => s.filter(x => x.id !== id));
    toast('Schedule deleted — open tee times it created are gone from the sheet.', 'ok');
  }

  async function toggleActive(s: Schedule) {
    const r = await dfetch<Schedule>('/api/operator/schedule', { method: 'PATCH', body: JSON.stringify({ id: s.id, active: !s.active }) });
    if (!r.ok || !r.data) { toast(r.ok ? 'No response — refresh and check.' : r.error); return; }
    const row = r.data;
    setSchedules(prev => prev.map(x => x.id === s.id ? row : x));
    toast(row.active ? 'Schedule resumed — its times are back on the sheet.' : 'Schedule paused — its open times are off the sheet.', 'ok');
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="schedule"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <StaffNotice what="the schedule" />
        <div className="bg-white border-b border-line px-6 py-4 flex flex-wrap items-start justify-between gap-3 sticky top-0 z-10">
          {/* U-O (§1b): serif title + one sentence of this page's numbers. */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[30px] font-serif font-medium leading-none tracking-tight text-ink">Schedule</h1>
              <TabIntroButton onClick={intro.show}/>
            </div>
            <p className="text-[13.5px] text-ink-soft mt-2">
              {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} · {schedules.filter(s => s.active).length} running · {schedules.filter(s => !s.active).length} paused
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={regenerate} disabled={regenerating} className="flex items-center gap-2 border border-line text-ink-soft px-3 py-2 rounded-md text-[12.5px] font-medium hover:border-line-strong hover:text-ink disabled:opacity-50 transition-colors">
              <RefreshCw className={'w-3.5 h-3.5 ' + (regenerating ? 'animate-spin' : '')}/>{regenerating ? 'Regenerating…' : 'Apply to Tee Sheet'}
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md font-medium text-[12.5px] transition-colors">
              <Plus className="w-4 h-4"/>Add Schedule
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
          <TabIntroCard
            open={intro.open}
            onDismiss={intro.dismiss}
            title="This is your Schedule."
            bullets={[
              'This is the template that creates your bookable tee times automatically.',
              'Set your tee time interval, hours, and which days of the week it runs.',
              'GreenReserve generates real tee times from this every night for the days ahead.',
              'Change it anytime — it only affects future tee times, never past bookings.',
            ]}
          />
          <div className="bg-pine/5 border border-pine/20 rounded-lg p-4 text-sm text-ink-soft leading-relaxed">
            <span className="font-medium text-ink">How this works:</span> each schedule is a recipe — days, hours, interval, and pricing — and GreenReserve automatically generates your bookable tee times from it every night for the next 8 days. Editing a schedule changes <span className="font-medium text-ink">future</span> generation only; to update the tee sheet right now, hit <span className="font-medium text-ink">Apply to Tee Sheet</span> above. Times that already have bookings are never touched.
          </div>

          {loadError && <LoadError message={loadError} onRetry={loadSchedules} />}

          {loading && <div className="text-center py-12 text-ink-muted">Loading schedules...</div>}

          {/* B-7: rates by band × weekday/weekend × member/resident in ONE table,
              blocks + booking windows beside it. A view over the same schedule
              objects — every action here is the one the cards had. Seasons are
              not tabs: a schedule has no date range, so seasons would be a
              schema change (see UI_REVISE_SPEC B-7 note). */}
          {!loading && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
              {schedules.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-lg border border-dashed border-line">
                  <div className="font-medium text-ink mb-1">No schedules yet</div>
                  <p className="text-sm text-ink-muted mb-4">Create a schedule to auto-generate tee times daily</p>
                  <button onClick={openAdd} className="bg-pine hover:bg-pine-hover text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors">Add Your First Schedule</button>
                </div>
              ) : (
              <div className="bg-white border border-line overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.1em] text-ink-muted border-b border-line">
                      <th className="text-left font-medium px-4 py-2.5">Band</th>
                      <th className="text-right font-medium px-3 py-2.5">Weekday</th>
                      <th className="text-right font-medium px-3 py-2.5">Weekend</th>
                      {showMember && <th className="text-right font-medium px-3 py-2.5">Member WD / WE</th>}
                      {showResident && <th className="text-right font-medium px-3 py-2.5">Resident WD / WE</th>}
                      <th className="text-right font-medium px-3 py-2.5">Cart</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {scheduleGroups.map(g => (
                      <React.Fragment key={g.key}>
                        {scheduleGroups.length > 1 && (
                          <tr className="bg-paper">
                            <td colSpan={99} className="px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-ink-muted">
                              {g.title}{g.holes ? ` · ${g.holes} holes` : ''}{g.rows.length === 0 ? ' · no schedule yet — it generates no tee times' : ''}
                            </td>
                          </tr>
                        )}
                        {g.rows.map(s => (
                      <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-ink capitalize">{s.tierName}</div>
                          <div className="text-[12.5px] text-ink-soft mt-0.5">{s.daysOfWeek.map(d=>DAYS[d]).join(', ')} · {fmtTime(s.startTime)} – {fmtTime(s.endTime)}</div>
                          <div className="text-[12px] text-ink-muted">{scheduleGroups.length === 1 && s.productLabel ? `${s.productLabel} · ` : ''}every {s.intervalMinutes} min · {s.holes} holes · {s.walkingAllowed ? 'walking ok' : 'cart required'}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium text-ink align-top">${s.greenFeeWeekday}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium text-ink align-top">${s.greenFeeWeekend}</td>
                        {showMember && <td className="px-3 py-3 text-right tabular-nums text-ok align-top">{s.memberRateWeekday != null ? `$${s.memberRateWeekday} / $${s.memberRateWeekend ?? s.memberRateWeekday}` : <span className="text-ink-faint">—</span>}</td>}
                        {showResident && <td className="px-3 py-3 text-right tabular-nums text-pine align-top">{s.residentRateWeekday != null ? `$${s.residentRateWeekday} / $${s.residentRateWeekend ?? s.residentRateWeekday}` : <span className="text-ink-faint">—</span>}</td>}
                        <td className="px-3 py-3 text-right tabular-nums text-ink-soft align-top">${s.cartFee}</td>
                        <td className="px-3 py-3 align-top"><StatusDot status={s.active ? 'ok' : 'neutral'} label={s.active ? 'Running' : 'Paused'}/></td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => toggleActive(s)} title={s.active?'Pause':'Resume'} className="p-1.5 border border-line text-ink-muted hover:text-warn hover:border-warn/30 transition-colors"><Power className="w-4 h-4"/></button>
                            <button onClick={() => openEdit(s)} title="Edit" className="p-1.5 border border-line text-ink-muted hover:text-pine hover:border-pine/30 transition-colors"><Pencil className="w-4 h-4"/></button>
                            <button onClick={() => del(s.id)} title="Delete" className="p-1.5 border border-line text-ink-muted hover:text-bad hover:border-bad/30 transition-colors"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        </td>
                      </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              )}

              <div className="space-y-4">
                {/* Blocks */}
                <div className="bg-white border border-line p-4">
                  <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-2">Blocked days</div>
                  {blackoutError && <p className="text-xs text-bad mb-2">{blackoutError} <button onClick={loadBlackouts} className="underline">Retry</button></p>}
                  {blackoutError ? null : blackouts.length === 0 ? (
                    <p className="text-[12.5px] text-ink-muted mb-3">No days blocked.</p>
                  ) : (
                    <ul className="divide-y divide-line-soft mb-3">
                      {blackouts.map(b => (
                        <li key={b.id} className="py-2 flex items-center justify-between gap-2 text-[13px]">
                          <div className="min-w-0">
                            <div className="text-ink tabular-nums">{b.date}</div>
                            {b.reason && <div className="text-[12px] text-ink-muted truncate">{b.reason}</div>}
                          </div>
                          <button onClick={() => removeBlackout(b.id)} disabled={blackoutBusy} title="Unblock" className="p-1 text-ink-faint hover:text-bad disabled:opacity-40 transition-colors"><X className="w-3.5 h-3.5"/></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="space-y-2">
                    <input type="date" value={blackoutForm.date} onChange={e => setBlackoutForm(f => ({ ...f, date: e.target.value }))} className={iCls}/>
                    <input type="text" value={blackoutForm.reason} onChange={e => setBlackoutForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason (outing, maintenance…)" className={iCls}/>
                    {/* SD-5 close-a-day: weather. Cancels the day's bookings and tells the golfers. */}
                    <label className="flex items-start gap-2 text-[12.5px] text-ink-soft cursor-pointer sm:col-span-2">
                      <input type="checkbox" checked={blackoutForm.closeDay} onChange={e => setBlackoutForm(f => ({ ...f, closeDay: e.target.checked }))} className="mt-0.5 accent-pine" />
                      <span>Close the day — also cancel every booking on it and email the golfers (weather, course closed). No cancellation fee is kept.</span>
                    </label>
                    <button onClick={addBlackout} disabled={blackoutBusy || !blackoutForm.date} className="w-full border border-ink text-ink py-2 text-[12.5px] font-medium hover:bg-paper disabled:opacity-40 transition-colors">{blackoutBusy ? 'Working…' : 'Block this day'}</button>
                  </div>
                </div>

                {/* Booking windows — read here, edited in Settings */}
                <div className="bg-white border border-line p-4">
                  <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-2">Booking windows</div>
                  {windowsError && <p className="text-xs text-bad mb-2">{windowsError} <button onClick={loadWindows} className="underline">Retry</button></p>}
                  <div className="text-[13px] text-ink space-y-1">
                    <div className="flex justify-between"><span className="text-ink-soft">Public can book</span><span className="tabular-nums">{windows.publicAdvanceDays != null ? `${windows.publicAdvanceDays} days ahead` : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-ink-soft">Members can book</span><span className="tabular-nums">{windows.memberAdvanceDays != null ? `${windows.memberAdvanceDays} days ahead` : '—'}</span></div>
                  </div>
                  <a href="/dashboard/settings" className="inline-block mt-3 text-[12.5px] text-pine hover:text-pine-hover">Change under Settings → Booking rules →</a>
                </div>
              </div>
            </div>
          )}
        </div>

        {showAdd && (
          <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white border border-line w-full sm:max-w-xl rounded-t-lg sm:rounded-lg max-h-[92vh] overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:pb-0">
              <div className="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-line flex items-center justify-between z-10">
                <span className="font-serif font-medium text-ink text-[17px]">{editId ? 'Edit Schedule' : 'New Schedule'}</span>
                <button onClick={() => { setShowAdd(false); setEditId(null); }} className="text-ink-muted hover:text-ink transition-colors"><X className="w-5 h-5"/></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {productsError && <p className="text-xs text-bad">{productsError} <button onClick={loadProducts} className="underline">Retry</button></p>}
                {activeProducts.length > 0 && (
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Which round</label>
                    <select value={form.productId} onChange={e=>set('productId',e.target.value)} className={iCls}>
                      <option value="">Select…</option>
                      {activeProducts.map(p => <option key={p.id} value={p.id}>{p.label} · {p.holes} holes</option>)}
                    </select>
                    <p className="text-[11px] text-ink-faint mt-1">Each schedule sells one round. Two rounds that share a nine can&apos;t run at the same time — the save will say so.</p>
                  </div>
                )}
                <div>
                  <label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Tier Name</label>
                  <select value={form.tierName} onChange={e=>set('tierName',e.target.value)} className={iCls}>
                    <option value="standard">Standard</option>
                    <option value="twilight">Twilight</option>
                    <option value="morning">Morning / Early Bird</option>
                    <option value="prime">Prime Time</option>
                    <option value="junior">Junior</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Days of Week</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map((d,i) => (
                      <button key={i} onClick={() => toggleDay(i)}
                        className={'w-10 h-10 rounded-md text-[13.5px] font-medium border transition-colors ' + (form.daysOfWeek.includes(i) ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-soft border-line hover:border-pine/40')}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {([['M–F',[1,2,3,4,5]],['Wknd',[0,6]],['All',[0,1,2,3,4,5,6]]] as [string,number[]][]).map(([lbl,days]) => (
                      <button key={lbl} onClick={() => set('daysOfWeek',days)} className="text-xs text-pine underline">{lbl}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Start Time</label><input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)} className={iCls}/></div>
                  <div><label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">End Time</label><input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)} className={iCls}/></div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Interval (min)</label>
                    <select value={form.intervalMinutes} onChange={e=>set('intervalMinutes',Number(e.target.value))} className={iCls}>
                      {[6,7,8,9,10,12,15,20].map(m=><option key={m} value={m}>{m} min</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={form.productId ? 'hidden' : ''}><label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Holes</label><select value={form.holes} onChange={e=>set('holes',Number(e.target.value))} className={iCls}><option value={9}>9 holes</option><option value={18}>18 holes</option></select></div>
                  <div><label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Cart Fee ($)</label><input type="number" value={form.cartFee} onChange={e=>set('cartFee',Number(e.target.value))} className={iCls} min={0}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Green Fee — Weekday ($)</label><input type="number" value={form.greenFeeWeekday} onChange={e=>set('greenFeeWeekday',Number(e.target.value))} className={iCls} min={0}/></div>
                  <div><label className="text-[11px] uppercase tracking-[0.1em] text-ink-muted block mb-1.5">Green Fee — Weekend ($)</label><input type="number" value={form.greenFeeWeekend} onChange={e=>set('greenFeeWeekend',Number(e.target.value))} className={iCls} min={0}/></div>
                </div>
                {hasMember && (
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.1em] text-ok block mb-1.5">Member Rate (optional)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" placeholder="Weekday $" value={form.memberRateWeekday} onChange={e=>set('memberRateWeekday',e.target.value)} className={iCls} min={0}/>
                      <input type="number" placeholder="Weekend $" value={form.memberRateWeekend} onChange={e=>set('memberRateWeekend',e.target.value)} className={iCls} min={0}/>
                    </div>
                  </div>
                )}
                {hasResident && (
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.1em] text-pine block mb-1.5">Resident Rate (optional)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" placeholder="Weekday $" value={form.residentRateWeekday} onChange={e=>set('residentRateWeekday',e.target.value)} className={iCls} min={0}/>
                      <input type="number" placeholder="Weekend $" value={form.residentRateWeekend} onChange={e=>set('residentRateWeekend',e.target.value)} className={iCls} min={0}/>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-t border-line">
                  <span className="text-sm text-ink">Walking allowed</span>
                  <button onClick={() => set('walkingAllowed', !form.walkingAllowed)}
                    className={'relative w-11 h-6 rounded-sm transition-colors ' + (form.walkingAllowed ? 'bg-pine' : 'bg-line-strong')}>
                    <span className={'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-sm shadow-sm transition-transform ' + (form.walkingAllowed ? 'translate-x-5' : '')}/>
                  </button>
                </div>
                <button onClick={save} disabled={saving}
                  className="w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[12.5px] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {saving ? 'Saving...' : <><Check className="w-4 h-4"/>{editId ? 'Save Changes' : 'Create Schedule'}</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
