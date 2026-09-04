'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LOGIN_SESSION_ENDED } from '@/lib/admin-fetch';
import Link from 'next/link';
import {
  ArrowLeft, Power, Globe, ArchiveX, ArchiveRestore, Mail, Phone,
  Calendar, Ban, Plus, X, RefreshCw, Search, MessageSquare, Send, Trash2, Eye, CheckCircle,
  FileText, Upload, StickyNote, AlertTriangle, MoreVertical, Pause, Play, Pencil,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { periodDelta, lastBookingLabel, type CourseHealthStatus } from '@/lib/course-metrics';

type TabName = 'overview' | 'money' | 'records' | 'messages' | 'operate' | 'setup';

// MP-5d: nine tabs became six. Transactions and Documents are named for what
// they hold (Money, Records) rather than the table they read. Tee Sheet and
// Schedule merged into Operate — one is the output of the other, and every
// mutation there now goes through the shared schedule service the operator's
// own dashboard calls. Staff died as a tab: its only action (resend login)
// sits on the Overview contact rail. Members is a read-only card on Operate.
const TABS: { key: TabName; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'money', label: 'Money' },
  { key: 'records', label: 'Records' },
  { key: 'messages', label: 'Messages' },
  { key: 'operate', label: 'Operate' },
  { key: 'setup', label: 'Setup' },
];

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
  // MP-5e: what the course told us vs what golfers see. Server-computed —
  // the setup sheet itself never crosses the wire.
  configDrift?: { field: string; label: string; sheet: string; live: string }[];
  approval: { status: 'none' | 'approved' | 'changes_requested'; approvedAt: string | null };
  health: { status: CourseHealthStatus; label: string; dot: 'ok' | 'bad' | 'warn' | 'neutral'; reason: string };
  openItems: { unreadMessages: number; openChanges: string[]; hasSchedule: boolean };
  timeline: TimelineEventDTO[] | null;
  remindersPaused: boolean;
  // ORPHAN SWEEP item 2 (FUTURE-PROOF) — null means no linked inquiry; the
  // origin card shows that loudly instead of pretending it doesn't matter.
  origin: { inquiryId: string; acceptedAt: string } | null;
  // AGREEMENT = GO-LIVE GATE (RUN_QUEUE)
  agreementAccepted: boolean;
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

interface ScheduleRow {
  id: string; daysOfWeek: number[]; startTime: string; endTime: string;
  intervalMinutes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number | null; memberRateWeekend: number | null;
  cartFee: number; walkingAllowed: boolean; active: boolean;
}

// What the schedule editor holds. Member rates are strings so an empty field
// can mean "no member rate" — the wire gets null, never 0.
interface ScheduleFormState {
  daysOfWeek: number[]; startTime: string; endTime: string; intervalMinutes: number;
  greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: string; memberRateWeekend: string;
  cartFee: number; walkingAllowed: boolean;
}
const EMPTY_SCHEDULE: ScheduleFormState = {
  daysOfWeek: [], startTime: '06:00', endTime: '18:00',
  intervalMinutes: 8, greenFeeWeekday: 65, greenFeeWeekend: 85,
  memberRateWeekday: '', memberRateWeekend: '', cartFee: 18, walkingAllowed: true,
};

// MP-5d: ONE set of fields for add and edit. Before this only "add" had a
// form; the PATCH endpoint existed with no UI caller.
function ScheduleFields({ value, onChange, showMemberRates }: {
  value: ScheduleFormState;
  onChange: (patch: Partial<ScheduleFormState>) => void;
  showMemberRates: boolean;
}) {
  const toggleDay = (d: number) => onChange({
    daysOfWeek: value.daysOfWeek.includes(d) ? value.daysOfWeek.filter(x => x !== d) : [...value.daysOfWeek, d],
  });
  return (
    <>
      <div>
        <label className="text-xs text-ink-muted block mb-1.5">Days <span className="text-ink-faint">(none = every day)</span></label>
        <div className="flex gap-1.5">
          {DAYS.map((day, i) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(i)}
              className={'flex-1 py-1.5 rounded-md text-xs font-medium border transition-colors ' + (value.daysOfWeek.includes(i) ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-muted border-line hover:border-pine/40 hover:text-ink')}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-ink-muted block mb-1">First tee</label>
          <input type="time" value={value.startTime} onChange={e => onChange({ startTime: e.target.value })} className={iCls} />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Last tee</label>
          <input type="time" value={value.endTime} onChange={e => onChange({ endTime: e.target.value })} className={iCls} />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Interval</label>
          <select value={value.intervalMinutes} onChange={e => onChange({ intervalMinutes: Number(e.target.value) })} className={iCls}>
            {[7, 8, 9, 10, 12, 15].map(v => <option key={v} value={v}>{v} min</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-ink-muted block mb-1">WD Green fee $</label>
          <input type="number" value={value.greenFeeWeekday} onChange={e => onChange({ greenFeeWeekday: Number(e.target.value) })} className={iCls} />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">WE Green fee $</label>
          <input type="number" value={value.greenFeeWeekend} onChange={e => onChange({ greenFeeWeekend: Number(e.target.value) })} className={iCls} />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Cart fee $</label>
          <input type="number" value={value.cartFee} onChange={e => onChange({ cartFee: Number(e.target.value) })} className={iCls} />
        </div>
      </div>
      {showMemberRates && (
        <div className="grid grid-cols-2 gap-3 bg-pine/5 border border-pine/20 rounded-md p-3">
          <div>
            <label className="text-xs font-medium text-pine block mb-1">Member rate WD $</label>
            <input type="number" value={value.memberRateWeekday} onChange={e => onChange({ memberRateWeekday: e.target.value })} className={iCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-pine block mb-1">Member rate WE $</label>
            <input type="number" value={value.memberRateWeekend} onChange={e => onChange({ memberRateWeekend: e.target.value })} className={iCls} />
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.walkingAllowed}
          onChange={e => onChange({ walkingAllowed: e.target.checked })}
          className="w-4 h-4 accent-pine rounded"
        />
        Walking allowed
      </label>
    </>
  );
}

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
    {
      key: 'agreement_accepted', label: 'Operator Agreement accepted', done: d.agreementAccepted,
      at: d.timeline?.find(e => e.type === 'agreement_accepted')?.at ?? null,
    },
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

  // Operate: schedules
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [newSchedule, setNewSchedule] = useState<ScheduleFormState>(EMPTY_SCHEDULE);
  const [showAddSched, setShowAddSched] = useState(false);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedMsg, setSchedMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editSched, setEditSched] = useState<{ id: string; form: ScheduleFormState } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Operate: tee sheet. MP-5d — every mutation reports pending + failure
  // inline; block/cancel used to swallow errors and manual booking alert()ed.
  const [tsDate, setTsDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [tsSlots, setTsSlots] = useState<TeeSlot[]>([]);
  const [tsLoading, setTsLoading] = useState(false);
  const [slotBusy, setSlotBusy] = useState<string | null>(null);
  const [opNote, setOpNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [manualSlot, setManualSlot] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ name: '', email: '', phone: '', players: 1 });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  // Money tab
  const [txItems, setTxItems] = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txPages, setTxPages] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txSearch, setTxSearch] = useState('');

  // Operate: members (read-only card)
  const [membersData, setMembersData] = useState<{ tiers: TierRow[]; members: MemberRow[] } | null>(null);
  const [membersError, setMembersError] = useState('');
  const [schedDeleteTarget, setSchedDeleteTarget] = useState<string | null>(null);
  const [schedDeleteBusy, setSchedDeleteBusy] = useState(false);
  const [schedDeleteError, setSchedDeleteError] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);

  // Resend staff login — lives on the Overview contact rail (the Staff tab's
  // one real action; MP-5d retired the tab).
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

  // A-05 item 2: header menu + preflight-aware live toggle
  const [dangerOpen, setDangerOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [liveToggleBusy, setLiveToggleBusy] = useState(false);
  // MP-5b: the server refuses to close a course over standing bookings unless
  // the caller has seen the count. The 409 carries the impact, so this prompt
  // never has to guess the numbers — or go and fetch them separately.
  const [closurePrompt, setClosurePrompt] = useState<{
    action: 'offline' | 'archive';
    impact: { bookings: number; players: number; golfers: number; nextDate: string | null; withMoney: number };
  } | null>(null);
  const [closureBusy, setClosureBusy] = useState(false);
  const [closureError, setClosureError] = useState('');
  const [liveBlockReason, setLiveBlockReason] = useState('');
  const [liveBlockMissing, setLiveBlockMissing] = useState<'agreement' | 'stripe' | null>(null);
  const [reminderNudgeBusy, setReminderNudgeBusy] = useState(false);
  const [reminderNudgeSent, setReminderNudgeSent] = useState(false);

  // A-05 item 5: Records tab (was Documents)
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

  // MP-5a: this swallowed every failure — no catch, no else. A 403 or a
  // dropped connection left membersData null, and the empty state then told
  // the reader to "click Load above", a button this tab has never had. The
  // documents loader right below always did this correctly; copy it.
  const loadMembers = useCallback(async () => {
    setMembersLoading(true); setMembersError('');
    try {
      const r = await fetch(`/api/admin/course-members?courseId=${courseId}`, { headers: H() });
      if (r.ok) setMembersData(await r.json());
      else {
        const e = await r.json().catch(() => ({}));
        setMembersError(e.error || (r.status === 403 ? 'Members require manager access.' : 'Could not load members.'));
      }
    } catch {
      setMembersError('Network error loading members. Check your connection.');
    }
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
      if (!r.ok) { router.push(LOGIN_SESSION_ENDED); return; }
      setAdminReady(true);
    }).catch(() => router.push(LOGIN_SESSION_ENDED));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadDetail();
  }, [adminReady, loadDetail]);

  // A-05 item 2 — preflight-aware: server enforces the SAME two absolute
  // checks (go-live-preflight.ts / course-timeline.ts) the inquiries
  // mark_live action does — Stripe + Operator Agreement, no override,
  // ever (STRIPE RULE FINAL / AGREEMENT = GO-LIVE GATE). A blocked "Set
  // live" surfaces the exact reason and a one-click reminder instead of
  // silently no-op'ing or offering a way around it.
  async function toggleActive(active: boolean, cancelBookings = false) {
    setLiveToggleBusy(true); setLiveBlockReason(''); setLiveBlockMissing(null); setClosureError('');
    const r = await fetch('/api/admin/course-detail', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, active, cancelBookings }),
    });
    setLiveToggleBusy(false);
    if (r.ok) {
      setClosurePrompt(null);
      const d = await r.json().catch(() => ({}));
      // Never let a bounced operator notice pass as a clean close.
      if (active === false && d.operatorNotified === false) {
        setLiveBlockReason('Course is offline, but the notice to the operator did not send — tell them yourself.');
      }
      setDetail(dd => dd ? { ...dd, course: { ...dd.course, active } } : dd);
      loadDetail();
      return;
    }
    const d = await r.json().catch(() => ({}));
    // MP-5b: golfers are holding tee times. Say how many, and make cancelling
    // them a decision rather than a side effect.
    if (r.status === 409 && d.needsBookingDecision && d.impact) {
      setClosurePrompt({ action: 'offline', impact: d.impact });
      return;
    }
    if (closurePrompt) { setClosureError(d.error || 'Failed to take the course offline.'); return; }
    setLiveBlockReason(d.error || 'Failed to update — try again.');
    setLiveBlockMissing(d.missing === 'agreement' || d.missing === 'stripe' ? d.missing : null);
  }

  async function sendGoLiveReminder(missing: 'agreement' | 'stripe') {
    setReminderNudgeBusy(true);
    const r = await fetch('/api/admin/send-golive-reminder', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId, missing }),
    });
    setReminderNudgeBusy(false);
    if (r.ok) setReminderNudgeSent(true);
  }

  // MP-0 review blocker B1 (no-silent-failures): this used to fire and forget
  // — no res.ok check, no catch, no pending state — and wrote the local state
  // regardless, so a 401/403/500 flipped the star and the menu label for a
  // write that never persisted, reverting on the next load with no
  // explanation. Mirrors toggleActive above: busy flag, real error surface,
  // local state only on success.

  // MP-5b: was a bare browser confirm that named no consequence, then an
  // alert() on failure. Archiving is now gated on the same booking decision as
  // taking a course offline.
  async function archiveCourse(cancelBookings = false) {
    if (!detail) return;
    setArchiveBusy(true); setClosureError('');
    const r = await fetch('/api/admin/archive-course', {
      method: 'POST', headers: H(), body: JSON.stringify({ courseId, action: 'archive', cancelBookings }),
    });
    setArchiveBusy(false);
    if (r.ok) { router.push('/admin/courses'); return; }
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.needsBookingDecision && d.impact) {
      setClosurePrompt({ action: 'archive', impact: d.impact });
      return;
    }
    if (closurePrompt) { setClosureError(d.error || 'Archive failed.'); return; }
    setClosureError('');
    setLiveBlockReason(d.error ? `Archive failed: ${d.error}` : 'Archive failed — try again.');
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

  // MP-5d: Operate loads all three of its panels at once. Transactions'
  // "View" jumps here with a date, so the date is a parameter.
  function openOperate(date = tsDate) {
    setTab('operate'); setTsDate(date); setOpNote(null);
    loadTeeSheet(date); loadSchedules(); loadMembers();
  }

  // '' in a member-rate field means "no member rate" — the wire wants null.
  function schedulePayload(f: ScheduleFormState) {
    return { ...f, memberRateWeekday: f.memberRateWeekday || null, memberRateWeekend: f.memberRateWeekend || null };
  }

  async function addSchedule() {
    if (newSchedule.startTime >= newSchedule.endTime) { setSchedMsg({ ok: false, text: 'Last tee must be after first tee.' }); return; }
    setSchedSaving(true); setSchedMsg(null);
    try {
      const r = await fetch('/api/admin/schedule', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId, ...schedulePayload(newSchedule) }),
      });
      if (r.ok) {
        setSchedMsg({ ok: true, text: 'Schedule saved — tee times generated for the next 8 days.' });
        setShowAddSched(false); setNewSchedule(EMPTY_SCHEDULE);
        loadSchedules(); loadTeeSheet(tsDate);
      } else {
        const e = await r.json().catch(() => ({}));
        setSchedMsg({ ok: false, text: e.error || 'Could not save the schedule — nothing was changed.' });
      }
    } catch {
      setSchedMsg({ ok: false, text: 'Network error — nothing was saved.' });
    }
    setSchedSaving(false);
  }

  function beginScheduleEdit(sch: ScheduleRow) {
    setEditError(''); setShowAddSched(false); setSchedMsg(null);
    setEditSched({
      id: sch.id,
      form: {
        daysOfWeek: sch.daysOfWeek, startTime: sch.startTime, endTime: sch.endTime,
        intervalMinutes: sch.intervalMinutes, greenFeeWeekday: sch.greenFeeWeekday, greenFeeWeekend: sch.greenFeeWeekend,
        memberRateWeekday: sch.memberRateWeekday != null ? String(sch.memberRateWeekday) : '',
        memberRateWeekend: sch.memberRateWeekend != null ? String(sch.memberRateWeekend) : '',
        cartFee: sch.cartFee, walkingAllowed: sch.walkingAllowed,
      },
    });
  }

  async function saveScheduleEdit() {
    if (!editSched) return;
    if (editSched.form.startTime >= editSched.form.endTime) { setEditError('Last tee must be after first tee.'); return; }
    setEditSaving(true); setEditError('');
    try {
      const r = await fetch('/api/admin/schedule', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ id: editSched.id, ...schedulePayload(editSched.form) }),
      });
      if (r.ok) {
        setEditSched(null);
        setSchedMsg({ ok: true, text: 'Schedule updated — open tee times were rebuilt to match. Booked times were left alone.' });
        loadSchedules(); loadTeeSheet(tsDate);
      } else {
        const e = await r.json().catch(() => ({}));
        setEditError(e.error || 'Could not save — nothing was changed.');
      }
    } catch {
      setEditError('Network error — nothing was changed.');
    }
    setEditSaving(false);
  }

  // MP-5a: fired straight off the trash icon with no confirm and no failure
  // path — a mis-click removed a course's entire bookable window, and a failed
  // delete looked exactly like a successful one.
  async function deleteSchedule(id: string) {
    setSchedDeleteBusy(true); setSchedDeleteError('');
    try {
      const r = await fetch('/api/admin/schedule', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setSchedDeleteError(e.error || 'Could not delete that schedule. Nothing was changed.');
        setSchedDeleteBusy(false);
        return;
      }
      setSchedDeleteTarget(null);
      loadSchedules();
      loadTeeSheet(tsDate);
    } catch {
      setSchedDeleteError('Network error — nothing was changed.');
    }
    setSchedDeleteBusy(false);
  }

  async function blockSlot(teeTimeId: string, block: boolean) {
    setSlotBusy(teeTimeId); setOpNote(null);
    try {
      const r = await fetch('/api/admin/tee-sheet', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ action: block ? 'block' : 'unblock', teeTimeId }),
      });
      if (r.ok) await loadTeeSheet(tsDate);
      else {
        const e = await r.json().catch(() => ({}));
        setOpNote({ ok: false, text: e.error || `Could not ${block ? 'block' : 'unblock'} that time — nothing was changed.` });
      }
    } catch {
      setOpNote({ ok: false, text: 'Network error — the tee sheet was not changed.' });
    }
    setSlotBusy(null);
  }

  async function cancelBooking(bookingId: string, teeTimeId: string) {
    if (!confirm('Cancel this booking? The golfer will be emailed.')) return;
    setSlotBusy(teeTimeId); setOpNote(null);
    try {
      const r = await fetch('/api/admin/tee-sheet', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ action: 'cancel_booking', bookingId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        await loadTeeSheet(tsDate);
        // The shared cancellation service applies the course's own late policy;
        // say so when it did, rather than letting a charge pass silently.
        setOpNote(d.feeCharged
          ? { ok: false, text: 'Booking cancelled. It was inside the course\'s cancellation window, so the late fee was charged to the golfer\'s card.' }
          : { ok: true, text: 'Booking cancelled — the golfer has been emailed.' });
      } else {
        setOpNote({ ok: false, text: d.error || 'Could not cancel that booking — nothing was changed.' });
      }
    } catch {
      setOpNote({ ok: false, text: 'Network error — the booking was not cancelled.' });
    }
    setSlotBusy(null);
  }

  async function addManualBooking() {
    if (!manualSlot) return;
    setManualSaving(true); setManualError('');
    try {
      const r = await fetch('/api/admin/tee-sheet', {
        method: 'POST', headers: H(), body: JSON.stringify({ teeTimeId: manualSlot, ...manualForm }),
      });
      if (r.ok) {
        setManualSlot(null);
        setManualForm({ name: '', email: '', phone: '', players: 1 });
        loadTeeSheet(tsDate);
      } else {
        const d = await r.json().catch(() => ({}));
        setManualError(d.error || 'Could not add the booking — nothing was changed.');
      }
    } catch {
      setManualError('Network error — nothing was booked.');
    }
    setManualSaving(false);
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
                onClick={() => {
                  // Going live is announced by the preflight; going offline is
                  // gated by the server's booking check, which supplies the
                  // real numbers instead of a confirm() guessing at them.
                  if (c.active) { setClosureError(''); toggleActive(false); }
                  else if (confirm(`Set "${c.name}" live? Golfers will be able to book immediately.`)) toggleActive(true);
                }}
                disabled={liveToggleBusy}
                className={'hidden min-[1200px]:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ' + (c.active ? 'bg-bad/5 text-bad border-bad/20 hover:bg-bad/10' : 'bg-ok/5 text-ok border-ok/20 hover:bg-ok/10')}
              >
                <Power className="w-3.5 h-3.5" />
                {liveToggleBusy ? 'Working…' : c.active ? 'Take offline' : 'Set live'}
              </button>
              <a
                href={'/courses/' + c.slug}
                target="_blank"
                className="hidden min-[1200px]:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-line text-ink-soft hover:text-pine hover:border-pine/30 hover:bg-pine/5 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />View page
              </a>
              <button
                onClick={loadDetail}
                className="hidden min-[1200px]:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-line text-ink-soft hover:text-ink hover:bg-paper transition-colors"
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
                    <div className="absolute right-0 top-10 z-20 bg-white border border-line rounded-lg shadow-lg w-64 py-1.5">
                      {/* Below ~1200px the header's action row cannot fit, so
                          Take offline / View page / Refresh live here instead.
                          Same handlers, same pending + disabled state —
                          relocated, not duplicated behaviour. */}
                      <div className="min-[1200px]:hidden">
                        <button
                          onClick={async () => {
                            if (!confirm(c.active ? `Take "${c.name}" offline? Golfers will no longer be able to book.` : `Set "${c.name}" live? Golfers will be able to book immediately.`)) { setDangerOpen(false); return; }
                            await toggleActive(!c.active);
                            setDangerOpen(false);
                          }}
                          disabled={liveToggleBusy}
                          className={'w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-paper transition-colors disabled:opacity-50 ' + (c.active ? 'text-bad' : 'text-ok')}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {liveToggleBusy ? 'Working…' : c.active ? 'Take offline' : 'Set live'}
                        </button>
                        <a
                          href={'/courses/' + c.slug}
                          target="_blank"
                          onClick={() => setDangerOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-soft hover:bg-paper transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5" />View page
                        </a>
                        <button
                          onClick={() => { setDangerOpen(false); loadDetail(); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-soft hover:bg-paper transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />Refresh
                        </button>
                        <div className="border-t border-line-soft my-1.5" />
                      </div>
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
                      {/* DELETION DOCTRINE (RUN_QUEUE) — anything that ever
                          became a course is archive-only, never permanently
                          deleted, from here or the API. No delete button. */}
                      <div className="border-t border-line-soft my-1.5" />
                      <p className="px-3 py-2 text-[11px] text-ink-faint leading-relaxed">
                        Courses are archived, never deleted — booking and payment history is retained.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* AGREEMENT = GO-LIVE GATE / STRIPE RULE FINAL (RUN_QUEUE) — two
              absolutes, no override, ever. A blocked go-live gets a one-click
              reminder nudge instead of a way around it. */}
          {liveBlockReason && (
            <div className="mt-3 rounded-md px-4 py-2.5 bg-bad/5 border border-bad/20 flex items-center justify-between gap-3">
              <p className="text-xs text-bad">{liveBlockReason}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setLiveBlockReason(''); setLiveBlockMissing(null); setReminderNudgeSent(false); }} className="text-xs text-ink-muted hover:text-ink transition-colors">Dismiss</button>
                {liveBlockMissing && (
                  <button
                    onClick={() => sendGoLiveReminder(liveBlockMissing)}
                    disabled={reminderNudgeBusy || reminderNudgeSent}
                    className="text-xs font-medium px-3 py-1 rounded-md bg-bad text-white hover:bg-bad/90 transition-colors disabled:opacity-50"
                  >
                    {reminderNudgeBusy ? 'Sending…' : reminderNudgeSent ? 'Sent' : 'Send reminder'}
                  </button>
                )}
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
            <div className="flex gap-0.5 bg-paper border border-line rounded-lg p-1 shrink-0">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    if (t.key === 'operate') { openOperate(); return; }
                    setTab(t.key);
                    if (t.key === 'money') loadTransactions(1, '', '', '');
                    if (t.key === 'records') loadDocuments();
                    if (t.key === 'messages') loadCourseThread();
                  }}
                  className={'px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap ' + (tab === t.key ? 'bg-white text-ink border border-line shadow-sm' : 'text-ink-muted hover:text-ink')}
                >
                  {t.label}
                  {t.key === 'messages' && detail.openItems.unreadMessages > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-bad text-white text-[10px] font-medium">{detail.openItems.unreadMessages}</span>
                  )}
                </button>
              ))}
            </div>
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
            const lastLabel = lastBookingLabel(detail.lastBookingAt);
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

                {/* MP-5e: the intake typo that survives to production. An
                    inquiry saying "Mahwah, AL" and a live course saying
                    "MAHWAH, NJ" both sit in the database one screen apart, and
                    nothing had ever put them side by side. Read-only on
                    purpose: a drift can mean an admin fixed a typo after
                    building (the sheet is stale) or that the build got it
                    wrong, and only a human knows which. */}
                {detail.configDrift && detail.configDrift.length > 0 && (
                  <div className="bg-white border border-warn/30 rounded-lg p-5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-warn">
                        Setup sheet disagrees with the live course
                      </div>
                      <span className="text-[11px] text-ink-faint">
                        {detail.configDrift.length} field{detail.configDrift.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-sm text-ink-soft mb-3">
                      Neither side is assumed correct — this only shows that they differ.
                    </p>
                    <div className="border border-line rounded-md divide-y divide-line">
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-3 py-2 bg-paper">
                        <span className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Field</span>
                        <span className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">They told us</span>
                        <span className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Golfers see</span>
                      </div>
                      {detail.configDrift.map(d2 => (
                        <div key={d2.field} className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-3 py-2">
                          <span className="text-xs text-ink-muted truncate">{d2.label}</span>
                          <span className="text-xs text-ink-soft break-words">{d2.sheet}</span>
                          <span className="text-xs text-ink font-medium break-words">{d2.live}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <button onClick={() => setTab('setup')} className="text-xs font-medium text-pine hover:text-pine-hover transition-colors">
                        Fix on Setup
                      </button>
                      {detail.origin && (
                        <a href={`/admin/inquiries/${detail.origin.inquiryId}`}
                          className="text-xs text-ink-muted hover:text-ink transition-colors">
                          Open their sheet
                        </a>
                      )}
                    </div>
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
                {/* ORPHAN SWEEP item 2 (FUTURE-PROOF) — origin card. A broken
                    link says so loudly instead of pretending it's fine. */}
                <div className={'bg-white border rounded-lg p-5 ' + (detail.origin ? 'border-line' : 'border-bad/30 bg-bad/5')}>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Origin</div>
                  {detail.origin ? (
                    <Link href={'/admin/inquiries/' + detail.origin.inquiryId} className="text-sm text-pine hover:underline">
                      From inquiry · accepted {fmtDate(detail.origin.acceptedAt)}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-bad font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />No linked inquiry — origin record missing
                    </div>
                  )}
                </div>
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
                    <div className="flex gap-3 flex-wrap">
                      {c.operator.emailVerified
                        ? <StatusDot status="ok" label="Email verified" />
                        : <StatusDot status="bad" label="Email not verified" />}
                      {c.stripeAccountActive
                        ? <StatusDot status="ok" label="Stripe connected" />
                        : <StatusDot status="warn" label="No Stripe" />}
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

                {/* MP-5d: the Staff tab's one real action — resend a login —
                    lives here now. Everything else that tab showed is on
                    this rail already. */}
                {detail.staff.length > 0 && (
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Staff Contacts</div>
                    <div className="space-y-3">
                      {detail.staff.map(s => (
                        <div key={s.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-sm shrink-0">{s.name[0]}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-ink truncate">
                              {s.name} <span className="text-xs text-ink-muted font-normal">· {s.role}{s.active ? '' : ' · inactive'}</span>
                            </div>
                            <a href={'mailto:' + s.email} className="text-xs text-pine hover:underline truncate block">{s.email}</a>
                          </div>
                          <button
                            onClick={() => resendSetup(s.id, s.name)}
                            disabled={resendingId === s.id}
                            title="Email this person a fresh dashboard login"
                            className="shrink-0 text-[11px] font-medium text-pine hover:text-pine-hover px-2 py-1 rounded-md border border-pine/20 hover:bg-pine/5 transition-colors disabled:opacity-50"
                          >
                            {resendingId === s.id ? 'Sending…' : 'Resend login'}
                          </button>
                        </div>
                      ))}
                    </div>
                    {resendMsg && (
                      <p className={'text-xs mt-3 ' + (resendMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{resendMsg}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* MONEY (was Transactions) */}
          {tab === 'money' && (
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
                                onClick={() => openOperate(tx.date)}
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

          {/* RECORDS (was Documents) — A-05 item 5 */}
          {tab === 'records' && (
            <div className="max-w-3xl space-y-5">
              {docsError && (
                <div className="text-sm font-medium px-4 py-2.5 rounded-md border bg-bad/5 text-bad border-bad/20">{docsError}</div>
              )}
              {docsLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading...</div>}
              {!docsLoading && docsData && (
                <>
                  <div className="bg-white border border-line rounded-lg p-6">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">Auto Records</div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-soft">Operator Agreement (v{docsData.agreementVersion})</span>
                        {docsData.agreement ? (
                          <span className="text-ink font-medium">Accepted {fmtDate(docsData.agreement.at)} · {docsData.agreement.acceptedBy}</span>
                        ) : c.active ? (
                          // AGREEMENT = GO-LIVE GATE item 3 — a LIVE course with
                          // no acceptance predates the clickwrap. Flagged amber
                          // until the operator accepts, never yanked offline.
                          <span className="text-warn font-medium">Not accepted — legacy</span>
                        ) : (
                          <span className="text-ink-faint">Not yet accepted</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-soft">Stripe connected-account agreement</span>
                        <span className="text-ink font-medium">{docsData.stripeAgreementDate ? fmtDate(docsData.stripeAgreementDate) : 'Not connected'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-soft">Go-live page approval</span>
                        <span className="text-ink font-medium">{docsData.approval.approvedAt ? `Approved ${fmtDate(docsData.approval.approvedAt)}` : 'Not yet approved'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-soft">Booking terms in force</span>
                        <span className="text-ink font-medium">v{docsData.bookingTermsVersion}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-line rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Uploaded Documents</div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5" />{docUploading ? 'Uploading…' : 'Upload PDF'}
                        <input
                          type="file" accept="application/pdf" className="hidden" disabled={docUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f); e.target.value = ''; }}
                        />
                      </label>
                    </div>
                    {docsData.documents.length === 0 ? (
                      <p className="text-sm text-ink-muted">No documents uploaded yet.</p>
                    ) : (
                      <div className="divide-y divide-line-soft">
                        {docsData.documents.map((doc, i) => (
                          // MP-5a: contracts are private blobs now — served
                          // through the authenticated route, never by raw URL.
                          <a key={i} href={`/api/admin/course-documents/download?courseId=${courseId}&url=${encodeURIComponent(doc.url)}`}
                            target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 text-sm hover:text-pine transition-colors">
                            <FileText className="w-4 h-4 text-ink-muted shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-ink">{doc.name}</span>
                            <span className="text-xs text-ink-faint shrink-0">{fmtDate(doc.at)} · {doc.by}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-line rounded-lg p-6">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-4">Client Notes</div>
                    <div className="flex gap-2 mb-4">
                      <input
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addClientNote(); }}
                        placeholder="Add a note for the team..."
                        className={iCls}
                      />
                      <button
                        onClick={addClientNote}
                        disabled={noteSaving || !noteDraft.trim()}
                        className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors"
                      >
                        <StickyNote className="w-3.5 h-3.5" />Add
                      </button>
                    </div>
                    {docsData.notes.length === 0 ? (
                      <p className="text-sm text-ink-muted">No notes yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {docsData.notes.map((n, i) => (
                          <div key={i} className="text-sm">
                            <p className="text-ink">{n.text}</p>
                            <p className="text-xs text-ink-faint mt-0.5">{n.by} · {fmtDate(n.at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-ink-faint px-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    E-signature workflow — planned, not yet built.
                  </div>
                </>
              )}
            </div>
          )}

          {/* OPERATE — MP-5d: Tee Sheet + Schedule merged. The sheet is the
              output of the schedules, so they belong on one screen, and every
              mutation here goes through lib/schedule-service — the same code
              the operator's own dashboard now calls. Members is a read-only
              card at the bottom: the admin never had a write on it. */}
          {tab === 'operate' && (
            <div className="max-w-3xl space-y-6">

              {/* Tee sheet */}
              <div>
                <div className="flex items-center gap-3 mb-4">
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

                {opNote && (
                  <div className={'mb-3 text-sm font-medium px-4 py-2.5 rounded-md border flex items-center justify-between gap-3 ' + (opNote.ok ? 'bg-ok/5 text-ok border-ok/20' : 'bg-bad/5 text-bad border-bad/20')}>
                    <span>{opNote.text}</span>
                    <button onClick={() => setOpNote(null)} className="text-ink-muted hover:text-ink transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {tsLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading tee sheet...</div>}
                {!tsLoading && tsSlots.length === 0 && (
                  <div className="text-center text-ink-muted py-12 text-sm bg-white border border-line rounded-lg">
                    {schedules.length === 0
                      ? 'No tee times for this date — this course has no schedule yet. Add one below.'
                      : 'No tee times for this date'}
                  </div>
                )}

                <div className="space-y-2">
                  {tsSlots.map(slot => {
                    const busy = slotBusy === slot.id;
                    return (
                    <div
                      key={slot.id}
                      className={'rounded-md border overflow-hidden ' + (slot.status === 'blocked' ? 'border-bad/20 bg-bad/5' : slot.bookings.length > 0 ? 'border-ok/20 bg-ok/5' : 'border-line bg-white') + (busy ? ' opacity-60' : '')}
                    >
                      <div className="px-4 py-3 flex items-center gap-3">
                        <span className="font-mono font-medium text-ink text-sm w-14 shrink-0">{slot.time}</span>
                        <span className="text-xs text-ink-muted">{slot.holes}h · ${slot.greenFee}</span>
                        <span className={'text-xs px-2 py-0.5 rounded font-medium ' + (slot.status === 'blocked' ? 'bg-bad/10 text-bad' : slot.bookings.length > 0 ? 'bg-ok/10 text-ok' : 'bg-paper text-ink-muted border border-line')}>
                          {slot.status === 'blocked' ? 'Blocked' : slot.bookings.length > 0 ? `${slot.bookings.length} booked` : `${slot.playersAvailable} open`}
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => { setManualError(''); setManualSlot(slot.id); }}
                            disabled={busy || slot.status === 'blocked'}
                            className="text-xs px-2.5 py-1 bg-pine hover:bg-pine-hover text-white rounded-md flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />Add
                          </button>
                          <button
                            onClick={() => blockSlot(slot.id, slot.status !== 'blocked')}
                            disabled={busy}
                            className={'text-xs px-2.5 py-1 rounded-md flex items-center gap-1 border transition-colors disabled:opacity-50 ' + (slot.status === 'blocked' ? 'border-ok/20 text-ok bg-ok/5 hover:bg-ok/10' : 'border-bad/20 text-bad bg-bad/5 hover:bg-bad/10')}
                          >
                            <Ban className="w-3 h-3" />{busy ? 'Working…' : slot.status === 'blocked' ? 'Unblock' : 'Block'}
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
                                  onClick={() => cancelBooking(b.id, slot.id)}
                                  disabled={busy}
                                  className="text-xs text-bad hover:text-bad/80 px-2 py-0.5 border border-bad/20 rounded-md hover:bg-bad/5 transition-colors disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Schedules — with EDIT. The PATCH endpoint had existed with no
                  UI caller, so fixing a fee typo meant delete + recreate, which
                  rebuilt the whole sheet. */}
              <div className="bg-white border border-line rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Tee Time Schedules</div>
                  {!showAddSched && !editSched && (
                    <button
                      onClick={() => { setSchedMsg(null); setShowAddSched(true); }}
                      className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />Add schedule
                    </button>
                  )}
                </div>

                {schedMsg && (
                  <div className={'text-sm font-medium px-4 py-2.5 rounded-md border flex items-center justify-between gap-3 ' + (schedMsg.ok ? 'bg-ok/5 text-ok border-ok/20' : 'bg-bad/5 text-bad border-bad/20')}>
                    <span>{schedMsg.text}</span>
                    <button onClick={() => setSchedMsg(null)} className="text-ink-muted hover:text-ink transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {schedules.length > 0 ? (
                  <div className="space-y-2">
                    {schedules.map(s => editSched?.id === s.id ? (
                      <div key={s.id} className="bg-paper border border-pine/30 rounded-md p-4 space-y-3">
                        <div className="text-[11px] uppercase tracking-[0.06em] text-pine">Editing schedule</div>
                        <ScheduleFields
                          value={editSched.form}
                          onChange={p => setEditSched(e => e ? { ...e, form: { ...e.form, ...p } } : e)}
                          showMemberRates={!!setupForm.hasMemberPricing}
                        />
                        {editError && <p className="text-xs text-bad">{editError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditSched(null); setEditError(''); }}
                            className="flex-1 border border-line text-ink-soft py-2 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveScheduleEdit}
                            disabled={editSaving}
                            className="flex-1 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white py-2 rounded-md text-[12.5px] font-medium transition-colors"
                          >
                            {editSaving ? 'Saving…' : 'Save & rebuild tee sheet'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={s.id} className={'flex items-center justify-between bg-paper border border-line rounded-md px-4 py-3' + (s.active ? '' : ' opacity-60')}>
                        <div className="min-w-0">
                          <div className="font-medium text-ink text-sm flex items-center gap-2 flex-wrap">
                            <span>{s.daysOfWeek.length === 0 ? 'Every day' : s.daysOfWeek.map(d => DAYS[d]).join(', ')} · {s.startTime}–{s.endTime} every {s.intervalMinutes}min</span>
                            {!s.active && <StatusDot status="neutral" label="Paused by course" />}
                          </div>
                          <div className="text-ink-muted text-xs mt-0.5">
                            WD ${s.greenFeeWeekday} / WE ${s.greenFeeWeekend} · Cart ${s.cartFee}
                            {s.memberRateWeekday != null && ` · Member $${s.memberRateWeekday}`}
                            {s.walkingAllowed ? ' · Walking' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => beginScheduleEdit(s)}
                            disabled={!!editSched}
                            title="Edit schedule"
                            className="text-ink-muted hover:text-pine transition-colors p-1.5 rounded-md hover:bg-pine/5 disabled:opacity-40"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setSchedDeleteError(''); setSchedDeleteTarget(s.id); }}
                            title="Delete schedule"
                            className="text-ink-muted hover:text-bad transition-colors p-1.5 rounded-md hover:bg-bad/5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted bg-paper rounded-md p-4 border border-line">
                    No schedule yet — add one to make this course bookable.
                  </p>
                )}

                {showAddSched && (
                  <div className="border-t border-line pt-4 space-y-3">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Add Schedule</div>
                    <ScheduleFields
                      value={newSchedule}
                      onChange={p => setNewSchedule(s => ({ ...s, ...p }))}
                      showMemberRates={!!setupForm.hasMemberPricing}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddSched(false)}
                        className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addSchedule}
                        disabled={schedSaving}
                        className="flex-1 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white py-2.5 rounded-md text-[12.5px] font-medium transition-colors"
                      >
                        {schedSaving ? 'Saving...' : 'Save Schedule & Generate Tee Times'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Members — read-only. The course runs its own programme from
                  the dashboard; this is a window onto it, not a control. */}
              <div className="bg-white border border-line rounded-lg p-6">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Members</div>
                  <span className="text-[11px] text-ink-faint">Read-only — the course manages this</span>
                </div>
                {membersLoading && <div className="text-center text-ink-muted py-8 text-sm">Loading...</div>}
                {!membersLoading && membersError && (
                  <div className="rounded-md border border-bad/20 bg-bad/5 px-4 py-4 text-center mt-3">
                    <p className="text-sm text-bad mb-2">{membersError}</p>
                    <button onClick={() => loadMembers()} className="text-xs font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">Retry</button>
                  </div>
                )}
                {!membersLoading && !membersError && membersData && (
                  membersData.tiers.length === 0 && membersData.members.length === 0 ? (
                    <p className="text-sm text-ink-muted mt-2">No membership programme set up.</p>
                  ) : (
                    <div className="space-y-4 mt-3">
                      {membersData.tiers.length > 0 && (
                        <div className="border border-line rounded-md divide-y divide-line-soft">
                          {membersData.tiers.map(t => (
                            <div key={t.id} className="flex items-center gap-4 px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-ink text-sm">{t.name}</div>
                                <div className="text-xs text-ink-muted">{t.memberCount} active member{t.memberCount !== 1 ? 's' : ''} · ${t.annualFee}/yr</div>
                              </div>
                              <StatusDot status={t.active ? 'ok' : 'neutral'} label={t.active ? 'Active' : 'Inactive'} />
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">
                          {membersData.members.length} member{membersData.members.length === 1 ? '' : 's'}
                        </div>
                        {membersData.members.length === 0 ? (
                          <p className="text-sm text-ink-muted">No members yet.</p>
                        ) : (
                          <div className="border border-line rounded-md divide-y divide-line-soft">
                            {membersData.members.map(m => {
                              const name = m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}` : (m.inviteName || '—');
                              const email = m.golfer?.email || m.inviteEmail || '';
                              return (
                                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                                  <div className="w-7 h-7 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-xs shrink-0">{name[0] || '?'}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-ink text-sm truncate">{name}</div>
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
                  )
                )}
              </div>
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
                  {steps.map(s => {
                    // AGREEMENT = GO-LIVE GATE item 3 — a live course missing
                    // acceptance is a legacy gap, not normal in-progress work.
                    const legacyGap = s.key === 'agreement_accepted' && !s.done && c.active;
                    return (
                      <div key={s.key} className="flex items-center gap-3">
                        {s.done
                          ? <CheckCircle className="w-4 h-4 text-ok shrink-0" />
                          : <span className={'w-4 h-4 rounded-full border shrink-0 ' + (legacyGap ? 'border-warn bg-warn/10' : 'border-line-strong')} />}
                        <span className={'text-sm flex-1 ' + (s.done ? 'text-ink' : legacyGap ? 'text-warn font-medium' : 'text-ink-muted')}>
                          {s.label}{legacyGap ? ' — legacy' : ''}
                        </span>
                        {s.at && <span className="text-xs text-ink-faint">{fmtDate(s.at)}</span>}
                      </div>
                    );
                  })}
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

      {/* MP-5b: the consequence, in numbers, before anything happens. This
          only ever appears because the SERVER refused to close a course over
          standing bookings — the counts are its, not a guess made here. */}
      {closurePrompt && (() => {
        const { action, impact } = closurePrompt;
        const verb = action === 'archive' ? 'Archive' : 'Take offline';
        const busy = action === 'archive' ? archiveBusy : liveToggleBusy;
        const plural = impact.bookings === 1 ? '' : 's';
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-line rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h3 className="font-serif font-medium text-ink mb-2">
                {impact.bookings} golfer booking{plural} {impact.bookings === 1 ? 'is' : 'are'} still standing
              </h3>
              <p className="text-sm text-ink-soft mb-3">
                {verb === 'Archive' ? 'Archiving' : 'Taking'} <strong>{detail?.course.name}</strong>
                {verb === 'Archive' ? '' : ' offline'} removes it from the public site. These rounds would be left
                booked at a course golfers can no longer see.
              </p>
              <div className="bg-paper border border-line rounded-md px-4 py-3 mb-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-ink-muted">Bookings</span><span className="text-ink font-medium">{impact.bookings}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="text-ink font-medium">{impact.players}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Golfers to email</span><span className="text-ink font-medium">{impact.golfers}</span></div>
                {impact.nextDate && (
                  <div className="flex justify-between"><span className="text-ink-muted">Soonest</span><span className="text-ink font-medium">{impact.nextDate}</span></div>
                )}
                {impact.withMoney > 0 && (
                  <div className="flex justify-between"><span className="text-warn">Already took money</span><span className="text-warn font-medium">{impact.withMoney}</span></div>
                )}
              </div>
              <p className="text-xs text-ink-muted mb-1">
                Continuing cancels {impact.bookings === 1 ? 'it' : 'them all'} and emails {impact.golfers === 1 ? 'the golfer' : 'each golfer'} to explain why.
                {impact.withMoney > 0 && ' Anything already charged is refunded.'}
              </p>
              <p className="text-xs text-ink-muted mb-4">
                Golfers watching for an opening at these times are deliberately NOT told — the course is closing, not freeing up.
              </p>
              {closureError && <p className="text-xs text-bad mb-3">{closureError}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setClosurePrompt(null); setClosureError(''); }}
                  className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">
                  Leave it live
                </button>
                <button
                  onClick={() => { if (action === 'archive') archiveCourse(true); else toggleActive(false, true); }}
                  disabled={busy}
                  className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Working…' : `Cancel ${impact.bookings} & ${verb.toLowerCase()}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MP-5a: deleting a schedule now says what it costs, and the rebuild it
          triggers is described honestly — unsold slots go, sold ones stay. */}
      {schedDeleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-line rounded-lg p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-serif font-medium text-ink mb-2">Delete this schedule?</h3>
            <p className="text-sm text-ink-soft mb-2">
              The tee sheet is rebuilt straight away, so the times this schedule was creating stop being bookable.
            </p>
            <p className="text-sm text-ink-soft mb-4">
              Tee times that are already booked or blocked are kept — golfers who have paid keep their slot.
            </p>
            {schedDeleteError && (
              <p className="text-xs text-bad mb-3">{schedDeleteError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setSchedDeleteTarget(null); setSchedDeleteError(''); }}
                className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteSchedule(schedDeleteTarget)}
                disabled={schedDeleteBusy}
                className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors"
              >
                {schedDeleteBusy ? 'Deleting…' : 'Delete schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            {manualError && <p className="text-xs text-bad mt-3">{manualError}</p>}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setManualSlot(null)}
                className="flex-1 px-4 py-2.5 border border-line rounded-md text-[12.5px] font-medium text-ink-muted hover:text-ink hover:border-line-strong transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addManualBooking}
                disabled={manualSaving}
                className="flex-1 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white rounded-md text-[12.5px] font-medium transition-colors"
              >
                {manualSaving ? 'Adding…' : 'Add Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
