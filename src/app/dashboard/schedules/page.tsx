'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Check, X, Power } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

type Schedule = {
  id: string; tierName: string; daysOfWeek: number[]; startTime: string; endTime: string;
  intervalMinutes: number; holes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number|null; memberRateWeekend: number|null;
  residentRateWeekday: number|null; residentRateWeekend: number|null;
  cartFee: number; walkingAllowed: boolean; active: boolean; createdAt: string;
};

const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white w-full';
const DAY_GROUPS = [[0],[6],[1,2,3,4,5]]; // presets
function fmtTime(t: string) {
  const [h,m]=t.split(':').map(Number);
  return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}

const emptyForm = () => ({
  tierName: 'standard', daysOfWeek: [0,1,2,3,4,5,6] as number[],
  startTime: '06:30', endTime: '17:30', intervalMinutes: 8, holes: 18,
  greenFeeWeekday: 65, greenFeeWeekend: 85,
  memberRateWeekday: '', memberRateWeekend: '',
  residentRateWeekday: '', residentRateWeekend: '',
  cartFee: 18, walkingAllowed: true,
});

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [hasMember, setHasMember] = useState(false);
  const [hasResident, setHasResident] = useState(false);
  const [courseName, setCourseName] = useState('');

  useEffect(()=>{
    fetch('/api/operator/schedule').then(r=>r.json()).then(d=>{ setSchedules(Array.isArray(d)?d:[]); setLoading(false); });
    fetch('/api/operator/settings').then(r=>r.json()).then(c=>{ setHasMember(!!c.hasMemberPricing); setHasResident(!!c.hasResidentPricing); });
    fetch('/api/operator/courses').then(r=>r.json()).then(c=>{ if (c?.name) setCourseName(c.name); });
  },[]);

  function openAdd() { setForm(emptyForm()); setEditId(null); setShowAdd(true); }
  function openEdit(s: Schedule) {
    setForm({
      tierName: s.tierName, daysOfWeek: s.daysOfWeek, startTime: s.startTime, endTime: s.endTime,
      intervalMinutes: s.intervalMinutes, holes: s.holes,
      greenFeeWeekday: s.greenFeeWeekday, greenFeeWeekend: s.greenFeeWeekend,
      memberRateWeekday: s.memberRateWeekday?.toString()??'',
      memberRateWeekend: s.memberRateWeekend?.toString()??'',
      residentRateWeekday: s.residentRateWeekday?.toString()??'',
      residentRateWeekend: s.residentRateWeekend?.toString()??'',
      cartFee: s.cartFee, walkingAllowed: s.walkingAllowed,
    });
    setEditId(s.id); setShowAdd(true);
  }

  const toggleDay = (d: number) => setForm(f=>({ ...f, daysOfWeek: f.daysOfWeek.includes(d)?f.daysOfWeek.filter(x=>x!==d):[...f.daysOfWeek,d].sort() }));
  const set = (k: string, v: unknown) => setForm(f=>({...f,[k]:v}));

  async function save() {
    if(!form.daysOfWeek.length) return alert('Select at least one day');
    setSaving(true);
    const payload = {
      ...form,
      memberRateWeekday: form.memberRateWeekday||null,
      memberRateWeekend: form.memberRateWeekend||null,
      residentRateWeekday: form.residentRateWeekday||null,
      residentRateWeekend: form.residentRateWeekend||null,
    };
    if(editId) {
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

  async function del(id: string) {
    if(!confirm('Delete this schedule? Future tee times from this schedule will not be re-generated.')) return;
    await fetch('/api/operator/schedule',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    setSchedules(s=>s.filter(x=>x.id!==id));
  }

  async function toggleActive(s: Schedule) {
    const r = await fetch('/api/operator/schedule',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:s.id,active:!s.active})});
    const updated = await r.json();
    setSchedules(prev=>prev.map(x=>x.id===s.id?updated:x));
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="schedule" courseName={courseName} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
      <div className="bg-[#1b4332] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <span className="text-white font-black text-lg">Tee Sheet Schedules</span>
        <button onClick={openAdd} className="flex items-center gap-2 bg-white text-[#1b4332] px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-50">
          <Plus className="w-4 h-4"/> Add Schedule
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading && <div className="text-center py-12 text-gray-400">Loading schedules...</div>}
        {!loading && schedules.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
            <div className="text-4xl mb-3">📅</div>
            <div className="font-semibold text-gray-700 mb-1">No schedules yet</div>
            <p className="text-sm text-gray-400 mb-4">Create a schedule to auto-generate tee times daily</p>
            <button onClick={openAdd} className="bg-[#1b4332] text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-[#2d6a4f]">Add Your First Schedule</button>
          </div>
        )}

        {schedules.map(s=>(
          <div key={s.id} className={`bg-white rounded-2xl border p-5 ${s.active?'border-gray-200':'border-gray-100 opacity-70'}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 capitalize">{s.tierName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{s.active?'Active':'Paused'}</span>
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {s.daysOfWeek.map(d=>DAYS[d]).join(', ')} · {fmtTime(s.startTime)} – {fmtTime(s.endTime)} · every {s.intervalMinutes} min · {s.holes} holes
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=>toggleActive(s)} title={s.active?'Pause schedule':'Activate schedule'} className={`p-1.5 rounded-lg border transition-colors ${s.active?'text-gray-400 hover:text-orange-500 border-gray-200':'text-gray-400 hover:text-green-600 border-gray-200'}`}><Power className="w-4 h-4"/></button>
                <button onClick={()=>openEdit(s)} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4"/></button>
                <button onClick={()=>del(s.id)} className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Weekday</div>
                <div className="font-semibold text-gray-900">${s.greenFeeWeekday} + ${s.cartFee} cart</div>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Weekend</div>
                <div className="font-semibold text-gray-900">${s.greenFeeWeekend} + ${s.cartFee} cart</div>
              </div>
              {s.memberRateWeekday&&<div className="bg-blue-50 rounded-lg px-3 py-2">
                <div className="text-xs text-blue-500 font-medium uppercase tracking-wide">Member WD/WE</div>
                <div className="font-semibold text-blue-800">${s.memberRateWeekday} / ${s.memberRateWeekend}</div>
              </div>}
              {s.residentRateWeekday&&<div className="bg-purple-50 rounded-lg px-3 py-2">
                <div className="text-xs text-purple-500 font-medium uppercase tracking-wide">Resident WD/WE</div>
                <div className="font-semibold text-purple-800">${s.residentRateWeekday} / ${s.residentRateWeekend}</div>
              </div>}
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Walking</div>
                <div className="font-semibold text-gray-900">{s.walkingAllowed?'Allowed':'Cart required'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showAdd&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between z-10">
              <span className="font-bold text-gray-900 text-lg">{editId?'Edit Schedule':'New Schedule'}</span>
              <button onClick={()=>{setShowAdd(false);setEditId(null);}} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Tier Name</label>
                <select value={form.tierName} onChange={e=>set('tierName',e.target.value)} className={inputCls}>
                  <option value="standard">Standard</option>
                  <option value="twilight">Twilight</option>
                  <option value="morning">Morning / Early Bird</option>
                  <option value="prime">Prime Time</option>
                  <option value="junior">Junior</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Days of Week</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((d,i)=>(
                    <button key={i} onClick={()=>toggleDay(i)}
                      className={`w-10 h-10 rounded-full text-sm font-semibold border transition-colors ${form.daysOfWeek.includes(i)?'bg-[#1b4332] text-white border-[#1b4332]':'bg-white text-gray-500 border-gray-200 hover:border-green-400'}`}>{d}</button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  {[['M–F',[1,2,3,4,5]],['Wknd',[0,6]],['All',[0,1,2,3,4,5,6]]].map(([lbl,days])=>(
                    <button key={lbl as string} onClick={()=>set('daysOfWeek',days)} className="text-xs text-blue-600 underline">{lbl as string}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Start Time</label>
                  <input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)} className={inputCls}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">End Time</label>
                  <input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)} className={inputCls}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Interval (min)</label>
                  <select value={form.intervalMinutes} onChange={e=>set('intervalMinutes',Number(e.target.value))} className={inputCls}>
                    {[6,7,8,9,10,12,15,20].map(m=><option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Holes</label>
                  <select value={form.holes} onChange={e=>set('holes',Number(e.target.value))} className={inputCls}>
                    <option value={9}>9 holes</option><option value={18}>18 holes</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Cart Fee ($)</label>
                  <input type="number" value={form.cartFee} onChange={e=>set('cartFee',Number(e.target.value))} className={inputCls} min={0}/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Green Fee — Weekday ($)</label>
                  <input type="number" value={form.greenFeeWeekday} onChange={e=>set('greenFeeWeekday',Number(e.target.value))} className={inputCls} min={0}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Green Fee — Weekend ($)</label>
                  <input type="number" value={form.greenFeeWeekend} onChange={e=>set('greenFeeWeekend',Number(e.target.value))} className={inputCls} min={0}/>
                </div>
              </div>

              {hasMember&&<div>
                <label className="text-xs font-semibold text-blue-600 uppercase tracking-wide block mb-1.5">Member Rate (optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Weekday $" value={form.memberRateWeekday} onChange={e=>set('memberRateWeekday',e.target.value)} className={inputCls} min={0}/>
                  <input type="number" placeholder="Weekend $" value={form.memberRateWeekend} onChange={e=>set('memberRateWeekend',e.target.value)} className={inputCls} min={0}/>
                </div>
              </div>}

              {hasResident&&<div>
                <label className="text-xs font-semibold text-purple-600 uppercase tracking-wide block mb-1.5">Resident Rate (optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Weekday $" value={form.residentRateWeekday} onChange={e=>set('residentRateWeekday',e.target.value)} className={inputCls} min={0}/>
                  <input type="number" placeholder="Weekend $" value={form.residentRateWeekend} onChange={e=>set('residentRateWeekend',e.target.value)} className={inputCls} min={0}/>
                </div>
              </div>}

              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm font-medium text-gray-700">Walking allowed</span>
                <button onClick={()=>set('walkingAllowed',!form.walkingAllowed)} className={`relative w-11 h-6 rounded-full transition-colors ${form.walkingAllowed?'bg-green-600':'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.walkingAllowed?'translate-x-5':''}`}/>
                </button>
              </div>

              <button onClick={save} disabled={saving} className="w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#2d6a4f] disabled:opacity-50 flex items-center justify-center gap-2">
                {saving?<><span className="animate-spin">⏳</span> Saving...</>:<><Check className="w-4 h-4"/> {editId?'Save Changes':'Create Schedule'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
