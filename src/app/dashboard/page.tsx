'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Calendar, Users, DollarSign, Ban,
  Plus, ChevronLeft, ChevronRight, RefreshCw,
  AlertTriangle, X, Loader2, Lock, Eye, CheckCircle,
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import OperatorSidebar from '@/components/OperatorSidebar';
import { getBookingStatus } from '@/lib/booking-status';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

/* ─── Types ────────────────────────────────────────────────────────────── */
type TeeTime = {
  id: string; date: string; time: string; holes: number;
  playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; walkingAllowed: boolean;
  status: string; bookings?: Booking[];
};
type Booking = {
  id: string; golferName: string; golferEmail: string; players: number; createdAt: string;
  status: string; paymentStatus: string; totalAmount: number;
};
interface AnalyticsData {
  summary: { totalRevenue: number; totalBookings: number; totalPlayers: number; utilization: number };
  revenueByDay: { date: string; revenue: number; bookings: number }[];
  utilizationByDow: { dow: number; label: string; pct: number }[];
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */
const today  = () => new Date().toISOString().split('T')[0];
const addDays = (d: string, n: number) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; };
const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; };

function slotBorderCls(tt: TeeTime) {
  if (tt.status === 'blocked') return 'bg-paper border-line opacity-60';
  const avail = tt.playersAvailable - (tt.playersBooked ?? 0);
  if (avail === 0) return 'bg-bad/5 border-bad/20';
  if (avail <= 2)  return 'bg-warn/5 border-warn/20';
  return 'bg-white border-line';
}
function slotBadge(tt: TeeTime) {
  if (tt.status === 'blocked') return <span className="text-xs text-ink-muted">Blocked</span>;
  const booked = tt.playersBooked ?? 0;
  const avail  = tt.playersAvailable - booked;
  if (avail === 0) return <span className="text-xs font-medium text-bad">Full</span>;
  if (booked > 0)  return <span className="text-xs font-medium text-warn">{avail} left</span>;
  return <span className="text-xs font-medium text-ok">{avail} open</span>;
}

function toneText(tone: string) {
  if (tone === 'emerald') return 'text-ok';
  if (tone === 'amber') return 'text-warn';
  if (tone === 'red') return 'text-bad';
  return 'text-ink-muted';
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'teesheet' | 'analytics'>(searchParams.get('tab') === 'analytics' ? 'analytics' : 'teesheet');
  const [selectedDate, setSelectedDate] = useState(today());
  const [dateOffset, setDateOffset]     = useState(0);
  const [teeTimes, setTeeTimes]   = useState<TeeTime[]>([]);
  const [loading, setLoading]     = useState(true);
  const [courseName, setCourseName] = useState('');
  const [courseArchived, setCourseArchived] = useState(false);
  const [courseDraft, setCourseDraft] = useState(false);
  const [pageApprovalStatus, setPageApprovalStatus] = useState<'none' | 'approved' | 'changes_requested'>('none');
  const [approvingPage, setApprovingPage] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [changesText, setChangesText] = useState('');
  const [sendingChanges, setSendingChanges] = useState(false);
  const [changesError, setChangesError] = useState('');
  const [changesConfirmMsg, setChangesConfirmMsg] = useState('');
  const [showAddModal, setShowAddModal]       = useState(false);
  const [showConditions, setShowConditions]   = useState(false);
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [analytics, setAnalytics]             = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [conditions, setConditions]       = useState('');
  const [conditionsInput, setConditionsInput] = useState('');
  const [savingConditions, setSavingConditions] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [cardModalBooking, setCardModalBooking] = useState<Booking | null>(null);
  const [search, setSearch] = useState('');

  async function checkInBooking(b: Booking) {
    if (b.paymentStatus === 'no_payment_method') { setCardModalBooking(b); return; }
    if (!confirm(`Check in ${b.golferName} and charge their card $${(b.totalAmount / 100).toFixed(2)} for the round?`)) return;
    setCheckingInId(b.id);
    const res = await fetch('/api/operator/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, action: 'checkin' }) });
    const data = await res.json();
    setCheckingInId(null);
    if (!res.ok) { alert(data.error || 'Check-in failed'); return; }
    alert(data.feeRefunded
      ? `Checked in — charged $${(data.totalCharged / 100).toFixed(2)}, and refunded the $${(data.feeRefundAmount / 100).toFixed(2)} late-cancellation fee.`
      : `Checked in — charged $${(data.totalCharged / 100).toFixed(2)}.`);
    loadTimes(selectedDate);
  }

  async function checkInWithCard(b: Booking, paymentMethodId: string) {
    setCheckingInId(b.id);
    const res = await fetch('/api/operator/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, action: 'checkin', paymentMethodId }) });
    const data = await res.json();
    setCheckingInId(null);
    if (!res.ok) { return data.error || 'Check-in failed'; }
    const msg = data.feeRefunded
      ? `Checked in — charged $${(data.totalCharged / 100).toFixed(2)}, refunded $${(data.feeRefundAmount / 100).toFixed(2)} late-cancellation fee.`
      : `Checked in — charged $${(data.totalCharged / 100).toFixed(2)}.`;
    alert(msg);
    setCardModalBooking(null);
    loadTimes(selectedDate);
    return null;
  }

  const dates = Array.from({ length: 7 }, (_, i) => addDays(today(), i + dateOffset));
  const totalSlots = teeTimes.filter(t => t.status !== 'blocked').reduce((s, t) => s + t.playersAvailable, 0);
  const bookedSlots = teeTimes.reduce((s, t) => s + (t.playersBooked ?? 0), 0);
  const revenue = teeTimes.reduce((s, t) => s + ((t.playersBooked ?? 0) * (t.greenFee + (t.cartFee || 0))), 0);
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

  const loadCourseStatus = useCallback(() => {
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (c?.name) setCourseName(c.name);
      setCourseArchived(!!c?.archivedAt);
      setCourseDraft(!c?.active || c?.liveStatus !== 'live');
      setPageApprovalStatus(c?.pageApprovalStatus === 'approved' || c?.pageApprovalStatus === 'changes_requested' ? c.pageApprovalStatus : 'none');
      if (c?.conditions) { setConditions(c.conditions); setConditionsInput(c.conditions); }
    });
  }, []);

  async function approvePage() {
    setApprovingPage(true); setApproveError('');
    try {
      const res = await fetch('/api/operator/approve-page', { method: 'POST' });
      if (res.ok) { setPageApprovalStatus('approved'); }
      else { const d = await res.json().catch(() => ({})); setApproveError(d.error || 'Could not submit approval.'); }
    } catch { setApproveError('Could not submit approval — try again.'); }
    setApprovingPage(false);
  }

  async function submitChanges() {
    if (!changesText.trim()) return;
    setSendingChanges(true); setChangesError('');
    try {
      const res = await fetch('/api/operator/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: changesText.trim() }),
      });
      if (res.ok) {
        setPageApprovalStatus('changes_requested'); setShowChangesModal(false); setChangesText('');
        setChangesConfirmMsg("Got it — we'll make the changes and send you an updated preview.");
      }
      else { const d = await res.json().catch(() => ({})); setChangesError(d.error || 'Could not send.'); }
    } catch { setChangesError('Could not send — try again.'); }
    setSendingChanges(false);
  }

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.json()).then(p => {
      if (!p || !p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3)   { router.push('/dashboard/onboarding'); return; }
    });
    loadCourseStatus();
    // Admin can flip a course live while this tab sits open in the
    // background — refresh live/draft status when the operator tabs back in
    // instead of showing whatever was true at page load.
    const onFocus = () => loadCourseStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [router, loadCourseStatus]);

  useEffect(() => {
    if (tab === 'analytics' && !analytics) {
      setAnalyticsLoading(true);
      fetch('/api/operator/analytics').then(r => r.json()).then(d => { setAnalytics(d); setAnalyticsLoading(false); });
    }
  }, [tab, analytics]);

  useEffect(() => { loadTimes(selectedDate); }, [selectedDate, loadTimes]);
  useEffect(() => { setTab(searchParams.get('tab') === 'analytics' ? 'analytics' : 'teesheet'); }, [searchParams]);

  async function saveConditions() {
    setSavingConditions(true);
    await fetch('/api/operator/conditions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conditions: conditionsInput }) });
    setConditions(conditionsInput); setSavingConditions(false); setShowConditions(false);
  }

  const nowHM = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
  const nextUpId = selectedDate === today()
    ? (teeTimes.find(t => t.time >= nowHM && t.status !== 'blocked')?.id ?? null)
    : null;

  const q = search.trim().toLowerCase();
  const visibleTimes = q
    ? teeTimes.filter(t => t.bookings?.some(b => b.golferName.toLowerCase().includes(q) || b.golferEmail.toLowerCase().includes(q)))
    : teeTimes;

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active={tab} onAlertClick={() => setShowConditions(true)}/>

      <main className="flex-1 overflow-y-auto">
        {courseDraft && !courseArchived && (
          <div className="bg-pine/5 border-b border-pine/20 px-6 py-3">
            <div className="flex items-center gap-2 text-sm text-ink-soft flex-wrap">
              <Eye className="w-4 h-4 shrink-0 text-pine"/>
              <span>Your course isn&apos;t live yet &mdash; golfers can&apos;t book until you approve the page.</span>
              <div className="flex items-center gap-2 ml-auto">
                {pageApprovalStatus === 'approved' ? (
                  <span className="text-xs text-ok font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5"/>You approved this page</span>
                ) : (
                  <button onClick={approvePage} disabled={approvingPage}
                    className="text-xs font-medium text-white bg-pine hover:bg-pine-hover px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors">
                    {approvingPage ? 'Submitting...' : 'Looks good — approve my page'}
                  </button>
                )}
                {pageApprovalStatus === 'changes_requested' ? (
                  <span className="text-xs text-warn font-medium">Changes requested</span>
                ) : (
                  <button onClick={() => setShowChangesModal(true)}
                    className="text-xs font-medium text-ink-soft bg-white border border-line hover:border-line-strong px-3 py-1.5 rounded-md transition-colors">
                    Request changes
                  </button>
                )}
              </div>
            </div>
            {approveError && <p className="text-xs text-bad mt-1.5">{approveError}</p>}
            {changesConfirmMsg && <p className="text-xs text-ok mt-1.5">{changesConfirmMsg}</p>}
          </div>
        )}
        {showChangesModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
              <div className="text-ink font-medium mb-2">What would you like changed?</div>
              <textarea
                value={changesText}
                onChange={e => setChangesText(e.target.value)}
                rows={4}
                placeholder="e.g. Can we update the green fee for weekends?"
                className="w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none mb-3"
              />
              {changesError && <p className="text-xs text-bad mb-2">{changesError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowChangesModal(false); setChangesText(''); setChangesError(''); }}
                  className="text-xs text-ink-muted hover:text-ink px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={submitChanges}
                  disabled={sendingChanges || !changesText.trim()}
                  className="text-xs font-medium text-white bg-pine hover:bg-pine-hover px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
                >
                  {sendingChanges ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
        {courseArchived && (
          <div className="bg-bad/5 border-b border-bad/20 px-6 py-3 flex items-center gap-2 text-sm text-bad">
            <AlertTriangle className="w-4 h-4 shrink-0"/>
            <span>This course has been archived. The public booking page is offline. Contact GreenReserve support to restore it.</span>
          </div>
        )}
        {conditions && (
          <div className="bg-warn/10 border-b border-warn/20 px-6 py-2 flex items-center gap-2 text-sm font-medium text-warn">
            <AlertTriangle className="w-4 h-4 shrink-0"/>
            <span>Course alert: {conditions}</span>
            <button onClick={() => setShowConditions(true)} className="ml-auto underline text-xs">Update</button>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-6 py-6">

          {/* ── Analytics ── */}
          {tab === 'analytics' && (
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-5">Analytics — Last 30 Days</h1>
              {analyticsLoading && <div className="text-center py-20 text-ink-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div>}
              {analytics && (
                <div className="space-y-5">
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 divide-x divide-line-soft">
                      {[
                        { label:'Revenue',     value:`$${analytics.summary.totalRevenue.toFixed(0)}`, sub:'green + cart fees', onClick:()=>router.push('/dashboard/payments') },
                        { label:'Bookings',    value:analytics.summary.totalBookings,                 sub:'confirmed',       onClick:undefined },
                        { label:'Players',     value:analytics.summary.totalPlayers,                  sub:'total rounds',    onClick:undefined },
                        { label:'Utilization', value:`${analytics.summary.utilization}%`,             sub:'slots filled',    onClick:undefined },
                      ].map(s => (
                        <button key={s.label} onClick={s.onClick} disabled={!s.onClick}
                          className={'pl-4 first:pl-0 text-left ' + (s.onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default')}>
                          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">{s.label}</div>
                          <div className="text-2xl font-serif font-medium text-ink">{s.value}</div>
                          <div className="text-xs text-ink-soft mt-0.5">{s.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">Daily Revenue</div>
                    <div className="flex items-end gap-0.5 h-24">
                      {analytics.revenueByDay.map(d => {
                        const max = Math.max(...analytics.revenueByDay.map(x => x.revenue), 1);
                        const pct = (d.revenue / max) * 100;
                        return (
                          <div key={d.date} className="flex-1 group relative flex flex-col justify-end h-full">
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-ink text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">${d.revenue.toFixed(0)}</div>
                            <div className="w-full rounded-t" style={{ height:`${Math.max(pct,2)}%`, background: pct > 0 ? '#24513B' : '#E6E3D7' }}/>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-ink-muted mt-1">
                      <span>{analytics.revenueByDay[0]?.date}</span>
                      <span>{analytics.revenueByDay[analytics.revenueByDay.length-1]?.date}</span>
                    </div>
                  </div>
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">Utilization by Day</div>
                    <div className="space-y-2">
                      {analytics.utilizationByDow.map(d => (
                        <div key={d.dow} className="flex items-center gap-3">
                          <span className="text-sm text-ink-muted w-8">{d.label}</span>
                          <div className="flex-1 bg-line rounded-full h-2.5">
                            <div className="h-2.5 rounded-full bg-pine" style={{ width:`${d.pct}%` }}/>
                          </div>
                          <span className="text-sm font-medium text-ink w-10 text-right tabular-nums">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tee Sheet ── */}
          {tab === 'teesheet' && (
            <>
              {/* Stats */}
              <div className="bg-white border border-line rounded-lg p-5 mb-5">
                <div className="grid grid-cols-4 gap-4 divide-x divide-line-soft">
                  {[
                    { label:'Total Slots', value:totalSlots,               icon:<Users className="w-4 h-4"/>,     onClick:undefined },
                    { label:'Booked',      value:bookedSlots,              icon:<Calendar className="w-4 h-4"/>,  onClick:undefined },
                    { label:'Revenue',     value:`$${revenue.toFixed(0)}`, icon:<DollarSign className="w-4 h-4"/>, onClick:()=>router.push(`/dashboard/payments?date=${selectedDate}`) },
                    { label:'Blocked',     value:blocked,                  icon:<Ban className="w-4 h-4"/>,       onClick:undefined },
                  ].map(s => (
                    <button key={s.label} onClick={s.onClick} disabled={!s.onClick}
                      className={'pl-4 first:pl-0 text-left ' + (s.onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default')}>
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">{s.icon}{s.label}</div>
                      <div className="text-xl font-serif font-medium text-ink tabular-nums">{s.value}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date strip */}
              <div className="bg-white border border-line rounded-lg mb-4 p-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setDateOffset(o => Math.max(0,o-7))} disabled={dateOffset===0}
                    className="p-1.5 rounded-md hover:bg-paper disabled:opacity-30 transition-colors">
                    <ChevronLeft className="w-4 h-4 text-ink-muted"/>
                  </button>
                  <div className="flex gap-1.5 flex-1 overflow-x-auto">
                    {dates.map(d => (
                      <button key={d} onClick={() => setSelectedDate(d)}
                        className={'flex-1 min-w-[70px] py-2 px-1 rounded-md text-center transition-colors ' + (selectedDate===d ? 'bg-pine text-white' : 'hover:bg-paper text-ink-soft')}>
                        <div className="text-xs font-medium">{new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'})}</div>
                        <div className="text-sm font-medium">{new Date(d+'T12:00:00').getDate()}</div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setDateOffset(o => o+7)} className="p-1.5 rounded-md hover:bg-paper transition-colors">
                    <ChevronRight className="w-4 h-4 text-ink-muted"/>
                  </button>
                </div>
              </div>

              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-[17px] font-medium text-ink">{fmtDate(selectedDate)}</h2>
                  <p className="text-xs text-ink-muted">{teeTimes.filter(t=>t.status!=='blocked').length} tee times · {teeTimes.filter(t=>(t.playersBooked??0)>0).length} booked</p>
                </div>
                <div className="flex gap-2 items-center">
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find golfer..."
                    className="w-36 sm:w-44 bg-white border border-line rounded-md px-3 py-1.5 text-xs text-ink placeholder-ink-faint focus:ring-2 focus:ring-pine/10 focus:border-pine/40 outline-none"/>
                  <button onClick={() => loadTimes(selectedDate)} className="flex items-center gap-1.5 text-xs text-ink-soft px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
                    <RefreshCw className="w-3.5 h-3.5"/>Refresh
                  </button>
                  <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 text-xs bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md transition-colors">
                    <Plus className="w-3.5 h-3.5"/>Add Time
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="flex gap-4 mb-3 text-xs text-ink-muted">
                {([['bg-white border-line','Open'],['bg-warn/5 border-warn/20','Filling'],['bg-bad/5 border-bad/20','Full'],['bg-paper border-line opacity-60','Blocked']] as [string,string][]).map(([cls,label]) => (
                  <span key={label} className="flex items-center gap-1.5"><span className={'w-2.5 h-2.5 rounded-sm border inline-block ' + cls}/>{label}</span>
                ))}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 text-ink-muted gap-2">
                  <Loader2 className="w-5 h-5 animate-spin"/>Loading tee times...
                </div>
              ) : teeTimes.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-lg border border-dashed border-line">
                  <p className="font-medium text-ink mb-1">No tee times for this date</p>
                  <p className="text-sm text-ink-muted mb-4">Add times manually or check your schedule covers this day</p>
                  <button onClick={() => setShowAddModal(true)} className="bg-pine hover:bg-pine-hover text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors">Add Tee Time</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {q && visibleTimes.length === 0 && (
                    <div className="text-center py-10 text-ink-muted text-sm bg-white rounded-lg border border-dashed border-line">
                      No bookings match &quot;{search}&quot; on this date.
                    </div>
                  )}
                  {visibleTimes.map(tt => (
                    <div key={tt.id}
                      className={'rounded-lg border p-3 cursor-pointer transition-colors ' + slotBorderCls(tt) + (tt.id===nextUpId ? ' ring-1 ring-pine/40' : '')}
                      onClick={() => setExpandedId(expandedId===tt.id?null:tt.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0 flex-wrap">
                          <span className="font-medium text-ink text-sm w-20 tabular-nums">{fmtTime(tt.time)}</span>
                          {tt.id===nextUpId && <span className="text-[10px] font-medium uppercase tracking-wider text-pine">Next up</span>}
                          <span className="text-xs text-ink-muted">{tt.holes}h</span>
                          {slotBadge(tt)}
                          <span className="text-xs text-ink-muted tabular-nums">{tt.playersBooked}/{tt.playersAvailable}</span>
                          <span className="text-xs font-medium text-ink-soft tabular-nums">${tt.greenFee}{tt.cartFee>0?` +$${tt.cartFee}`:''}</span>
                          {expandedId!==tt.id && (tt.bookings?.length ?? 0) > 0 && (
                            <span className="hidden sm:flex items-center gap-1 flex-wrap min-w-0">
                              {tt.bookings!.slice(0, 3).map(b => (
                                <span key={b.id} className="text-[11px] px-2 py-0.5 rounded-full bg-line text-ink-soft whitespace-nowrap">
                                  {b.golferName} · {b.players}
                                </span>
                              ))}
                              {tt.bookings!.length > 3 && <span className="text-[11px] text-ink-muted">+{tt.bookings!.length - 3} more</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={e => { e.stopPropagation(); fetch('/api/operator/tee-times',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:tt.id,status:tt.status==='blocked'?'available':'blocked'})}).then(()=>loadTimes(selectedDate)); }}
                            className="text-xs px-2 py-1 rounded-md border border-line text-ink-soft hover:text-ink hover:border-line-strong transition-colors">
                            {tt.status==='blocked'?'Unblock':'Block'}
                          </button>
                          <button onClick={e => { e.stopPropagation(); if(confirm('Delete this tee time?')) fetch('/api/operator/tee-times',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:tt.id})}).then(()=>loadTimes(selectedDate)); }}
                            className="text-xs px-2 py-1 rounded-md border border-bad/30 text-bad hover:bg-bad/5 transition-colors">
                            Del
                          </button>
                        </div>
                      </div>
                      {expandedId===tt.id && tt.bookings && tt.bookings.length>0 && (
                        <div className="mt-3 pt-3 border-t border-line-soft space-y-1.5">
                          {tt.bookings.map(b => {
                            const bStatus = getBookingStatus(b.status, b.paymentStatus);
                            return (
                              <div key={b.id} className="flex items-center justify-between text-xs bg-paper rounded-md px-3 py-2 border border-line gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-ink">{b.golferName}</span>
                                  <span className="text-ink-muted ml-2">{b.players} player{b.players!==1?'s':''}</span>
                                  <div className="text-xs text-ink-muted truncate">{b.golferEmail}</div>
                                </div>
                                <span className={'shrink-0 text-xs font-medium ' + toneText(bStatus.tone)}>{bStatus.label}</span>
                                {b.status !== 'completed' && b.status !== 'cancelled' && (
                                  <button onClick={e=>{e.stopPropagation();checkInBooking(b);}} disabled={checkingInId===b.id}
                                    className="shrink-0 text-white bg-pine hover:bg-pine-hover px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors">
                                    {checkingInId===b.id ? 'Charging…' : 'Check In'}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {expandedId===tt.id && tt.bookings && tt.bookings.length===0 && (
                        <div className="mt-2 pt-2 border-t border-line-soft text-xs text-ink-muted">No bookings yet</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Add Tee Time Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-line w-full sm:max-w-sm rounded-t-lg sm:rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-medium text-ink text-[17px]">Add Tee Time — {fmtDate(selectedDate)}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5"/></button>
            </div>
            <AddTeeTimeForm date={selectedDate} onSave={()=>{setShowAddModal(false);loadTimes(selectedDate);}} onCancel={()=>setShowAddModal(false)}/>
          </div>
        </div>
      )}

      {/* ── Card Check-In Modal ── */}
      {cardModalBooking && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4">
          <Elements stripe={stripePromise}>
            <CardCheckInModal booking={cardModalBooking} onConfirm={(pmId) => checkInWithCard(cardModalBooking, pmId)} onCancel={() => setCardModalBooking(null)}/>
          </Elements>
        </div>
      )}

      {/* ── Course Alert Modal ── */}
      {showConditions && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-line w-full max-w-sm rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-medium text-ink text-[17px]">Course Alert</h3>
              <button onClick={() => setShowConditions(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5"/></button>
            </div>
            <p className="text-sm text-ink-soft mb-3">Shown as a banner to golfers before they book. Leave blank to clear.</p>
            <textarea value={conditionsInput} onChange={e=>setConditionsInput(e.target.value)} rows={3}
              placeholder="e.g. Cart paths only through Sunday"
              className={iCls + ' w-full mb-4 resize-none'}/>
            <div className="flex gap-3">
              <button onClick={() => setShowConditions(false)} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">Cancel</button>
              <button onClick={saveConditions} disabled={savingConditions}
                className="flex-1 bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">
                {savingConditions ? 'Saving...' : conditionsInput ? 'Save Alert' : 'Clear Alert'}
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
    <Suspense fallback={<div className="min-h-screen bg-paper"/>}>
      <DashboardPageInner/>
    </Suspense>
  );
}

/* ─── Add Tee Time Form ─────────────────────────────────────────────────── */
function AddTeeTimeForm({ date, onSave, onCancel }: { date: string; onSave: ()=>void; onCancel: ()=>void }) {
  const [time,     setTime]     = useState('08:00');
  const [holes,    setHoles]    = useState(18);
  const [players,  setPlayers]  = useState(4);
  const [greenFee, setGreenFee] = useState(65);
  const [cartFee,  setCartFee]  = useState(18);
  const [walking,  setWalking]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const inp = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full';

  async function save() {
    setSaving(true);
    await fetch('/api/operator/tee-times', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({date,time,holes,playersAvailable:players,greenFee,cartFee,walkingAllowed:walking}) });
    setSaving(false); onSave();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Time</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} className={inp}/></div>
        <div><label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Holes</label><select value={holes} onChange={e=>setHoles(Number(e.target.value))} className={inp}><option value={9}>9</option><option value={18}>18</option></select></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Slots</label><input type="number" value={players} min={1} max={8} onChange={e=>setPlayers(Number(e.target.value))} className={inp}/></div>
        <div><label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Green $</label><input type="number" value={greenFee} min={0} onChange={e=>setGreenFee(Number(e.target.value))} className={inp}/></div>
        <div><label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Cart $</label><input type="number" value={cartFee} min={0} onChange={e=>setCartFee(Number(e.target.value))} className={inp}/></div>
      </div>
      <div className="flex items-center justify-between py-1">
        <span className="text-sm text-ink">Walking allowed</span>
        <button onClick={() => setWalking(!walking)} className={'relative w-11 h-6 rounded-full transition-colors ' + (walking ? 'bg-pine' : 'bg-line-strong')}>
          <span className={'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ' + (walking ? 'translate-x-5' : '')}/>
        </button>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">
          {saving ? 'Adding...' : 'Add Time'}
        </button>
      </div>
    </div>
  );
}

/* ─── Card Check-In Modal ───────────────────────────────────────────────── */
function CardCheckInModal({ booking, onConfirm, onCancel }: {
  booking: Booking;
  onConfirm: (paymentMethodId: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cardStyle = { style: { base: { fontSize: '14px', color: '#1C1C18', '::placeholder': { color: '#98968B' } }, invalid: { color: '#A3452F' } } };

  async function handleCharge() {
    if (!stripe || !elements) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setLoading(true); setError('');
    try {
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({ type: 'card', card, billing_details: { name: booking.golferName } });
      if (pmError) { setError(pmError.message || 'Card error.'); setLoading(false); return; }
      const err = await onConfirm(paymentMethod.id);
      if (err) { setError(err); setLoading(false); }
    } catch { setError('Something went wrong — try again.'); setLoading(false); }
  }

  return (
    <div className="bg-white border border-line w-full max-w-sm rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-serif font-medium text-ink text-[17px]">Check In — {booking.golferName}</h3>
          <p className="text-xs text-ink-muted mt-0.5">Enter golfer&apos;s card to charge ${(booking.totalAmount / 100).toFixed(2)}</p>
        </div>
        <button onClick={onCancel} className="text-ink-muted hover:text-ink"><X className="w-5 h-5"/></button>
      </div>
      <div className="mb-4">
        <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Card Details</label>
        <div className="w-full px-4 py-3.5 rounded-md border border-line bg-paper focus-within:border-pine/40 transition-colors">
          <CardElement options={cardStyle}/>
        </div>
      </div>
      {error && <p className="text-bad text-xs mb-3">{error}</p>}
      <button onClick={handleCharge} disabled={loading || !stripe}
        className="w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md text-[12.5px] font-medium disabled:opacity-50 flex items-center justify-center gap-2 mb-2 transition-colors">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin"/>Charging…</> : `Charge $${(booking.totalAmount / 100).toFixed(2)}`}
      </button>
      <div className="flex items-center justify-center gap-1.5 text-ink-muted text-xs">
        <Lock className="w-3 h-3"/><span>Powered by Stripe</span>
      </div>
    </div>
  );
}
