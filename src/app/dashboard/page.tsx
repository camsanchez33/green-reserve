'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Calendar, Users, DollarSign, Ban,
  Plus, ChevronLeft, ChevronRight, RefreshCw,
  AlertTriangle, X, Loader2,
} from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

/* ─── Types ─────────────────────────────────────────────────────────── */
type TeeTime = {
  id: string; date: string; time: string; holes: number;
  playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; walkingAllowed: boolean;
  status: string; bookings?: Booking[];
};
type Booking = { id: string; golferName: string; golferEmail: string; players: number; createdAt: string; };
interface AnalyticsData {
  summary: { totalRevenue: number; totalBookings: number; totalPlayers: number; utilization: number };
  revenueByDay: { date: string; revenue: number; bookings: number }[];
  utilizationByDow: { dow: number; label: string; pct: number }[];
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
const today  = () => new Date().toISOString().split('T')[0];
const addDays = (d: string, n: number) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; };
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; };

function slotColor(tt: TeeTime) {
  if (tt.status === 'blocked') return 'bg-gray-100 border-gray-200';
  const avail = tt.playersAvailable - (tt.playersBooked ?? 0);
  if (avail === 0) return 'bg-red-50 border-red-200';
  if (avail <= 2)  return 'bg-yellow-50 border-yellow-200';
  return 'bg-green-50 border-green-200';
}
function slotBadge(tt: TeeTime) {
  if (tt.status === 'blocked') return <span className="text-xs text-gray-400 font-medium">Blocked</span>;
  const booked = tt.playersBooked ?? 0;
  const avail  = tt.playersAvailable - booked;
  if (avail === 0) return <span className="text-xs font-semibold text-red-600">Full</span>;
  if (booked > 0)  return <span className="text-xs font-semibold text-yellow-600">{avail} left</span>;
  return <span className="text-xs font-semibold text-green-700">{avail} open</span>;
}

/* ─── Main ───────────────────────────────────────────────────────────── */
function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'teesheet' | 'analytics'>(searchParams.get('tab') === 'analytics' ? 'analytics' : 'teesheet');
  const [selectedDate, setSelectedDate] = useState(today());
  const [dateOffset, setDateOffset]     = useState(0);
  const [teeTimes, setTeeTimes]   = useState<TeeTime[]>([]);
  const [loading, setLoading]     = useState(true);
  const [courseName, setCourseName] = useState('');
  const [showAddModal, setShowAddModal]       = useState(false);
  const [showConditions, setShowConditions]   = useState(false);
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [analytics, setAnalytics]             = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [conditions, setConditions]       = useState('');
  const [conditionsInput, setConditionsInput] = useState('');
  const [savingConditions, setSavingConditions] = useState(false);

  const dates = Array.from({ length: 7 }, (_, i) => addDays(today(), i + dateOffset));
  const totalSlots = teeTimes.filter(t => t.status !== 'blocked').reduce((s, t) => s + t.playersAvailable, 0);
  const bookedSlots = teeTimes.reduce((s, t) => s + (t.playersBooked ?? 0), 0);
  const revenue = teeTimes.reduce((s, t) => s + ((t.playersBooked ?? 0) * t.greenFee), 0);
  const blocked = teeTimes.filter(t => t.status === 'blocked').length;

  const loadTimes = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/operator/tee-times?date=${date}&withBookings=1`);
      if (res.status === 401) { router.push('/dashboard/login'); return; }
      const data = await res.json();
      setTeeTimes(Array.isArray(data) ? data : []);
    } catch { setTeeTimes([]); }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.json()).then(p => {
      if (!p || !p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3)   { router.push('/dashboard/onboarding'); return; }
    });
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (c?.name) setCourseName(c.name);
      if (c?.conditions) { setConditions(c.conditions); setConditionsInput(c.conditions); }
    });
  }, [router]);

  useEffect(() => {
    if (tab === 'analytics' && !analytics) {
      setAnalyticsLoading(true);
      fetch('/api/operator/analytics').then(r => r.json()).then(d => { setAnalytics(d); setAnalyticsLoading(false); });
    }
  }, [tab, analytics]);

  useEffect(() => { loadTimes(selectedDate); }, [selectedDate, loadTimes]);

  // Sidebar navigates via ?tab=analytics rather than calling a local setter
  // directly (so the link works from anywhere) — sync local tab state to it.
  useEffect(() => {
    setTab(searchParams.get('tab') === 'analytics' ? 'analytics' : 'teesheet');
  }, [searchParams]);

  async function saveConditions() {
    setSavingConditions(true);
    await fetch('/api/operator/conditions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions: conditionsInput }) });
    setConditions(conditionsInput); setSavingConditions(false); setShowConditions(false);
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      <OperatorSidebar active={tab} courseName={courseName} onAlertClick={() => setShowConditions(true)} />

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">

        {/* Conditions banner */}
        {conditions && (
          <div className="bg-yellow-500 px-6 py-2 flex items-center gap-2 text-sm font-medium text-yellow-900">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Course alert: {conditions}</span>
            <button onClick={() => setShowConditions(true)} className="ml-auto underline text-xs">Update</button>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-6 py-6">

          {/* ── Analytics ── */}
          {tab === 'analytics' && (
            <div>
              <h2 className="font-black text-gray-900 text-xl mb-5">Analytics — Last 30 Days</h2>
              {analyticsLoading && <div className="text-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}
              {analytics && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label:'Revenue',     value:`$${analytics.summary.totalRevenue.toFixed(0)}`, sub:'green fees',    color:'text-green-700' },
                      { label:'Bookings',    value:analytics.summary.totalBookings,                 sub:'confirmed',     color:'text-blue-700'  },
                      { label:'Players',     value:analytics.summary.totalPlayers,                  sub:'total rounds',  color:'text-purple-700'},
                      { label:'Utilization', value:`${analytics.summary.utilization}%`,             sub:'slots filled',  color:'text-orange-600'},
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4">
                        <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                        <div className="text-xs text-gray-400">{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wide">Daily Revenue</h3>
                    <div className="flex items-end gap-0.5 h-24">
                      {analytics.revenueByDay.map(d => {
                        const max = Math.max(...analytics.revenueByDay.map(x => x.revenue), 1);
                        const pct = (d.revenue / max) * 100;
                        return (
                          <div key={d.date} className="flex-1 group relative flex flex-col justify-end h-full">
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">${d.revenue.toFixed(0)}</div>
                            <div className="w-full rounded-t" style={{ height:`${Math.max(pct,2)}%`, background: pct > 0 ? '#1b4332' : '#e5e7eb' }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>{analytics.revenueByDay[0]?.date}</span>
                      <span>{analytics.revenueByDay[analytics.revenueByDay.length-1]?.date}</span>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wide">Utilization by Day</h3>
                    <div className="space-y-2">
                      {analytics.utilizationByDow.map(d => (
                        <div key={d.dow} className="flex items-center gap-3">
                          <span className="text-sm text-gray-500 w-8">{d.label}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-3">
                            <div className="h-3 rounded-full" style={{ width:`${d.pct}%`, background: d.pct>70?'#166534':d.pct>40?'#1b4332':'#86efac' }} />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 w-10 text-right">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tee Sheet ── */}
          {tab === 'teesheet' && (<>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label:'Total Slots', value:totalSlots,           icon:<Users className="w-4 h-4"/>,     color:'text-blue-600'   },
                { label:'Booked',      value:bookedSlots,          icon:<Calendar className="w-4 h-4"/>,  color:'text-green-600'  },
                { label:'Revenue',     value:`$${revenue.toFixed(0)}`, icon:<DollarSign className="w-4 h-4"/>, color:'text-emerald-600'},
                { label:'Blocked',     value:blocked,              icon:<Ban className="w-4 h-4"/>,       color:'text-gray-500'   },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${s.color}`}>{s.icon}{s.label}</div>
                  <div className="text-xl font-black text-gray-900">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Date strip */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 p-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setDateOffset(o => Math.max(0,o-7))} disabled={dateOffset===0} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4 text-gray-600"/>
                </button>
                <div className="flex gap-1.5 flex-1 overflow-x-auto">
                  {dates.map(d => (
                    <button key={d} onClick={() => setSelectedDate(d)} className={`flex-1 min-w-[70px] py-2 px-1 rounded-lg text-center transition-colors ${selectedDate===d?'bg-[#1b4332] text-white':'hover:bg-gray-50 text-gray-600'}`}>
                      <div className="text-xs font-medium">{new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'})}</div>
                      <div className="text-sm font-bold">{new Date(d+'T12:00:00').getDate()}</div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setDateOffset(o => o+7)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <ChevronRight className="w-4 h-4 text-gray-600"/>
                </button>
              </div>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-black text-gray-900">{fmtDate(selectedDate)}</h2>
                <p className="text-xs text-gray-400">{teeTimes.filter(t=>t.status!=='blocked').length} tee times · {teeTimes.filter(t=>(t.playersBooked??0)>0).length} booked</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadTimes(selectedDate)} className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300">
                  <RefreshCw className="w-3.5 h-3.5"/>Refresh
                </button>
                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 text-xs bg-[#1b4332] text-white px-3 py-1.5 rounded-lg hover:bg-[#2d6a4f]">
                  <Plus className="w-3.5 h-3.5"/>Add Time
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-3 mb-3 text-xs text-gray-500">
              {[['bg-green-100 border-green-300','Open'],['bg-yellow-100 border-yellow-300','Filling'],['bg-red-100 border-red-300','Full'],['bg-gray-100 border-gray-200','Blocked']].map(([cls,label])=>(
                <span key={label} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm border inline-block ${cls}`}/>{label}</span>
              ))}
            </div>

            {/* Tee times */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin"/>Loading tee times...
              </div>
            ) : teeTimes.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
                <div className="text-4xl mb-3">⛳</div>
                <p className="font-semibold text-gray-700 mb-1">No tee times for this date</p>
                <p className="text-sm text-gray-400 mb-4">Add times manually or check your schedule covers this day</p>
                <button onClick={() => setShowAddModal(true)} className="bg-[#1b4332] text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-[#2d6a4f]">Add Tee Time</button>
              </div>
            ) : (
              <div className="space-y-2">
                {teeTimes.map(tt => (
                  <div key={tt.id} className={`rounded-xl border p-3 cursor-pointer ${slotColor(tt)}`} onClick={() => setExpandedId(expandedId===tt.id?null:tt.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-gray-900 text-sm w-20">{fmtTime(tt.time)}</span>
                        <span className="text-xs text-gray-500">{tt.holes}h</span>
                        {slotBadge(tt)}
                        <span className="text-xs text-gray-400">{tt.playersBooked}/{tt.playersAvailable}</span>
                        <span className="text-xs font-semibold text-gray-700">${tt.greenFee}{tt.cartFee>0?` +$${tt.cartFee}`:''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={e=>{e.stopPropagation();fetch('/api/operator/tee-times',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:tt.id,status:tt.status==='blocked'?'available':'blocked'})}).then(()=>loadTimes(selectedDate));}}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-700">
                          {tt.status==='blocked'?'Unblock':'Block'}
                        </button>
                        <button onClick={e=>{e.stopPropagation();if(confirm('Delete this tee time?'))fetch('/api/operator/tee-times',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:tt.id})}).then(()=>loadTimes(selectedDate));}}
                          className="text-xs px-2 py-1 rounded-lg border border-red-100 bg-white text-red-400 hover:text-red-600">
                          Del
                        </button>
                      </div>
                    </div>
                    {expandedId===tt.id&&tt.bookings&&tt.bookings.length>0&&(
                      <div className="mt-3 pt-3 border-t border-gray-200 space-y-1.5">
                        {tt.bookings.map(b=>(
                          <div key={b.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                            <span className="font-semibold text-gray-800">{b.golferName}</span>
                            <span className="text-gray-400">{b.players} player{b.players!==1?'s':''}</span>
                            <span className="text-gray-500">{b.golferEmail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {expandedId===tt.id&&tt.bookings&&tt.bookings.length===0&&(
                      <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-400">No bookings yet</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>
      </main>

      {/* ── Add Tee Time Modal ── */}
      {showAddModal&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6">
            <h3 className="font-bold text-gray-900 mb-4">Add Tee Time — {fmtDate(selectedDate)}</h3>
            <AddTeeTimeForm date={selectedDate} onSave={()=>{setShowAddModal(false);loadTimes(selectedDate);}} onCancel={()=>setShowAddModal(false)}/>
          </div>
        </div>
      )}

      {/* ── Conditions Modal ── */}
      {showConditions&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">Course Alert</h3>
              <button onClick={()=>setShowConditions(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Shown as a banner to golfers before they book. Leave blank to clear.</p>
            <textarea value={conditionsInput} onChange={e=>setConditionsInput(e.target.value)} rows={3} placeholder="e.g. Cart paths only through Sunday" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none mb-4 resize-none"/>
            <div className="flex gap-3">
              <button onClick={()=>setShowConditions(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={saveConditions} disabled={savingConditions} className="flex-1 bg-[#1b4332] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#2d6a4f] disabled:opacity-50">
                {savingConditions?'Saving...':conditionsInput?'Save Alert':'Clear Alert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <DashboardPageInner />
    </Suspense>
  );
}

/* ─── Add Tee Time Form ─────────────────────────────────────────────── */
function AddTeeTimeForm({ date, onSave, onCancel }: { date: string; onSave: ()=>void; onCancel: ()=>void }) {
  const [time,     setTime]     = useState('08:00');
  const [holes,    setHoles]    = useState(18);
  const [players,  setPlayers]  = useState(4);
  const [greenFee, setGreenFee] = useState(65);
  const [cartFee,  setCartFee]  = useState(18);
  const [walking,  setWalking]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none';

  async function save() {
    setSaving(true);
    await fetch('/api/operator/tee-times', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({date,time,holes,playersAvailable:players,greenFee,cartFee,walkingAllowed:walking}) });
    setSaving(false); onSave();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Time</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} className={inp}/></div>
        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Holes</label><select value={holes} onChange={e=>setHoles(Number(e.target.value))} className={inp}><option value={9}>9</option><option value={18}>18</option></select></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Slots</label><input type="number" value={players} min={1} max={8} onChange={e=>setPlayers(Number(e.target.value))} className={inp}/></div>
        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Green $</label><input type="number" value={greenFee} min={0} onChange={e=>setGreenFee(Number(e.target.value))} className={inp}/></div>
        <div><label className="block text-xs font-semibold text-gray-500 mb-1">Cart $</label><input type="number" value={cartFee} min={0} onChange={e=>setCartFee(Number(e.target.value))} className={inp}/></div>
      </div>
      <div className="flex items-center justify-between py-1">
        <span className="text-sm text-gray-700">Walking allowed</span>
        <button onClick={()=>setWalking(!walking)} className={`relative w-11 h-6 rounded-full transition-colors ${walking?'bg-green-600':'bg-gray-200'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${walking?'translate-x-5':''}`}/>
        </button>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 bg-[#1b4332] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#2d6a4f] disabled:opacity-50">
          {saving?'Adding...':'Add Time'}
        </button>
      </div>
    </div>
  );
}
