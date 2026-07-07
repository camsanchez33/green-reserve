'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Star, Power, Globe, Trash2, Mail, Phone,
  Calendar, Ban, Plus, X, RefreshCw, Search, MessageSquare, Send,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

type TabName = 'overview' | 'transactions' | 'teesheet' | 'schedule' | 'members' | 'staff' | 'messages' | 'contact' | 'setup';

const TAB_LABELS: Record<TabName, string> = {
  overview: 'Overview', transactions: 'Transactions', teesheet: 'Tee Sheet',
  schedule: 'Schedule', members: 'Members', staff: 'Staff',
  messages: 'Messages', contact: 'Contact', setup: 'Setup',
};
const ALL_TABS: TabName[] = ['overview', 'transactions', 'teesheet', 'schedule', 'members', 'staff', 'messages', 'contact', 'setup'];

const TX_STATUS: Record<string, { dot: string; label: string }> = {
  card_saved: { dot: 'neutral', label: 'Card saved' },
  manual: { dot: 'neutral', label: 'Manual' },
  completed: { dot: 'ok', label: 'Completed' },
  fee_charged: { dot: 'bad', label: 'Fee charged' },
  cancelled: { dot: 'bad', label: 'Cancelled' },
  paid: { dot: 'ok', label: 'Paid' },
};

interface CourseDetail {
  course: {
    id: string; name: string; slug: string; city: string; state: string; type: string;
    active: boolean; featured: boolean; stripeAccountActive: boolean;
    cancellationHours: number; hasMemberPricing: boolean; hasResidentPricing: boolean;
    walkingAllowed: string; cartRequired: boolean; hasCaddies: boolean;
    residentCounty: string; residentState: string;
    operator: { id: string; name: string; email: string; phone?: string; emailVerified: boolean; onboardingStep: number } | null;
  };
  staff: { id: string; name: string; email: string; role: string; active: boolean }[];
  recentBookings: {
    id: string; golferName: string; golferEmail: string; players: number;
    totalAmount: number; createdAt: string;
    teeTime: { date: string; time: string };
  }[];
  totalBookings: number;
  revenue30d: { gross: number; platform: number; greenFees: number };
}

interface TeeSlot {
  id: string; time: string; holes: number; playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; status: string; tierName: string;
  bookings: {
    id: string; golferName: string; golferEmail: string; golferPhone: string;
    players: number; totalAmount: number; paymentStatus: string;
  }[];
}

interface TxRow {
  id: string; type: 'booking' | 'membership_payment';
  golferName: string; golferEmail: string;
  amount: number; platformFee: number;
  status: string; date: string; detail: string;
}

interface TierRow {
  id: string; name: string; annualFee: number; active: boolean; memberCount: number;
}

interface MemberRow {
  id: string;
  golfer: { firstName: string; lastName: string; email: string } | null;
  inviteName: string; inviteEmail: string;
  tierName: string | null; status: string; paymentStatus: string;
  expiresAt: string | null; createdAt: string;
}

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtMoney = (n: number) =>
  '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtTime = (t: string) => {
  const [h, m] = t.split(':');
  const hr = Number(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
};

export default function CourseDetailPage() {
  const { id: courseId } = useParams() as { id: string };
  const router = useRouter();

  const [adminReady, setAdminReady] = useState(false);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabName>('overview');

  // Setup / policy form
  const [setupForm, setSetupForm] = useState<Record<string, unknown>>({});
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');

  // Schedules (Schedule tab)
  const [schedules, setSchedules] = useState<{
    id: string; daysOfWeek: number[]; startTime: string; endTime: string;
    intervalMinutes: number; greenFeeWeekday: number; greenFeeWeekend: number;
    memberRateWeekday: number | null; memberRateWeekend: number | null;
    cartFee: number; walkingAllowed: boolean;
  }[]>([]);
  const [newSchedule, setNewSchedule] = useState({
    daysOfWeek: [] as number[], startTime: '06:00', endTime: '18:00',
    intervalMinutes: 8, greenFeeWeekday: 65, greenFeeWeekend: 85,
    memberRateWeekday: '', memberRateWeekend: '', cartFee: 18, walkingAllowed: true,
  });
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedMsg, setSchedMsg] = useState('');

  // Tee sheet
  const [tsDate, setTsDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [tsSlots, setTsSlots] = useState<TeeSlot[]>([]);
  const [tsLoading, setTsLoading] = useState(false);
  const [manualSlot, setManualSlot] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ name: '', email: '', phone: '', players: 1 });

  // Transactions tab
  const [txItems, setTxItems] = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txPages, setTxPages] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txSearch, setTxSearch] = useState('');

  // Members tab
  const [membersData, setMembersData] = useState<{ tiers: TierRow[]; members: MemberRow[] } | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  // Staff tab
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState('');

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadSchedules = useCallback(async () => {
    const r = await fetch(`/api/admin/schedule?courseId=${courseId}`, { headers: H() });
    if (r.ok) setSchedules(await r.json());
  }, [courseId, H]);

  const loadTeeSheet = useCallback(async (date: string) => {
    setTsLoading(true); setTsSlots([]);
    const r = await fetch(`/api/admin/tee-sheet?courseId=${courseId}&date=${date}`, { headers: H() });
    if (r.ok) setTsSlots(await r.json());
    setTsLoading(false);
  }, [courseId, H]);

  const loadTransactions = useCallback(async (p: number, f: string, t: string, s: string) => {
    setTxLoading(true);
    const params = new URLSearchParams({ courseId, page: String(p) });
    if (f) params.set('from', f);
    if (t) params.set('to', t);
    if (s) params.set('search', s);
    const r = await fetch(`/api/admin/transactions?${params}`, { headers: H() });
    if (r.ok) {
      const d = await r.json();
      setTxItems(d.items);
      setTxPage(d.page);
      setTxPages(d.pages);
      setTxTotal(d.total);
    }
    setTxLoading(false);
  }, [courseId, H]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    const r = await fetch(`/api/admin/course-members?courseId=${courseId}`, { headers: H() });
    if (r.ok) setMembersData(await r.json());
    setMembersLoading(false);
  }, [courseId, H]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/course-detail?courseId=${courseId}`, { headers: H() });
    if (r.ok) {
      const d = await r.json();
      setDetail(d);
      setSetupForm(d.course);
    } else {
      router.push('/admin/courses');
    }
    setLoading(false);
  }, [courseId, H, router]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadDetail();
  }, [adminReady, loadDetail]);

  async function toggleActive(active: boolean) {
    await fetch('/api/admin/course-detail', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, active }),
    });
    setDetail(d => d ? { ...d, course: { ...d.course, active } } : d);
  }

  async function toggleFeatured(featured: boolean) {
    await fetch('/api/admin/course-detail', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, featured }),
    });
    setDetail(d => d ? { ...d, course: { ...d.course, featured } } : d);
  }

  async function deleteCourse() {
    if (!detail) return;
    if (!confirm(`Permanently delete "${detail.course.name}" and ALL its data? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/courses?id=${courseId}`, { method: 'DELETE', headers: H() });
    if (r.ok) router.push('/admin/courses');
    else { const d = await r.json(); alert(`Delete failed: ${d.error}`); }
  }

  async function saveSetup() {
    setSetupSaving(true); setSetupMsg('');
    const r = await fetch('/api/admin/course-settings', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, ...setupForm }),
    });
    setSetupSaving(false);
    setSetupMsg(r.ok ? 'saved' : 'error');
  }

  function toggleDay(d: number) {
    setNewSchedule(s => ({
      ...s,
      daysOfWeek: s.daysOfWeek.includes(d)
        ? s.daysOfWeek.filter(x => x !== d)
        : [...s.daysOfWeek, d],
    }));
  }

  async function addSchedule() {
    setSchedSaving(true); setSchedMsg('');
    const r = await fetch('/api/admin/schedule', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId, ...newSchedule }),
    });
    setSchedSaving(false);
    if (r.ok) { setSchedMsg('schedule_saved'); loadSchedules(); }
    else setSchedMsg('error');
  }

  async function deleteSchedule(id: string) {
    await fetch('/api/admin/schedule', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) });
    loadSchedules();
  }

  async function blockSlot(teeTimeId: string, block: boolean) {
    await fetch('/api/admin/tee-sheet', {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({ action: block ? 'block' : 'unblock', teeTimeId }),
    });
    loadTeeSheet(tsDate);
  }

  async function cancelBooking(bookingId: string) {
    if (!confirm('Cancel this booking?')) return;
    await fetch('/api/admin/tee-sheet', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ action: 'cancel_booking', bookingId }),
    });
    loadTeeSheet(tsDate);
  }

  async function addManualBooking() {
    if (!manualSlot) return;
    const r = await fetch('/api/admin/tee-sheet', {
      method: 'POST', headers: H(), body: JSON.stringify({ teeTimeId: manualSlot, ...manualForm }),
    });
    if (r.ok) {
      setManualSlot(null);
      setManualForm({ name: '', email: '', phone: '', players: 1 });
      loadTeeSheet(tsDate);
    } else {
      const d = await r.json();
      alert(d.error);
    }
  }

  async function resendSetup(staffId: string, staffName: string) {
    setResendingId(staffId); setResendMsg('');
    const r = await fetch('/api/admin/resend-staff-setup', {
      method: 'POST', headers: H(), body: JSON.stringify({ staffId }),
    });
    setResendingId(null);
    setResendMsg(r.ok ? `Login email sent to ${staffName}` : 'Error sending email');
  }

  const c = detail?.course;

  if (!adminReady || loading) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="ml-56 flex-1 flex items-center justify-center">
          <div className="text-ink-muted text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (!detail || !c) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="ml-56 flex-1 flex items-center justify-center flex-col gap-3">
          <div className="text-ink-muted text-sm">Course not found</div>
          <button onClick={() => router.push('/admin/courses')} className="text-pine text-sm hover:underline">Back to list</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="ml-56 flex-1 flex flex-col min-h-screen">

        {/* Sticky page header */}
        <div className="bg-white border-b border-line px-8 py-5 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin/courses')}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper text-ink-muted hover:text-ink transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-0.5">
                <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink truncate">{c.name}</h1>
                {c.featured && <Star className="w-4 h-4 text-warn fill-warn shrink-0" />}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <StatusDot status={c.active ? 'ok' : 'neutral'} label={c.active ? 'Live' : 'Offline'} />
                <span className="text-xs text-ink-muted">{c.city}, {c.state}</span>
                <span className="text-xs text-ink-muted capitalize">{c.type}</span>
                {c.stripeAccountActive && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-pine/5 text-pine border border-pine/20">Stripe</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleFeatured(!c.featured)}
                className={'w-9 h-9 flex items-center justify-center rounded-md transition-colors ' + (c.featured ? 'text-warn bg-warn/10' : 'text-ink-muted hover:text-warn hover:bg-warn/5')}
                title={c.featured ? 'Unfeature' : 'Feature'}
              >
                <Star className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleActive(!c.active)}
                className={'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ' + (c.active ? 'bg-bad/5 text-bad border-bad/20 hover:bg-bad/10' : 'bg-ok/5 text-ok border-ok/20 hover:bg-ok/10')}
              >
                <Power className="w-3.5 h-3.5" />
                {c.active ? 'Take offline' : 'Set live'}
              </button>
              <a
                href={'/courses/' + c.slug}
                target="_blank"
                className="w-9 h-9 flex items-center justify-center rounded-md text-ink-muted hover:text-pine hover:bg-pine/5 transition-colors"
                title="View public page"
              >
                <Globe className="w-4 h-4" />
              </a>
              <button
                onClick={loadDetail}
                className="w-9 h-9 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={deleteCourse}
                className="w-9 h-9 flex items-center justify-center rounded-md text-ink-muted hover:text-bad hover:bg-bad/5 transition-colors"
                title="Delete course"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-0.5 mt-4 bg-paper border border-line rounded-lg p-1 w-fit max-w-full overflow-x-auto">
            {ALL_TABS.map(t => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === 'teesheet') loadTeeSheet(tsDate);
                  if (t === 'schedule') loadSchedules();
                  if (t === 'transactions') loadTransactions(1, '', '', '');
                  if (t === 'members') loadMembers();
                }}
                className={'px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap ' + (tab === t ? 'bg-white text-ink border border-line shadow-sm' : 'text-ink-muted hover:text-ink')}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-8 py-7 flex-1">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6 max-w-5xl">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Gross (30d)', value: fmtMoney(detail.revenue30d.gross), color: 'text-ink' },
                  { label: 'GR Fees (30d)', value: fmtMoney(detail.revenue30d.platform), color: 'text-ok' },
                  { label: 'All-time Bookings', value: String(detail.totalBookings), color: 'text-ink' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white border border-line rounded-lg p-5">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">{label}</div>
                    <div className={'text-[28px] font-serif font-medium leading-none ' + color}>{value}</div>
                  </div>
                ))}
              </div>

              {c.operator && (
                <div className="bg-white border border-line rounded-lg p-5">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Operator</div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-md bg-pine/10 flex items-center justify-center text-pine font-medium text-base shrink-0">
                      {c.operator.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink">{c.operator.name}</div>
                      <div className="text-sm text-ink-muted">{c.operator.email}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {c.operator.emailVerified
                        ? <StatusDot status="ok" label="Verified" />
                        : <StatusDot status="bad" label="Unverified" />}
                      {c.stripeAccountActive
                        ? <span className="text-[11px] px-2 py-0.5 rounded bg-pine/5 text-pine border border-pine/20">Stripe</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded bg-warn/5 text-warn border border-warn/20">No Stripe</span>}
                      <span className="text-[11px] px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">
                        Step {c.operator.onboardingStep}/3
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {detail.recentBookings.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Recent Bookings</div>
                  <div className="bg-white border border-line rounded-lg divide-y divide-line-soft">
                    {detail.recentBookings.map(b => (
                      <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-ink text-sm">{b.golferName}</div>
                          <div className="text-xs text-ink-muted">
                            {fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.players} player{b.players !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-ok">{fmtMoney(b.totalAmount / 100)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.recentBookings.length === 0 && detail.totalBookings === 0 && (
                <div className="text-center py-12 text-ink-muted text-sm bg-white border border-line rounded-lg">
                  No bookings yet for this course
                </div>
              )}
            </div>
          )}

          {/* TRANSACTIONS */}
          {tab === 'transactions' && (
            <div className="max-w-5xl">
              <div className="bg-white border border-line rounded-lg p-4 mb-5">
                <div className="flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-52">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                    <input
                      placeholder="Search golfer name or email"
                      value={txSearch}
                      onChange={e => setTxSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') loadTransactions(1, txFrom, txTo, txSearch); }}
                      className={iCls + ' pl-9'}
                    />
                  </div>
                  <input type="date" value={txFrom} onChange={e => setTxFrom(e.target.value)} className={iCls + ' flex-1 min-w-36'} />
                  <input type="date" value={txTo} onChange={e => setTxTo(e.target.value)} className={iCls + ' flex-1 min-w-36'} />
                  <button
                    onClick={() => loadTransactions(1, txFrom, txTo, txSearch)}
                    className="bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors"
                  >
                    Load
                  </button>
                </div>
              </div>

              {txLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading...</div>}

              {!txLoading && txItems.length === 0 && (
                <div className="text-center text-ink-muted py-12 text-sm bg-white border border-line rounded-lg">
                  No transactions found
                </div>
              )}

              {!txLoading && txItems.length > 0 && (
                <div className="bg-white border border-line rounded-lg overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-line-soft bg-paper/50 grid grid-cols-[1fr_1fr_90px_80px_100px_90px] gap-3 text-[10px] uppercase tracking-[0.06em] text-ink-muted">
                    <span>Golfer</span>
                    <span>Detail</span>
                    <span>Amount</span>
                    <span>GR Fee</span>
                    <span>Status</span>
                    <span>Date</span>
                  </div>
                  <div className="divide-y divide-line-soft">
                    {txItems.map(tx => {
                      const st = TX_STATUS[tx.status] ?? { dot: 'neutral', label: tx.status };
                      return (
                        <div key={tx.id} className="px-5 py-3 grid grid-cols-[1fr_1fr_90px_80px_100px_90px] gap-3 items-center hover:bg-paper/50 transition-colors">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate">{tx.golferName}</div>
                            <div className="text-xs text-ink-muted truncate">{tx.golferEmail}</div>
                          </div>
                          <div className="text-xs text-ink-soft truncate">{tx.detail}</div>
                          <div className="text-sm font-medium text-ink tabular-nums">{fmtMoney(tx.amount)}</div>
                          <div className="text-xs text-ok tabular-nums">{tx.platformFee > 0 ? fmtMoney(tx.platformFee) : '—'}</div>
                          <div><StatusDot status={st.dot} label={st.label} /></div>
                          <div className="text-xs text-ink-muted tabular-nums">{fmtDate(tx.date)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!txLoading && txPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-ink-muted">Page {txPage} of {txPages} · {txTotal} total</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { const p = txPage - 1; setTxPage(p); loadTransactions(p, txFrom, txTo, txSearch); }}
                      disabled={txPage <= 1}
                      className="text-sm text-ink-soft hover:text-ink disabled:opacity-30 px-3 py-1.5 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors"
                    >Prev</button>
                    <button
                      onClick={() => { const p = txPage + 1; setTxPage(p); loadTransactions(p, txFrom, txTo, txSearch); }}
                      disabled={txPage >= txPages}
                      className="text-sm text-ink-soft hover:text-ink disabled:opacity-30 px-3 py-1.5 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors"
                    >Next</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TEE SHEET */}
          {tab === 'teesheet' && (
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-5">
                <Calendar className="w-4 h-4 text-ink-muted" />
                <input
                  type="date"
                  value={tsDate}
                  onChange={e => { setTsDate(e.target.value); loadTeeSheet(e.target.value); }}
                  className="bg-white border border-line text-ink rounded-md px-3 py-1.5 text-sm outline-none focus:border-pine/40"
                />
                {!tsLoading && (
                  <span className="text-xs text-ink-muted">
                    {tsSlots.length} slots · {tsSlots.filter(s => s.bookings.length > 0).length} booked
                  </span>
                )}
              </div>

              {tsLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading tee sheet...</div>}
              {!tsLoading && tsSlots.length === 0 && (
                <div className="text-center text-ink-muted py-12 text-sm bg-white border border-line rounded-lg">
                  No tee times for this date
                </div>
              )}

              <div className="space-y-2">
                {tsSlots.map(slot => (
                  <div
                    key={slot.id}
                    className={'rounded-md border overflow-hidden ' + (slot.status === 'blocked' ? 'border-bad/20 bg-bad/5' : slot.bookings.length > 0 ? 'border-ok/20 bg-ok/5' : 'border-line bg-white')}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span className="font-mono font-medium text-ink text-sm w-14 shrink-0">{slot.time}</span>
                      <span className="text-xs text-ink-muted">{slot.holes}h · ${slot.greenFee}</span>
                      <span className={'text-xs px-2 py-0.5 rounded font-medium ' + (slot.status === 'blocked' ? 'bg-bad/10 text-bad' : slot.bookings.length > 0 ? 'bg-ok/10 text-ok' : 'bg-paper text-ink-muted border border-line')}>
                        {slot.status === 'blocked' ? 'Blocked' : slot.bookings.length > 0 ? `${slot.bookings.length} booked` : `${slot.playersAvailable} open`}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => setManualSlot(slot.id)}
                          className="text-xs px-2.5 py-1 bg-pine hover:bg-pine-hover text-white rounded-md flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" />Add
                        </button>
                        <button
                          onClick={() => blockSlot(slot.id, slot.status !== 'blocked')}
                          className={'text-xs px-2.5 py-1 rounded-md flex items-center gap-1 border transition-colors ' + (slot.status === 'blocked' ? 'border-ok/20 text-ok bg-ok/5 hover:bg-ok/10' : 'border-bad/20 text-bad bg-bad/5 hover:bg-bad/10')}
                        >
                          <Ban className="w-3 h-3" />{slot.status === 'blocked' ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    </div>
                    {slot.bookings.length > 0 && (
                      <div className="border-t border-line/50 px-4 py-2 space-y-2">
                        {slot.bookings.map(b => (
                          <div key={b.id} className="flex items-center justify-between py-0.5">
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-xs shrink-0">{b.golferName[0]}</div>
                              <div>
                                <div className="font-medium text-ink text-xs">
                                  {b.golferName} <span className="text-ink-muted font-normal">· {b.players}p</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <a href={'mailto:' + b.golferEmail} className="text-xs text-pine hover:underline">{b.golferEmail}</a>
                                  {b.golferPhone && <span className="text-xs text-ink-muted">{b.golferPhone}</span>}
                                  {b.paymentStatus === 'manual' && (
                                    <span className="text-xs px-1.5 py-0.5 bg-warn/10 text-warn rounded border border-warn/20">Manual</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-medium text-ok">{fmtMoney(b.totalAmount / 100)}</span>
                              <button
                                onClick={() => cancelBooking(b.id)}
                                className="text-xs text-bad hover:text-bad/80 px-2 py-0.5 border border-bad/20 rounded-md hover:bg-bad/5 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCHEDULE */}
          {tab === 'schedule' && (
            <div className="max-w-2xl space-y-5">
              {schedMsg && (
                <div className={'text-sm font-medium px-4 py-2.5 rounded-md border ' + (schedMsg === 'error' ? 'bg-bad/5 text-bad border-bad/20' : 'bg-ok/5 text-ok border-ok/20')}>
                  {schedMsg === 'error' ? 'Error saving' : schedMsg === 'schedule_saved' ? 'Schedule saved — tee times generated for next 8 days' : 'Saved'}
                </div>
              )}
              <div className="bg-white border border-line rounded-lg p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Tee Time Schedules</div>
                {schedules.length > 0 ? (
                  <div className="space-y-2">
                    {schedules.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-paper border border-line rounded-md px-4 py-3">
                        <div>
                          <div className="font-medium text-ink text-sm">
                            {s.daysOfWeek.length === 0 ? 'Every day' : s.daysOfWeek.map(d => DAYS[d]).join(', ')} · {s.startTime}–{s.endTime} every {s.intervalMinutes}min
                          </div>
                          <div className="text-ink-muted text-xs mt-0.5">
                            WD ${s.greenFeeWeekday} / WE ${s.greenFeeWeekend} · Cart ${s.cartFee}
                            {s.memberRateWeekday != null && ` · Member $${s.memberRateWeekday}`}
                            {s.walkingAllowed ? ' · Walking' : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteSchedule(s.id)}
                          className="text-ink-muted hover:text-bad transition-colors p-1.5 rounded-md hover:bg-bad/5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted bg-paper rounded-md p-4 border border-line">
                    No schedule yet — add one below to make this course bookable.
                  </p>
                )}

                <div className="border-t border-line pt-4 space-y-3">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Add Schedule</div>
                  <div>
                    <label className="text-xs text-ink-muted block mb-1.5">Days <span className="text-ink-faint">(none = every day)</span></label>
                    <div className="flex gap-1.5">
                      {DAYS.map((day, i) => (
                        <button
                          key={day}
                          onClick={() => toggleDay(i)}
                          className={'flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ' + (newSchedule.daysOfWeek.includes(i) ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-muted border-line hover:border-pine/40 hover:text-ink')}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-ink-muted block mb-1">First tee</label>
                      <input type="time" value={newSchedule.startTime} onChange={e => setNewSchedule(s => ({ ...s, startTime: e.target.value }))} className={iCls} />
                    </div>
                    <div>
                      <label className="text-xs text-ink-muted block mb-1">Last tee</label>
                      <input type="time" value={newSchedule.endTime} onChange={e => setNewSchedule(s => ({ ...s, endTime: e.target.value }))} className={iCls} />
                    </div>
                    <div>
                      <label className="text-xs text-ink-muted block mb-1">Interval</label>
                      <select value={newSchedule.intervalMinutes} onChange={e => setNewSchedule(s => ({ ...s, intervalMinutes: Number(e.target.value) }))} className={iCls}>
                        {[7, 8, 9, 10, 12, 15].map(v => <option key={v} value={v}>{v} min</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-ink-muted block mb-1">WD Green fee $</label>
                      <input type="number" value={newSchedule.greenFeeWeekday} onChange={e => setNewSchedule(s => ({ ...s, greenFeeWeekday: Number(e.target.value) }))} className={iCls} />
                    </div>
                    <div>
                      <label className="text-xs text-ink-muted block mb-1">WE Green fee $</label>
                      <input type="number" value={newSchedule.greenFeeWeekend} onChange={e => setNewSchedule(s => ({ ...s, greenFeeWeekend: Number(e.target.value) }))} className={iCls} />
                    </div>
                    <div>
                      <label className="text-xs text-ink-muted block mb-1">Cart fee $</label>
                      <input type="number" value={newSchedule.cartFee} onChange={e => setNewSchedule(s => ({ ...s, cartFee: Number(e.target.value) }))} className={iCls} />
                    </div>
                  </div>
                  {!!setupForm.hasMemberPricing && (
                    <div className="grid grid-cols-2 gap-3 bg-pine/5 border border-pine/20 rounded-md p-3">
                      <div>
                        <label className="text-xs font-medium text-pine block mb-1">Member rate WD $</label>
                        <input type="number" value={newSchedule.memberRateWeekday} onChange={e => setNewSchedule(s => ({ ...s, memberRateWeekday: e.target.value }))} className={iCls} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-pine block mb-1">Member rate WE $</label>
                        <input type="number" value={newSchedule.memberRateWeekend} onChange={e => setNewSchedule(s => ({ ...s, memberRateWeekend: e.target.value }))} className={iCls} />
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newSchedule.walkingAllowed}
                      onChange={e => setNewSchedule(s => ({ ...s, walkingAllowed: e.target.checked }))}
                      className="w-4 h-4 accent-pine rounded"
                    />
                    Walking allowed
                  </label>
                  <button
                    onClick={addSchedule}
                    disabled={schedSaving}
                    className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white py-2.5 rounded-md text-[12.5px] font-medium transition-colors"
                  >
                    {schedSaving ? 'Saving...' : 'Save Schedule & Generate Tee Times'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MEMBERS */}
          {tab === 'members' && (
            <div className="max-w-4xl">
              {membersLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading...</div>}
              {!membersLoading && !membersData && (
                <div className="text-center text-ink-muted py-12 text-sm bg-white border border-line rounded-lg">
                  Click Load above to view members
                </div>
              )}
              {!membersLoading && membersData && (
                <div className="space-y-6">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Membership Tiers</div>
                    {membersData.tiers.length === 0 ? (
                      <div className="text-sm text-ink-muted bg-white border border-line rounded-lg p-6 text-center">No tiers set up</div>
                    ) : (
                      <div className="bg-white border border-line rounded-lg divide-y divide-line-soft">
                        {membersData.tiers.map(t => (
                          <div key={t.id} className="flex items-center gap-4 px-5 py-3.5">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-ink text-sm">{t.name}</div>
                              <div className="text-xs text-ink-muted">{t.memberCount} active member{t.memberCount !== 1 ? 's' : ''} · ${t.annualFee}/yr</div>
                            </div>
                            <StatusDot status={t.active ? 'ok' : 'neutral'} label={t.active ? 'Active' : 'Inactive'} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">
                      Members — {membersData.members.length} total
                    </div>
                    {membersData.members.length === 0 ? (
                      <div className="text-sm text-ink-muted bg-white border border-line rounded-lg p-6 text-center">No members</div>
                    ) : (
                      <div className="bg-white border border-line rounded-lg divide-y divide-line-soft">
                        {membersData.members.map(m => {
                          const name = m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}` : (m.inviteName || '—');
                          const email = m.golfer?.email || m.inviteEmail || '';
                          const initial = name[0] || '?';
                          return (
                            <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                              <div className="w-8 h-8 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-sm shrink-0">
                                {initial}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-ink text-sm">{name}</div>
                                <div className="text-xs text-ink-muted truncate">{email}{m.tierName ? ` · ${m.tierName}` : ''}</div>
                              </div>
                              <div className="flex flex-col items-end gap-0.5">
                                <StatusDot status={m.status === 'active' ? 'ok' : 'neutral'} label={m.status} />
                                <span className="text-[10px] text-ink-faint capitalize">{m.paymentStatus.replace('_', ' ')}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAFF */}
          {tab === 'staff' && (
            <div className="max-w-2xl space-y-5">
              {c.operator && (
                <div className="bg-white border border-line rounded-lg p-5">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Operator Account</div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-md bg-pine/10 flex items-center justify-center text-pine font-medium text-base shrink-0">
                      {c.operator.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink">{c.operator.name}</div>
                      <div className="text-sm text-ink-muted">{c.operator.email}</div>
                      <div className="text-xs text-ink-faint mt-0.5">Onboarding {c.operator.onboardingStep}/3</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {c.operator.emailVerified
                        ? <StatusDot status="ok" label="Verified" />
                        : <StatusDot status="bad" label="Unverified" />}
                      {c.stripeAccountActive
                        ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-pine/5 text-pine border border-pine/20">Stripe</span>
                        : <span className="text-[11px] px-1.5 py-0.5 rounded bg-warn/5 text-warn border border-warn/20">No Stripe</span>}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-line rounded-lg">
                <div className="px-5 py-3.5 border-b border-line">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                    Staff Accounts — {detail.staff.length}
                  </div>
                </div>
                {detail.staff.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-ink-muted">No staff accounts</div>
                ) : (
                  <div className="divide-y divide-line-soft">
                    {detail.staff.map(s => (
                      <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="w-9 h-9 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-sm shrink-0">
                          {s.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-ink text-sm">{s.name}</div>
                          <div className="text-xs text-ink-muted">{s.email} · <span className="capitalize">{s.role}</span></div>
                        </div>
                        <StatusDot status={s.active ? 'ok' : 'neutral'} label={s.active ? 'Active' : 'Inactive'} />
                        <button
                          onClick={() => resendSetup(s.id, s.name)}
                          disabled={resendingId === s.id}
                          className="flex items-center gap-1.5 text-[12px] font-medium text-pine hover:text-pine-hover px-3 py-1.5 rounded-md border border-pine/20 hover:bg-pine/5 transition-colors disabled:opacity-50 shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {resendingId === s.id ? 'Sending...' : 'Resend login'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {resendMsg && (
                <div className={'text-sm font-medium px-4 py-2.5 rounded-md border ' + (resendMsg.startsWith('Error') ? 'bg-bad/5 text-bad border-bad/20' : 'bg-ok/5 text-ok border-ok/20')}>
                  {resendMsg}
                </div>
              )}
            </div>
          )}

          {/* MESSAGES */}
          {tab === 'messages' && (
            <div className="max-w-xl">
              <div className="bg-white border border-line rounded-lg p-10 text-center">
                <MessageSquare className="w-8 h-8 text-ink-muted mx-auto mb-3" />
                <div className="text-sm font-medium text-ink mb-1">Two-way messaging coming soon</div>
                <div className="text-xs text-ink-muted">Admin ↔ course messaging arrives with Phase 3</div>
              </div>
            </div>
          )}

          {/* CONTACT */}
          {tab === 'contact' && (
            <div className="space-y-5 max-w-2xl">
              {c.operator && (
                <div className="bg-white border border-line rounded-lg p-6">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Operator / Owner</div>
                  <div className="text-lg font-serif font-medium text-ink mb-3">{c.operator.name}</div>
                  <div className="space-y-2">
                    <a href={'mailto:' + c.operator.email} className="flex items-center gap-3 text-sm text-ink-soft hover:text-pine transition-colors">
                      <Mail className="w-4 h-4 text-ink-muted" />{c.operator.email}
                    </a>
                    {c.operator.phone && (
                      <a href={'tel:' + c.operator.phone} className="flex items-center gap-3 text-sm text-ink-soft hover:text-pine transition-colors">
                        <Phone className="w-4 h-4 text-ink-muted" />{c.operator.phone}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {c.operator.emailVerified
                      ? <StatusDot status="ok" label="Email verified" />
                      : <StatusDot status="bad" label="Not verified" />}
                    <span className="text-[11px] px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">
                      Onboarding {c.operator.onboardingStep}/3
                    </span>
                    {c.stripeAccountActive && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-pine/5 text-pine border border-pine/20">Stripe connected</span>
                    )}
                  </div>
                </div>
              )}
              <div className="bg-white border border-line rounded-lg p-6">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Course Info</div>
                <div className="space-y-2.5">
                  {([
                    ['Type', c.type],
                    ['Slug', c.slug],
                    ['City / State', c.city + ', ' + c.state],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-24 shrink-0">{label}</span>
                      <span className="text-ink font-medium">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {detail.staff.length > 0 && (
                <div className="bg-white border border-line rounded-lg p-6">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Staff Contacts</div>
                  <div className="space-y-3">
                    {detail.staff.map(s => (
                      <div key={s.id} className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-sm shrink-0">{s.name[0]}</div>
                        <div>
                          <div className="text-sm font-medium text-ink">
                            {s.name} <span className="text-xs text-ink-muted font-normal">· {s.role}</span>
                          </div>
                          <a href={'mailto:' + s.email} className="text-xs text-pine hover:underline">{s.email}</a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SETUP */}
          {tab === 'setup' && (
            <div className="space-y-5 max-w-2xl">
              <div className="bg-warn/5 border border-warn/20 rounded-md px-4 py-3 text-xs text-warn">
                You&apos;re editing live settings directly. The operator can still adjust their own dashboard.
              </div>
              {setupMsg && (
                <div className={'text-sm font-medium px-4 py-2.5 rounded-md border ' + (setupMsg === 'error' ? 'bg-bad/5 text-bad border-bad/20' : 'bg-ok/5 text-ok border-ok/20')}>
                  {setupMsg === 'error' ? 'Error saving' : 'Settings saved'}
                </div>
              )}

              <div className="bg-white border border-line rounded-lg p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Course Policy</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Walking policy</label>
                    <select
                      value={String(setupForm.walkingAllowed ?? 'always')}
                      onChange={e => setSetupForm(f => ({ ...f, walkingAllowed: e.target.value }))}
                      className={iCls}
                    >
                      <option value="always">Always allowed</option>
                      <option value="weekdays">Weekdays only</option>
                      <option value="after12">After 12pm only</option>
                      <option value="never">Cart required</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Cancellation window (hrs)</label>
                    <input
                      type="number"
                      value={Number(setupForm.cancellationHours ?? 24)}
                      onChange={e => setSetupForm(f => ({ ...f, cancellationHours: Number(e.target.value) }))}
                      className={iCls}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {([
                    ['hasMemberPricing', 'Member pricing'],
                    ['hasResidentPricing', 'Resident pricing'],
                    ['hasCaddies', 'Caddies'],
                    ['cartRequired', 'Cart required'],
                  ] as [string, string][]).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!setupForm[k]}
                        onChange={e => setSetupForm(f => ({ ...f, [k]: e.target.checked }))}
                        className="w-4 h-4 accent-pine rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {!!setupForm.hasResidentPricing && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Resident county</label>
                      <input
                        value={String(setupForm.residentCounty ?? '')}
                        onChange={e => setSetupForm(f => ({ ...f, residentCounty: e.target.value }))}
                        className={iCls}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Resident state</label>
                      <input
                        value={String(setupForm.residentState ?? '')}
                        maxLength={2}
                        onChange={e => setSetupForm(f => ({ ...f, residentState: e.target.value }))}
                        className={iCls}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={saveSetup}
                  disabled={setupSaving}
                  className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors"
                >
                  {setupSaving ? 'Saving...' : 'Save Policy Settings'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Manual booking modal */}
      {manualSlot && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-line rounded-lg p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-serif font-medium text-ink">Add Manual Booking</h3>
              <button
                onClick={() => setManualSlot(null)}
                className="text-ink-muted hover:text-ink w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {([['Golfer Name *', 'name', 'text'], ['Email *', 'email', 'email'], ['Phone', 'phone', 'tel']] as [string, string, string][]).map(([label, field, type]) => (
                <div key={field}>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">{label}</label>
                  <input
                    type={type}
                    value={(manualForm as Record<string, unknown>)[field] as string}
                    onChange={e => setManualForm(f => ({ ...f, [field]: e.target.value }))}
                    className={iCls}
                  />
                </div>
              ))}
              <div>
                <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Players *</label>
                <select value={manualForm.players} onChange={e => setManualForm(f => ({ ...f, players: Number(e.target.value) }))} className={iCls}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setManualSlot(null)}
                className="flex-1 px-4 py-2.5 border border-line rounded-md text-[12.5px] font-medium text-ink-muted hover:text-ink hover:border-line-strong transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addManualBooking}
                className="flex-1 px-4 py-2.5 bg-pine hover:bg-pine-hover text-white rounded-md text-[12.5px] font-medium transition-colors"
              >
                Add Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
