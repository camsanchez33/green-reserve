'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Check, X, Power, RefreshCw } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { TabIntroButton, TabIntroCard } from '@/components/dashboard/TabIntro';
import { useTabIntro } from '@/lib/use-tab-intro';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full';

type Schedule = {
  id: string; tierName: string; daysOfWeek: number[]; startTime: string; endTime: string;
  intervalMinutes: number; holes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number|null; memberRateWeekend: number|null;
  residentRateWeekday: number|null; residentRateWeekend: number|null;
  cartFee: number; walkingAllowed: boolean; active: boolean; createdAt: string;
};

function fmtTime(t: string) { const [h,m]=t.split(':').map(Number); return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
const emptyForm = () => ({ tierName:'standard', daysOfWeek:[0,1,2,3,4,5,6] as number[], startTime:'06:30', endTime:'17:30', intervalMinutes:8, holes:18, greenFeeWeekday:65, greenFeeWeekend:85, memberRateWeekday:'', memberRateWeekend:'', residentRateWeekday:'', residentRateWeekend:'', cartFee:18, walkingAllowed:true });

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [hasMember, setHasMember] = useState(false);
  const [hasResident, setHasResident] = useState(false);
  const intro = useTabIntro('schedule');

  useEffect(() => {
    fetch('/api/operator/schedule').then(r=>r.json()).then(d=>{ setSchedules(Array.isArray(d)?d:[]); setLoading(false); });
    fetch('/api/operator/settings').then(r=>r.json()).then(c=>{ setHasMember(!!c.hasMemberPricing); setHasResident(!!c.hasResidentPricing); });
  }, []);

  function openAdd() { setForm(emptyForm()); setEditId(null); setShowAdd(true); }
  function openEdit(s: Schedule) {
    setForm({ tierName:s.tierName, daysOfWeek:s.daysOfWeek, startTime:s.startTime, endTime:s.endTime, intervalMinutes:s.intervalMinutes, holes:s.holes, greenFeeWeekday:s.greenFeeWeekday, greenFeeWeekend:s.greenFeeWeekend, memberRateWeekday:s.memberRateWeekday?.toString()??'', memberRateWeekend:s.memberRateWeekend?.toString()??'', residentRateWeekday:s.residentRateWeekday?.toString()??'', residentRateWeekend:s.residentRateWeekend?.toString()??'', cartFee:s.cartFee, walkingAllowed:s.walkingAllowed });
    setEditId(s.id); setShowAdd(true);
  }

  const toggleDay = (d: number) => setForm(f=>({ ...f, daysOfWeek: f.daysOfWeek.includes(d)?f.daysOfWeek.filter(x=>x!==d):[...f.daysOfWeek,d].sort() }));
  const set = (k: string, v: unknown) => setForm(f=>({...f,[k]:v}));

  async function save() {
    if (!form.daysOfWeek.length) return alert('Select at least one day');
    const clash = schedules.find(s => {
      if (editId && s.id === editId) return false;
      if (!s.active) return false;
      const sharesDay = s.daysOfWeek.some(d => form.daysOfWeek.includes(d));
      if (!sharesDay) return false;
      return form.startTime < s.endTime && s.startTime < form.endTime;
    });
    if (clash) {
      const days = clash.daysOfWeek.filter(d => form.daysOfWeek.includes(d)).map(d => DAYS[d]).join(', ');
      alert(`This overlaps your "${clash.tierName}" schedule on ${days} (${fmtTime(clash.startTime)} – ${fmtTime(clash.endTime)}).\n\nTwo schedules can't cover the same time on the same day. Adjust the times or edit the existing schedule instead.`);
      return;
    }
    if (form.startTime >= form.endTime) { alert('End time must be after start time.'); return; }
    setSaving(true);
    const payload = { ...form, memberRateWeekday:form.memberRateWeekday||null, memberRateWeekend:form.memberRateWeekend||null, residentRateWeekday:form.residentRateWeekday||null, residentRateWeekend:form.residentRateWeekend||null };
    if (editId) {
      const r = await fetch('/api/operator/schedule',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editId,...payload})});
      const updated = await r.json();
      setSchedules(s=>s.map(x=>x.id===editId?updated:x));
    } else {
      const r = await fetch('/api/operator/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const created = await r.json();
      setSchedules(s=>[...s,created]);
    }
    setSaving(false); setShowAdd(false); setEditId(null);
  }

  async function regenerate() {
    if (!confirm('Update the tee sheet now?\n\nThis rebuilds open tee times for the next 8 days from your current schedules. Times that already have bookings are never touched.')) return;
    setRegenerating(true);
    const r = await fetch('/api/operator/regenerate-tee-times', { method: 'POST' });
    const data = await r.json();
    setRegenerating(false);
    if (data.errors?.length) alert(`Done with some errors: ${data.errors.join(', ')}`);
    else alert(`Done! ${data.created} new tee time slot${data.created !== 1 ? 's' : ''} created across the next 8 days.`);
  }

  async function del(id: string) {
    if (!confirm('Delete this schedule? Future tee times from this schedule will not be re-generated.')) return;
    await fetch('/api/operator/schedule',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    setSchedules(s=>s.filter(x=>x.id!==id));
  }

  async function toggleActive(s: Schedule) {
    const r = await fetch('/api/operator/schedule',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:s.id,active:!s.active})});
    const updated = await r.json();
    setSchedules(prev=>prev.map(x=>x.id===s.id?updated:x));
  }

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="schedule"/>
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-line px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Tee Sheet Schedules</h1>
            <TabIntroButton onClick={intro.show}/>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={regenerate} disabled={regenerating} className="flex items-center gap-2 border border-line text-ink-soft px-3 py-2 rounded-md text-[12.5px] font-medium hover:border-line-strong hover:text-ink disabled:opacity-50 transition-colors">
              <RefreshCw className={'w-3.5 h-3.5 ' + (regenerating ? 'animate-spin' : '')}/>{regenerating ? 'Regenerating…' : 'Apply to Tee Sheet'}
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md font-medium text-[12.5px] transition-colors">
              <Plus className="w-4 h-4"/>Add Schedule
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
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

          {loading && <div className="text-center py-12 text-ink-muted">Loading schedules...</div>}
          {!loading && schedules.length === 0 && (
            <div className="text-center py-16 bg-white rounded-lg border border-dashed border-line">
              <div className="font-medium text-ink mb-1">No schedules yet</div>
              <p className="text-sm text-ink-muted mb-4">Create a schedule to auto-generate tee times daily</p>
              <button onClick={openAdd} className="bg-pine hover:bg-pine-hover text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors">Add Your First Schedule</button>
            </div>
          )}

          {schedules.map(s => (
            <div key={s.id} className={'bg-white rounded-lg border p-5 ' + (s.active ? 'border-line' : 'border-line opacity-60')}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink capitalize">{s.tierName}</span>
                    <span className={'text-[10px] font-medium px-2 py-0.5 rounded-full ' + (s.active ? 'text-ok bg-ok/10' : 'text-ink-muted bg-line')}>{s.active ? 'Active' : 'Paused'}</span>
                  </div>
                  <div className="text-sm text-ink-soft mt-0.5">
                    {s.daysOfWeek.map(d=>DAYS[d]).join(', ')} · {fmtTime(s.startTime)} – {fmtTime(s.endTime)} · every {s.intervalMinutes} min · {s.holes} holes
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(s)} title={s.active?'Pause':'Activate'} className="p-1.5 rounded-md border border-line text-ink-muted hover:text-warn hover:border-warn/30 transition-colors"><Power className="w-4 h-4"/></button>
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-md border border-line text-ink-muted hover:text-pine hover:border-pine/30 transition-colors"><Pencil className="w-4 h-4"/></button>
                  <button onClick={() => del(s.id)} className="p-1.5 rounded-md border border-line text-ink-muted hover:text-bad hover:border-bad/30 transition-colors"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="bg-paper rounded-md px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">Weekday</div>
                  <div className="font-medium text-ink">${s.greenFeeWeekday} + ${s.cartFee} cart</div>
                </div>
                <div className="bg-paper rounded-md px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">Weekend</div>
                  <div className="font-medium text-ink">${s.greenFeeWeekend} + ${s.cartFee} cart</div>
                </div>
                {s.memberRateWeekday != null && (
                  <div className="bg-ok/5 border border-ok/15 rounded-md px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-ok mb-0.5">Member WD/WE</div>
                    <div className="font-medium text-ok">${s.memberRateWeekday} / ${s.memberRateWeekend}</div>
                  </div>
                )}
                {s.residentRateWeekday != null && (
                  <div className="bg-pine/5 border border-pine/15 rounded-md px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-pine mb-0.5">Resident WD/WE</div>
                    <div className="font-medium text-pine">${s.residentRateWeekday} / ${s.residentRateWeekend}</div>
                  </div>
                )}
                <div className="bg-paper rounded-md px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">Walking</div>
                  <div className="font-medium text-ink">{s.walkingAllowed ? 'Allowed' : 'Cart required'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {showAdd && (
          <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white border border-line w-full sm:max-w-xl rounded-t-lg sm:rounded-lg max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-line flex items-center justify-between z-10">
                <span className="font-serif font-medium text-ink text-[17px]">{editId ? 'Edit Schedule' : 'New Schedule'}</span>
                <button onClick={() => { setShowAdd(false); setEditId(null); }} className="text-ink-muted hover:text-ink transition-colors"><X className="w-5 h-5"/></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Tier Name</label>
                  <select value={form.tierName} onChange={e=>set('tierName',e.target.value)} className={iCls}>
                    <option value="standard">Standard</option>
                    <option value="twilight">Twilight</option>
                    <option value="morning">Morning / Early Bird</option>
                    <option value="prime">Prime Time</option>
                    <option value="junior">Junior</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Days of Week</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map((d,i) => (
                      <button key={i} onClick={() => toggleDay(i)}
                        className={'w-10 h-10 rounded-full text-sm font-medium border transition-colors ' + (form.daysOfWeek.includes(i) ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-soft border-line hover:border-pine/40')}>
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
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Start Time</label><input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)} className={iCls}/></div>
                  <div><label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">End Time</label><input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)} className={iCls}/></div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Interval (min)</label>
                    <select value={form.intervalMinutes} onChange={e=>set('intervalMinutes',Number(e.target.value))} className={iCls}>
                      {[6,7,8,9,10,12,15,20].map(m=><option key={m} value={m}>{m} min</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Holes</label><select value={form.holes} onChange={e=>set('holes',Number(e.target.value))} className={iCls}><option value={9}>9 holes</option><option value={18}>18 holes</option></select></div>
                  <div><label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Cart Fee ($)</label><input type="number" value={form.cartFee} onChange={e=>set('cartFee',Number(e.target.value))} className={iCls} min={0}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Green Fee — Weekday ($)</label><input type="number" value={form.greenFeeWeekday} onChange={e=>set('greenFeeWeekday',Number(e.target.value))} className={iCls} min={0}/></div>
                  <div><label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Green Fee — Weekend ($)</label><input type="number" value={form.greenFeeWeekend} onChange={e=>set('greenFeeWeekend',Number(e.target.value))} className={iCls} min={0}/></div>
                </div>
                {hasMember && (
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ok block mb-1.5">Member Rate (optional)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" placeholder="Weekday $" value={form.memberRateWeekday} onChange={e=>set('memberRateWeekday',e.target.value)} className={iCls} min={0}/>
                      <input type="number" placeholder="Weekend $" value={form.memberRateWeekend} onChange={e=>set('memberRateWeekend',e.target.value)} className={iCls} min={0}/>
                    </div>
                  </div>
                )}
                {hasResident && (
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-pine block mb-1.5">Resident Rate (optional)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" placeholder="Weekday $" value={form.residentRateWeekday} onChange={e=>set('residentRateWeekday',e.target.value)} className={iCls} min={0}/>
                      <input type="number" placeholder="Weekend $" value={form.residentRateWeekend} onChange={e=>set('residentRateWeekend',e.target.value)} className={iCls} min={0}/>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between py-2 border-t border-line">
                  <span className="text-sm text-ink">Walking allowed</span>
                  <button onClick={() => set('walkingAllowed', !form.walkingAllowed)}
                    className={'relative w-11 h-6 rounded-full transition-colors ' + (form.walkingAllowed ? 'bg-pine' : 'bg-line-strong')}>
                    <span className={'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ' + (form.walkingAllowed ? 'translate-x-5' : '')}/>
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
