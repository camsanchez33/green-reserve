'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, Clock, Calendar, Users, DollarSign, Ban, Plus, ChevronLeft, ChevronRight, RefreshCw, BarChart2, AlertTriangle, X } from 'lucide-react';

type TeeTime = {
  id: string; date: string; time: string; holes: number;
  playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; walkingAllowed: boolean;
  status: string;
  bookings?: Booking[];
};

type Booking = {
  id: string; golferName: string; golferEmail: string; players: number; createdAt: string;
};

function today() { return new Date().toISOString().split('T')[0]; }
function addDays(d: string, n: number) {
  const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n);
  return dt.toISOString().split('T')[0];
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${ampm}`;
}

function statusColor(tt: TeeTime) {
  if (tt.status === 'blocked') return 'bg-gray-100 border-gray-200 text-gray-400';
  const booked = tt.playersBooked ?? 0;
  const avail = tt.playersAvailable - booked;
  if (avail === 0) return 'bg-red-50 border-red-200';
  if (avail <= 2) return 'bg-yellow-50 border-yellow-200';
  return 'bg-green-50 border-green-200';
}

function statusBadge(tt: TeeTime) {
  if (tt.status === 'blocked') return <span className="text-xs text-gray-400 font-medium">Blocked</span>;
  const booked = tt.playersBooked ?? 0;
  const avail = tt.playersAvailable - booked;
  if (avail === 0) return <span className="text-xs font-semibold text-red-600">Full</span>;
  if (booked > 0) return <span className="text-xs font-semibold text-yellow-600">{avail} left</span>;
  return <span className="text-xs font-semibold text-green-700">{avail} open</span>;
}

interface AnalyticsData {
  summary: { totalRevenue: number; totalBookings: number; totalPlayers: number; utilization: number };
  revenueByDay: { date: string; revenue: number; bookings: number }[];
  utilizationByDow: { dow: number; label: string; pct: number }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'teesheet' | 'analytics'>('teesheet');
  const [selectedDate, setSelectedDate] = useState(today());
  const [dateOffset, setDateOffset] = useState(0);
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseName, setCourseName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [conditions, setConditions] = useState('');
  const [conditionsInput, setConditionsInput] = useState('');
  const [showConditions, setShowConditions] = useState(false);
  const [savingConditions, setSavingConditions] = useState(false);

  // Stats
  const totalSlots = teeTimes.filter(t => t.status !== 'blocked').reduce((s, t) => s + t.playersAvailable, 0);
  const bookedSlots = teeTimes.reduce((s, t) => s + (t.playersBooked ?? 0), 0);
  const revenue = teeTimes.reduce((s, t) => s + ((t.playersBooked ?? 0) * t.greenFee), 0);
  const blocked = teeTimes.filter(t => t.status === 'blocked').length;

  // 7-day strip (starting from offset)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today(), i + dateOffset));

  const load = useCallback(async (date: string) => {
    setLoading(true);
    const res = await fetch(`/api/operator/tee-times?date=${date}&withBookings=1`);
    if (res.status === 401) { router.push('/dashboard/login'); return; }
    const data = await res.json();
    setTeeTimes(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.json()).then(p => {
      if (!p || !p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3) { router.push('/dashboard/onboarding'); return; }
    });
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (c?.name) setCourseName(c.name);
      if (c?.conditions) { setConditions(c.conditions); setConditionsInput(c.conditions); }
    });
  }, [router]);

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics) {
      setAnalyticsLoading(true);
      fetch('/api/operator/analytics').then(r => r.json()).then(d => { setAnalytics(d); setAnalyticsLoading(false); });
    }
  }, [activeTab, analytics]);

  async function saveConditions() {
    setSavingConditions(true);
    await fetch('/api/operator/conditions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditions: conditionsInput }),
    });
    setConditions(conditionsInput);
    setSavingConditions(false);
    setShowConditions(false);
  }

  useEffect(() => { load(selectedDate); }, [selectedDate, load]);

  async function toggleBlock(tt: TeeTime) {
    const newStatus = tt.status === 'blocked' ? 'available' : 'blocked';
    await fetch('/api/operator/tee-times', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tt.id, status: newStatus }),
    });
    load(selectedDate);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/dashboard/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-[#1b4332] px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-lg tracking-tight">Green<span className="text-green-300">Reserve</span></span>
          {courseName && <span className="text-green-200/60 text-sm hidden sm:block">· {courseName}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setActiveTab('teesheet')}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${activeTab === 'teesheet' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
            <Calendar className="w-3.5 h-3.5" /> Tee Sheet
          </button>
          <button onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${activeTab === 'analytics' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
            <BarChart2 className="w-3.5 h-3.5" /> Analytics
          </button>
          <button onClick={() => router.push('/dashboard/schedule')}
            className="text-white/60 hover:text-white flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <Clock className="w-3.5 h-3.5" /> Schedule
          </button>
          <button onClick={() => router.push('/dashboard/settings')}
            className="text-white/60 hover:text-white flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
          <button onClick={logout}
            className="text-white/60 hover:text-white flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </nav>

      {/* Conditions banner */}
      {conditions && (
        <div className="bg-yellow-500 px-4 py-2 flex items-center gap-2 text-sm font-medium text-yellow-900">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Course alert: {conditions}</span>
          <button onClick={() => setShowConditions(true)} className="ml-auto underline text-xs">Update</button>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Conditions modal */}
        {showConditions && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-gray-900">Course Conditions</h3>
                <button onClick={() => setShowConditions(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">Set a status visible to golfers before they book (e.g. "Cart paths only today", "Closed for tournament 6/20"). Clear to remove.</p>
              <input value={conditionsInput} onChange={e => setConditionsInput(e.target.value)}
                placeholder="e.g. Cart paths only through Sunday"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none mb-4" />
              <div className="flex gap-2">
                <button onClick={() => { setConditionsInput(''); saveConditions(); }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Clear Alert
                </button>
                <button onClick={saveConditions} disabled={savingConditions}
                  className="flex-1 bg-[#1b4332] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#2d6a4f] disabled:opacity-50">
                  {savingConditions ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-black text-gray-900 text-lg">Last 30 Days</h2>
              <button onClick={() => setShowConditions(true)}
                className="flex items-center gap-1.5 text-sm border border-yellow-300 bg-yellow-50 text-yellow-800 px-3 py-1.5 rounded-lg font-medium hover:bg-yellow-100">
                <AlertTriangle className="w-4 h-4" /> Course Alert
              </button>
            </div>

            {analyticsLoading && <div className="text-center py-20 text-gray-400">Loading analytics...</div>}
            {analytics && (
              <div className="space-y-5">
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Revenue', value: `$${analytics.summary.totalRevenue.toFixed(0)}`, sub: 'green fees', color: 'text-green-700' },
                    { label: 'Bookings', value: analytics.summary.totalBookings, sub: 'confirmed', color: 'text-blue-700' },
                    { label: 'Players', value: analytics.summary.totalPlayers, sub: 'total rounds', color: 'text-purple-700' },
                    { label: 'Utilization', value: `${analytics.summary.utilization}%`, sub: 'slots filled', color: 'text-orange-600' },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4">
                      <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                      <div className="text-xs text-gray-400">{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Revenue chart */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wide">Daily Revenue</h3>
                  <div className="flex items-end gap-0.5 h-24">
                    {analytics.revenueByDay.map(d => {
                      const max = Math.max(...analytics.revenueByDay.map(x => x.revenue), 1);
                      const pct = (d.revenue / max) * 100;
                      return (
                        <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                            ${d.revenue.toFixed(0)}
                          </div>
                          <div className="w-full rounded-t transition-all"
                            style={{ height: `${Math.max(pct, 2)}%`, background: pct > 0 ? '#1b4332' : '#e5e7eb' }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{analytics.revenueByDay[0]?.date}</span>
                    <span>{analytics.revenueByDay[analytics.revenueByDay.length - 1]?.date}</span>
                  </div>
                </div>

                {/* Utilization by day of week */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 mb-4 text-sm uppercase tracking-wide">Utilization by Day</h3>
                  <div className="space-y-2">
                    {analytics.utilizationByDow.map(d => (
                      <div key={d.dow} className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 w-8">{d.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-3">
                          <div className="h-3 rounded-full transition-all"
                            style={{ width: `${d.pct}%`, background: d.pct > 70 ? '#166534' : d.pct > 40 ? '#1b4332' : '#86efac' }} />
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

        {activeTab === 'teesheet' && (<>
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Slots', value: totalSlots, icon: <Users className="w-4 h-4" />, color: 'text-blue-600' },
            { label: 'Booked', value: bookedSlots, icon: <Calendar className="w-4 h-4" />, color: 'text-green-600' },
            { label: 'Revenue', value: `$${revenue.toFixed(0)}`, icon: <DollarSign className="w-4 h-4" />, color: 'text-emerald-600' },
            { label: 'Blocked', value: blocked, icon: <Ban className="w-4 h-4" />, color: 'text-gray-500' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${s.color}`}>
                {s.icon} {s.label}
              </div>
              <div className="text-xl font-black text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Date strip */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4 p-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setDateOffset(o => Math.max(0, o - 7))}
              disabled={dateOffset === 0}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className="flex gap-1.5 flex-1 overflow-x-auto">
              {dates.map(d => (
                <button key={d} onClick={() => setSelectedDate(d)}
                  className={`flex-1 min-w-[70px] py-2 px-1 rounded-lg text-center transition-colors ${
                    selectedDate === d
                      ? 'bg-[#1b4332] text-white'
                      : 'hover:bg-gray-50 text-gray-600'
                  }`}>
                  <div className="text-xs font-medium">{new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-sm font-bold">{new Date(d + 'T12:00:00').getDate()}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setDateOffset(o => o + 7)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Tee sheet header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-black text-gray-900">{fmtDate(selectedDate)}</h2>
            <p className="text-xs text-gray-400">
              {teeTimes.filter(t => t.status !== 'blocked').length} tee times ·{' '}
              {teeTimes.filter(t => (t.playersBooked ?? 0) > 0).length} booked
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => load(selectedDate)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-xs bg-[#1b4332] text-white px-3 py-1.5 rounded-lg hover:bg-[#2d6a4f] transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Time
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-3 mb-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300 inline-block" /> Open</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-100 border border-yellow-300 inline-block" /> Filling up</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300 inline-block" /> Full</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-100 border border-gray-300 inline-block" /> Blocked</span>
        </div>

        {/* Tee time grid */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <RefreshCw className="w-6 h-6 text-gray-300 animate-spin mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Loading tee sheet...</p>
          </div>
        ) : teeTimes.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Calendar className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No tee times for this day</p>
            <p className="text-gray-400 text-sm mt-1">Check your schedule settings or add times manually</p>
            <button onClick={() => router.push('/dashboard/schedule')}
              className="mt-4 text-sm text-green-600 underline">Go to Schedule Setup</button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-0 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <div className="col-span-2">Time</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Players</div>
              <div className="col-span-2">Green Fee</div>
              <div className="col-span-2">Cart</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-gray-50">
              {teeTimes.map(tt => (
                <div key={tt.id}>
                  <div
                    onClick={() => tt.bookings && tt.bookings.length > 0 && setExpandedId(expandedId === tt.id ? null : tt.id)}
                    className={`grid grid-cols-12 gap-0 px-4 py-3 border-l-4 transition-colors ${statusColor(tt)} ${tt.bookings && tt.bookings.length > 0 ? 'cursor-pointer hover:brightness-95' : ''}`}>
                    <div className="col-span-2 font-bold text-sm text-gray-900">{fmtTime(tt.time)}</div>
                    <div className="col-span-2 flex items-center">{statusBadge(tt)}</div>
                    <div className="col-span-2 text-sm text-gray-600">
                      {tt.status === 'blocked' ? '—' : `${tt.playersBooked ?? 0} / ${tt.playersAvailable}`}
                    </div>
                    <div className="col-span-2 text-sm text-gray-600">${tt.greenFee}</div>
                    <div className="col-span-2 text-sm text-gray-600">{tt.cartFee > 0 ? `$${tt.cartFee}` : 'Incl.'}</div>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      {tt.bookings && tt.bookings.length > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          {tt.bookings.length} booking{tt.bookings.length > 1 ? 's' : ''}
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); toggleBlock(tt); }}
                        title={tt.status === 'blocked' ? 'Unblock' : 'Block this time'}
                        className={`p-1.5 rounded-lg transition-colors ${tt.status === 'blocked' ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}>
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded bookings */}
                  {expandedId === tt.id && tt.bookings && tt.bookings.length > 0 && (
                    <div className="bg-blue-50 border-t border-blue-100 px-6 py-3 space-y-2">
                      {tt.bookings.map(b => (
                        <div key={b.id} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-semibold text-gray-900">{b.golferName}</span>
                            <span className="text-gray-500 ml-2">{b.golferEmail}</span>
                          </div>
                          <span className="text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded text-xs font-medium">
                            {b.players} player{b.players > 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}
      </div>

      {/* Add tee time modal */}
      {showAddModal && (
        <AddTeeTimeModal date={selectedDate} onClose={() => setShowAddModal(false)} onSaved={() => { setShowAddModal(false); load(selectedDate); }} />
      )}
    </div>
  );
}

function AddTeeTimeModal({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ time: '08:00', greenFee: '65', cartFee: '18', players: '4', walking: true });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/operator/tee-times', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date, time: form.time, greenFee: Number(form.greenFee),
        cartFee: Number(form.cartFee), playersAvailable: Number(form.players),
        walkingAllowed: form.walking, holes: 18,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-black text-gray-900 mb-4">Add Tee Time</h3>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Time</label>
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Green $</label>
              <input type="number" value={form.greenFee} onChange={e => set('greenFee', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Cart $</label>
              <input type="number" value={form.cartFee} onChange={e => set('cartFee', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Players</label>
              <select value={form.players} onChange={e => set('players', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500">
                {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="walk" checked={form.walking} onChange={e => set('walking', e.target.checked)} className="w-4 h-4 text-green-600 rounded" />
            <label htmlFor="walk" className="text-sm text-gray-600">Walking allowed</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#1b4332] text-white rounded-xl text-sm font-bold hover:bg-[#2d6a4f] disabled:opacity-50">
              {saving ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
