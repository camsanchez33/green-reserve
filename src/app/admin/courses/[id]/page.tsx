'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Star, Power, Globe, ArchiveX, ArchiveRestore, Mail, Phone,
  Calendar, Ban, Plus, X, RefreshCw, Search, MessageSquare, Send, Trash2, Eye, CheckCircle,
  FileText, Upload, StickyNote, AlertTriangle, MoreVertical, Pause, Play,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { periodDelta, type CourseHealthStatus } from '@/lib/course-metrics';

type TabName = 'overview' | 'transactions' | 'documents' | 'messages' | 'teesheet' | 'schedule' | 'members' | 'staff' | 'setup';

const TAB_LABELS: Record<TabName, string> = {
  overview: 'Overview', transactions: 'Transactions', documents: 'Documents', messages: 'Messages',
  teesheet: 'Tee Sheet', schedule: 'Schedule', members: 'Members', staff: 'Staff', setup: 'Setup',
};
// A-05 item 1: tabs reorganized into two labeled groups — Contact folds into
// Overview's client card instead of staying its own tab.
const TAB_GROUPS: { label: string; tabs: TabName[] }[] = [
  { label: 'Business', tabs: ['overview', 'transactions', 'documents', 'messages'] },
  { label: 'Operations', tabs: ['teesheet', 'schedule', 'members', 'staff', 'setup'] },
];
const ALL_TABS: TabName[] = TAB_GROUPS.flatMap(g => g.tabs);

const TX_STATUS: Record<string, { dot: string; label: string }> = {
  card_saved: { dot: 'neutral', label: 'Card saved' },
  manual: { dot: 'neutral', label: 'Manual' },
  completed: { dot: 'ok', label: 'Completed' },
  fee_charged: { dot: 'bad', label: 'Fee charged' },
  cancelled: { dot: 'bad', label: 'Cancelled' },
  paid: { dot: 'ok', label: 'Paid' },
};

interface TimelineEventDTO {
  type: string;
  at: string;
  data: Record<string, unknown>;
}

interface CourseDetail {
  course: {
    id: string; name: string; slug: string; city: string; state: string; type: string; phone?: string;
    active: boolean; featured: boolean; stripeAccountActive: boolean; stripeAccountId?: string;
    cancellationHours: number; hasMemberPricing: boolean; hasResidentPricing: boolean;
    walkingAllowed: string; cartRequired: boolean; hasCaddies: boolean;
    residentCounty: string; residentState: string;
    archivedAt?: string | null; archivedBy?: string | null;
    adminNotes?: string | null; createdAt?: string;
    welcomeEmailSentAt?: string | null;
    schedules?: { id: string; createdAt: string }[];
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
  bookings30d: number;
  lastBookingAt: string | null;
  bookingsPrior30d: number;
  approval: { status: 'none' | 'approved' | 'changes_requested'; approvedAt: string | null };
  health: { status: CourseHealthStatus; label: string; dot: 'ok' | 'bad' | 'warn' | 'neutral'; reason: string };
  openItems: { unreadMessages: number; openChanges: string[]; hasSchedule: boolean };
  timeline: TimelineEventDTO[] | null;
  remindersPaused: boolean;
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

// A-05 item 4a — the onboarding checklist as named steps with date/state,
// replacing "Verified 3/3" everywhere. Dates are shown only where a real
// timestamp exists (no fabricated dates) — several steps don't have a
// dedicated timestamp field today (kept out of scope for a no-migration
// pass), so those render state-only.
interface OnboardingStep { key: string; label: string; done: boolean; at: string | null }
function onboardingSteps(d: CourseDetail): OnboardingStep[] {
  const c = d.course;
  return [
    { key: 'email_verified', label: 'Email verified', done: !!c.operator?.emailVerified, at: null },
    { key: 'password_set', label: 'Password set', done: !!c.operator, at: c.createdAt ?? null },
    { key: 'page_approved', label: 'Page approved', done: d.approval.status === 'approved', at: d.approval.approvedAt },
    { key: 'stripe_connected', label: 'Stripe connected', done: c.stripeAccountActive, at: null },
    { key: 'schedule_confirmed', label: 'Schedule confirmed', done: d.openItems.hasSchedule, at: (c.schedules && c.schedules[0]) ? c.schedules[0].createdAt : null },
    { key: 'live', label: 'Live', done: c.active, at: c.welcomeEmailSentAt ?? null },
  ];
}

export default function CourseDetailPage() {
  const { id: courseId } = useParams() as { id: string };
  const router = useRouter();

  const [adminReady, setAdminReady] = useState(false);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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

  // Preview email
  const [sendingPreview, setSendingPreview] = useState(false);
  const [previewMsg, setPreviewMsg] = useState('');
  const [showPreviewConfirm, setShowPreviewConfirm] = useState(false);
  const [requestingReReview, setRequestingReReview] = useState(false);

  // Messages tab
  const [msgThread, setMsgThread] = useState<{ id: string; messages: { id: string; senderType: string; senderName: string; body: string; readAt: string | null; isBroadcast: boolean; createdAt: string }[] } | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgCompose, setMsgCompose] = useState('');
  const [msgSending, setMsgSending] = useState(false);

  // A-05 item 2: header danger menu + preflight-aware live toggle
  const [dangerOpen, setDangerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [liveToggleBusy, setLiveToggleBusy] = useState(false);
  const [liveBlockReason, setLiveBlockReason] = useState('');

  // A-05 item 5: Documents tab
  const [docsData, setDocsData] = useState<{
    approval: { status: string; approvedAt: string | null };
    stripeAgreementDate: string | null;
    bookingTermsVersion: string;
    agreementVersion: string;
    agreement: { version: string; acceptedBy: string; at: string } | null;
    documents: { name: string; url: string; by: string; at: string }[];
    notes: { text: string; by: string; at: string }[];
  } | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [docsError, setDocsError] = useState('');

  // A-05 item 4b: auto-chase reminders kill switch
  const [remindersBusy, setRemindersBusy] = useState(false);

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

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true); setDocsError('');
    const r = await fetch(`/api/admin/course-documents?courseId=${courseId}`, { headers: H() });
    if (r.ok) setDocsData(await r.json());
    else { const e = await r.json().catch(() => ({})); setDocsError(e.error || 'Failed to load documents'); }
    setDocsLoading(false);
  }, [courseId, H]);

  const loadCourseThread = useCallback(async () => {
    setMsgLoading(true);
    const r = await fetch(`/api/admin/messages?courseId=${courseId}`, { headers: H() });
    if (r.ok) setMsgThread(await r.json());
    setMsgLoading(false);
    // Mark operator messages as read
    await fetch('/api/admin/messages', { method: 'PATCH', headers: H(), body: JSON.stringify({ courseId }) });
  }, [courseId, H]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await fetch(`/api/admin/course-detail?courseId=${courseId}`, { headers: H() });
      if (r.ok) {
        const d = await r.json();
        setDetail(d);
        setSetupForm(d.course);
      } else {
        const e = await r.json().catch(() => ({}));
        setLoadError(e.error || `Failed to load course (${r.status})`);
      }
    } catch {
      setLoadError('Network error — check your connection and try again.');
    }
    setLoading(false);
  }, [courseId, H]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadDetail();
  }, [adminReady, loadDetail]);

  // A-05 item 2 — preflight-aware: server enforces the same Stripe check
  // (go-live-preflight.ts) the inquiries mark_live action does. A blocked
  // "Set live" surfaces the exact reason rather than silently no-op'ing.
  async function toggleActive(active: boolean, override = false) {
    setLiveToggleBusy(true); setLiveBlockReason('');
    const r = await fetch('/api/admin/course-detail', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, active, override }),
    });
    setLiveToggleBusy(false);
    if (r.ok) {
      setDetail(d => d ? { ...d, course: { ...d.course, active } } : d);
      loadDetail();
    } else {
      const d = await r.json().catch(() => ({}));
      setLiveBlockReason(d.error || 'Failed to update — try again.');
    }
  }

  async function toggleFeatured(featured: boolean) {
    await fetch('/api/admin/course-detail', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, featured }),
    });
    setDetail(d => d ? { ...d, course: { ...d.course, featured } } : d);
  }

  async function archiveCourse() {
    if (!detail) return;
    if (!confirm(`Archive "${detail.course.name}"? The course disappears from the public site but data is retained. You can restore it later.`)) return;
    setArchiveBusy(true);
    const r = await fetch('/api/admin/archive-course', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId, action: 'archive' }),
    });
    setArchiveBusy(false);
    if (r.ok) router.push('/admin/courses');
    else { const d = await r.json(); alert(`Archive failed: ${d.error}`); }
  }

  async function restoreCourse() {
    setArchiveBusy(true);
    const r = await fetch('/api/admin/archive-course', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId, action: 'restore' }),
    });
    setArchiveBusy(false);
    if (r.ok) loadDetail();
    else { const d = await r.json(); alert(`Restore failed: ${d.error}`); }
  }

  // A-05 item 2 — danger menu: hard delete routes through the SAME
  // lifecycle.ts deletePair the archive/restore actions use (LIFECYCLE
  // PARITY LAW), owner-only, typed-name confirm, blocked if payment history.
  async function hardDeleteCourse() {
    if (!detail) return;
    setDeleteBusy(true); setDeleteError('');
    const r = await fetch('/api/admin/archive-course', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId, action: 'hard_delete', confirmName: deleteConfirmName }),
    });
    setDeleteBusy(false);
    if (r.ok) { router.push('/admin/courses'); return; }
    const d = await r.json().catch(() => ({}));
    setDeleteError(d.error || 'Delete failed — try again.');
  }

  // A-05 item 4b — kill switch, logged to the course timeline.
  async function toggleRemindersPaused(paused: boolean) {
    setRemindersBusy(true);
    const r = await fetch('/api/admin/course-reminders', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, paused }),
    });
    setRemindersBusy(false);
    if (r.ok) loadDetail();
    else { const d = await r.json().catch(() => ({})); alert(d.error || 'Failed to update'); }
  }

  async function addClientNote() {
    if (!noteDraft.trim()) return;
    setNoteSaving(true);
    const r = await fetch('/api/admin/course-documents', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId, kind: 'note', text: noteDraft.trim() }),
    });
    setNoteSaving(false);
    if (r.ok) { setNoteDraft(''); loadDocuments(); }
    else { const d = await r.json().catch(() => ({})); alert(d.error || 'Failed to save note'); }
  }

  async function uploadDocument(file: File) {
    setDocUploading(true); setDocsError('');
    const form = new FormData();
    form.append('file', file);
    form.append('courseId', courseId);
    const r = await fetch('/api/admin/course-documents/upload', { method: 'POST', body: form });
    setDocUploading(false);
    if (r.ok) loadDocuments();
    else { const d = await r.json().catch(() => ({})); setDocsError(d.error || 'Upload failed'); }
  }

  async function saveSetup() {
    setSetupSaving(true); setSetupMsg('');
    const r = await fetch('/api/admin/course-settings', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, ...setupForm }),
    });
    setSetupSaving(false);
    setSetupMsg(r.ok ? 'saved' : 'error');
    if (r.ok) loadDetail();
  }

  async function savePhone(phone: string) {
    const r = await fetch('/api/admin/course-settings', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, phone }),
    });
    if (r.ok) loadDetail();
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

  async function sendCoursePreview() {
    if (!detail?.course.operator?.email) return;
    setSendingPreview(true); setPreviewMsg('');
    const r = await fetch('/api/preview/send', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId }),
    });
    const d = await r.json();
    setSendingPreview(false);
    setPreviewMsg(r.ok ? `Preview + dashboard access sent to ${detail.course.operator.email}` : ('Error: ' + (d.error || 'Failed')));
    if (r.ok) loadDetail();
  }

  async function requestReReview() {
    setRequestingReReview(true); setPreviewMsg('');
    const r = await fetch('/api/admin/request-re-review', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId }),
    });
    const d = await r.json();
    setRequestingReReview(false);
    setPreviewMsg(r.ok ? 'Re-review requested — Send Preview is available again.' : ('Error: ' + (d.error || 'Failed')));
    if (r.ok) loadDetail();
  }

  const c = detail?.course;

  if (!adminReady || loading) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="admin-content flex-1 flex items-center justify-center">
          <div className="text-ink-muted text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="admin-content flex-1 flex items-center justify-center flex-col gap-4">
          <div className="bg-bad/5 border border-bad/20 rounded-lg px-6 py-5 text-center max-w-sm">
            <div className="text-bad text-sm font-medium mb-1">Failed to load course</div>
            <div className="text-ink-muted text-xs mb-4">{loadError}</div>
            <div className="flex gap-2 justify-center">
              <button onClick={loadDetail} className="px-4 py-2 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-colors">Retry</button>
              <button onClick={() => router.push('/admin/courses')} className="px-4 py-2 border border-line text-ink-soft hover:text-ink rounded-md text-sm transition-colors">Back to list</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!detail || !c) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="admin-content flex-1 flex items-center justify-center flex-col gap-3">
          <div className="text-ink-muted text-sm">Course not found</div>
          <button onClick={() => router.push('/admin/courses')} className="text-pine text-sm hover:underline">Back to list</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">

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
                <span title={detail.health.reason}><StatusDot status={detail.health.dot} label={detail.health.label} /></span>
                <span className="text-xs text-ink-muted">{c.city}, {c.state}</span>
                <span className="text-xs text-ink-muted capitalize">{c.type}</span>
                {detail?.approval.approvedAt && (
                  <span className="text-xs text-ink-faint">
                    Page approved by course · {new Date(detail.approval.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => toggleFeatured(!c.featured)}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ' + (c.featured ? 'text-warn bg-warn/10 border-warn/20' : 'text-ink-soft border-line hover:text-warn hover:bg-warn/5')}
              >
                <Star className="w-3.5 h-3.5" />{c.featured ? 'Featured' : 'Feature'}
              </button>
              {!c.active && c.operator && detail?.approval.status === 'approved' && (
                <>
                  <span className="px-3 py-1.5 rounded-md text-xs font-medium border bg-ok/5 text-ok border-ok/20 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Approved{detail.approval.approvedAt ? ' · ' + new Date(detail.approval.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                  <button
                    onClick={requestReReview}
                    disabled={requestingReReview}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors bg-paper text-ink-soft border-line hover:text-ink hover:border-line-strong disabled:opacity-50"
                    title="Reopen the review loop without waiting on the course"
                  >
                    {requestingReReview ? 'Requesting…' : 'Request re-review'}
                  </button>
                </>
              )}
              {!c.active && c.operator && detail?.approval.status !== 'approved' && (
                <button
                  onClick={() => setShowPreviewConfirm(true)}
                  disabled={sendingPreview}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 bg-paper text-ink-soft border-line hover:text-pine hover:border-pine/30 hover:bg-pine/5 disabled:opacity-50"
                  title="Send preview + dashboard access to operator"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {sendingPreview ? 'Sending…' : 'Send Preview'}
                </button>
              )}
              <button
                onClick={() => confirm(c.active ? `Take "${c.name}" offline? Golfers will no longer be able to book.` : `Set "${c.name}" live? Golfers will be able to book immediately.`) && toggleActive(!c.active)}
                disabled={liveToggleBusy}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ' + (c.active ? 'bg-bad/5 text-bad border-bad/20 hover:bg-bad/10' : 'bg-ok/5 text-ok border-ok/20 hover:bg-ok/10')}
              >
                <Power className="w-3.5 h-3.5" />
                {liveToggleBusy ? 'Working…' : c.active ? 'Take offline' : 'Set live'}
              </button>
              <a
                href={'/courses/' + c.slug}
                target="_blank"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-line text-ink-soft hover:text-pine hover:border-pine/30 hover:bg-pine/5 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />View page
              </a>
              <button
                onClick={loadDetail}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-line text-ink-soft hover:text-ink hover:bg-paper transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />Refresh
              </button>
              <div className="relative">
                <button
                  onClick={() => setDangerOpen(o => !o)}
                  className="w-9 h-9 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors border border-line"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {dangerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDangerOpen(false)} />
                    <div className="absolute right-0 top-10 z-20 bg-white border border-line rounded-lg shadow-lg w-52 py-1.5">
                      {c.archivedAt ? (
                        <button
                          onClick={() => { setDangerOpen(false); restoreCourse(); }}
                          disabled={archiveBusy}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ok hover:bg-ok/5 transition-colors disabled:opacity-50"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />Restore course
                        </button>
                      ) : (
                        <button
                          onClick={() => { setDangerOpen(false); archiveCourse(); }}
                          disabled={archiveBusy}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-soft hover:bg-paper transition-colors disabled:opacity-50"
                        >
                          <ArchiveX className="w-3.5 h-3.5" />Archive course
                        </button>
                      )}
                      <div className="border-t border-line-soft my-1.5" />
                      <button
                        onClick={() => { setDangerOpen(false); setShowDeleteConfirm(true); setDeleteConfirmName(''); setDeleteError(''); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-bad hover:bg-bad/5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />Delete permanently
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {liveBlockReason && (
            <div className="mt-3 rounded-md px-4 py-2.5 bg-warn/5 border border-warn/20 flex items-center justify-between gap-3">
              <p className="text-xs text-warn">{liveBlockReason}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setLiveBlockReason('')} className="text-xs text-ink-muted hover:text-ink transition-colors">Dismiss</button>
                <button
                  onClick={() => toggleActive(true, true)}
                  className="text-xs font-medium px-3 py-1 rounded-md bg-warn text-white hover:bg-warn/90 transition-colors"
                >
                  Go live anyway
                </button>
              </div>
            </div>
          )}

          {previewMsg && (
            <div className={'mt-3 rounded-md px-4 py-2 flex items-center justify-between gap-3 ' + (previewMsg.startsWith('Error') ? 'bg-bad/5 border border-bad/20' : 'bg-ok/5 border border-ok/20')}>
              <p className={'text-xs ' + (previewMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{previewMsg}</p>
              <button onClick={() => setPreviewMsg('')} className="text-ink-muted hover:text-ink transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-4 mt-4 overflow-x-auto">
            {TAB_GROUPS.map(group => (
              <div key={group.label} className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] uppercase tracking-[0.06em] text-ink-faint pl-0.5">{group.label}</span>
                <div className="flex gap-0.5 bg-paper border border-line rounded-lg p-1">
                  {group.tabs.map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setTab(t);
                        if (t === 'teesheet') loadTeeSheet(tsDate);
                        if (t === 'schedule') loadSchedules();
                        if (t === 'transactions') loadTransactions(1, '', '', '');
                        if (t === 'members') loadMembers();
                        if (t === 'messages') loadCourseThread();
                        if (t === 'documents') loadDocuments();
                      }}
                      className={'px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap ' + (tab === t ? 'bg-white text-ink border border-line shadow-sm' : 'text-ink-muted hover:text-ink')}
                    >
                      {TAB_LABELS[t]}
                      {t === 'messages' && detail.openItems.unreadMessages > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-bad text-white text-[10px] font-medium">{detail.openItems.unreadMessages}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Archived notice */}
        {c.archivedAt && (
          <div className="mx-8 mt-5 px-4 py-3 rounded-lg bg-bad/5 border border-bad/20 flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-bad">This course is archived</span>
              <span className="text-sm text-ink-soft ml-2">
                — archived {new Date(c.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {c.archivedBy ? ` by ${c.archivedBy}` : ''}. Public pages return 404.
              </span>
            </div>
            <button
              onClick={restoreCourse}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-ok/10 text-ok border border-ok/20 hover:bg-ok/20 transition-colors"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />Restore
            </button>
          </div>
        )}

        {/* Tab content */}
        <div className="px-8 py-7 flex-1">

          {/* OVERVIEW */}
          {tab === 'overview' && (() => {
            const steps = onboardingSteps(detail);
            const doneSteps = steps.filter(s => s.done).length;
            const lastDays = detail.lastBookingAt ? Math.floor((Date.now() - new Date(detail.lastBookingAt).getTime()) / 86400000) : null;
            const lastLabel = detail.lastBookingAt ? (lastDays === 0 ? 'Today' : lastDays === 1 ? '1d ago' : lastDays! < 14 ? `${lastDays}d ago` : lastDays! < 60 ? `${Math.floor(lastDays!/7)}w ago` : `${Math.floor(lastDays!/30)}mo ago`) : 'Never';
            const trend = periodDelta(detail.bookings30d, detail.bookingsPrior30d);
            const openItemsList = [
              ...(detail.openItems.unreadMessages > 0 ? [`${detail.openItems.unreadMessages} unread message${detail.openItems.unreadMessages !== 1 ? 's' : ''}`] : []),
              ...(doneSteps < steps.length ? [`${steps.length - doneSteps} setup step${steps.length - doneSteps !== 1 ? 's' : ''} incomplete`] : []),
              ...detail.openItems.openChanges.map(c2 => `Change requested: ${c2}`),
            ];
            return (
            <div className="grid grid-cols-[1fr_320px] gap-6 max-w-6xl">
              <div className="space-y-6 min-w-0">
                {c.adminNotes && c.adminNotes.startsWith('[BUILD NOTES]') && (
                  <div className="bg-warn/5 border border-warn/20 rounded-lg px-5 py-4">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-warn mb-2">Needs review</div>
                    <ul className="space-y-1">
                      {c.adminNotes.replace('[BUILD NOTES]\n', '').split('\n').filter(Boolean).map((line, i) => (
                        <li key={i} className="text-sm text-ink-soft">{line.replace(/^• /, '')}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Client health block (item 3, top) */}
                <div className="bg-white border border-line rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Client Health</div>
                    <span title={detail.health.reason}><StatusDot status={detail.health.dot} label={detail.health.label} /></span>
                  </div>
                  <p className="text-sm text-ink-soft mb-4">{detail.health.reason}</p>
                  <div className="flex items-center gap-6 flex-wrap text-xs mb-4">
                    <div><span className="text-ink-muted mr-1.5">Last activity</span><span className="font-medium text-ink">{lastLabel}</span></div>
                    <div><span className="text-ink-muted mr-1.5">Setup</span><span className="font-medium text-ink">{doneSteps}/{steps.length} steps</span>
                      <button onClick={() => setTab('setup')} className="ml-1.5 text-pine hover:underline">View</button>
                    </div>
                  </div>
                  {openItemsList.length > 0 ? (
                    <div className="border-t border-line-soft pt-3">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Open items</div>
                      <ul className="space-y-1">
                        {openItemsList.map((item, i) => (
                          <li key={i} className="text-sm text-ink-soft flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-warn shrink-0" />{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="border-t border-line-soft pt-3 text-sm text-ink-muted">No open items.</div>
                  )}
                </div>

                {/* Money block (item 3, bottom) — shared metrics brain */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Bookings (30d)', value: String(detail.bookings30d), color: 'text-ink' },
                    { label: 'Gross (30d)', value: fmtMoney(detail.revenue30d.gross), color: 'text-ink' },
                    { label: 'GR Fees (30d)', value: fmtMoney(detail.revenue30d.platform), color: 'text-ok' },
                    { label: 'All-time Bookings', value: String(detail.totalBookings), color: 'text-ink' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white border border-line rounded-lg p-5">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">{label}</div>
                      <div className={'text-[28px] font-serif font-medium leading-none ' + color}>{value}</div>
                      {label === 'Bookings (30d)' && (
                        <div className={'text-xs font-medium mt-1.5 ' + (trend.direction === 'up' ? 'text-ok' : trend.direction === 'down' ? 'text-bad' : 'text-ink-muted')}>
                          {trend.pct === null ? 'no prior period' : `${trend.pct > 0 ? '+' : ''}${trend.pct.toFixed(0)}% vs prior 30d`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

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

              {/* Client card (contact info) — folded in from the old Contact tab (item 1) */}
              <div className="space-y-5">
                {c.operator && (
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Operator / Owner</div>
                    <div className="font-medium text-ink mb-2">{c.operator.name}</div>
                    <div className="space-y-1.5 mb-3">
                      <a href={'mailto:' + c.operator.email} className="flex items-center gap-2 text-sm text-ink-soft hover:text-pine transition-colors">
                        <Mail className="w-3.5 h-3.5 text-ink-muted shrink-0" />{c.operator.email}
                      </a>
                      {c.operator.phone && (
                        <a href={'tel:' + c.operator.phone} className="flex items-center gap-2 text-sm text-ink-soft hover:text-pine transition-colors">
                          <Phone className="w-3.5 h-3.5 text-ink-muted shrink-0" />{c.operator.phone}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {c.operator.emailVerified
                        ? <StatusDot status="ok" label="Email verified" />
                        : <StatusDot status="bad" label="Email not verified" />}
                    </div>
                  </div>
                )}

                <div className="bg-white border border-line rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Course Contact</div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Phone</span>
                      <input
                        defaultValue={c.phone || ''}
                        onBlur={e => { if (e.target.value !== (c.phone || '')) savePhone(e.target.value); }}
                        placeholder="Not set"
                        className="flex-1 min-w-0 bg-transparent text-ink font-medium outline-none border-b border-transparent focus:border-pine/40 transition-colors"
                      />
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Type</span>
                      <span className="text-ink font-medium capitalize">{c.type}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Slug</span>
                      <span className="text-ink font-medium">{c.slug}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Where</span>
                      <span className="text-ink font-medium">{c.city}, {c.state}</span>
                    </div>
                  </div>
                </div>

                {detail.staff.length > 0 && (
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Staff Contacts</div>
                    <div className="space-y-3">
                      {detail.staff.map(s => (
                        <div key={s.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-sm shrink-0">{s.name[0]}</div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate">
                              {s.name} <span className="text-xs text-ink-muted font-normal">· {s.role}</span>
                            </div>
                            <a href={'mailto:' + s.email} className="text-xs text-pine hover:underline truncate block">{s.email}</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

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
                          <div className="text-xs text-ink-soft truncate">
                            {tx.detail}
                            {tx.status === 'fee_charged' && tx.type === 'booking' && (
                              <button
                                onClick={() => { const d = tx.date; setTab('teesheet'); setTsDate(d); loadTeeSheet(d); }}
                                className="ml-1.5 text-pine hover:underline"
                              >View</button>
                            )}
                          </div>
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
            <div className="max-w-2xl">
              <div className="bg-white border border-line rounded-lg flex flex-col" style={{ minHeight: 480 }}>
                {/* Messages list */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ maxHeight: 420 }}>
                  {msgLoading && <div className="py-8 text-center text-ink-muted text-sm">Loading...</div>}
                  {!msgLoading && (!msgThread || msgThread.messages.length === 0) && (
                    <div className="py-8 text-center">
                      <MessageSquare className="w-8 h-8 text-ink-muted mx-auto mb-2" />
                      <div className="text-sm text-ink-muted">No messages yet. Start the conversation below.</div>
                    </div>
                  )}
                  {!msgLoading && msgThread && msgThread.messages.map(msg => {
                    const isAdmin = msg.senderType === 'admin';
                    return (
                      <div key={msg.id} className={isAdmin ? 'flex justify-end' : 'flex justify-start'}>
                        <div className="max-w-[70%]">
                          {msg.isBroadcast && (
                            <div className="text-[10px] text-ink-muted mb-1 flex items-center gap-1">
                              <Send className="w-3 h-3" /> Announcement
                            </div>
                          )}
                          <div className={
                            'px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ' + (
                              isAdmin
                                ? 'bg-pine text-white rounded-br-none'
                                : 'bg-paper border border-line text-ink rounded-bl-none'
                            )
                          }>
                            {msg.body}
                          </div>
                          <div className={'text-[10px] mt-1 text-ink-faint ' + (isAdmin ? 'text-right' : '')}>
                            {msg.senderName} · {new Date(msg.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            {isAdmin && msg.readAt && <span className="ml-1 text-pine/60">· Read</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Composer */}
                <div className="border-t border-line px-5 py-4 shrink-0">
                  <div className="flex gap-3 items-end">
                    <textarea
                      value={msgCompose}
                      onChange={e => setMsgCompose(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && msgCompose.trim() && !msgSending) {
                          e.preventDefault();
                          (async () => {
                            setMsgSending(true);
                            const r = await fetch('/api/admin/messages', {
                              method: 'POST', headers: H(),
                              body: JSON.stringify({ courseId, body: msgCompose.trim() }),
                            });
                            if (r.ok) { setMsgCompose(''); await loadCourseThread(); }
                            else { const d = await r.json(); alert(d.error || 'Send failed'); }
                            setMsgSending(false);
                          })();
                        }
                      }}
                      placeholder="Message this course..."
                      rows={2}
                      className="flex-1 bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 resize-none"
                    />
                    <button
                      disabled={!msgCompose.trim() || msgSending}
                      onClick={async () => {
                        if (!msgCompose.trim() || msgSending) return;
                        setMsgSending(true);
                        const r = await fetch('/api/admin/messages', {
                          method: 'POST', headers: H(),
                          body: JSON.stringify({ courseId, body: msgCompose.trim() }),
                        });
                        if (r.ok) { setMsgCompose(''); await loadCourseThread(); }
                        else { const d = await r.json(); alert(d.error || 'Send failed'); }
                        setMsgSending(false);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />Send
                    </button>
                  </div>
                  <div className="text-[10px] text-ink-faint mt-1.5">⌘/Ctrl + Enter to send · <button onClick={() => window.open('/admin/messages?courseId=' + courseId, '_blank')} className="text-pine hover:underline">Open full view</button></div>
                </div>
              </div>
            </div>
          )}

          {/* SETUP */}
          {tab === 'setup' && (() => {
            const steps = onboardingSteps(detail);
            const events = detail.timeline ?? [];
            const reminderEvents = events.filter(e => e.type === 'reminder_sent');
            return (
            <div className="space-y-5 max-w-3xl">
              <div className="bg-warn/5 border border-warn/20 rounded-md px-4 py-3 text-xs text-warn">
                You&apos;re editing live settings directly. The operator can still adjust their own dashboard, and every change here is logged to their timeline.
              </div>

              {/* 4a — onboarding checklist as named steps */}
              <div className="bg-white border border-line rounded-lg p-6">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">Onboarding Checklist</div>
                <div className="space-y-3">
                  {steps.map(s => (
                    <div key={s.key} className="flex items-center gap-3">
                      {s.done
                        ? <CheckCircle className="w-4 h-4 text-ok shrink-0" />
                        : <span className="w-4 h-4 rounded-full border border-line-strong shrink-0" />}
                      <span className={'text-sm flex-1 ' + (s.done ? 'text-ink' : 'text-ink-muted')}>{s.label}</span>
                      {s.at && <span className="text-xs text-ink-faint">{fmtDate(s.at)}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* 4b — auto-chase reminders */}
              <div className="bg-white border border-line rounded-lg p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Auto-Chase Reminders</div>
                  <button
                    onClick={() => toggleRemindersPaused(!detail.remindersPaused)}
                    disabled={remindersBusy || detail.timeline === null}
                    className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ' + (detail.remindersPaused ? 'bg-ok/5 text-ok border-ok/20 hover:bg-ok/10' : 'bg-paper text-ink-soft border-line hover:text-warn hover:border-warn/30')}
                  >
                    {detail.remindersPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {detail.remindersPaused ? 'Resume reminders' : 'Pause reminders'}
                  </button>
                </div>
                <p className="text-sm text-ink-soft mb-3">
                  Emails at 3, 7, and 14 days after the course record is created, then weekly, until the course goes live. Stops instantly once live.
                </p>
                {detail.timeline === null ? (
                  <p className="text-xs text-ink-faint">No linked inquiry — reminders can&apos;t be tracked for this course.</p>
                ) : reminderEvents.length === 0 ? (
                  <p className="text-xs text-ink-faint">No reminders sent yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {reminderEvents.slice(0, 5).map((e, i) => (
                      <li key={i} className="text-xs text-ink-soft">Reminder sent {fmtDate(e.at)} · {String((e.data as { step?: string }).step ?? '')}</li>
                    ))}
                  </ul>
                )}
              </div>

              {setupMsg && (
                <div className={'text-sm font-medium px-4 py-2.5 rounded-md border ' + (setupMsg === 'error' ? 'bg-bad/5 text-bad border-bad/20' : 'bg-ok/5 text-ok border-ok/20')}>
                  {setupMsg === 'error' ? 'Error saving' : 'Settings saved'}
                </div>
              )}

              {/* 4c — full mirror of operator settings, same endpoint/whitelist the operator's own Settings page uses */}
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
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Min players</label>
                    <input
                      type="number"
                      value={Number(setupForm.minPlayers ?? 1)}
                      onChange={e => setSetupForm(f => ({ ...f, minPlayers: Number(e.target.value) }))}
                      className={iCls}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Max players</label>
                    <input
                      type="number"
                      value={Number(setupForm.maxPlayers ?? 4)}
                      onChange={e => setSetupForm(f => ({ ...f, maxPlayers: Number(e.target.value) }))}
                      className={iCls}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Public booking window (days)</label>
                    <input
                      type="number"
                      value={Number(setupForm.publicAdvanceDays ?? 7)}
                      onChange={e => setSetupForm(f => ({ ...f, publicAdvanceDays: Number(e.target.value) }))}
                      className={iCls}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Member booking window (days)</label>
                    <input
                      type="number"
                      value={Number(setupForm.memberAdvanceDays ?? 14)}
                      onChange={e => setSetupForm(f => ({ ...f, memberAdvanceDays: Number(e.target.value) }))}
                      className={iCls}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Rain check policy</label>
                  <input
                    value={String(setupForm.rainCheckPolicy ?? '')}
                    onChange={e => setSetupForm(f => ({ ...f, rainCheckPolicy: e.target.value }))}
                    className={iCls}
                  />
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
              </div>

              <div className="bg-white border border-line rounded-lg p-6 space-y-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Facilities & Amenities</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                  {([
                    ['hasDrivingRange', 'Driving range'],
                    ['hasPuttingGreen', 'Putting green'],
                    ['hasShortGameArea', 'Short game area'],
                    ['hasProShop', 'Pro shop'],
                    ['hasCartGirl', 'Beverage cart'],
                    ['hasLessons', 'Lessons'],
                    ['hasClubRental', 'Club rental'],
                    ['hasPushCartRental', 'Push cart rental'],
                    ['hasBagStorage', 'Bag storage'],
                    ['hasLockerRoom', 'Locker room'],
                    ['hasGpsCarts', 'GPS carts'],
                    ['hasTournaments', 'Hosts tournaments'],
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
              </div>

              <button
                onClick={saveSetup}
                disabled={setupSaving}
                className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors"
              >
                {setupSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
            );
          })()}

        </div>
      </div>

      {/* Send Preview confirm — lists both things being sent + recipient (RUN_QUEUE "Send Preview = one combined send") */}
      {showPreviewConfirm && detail?.course.operator && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-line rounded-lg p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-serif font-medium text-ink mb-2">Send preview + dashboard access?</h3>
            <p className="text-sm text-ink-soft mb-2">
              Sends ONE email to <strong>{detail.course.operator.name}</strong> at <strong>{detail.course.operator.email}</strong> containing:
            </p>
            <ul className="text-sm text-ink-soft list-disc pl-5 mb-4 space-y-1">
              <li>A link to preview their built course page</li>
              <li>Dashboard login access (a fresh temporary password)</li>
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setShowPreviewConfirm(false)} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">Cancel</button>
              <button
                onClick={() => { setShowPreviewConfirm(false); sendCoursePreview(); }}
                disabled={sendingPreview}
                className="flex-1 bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors"
              >
                {sendingPreview ? 'Sending…' : 'Send Preview'}
              </button>
            </div>
          </div>
        </div>
      )}

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
