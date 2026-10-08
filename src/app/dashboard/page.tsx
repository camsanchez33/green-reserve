'use client';
import { CARD } from '@/components/ui/Card';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { todayIn, clockIn, DEFAULT_TZ } from '@/lib/course-time';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, X, Loader2,
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import OperatorSidebar from '@/components/OperatorSidebar';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import GettingStartedChecklist from '@/components/dashboard/GettingStartedChecklist';
import { getBookingStatus, statusDot } from '@/lib/booking-status';
import { StatusDot } from '@/components/ui/StatusDot';
import MoveGroupModal from '@/components/dashboard/MoveGroupModal';
import { cancelConfirmText, cancelResultText } from '@/lib/cancel-confirm';
import TeeSheetBoard, { type BoardGroup } from '@/components/dashboard/TeeSheetBoard';
import GolferMessageModal from '@/components/dashboard/GolferMessageModal';
import { CHANGE_CATEGORIES } from '@/lib/change-requests';
import { formatTeeDay as fmtDate, formatTeeTime as fmtTime } from '@/lib/format';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

/* ─── Types ────────────────────────────────────────────────────────────── */
type TeeTime = {
  id: string; date: string; time: string; holes: number;
  /** L2: the bookable product this slot sells (null on a simple course). */
  product?: { label: string } | null;
  playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; walkingAllowed: boolean;
  status: string; bookings?: Booking[];
};
type Booking = {
  id: string; golferName: string; golferEmail: string; players: number; createdAt: string;
  status: string; paymentStatus: string; totalAmount: number; accessFeeTotal?: number;
  // SD-4: set by a failed check-in charge; cleared when a charge goes through.
  checkInFailReason?: string;
  // SD-5 lifecycle
  golferPhone?: string;
  source?: string;
  noShowAt?: string | null;
  paidOffline?: boolean;
  checkedInPlayers?: number | null;
  /** The late fee this booking carries (cents) — the cancel confirm says what it costs. */
  cancellationFeeTotal?: number;
  /** SP-B: false when the golfer booked without a card (pay-link course). */
  hasCard?: boolean;
  /** PAY-1: a textable number is on file (sent even to logins that can't see it). */
  hasPhone?: boolean;
};
/* ─── Helpers ──────────────────────────────────────────────────────────── */
// SD-3: "today" is the COURSE's today (see courseTz inside the component) —
// this module-level fallback only seeds state before the course has loaded.
const todayFallback = () => todayIn(DEFAULT_TZ);
const addDays = (d: string, n: number) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; };

// FLOW-1: the demo's status column — "Checked in", "2 left", "Full",
// "4 spots open", or a muted italic "Blocked".
function slotStatus(tt: TeeTime) {
  if (tt.status === 'blocked') return <span className="italic text-ink-muted">Blocked</span>;
  const bs = tt.bookings ?? [];
  if (bs.length === 0 && (tt.playersBooked ?? 0) === 0) return <span className="text-ink-muted">{tt.playersAvailable} spots open</span>;
  if (bs.length > 0 && bs.every(b => b.status === 'completed')) {
    return <span className="inline-flex items-center gap-1.5 font-semibold text-pine"><span className="w-1.5 h-1.5 rounded-full bg-ok"/>Checked in</span>;
  }
  return slotBadge(tt);
}
function slotBadge(tt: TeeTime) {
  if (tt.status === 'blocked') return <span className="text-xs text-ink-muted">Blocked</span>;
  const booked = tt.playersBooked ?? 0;
  const avail  = tt.playersAvailable - booked;
  if (avail === 0) return <span className="text-xs font-medium text-bad">Full</span>;
  if (booked > 0)  return <span className="text-xs font-medium text-warn">{avail} left</span>;
  return <span className="text-xs font-medium text-ok">{avail} open</span>;
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // AN-1: Analytics is its own page now; an old ?tab=analytics link goes there.
  const tab = 'teesheet' as const;
  // SD-3: the course's timezone drives "today" and "now" on this page.
  const [courseTz, setCourseTz] = useState(DEFAULT_TZ);
  const today = () => todayIn(courseTz);
  const [selectedDate, setSelectedDate] = useState(todayFallback());
  const [teeTimes, setTeeTimes]   = useState<TeeTime[]>([]);
  const [loading, setLoading]     = useState(true);
  const [courseName, setCourseName] = useState('');
  const [courseArchived, setCourseArchived] = useState(false);
  const [courseDraft, setCourseDraft] = useState(false);
  const [pageApprovalStatus, setPageApprovalStatus] = useState<'none' | 'approved' | 'changes_requested'>('none');
  const [approvingPage, setApprovingPage] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [changesChecked, setChangesChecked] = useState<Set<string>>(new Set());
  const [changesDetails, setChangesDetails] = useState<Record<string, string>>({});
  const [sendingChanges, setSendingChanges] = useState(false);
  const [changesError, setChangesError] = useState('');
  const [changesConfirmMsg, setChangesConfirmMsg] = useState('');
  const [showAddModal, setShowAddModal]       = useState(false);
  // MSG-1: the message-the-day's-golfers dialog.
  const [messageOpen, setMessageOpen] = useState(false);
  // ACT-1: the group being moved to another time.
  const [moveTarget, setMoveTarget] = useState<{ booking: { id: string; golferName: string; players: number; emailable: boolean; checkedIn: boolean }; fromTeeTimeId: string; toTeeTimeId?: string } | null>(null);
  // SHEET-2 (Cam 2026-10-08: "is it smart to have both" — no: one sheet). The
  // board is the tee sheet; tapping a square opens this panel.
  const [panelId, setPanelId] = useState<string | null>(null);
  const [showConditions, setShowConditions]   = useState(false);
  const [conditions, setConditions]       = useState('');
  const [conditionsInput, setConditionsInput] = useState('');
  const [savingConditions, setSavingConditions] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  // B-8: late groups the counter has said are "still coming" — hidden from the
  // attention row for this page load only; nothing is written anywhere.
  const [stillComing, setStillComing] = useState<Set<string>>(new Set());
  // SD-5: the walk-in form is opened on a slot; row actions carry their own busy id.
  // B-9 frost delay: pick the new first tee time, preview the moves, confirm.
  type FrostPlan = { moves: { bookingId: string; name: string; players: number; fromTime: string; toTime: string }[]; unplaced: { bookingId: string; name: string; players: number; time: string }[]; blockTeeTimeIds: string[] };
  const [statusError, setStatusError] = useState(false);
  const [frostOpen, setFrostOpen] = useState(false);
  const [frostTime, setFrostTime] = useState('09:00');
  const [frostPlan, setFrostPlan] = useState<FrostPlan | null>(null);
  const [frostBusy, setFrostBusy] = useState(false);
  const [frostErr, setFrostErr] = useState('');
  // Review (admin-UX): after applying, anyone staff must call stays on screen
  // (didn't fit, no email on file, email failed) until they close it.
  type FrostCall = { name: string; players: number; why: string };
  const [frostResult, setFrostResult] = useState<{ moved: number; blocked: number; calls: FrostCall[] } | null>(null);
  // WX-1 weather: one button, two choices — call off play (whole day or a
  // window) or delay the start (the B-9 frost delay above).
  type WxGroup = { bookingId: string; name: string; players: number; time: string; noEmail: boolean };
  type WxPlan = { from: string; to: string; wholeDay: boolean; startedBefore: string | null; groups: WxGroup[]; teeTimeIds: string[] };
  // SP-A: what this login may do on the sheet (owners: everything).
  const access = useDashboardAccess();
  const wxTabs = ([['cancel', 'Cancel times'], ['delay', 'Delay start']] as const).filter(([k]) => access.can(k === 'cancel' ? 'sheet.weather_cancel' : 'sheet.delay_start'));
  const [wxMode, setWxMode] = useState<'cancel' | 'delay'>('cancel');
  const [wxWhole, setWxWhole] = useState(true);
  const [wxFrom, setWxFrom] = useState('13:00');
  const [wxTo, setWxTo] = useState('');
  const [wxReason, setWxReason] = useState('');
  const [wxPlan, setWxPlan] = useState<WxPlan | null>(null);
  const [wxBusy, setWxBusy] = useState(false);
  const [wxErr, setWxErr] = useState('');
  const [wxResult, setWxResult] = useState<{ cancelled: number; blocked: number; feeRefundsFailed: number; calls: FrostCall[] } | null>(null);
  const [walkInSlot, setWalkInSlot] = useState<TeeTime | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [cardModalBooking, setCardModalBooking] = useState<Booking | null>(null);
  const [cardModalReason, setCardModalReason] = useState('');
  // SD-10: failure is never emptiness, and no button stays stuck.
  const [sheetError, setSheetError] = useState('');
  const [slotBusy, setSlotBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [emailVerified, setEmailVerified] = useState(true);
  const [onboardingStepNum, setOnboardingStepNum] = useState(3);
  const [stripeAccountActive, setStripeAccountActive] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  // AGREEMENT = GO-LIVE GATE (RUN_QUEUE)
  const [agreementAccepted, setAgreementAccepted] = useState(true); // assume yes until loaded — never flash a false "not accepted" prompt
  const [acceptingAgreement, setAcceptingAgreement] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  // AG-2: signed / total signable documents for the checklist count.
  const [agreementsCount, setAgreementsCount] = useState<{ signed: number; total: number } | null>(null);

  // SD-4: one wording for a check-in result, and it distinguishes a refund
  // that happened from one that failed — the service reports both now.
  function chargeOutcome(data: { totalCharged: number; feeRefunded?: boolean; feeRefundFailed?: boolean; feeRefundAmount?: number }) {
    const charged = `Checked in — charged $${(data.totalCharged / 100).toFixed(2)}`;
    if (data.feeRefundFailed) {
      toast(`${charged}. The $${((data.feeRefundAmount ?? 0) / 100).toFixed(2)} late-cancellation fee refund FAILED — issue it in Stripe or the golfer is still out that money.`, 'warn');
    } else if (data.feeRefunded) {
      toast(`${charged}, and refunded the $${((data.feeRefundAmount ?? 0) / 100).toFixed(2)} late-cancellation fee.`, 'ok');
    } else {
      toast(`${charged}.`, 'ok');
    }
  }

  // SD-5: no-show / still coming / paid at the counter — recorded on the
  // booking, each with a pending state and an explicit failure.
  // SD-5: partial party — ask how many showed before a check-in or a counter
  // payment; null = the counter cancelled the prompt.
  function askHeadcount(b: Booking): number | null {
    if (b.players <= 1) return b.players;
    const raw = window.prompt(`How many of ${b.golferName}'s ${b.players} players are here?`, String(b.players));
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > b.players) { toast(`Enter a number between 1 and ${b.players}.`, 'warn'); return null; }
    return n;
  }

  // Cancel from the sheet (Cam 2026-10-08: "you have to be able to cancel someones
  // time from the sheet") — the same route, words and fee rules as Money → Cancellations.
  async function cancelGroup(b: Booking, waive: boolean) {
    const c = { golferName: b.golferName, paymentStatus: b.paymentStatus, cancellationFeeTotal: b.cancellationFeeTotal ?? 0, noShowAt: b.noShowAt };
    if (!confirm(cancelConfirmText(c, waive, access.can('sheet.waive_fee')))) return;
    setRowBusy(b.id);
    try {
      const r = await dfetch<{ feeCharged?: boolean; feeRefundFailed?: string; lateFeeChargeFailed?: string; roundRefunded?: boolean }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: b.id, action: 'cancel', ...(waive ? { waiveFee: true } : {}) }) });
      if (!r.ok) { toast(r.error, 'warn'); return; }
      const out = cancelResultText(c, waive, r.data ?? {});
      toast(out.text, out.tone);
      await loadTimes(selectedDate);
    } finally {
      setRowBusy(null);
    }
  }

  async function bookingLifecycle(b: Booking, action: 'no_show' | 'still_coming' | 'paid_offline') {
    let checkedInPlayers: number | undefined;
    if (action === 'paid_offline') {
      const n = askHeadcount(b);
      if (n === null) return;
      checkedInPlayers = n < b.players ? n : undefined;
      // FB-3: GreenReserve's booking fee is charged to the golfer's saved card
      // on its own, so the counter collects only the course's share — taking
      // the full total here would charge the golfer the fee twice.
      const who = checkedInPlayers ?? b.players;
      const fee = Math.round((b.accessFeeTotal ?? 0) * who / b.players);
      const owed = Math.round((b.totalAmount - (b.accessFeeTotal ?? 0)) * who / b.players);
      const feeLine = fee > 0 ? ` GreenReserve's $${(fee / 100).toFixed(2)} booking fee is charged to their saved card — don't collect it at the counter.` : ' No card will be charged.';
      if (!confirm(`Mark ${b.golferName} checked in — ${who} of ${b.players} players, paid $${(owed / 100).toFixed(2)} at the counter?${feeLine}`)) return;
    }
    setRowBusy(b.id);
    try {
      const r = await dfetch<{ fee?: string | null }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: b.id, action, ...(checkedInPlayers ? { checkedInPlayers } : {}) }) });
      if (!r.ok) { toast(r.error, 'warn'); return; }
      if (r.data?.fee) toast(r.data.fee, 'warn');
      toast(action === 'no_show' ? `${b.golferName} marked as a no-show.` : action === 'still_coming' ? `${b.golferName} is still coming.` : `${b.golferName} checked in — paid at the counter.`, 'ok');
      await loadTimes(selectedDate);
    } finally {
      setRowBusy(null);
    }
  }

  // SP-B (Cam 2026-10-05: "push them to the pay link"): a no-card golfer pays
  // through their check-in link — round and booking fee together — instead of
  // at the counter. This (re)sends it.
  // PAY-1: 'sms' texts it to the golfer at the counter (Apple Pay / Google Pay
  // on their own phone); 'email' is the original.
  async function sendPayLink(b: Booking, via: 'sms' | 'email' = 'email') {
    setRowBusy(b.id);
    const r = await dfetch<{ sentTo: string }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: b.id, action: 'send_pay_link', via }) });
    setRowBusy(null);
    if (!r.ok) { toast(r.error); return; }
    toast(via === 'sms'
      ? `Pay link texted to ${r.data.sentTo}. They can pay with Apple Pay, Google Pay or a card, and the sheet updates when they do.`
      : `Pay link sent to ${r.data.sentTo}. They can check in and pay from their phone.`, 'ok');
  }

  async function checkInBooking(b: Booking) {
    // No saved card → the card modal. Keyed on the card itself, not paymentStatus:
    // the hourly cron flips a no-card booking to 'awaiting_checkin' when it sends
    // the pay link, which is before most golfers reach the counter.
    if (b.hasCard === false || b.paymentStatus === 'no_payment_method') { setCardModalReason(''); setCardModalBooking(b); return; }
    // SD-5: partial party — the charge is prorated to who showed.
    const showed = askHeadcount(b);
    if (showed === null) return;
    const partial = showed < b.players ? showed : undefined;
    const amount = partial ? Math.round(b.totalAmount * partial / b.players) : b.totalAmount;
    if (!confirm(`Check in ${b.golferName}${partial ? ` (${partial} of ${b.players} players)` : ''} and charge their card $${(amount / 100).toFixed(2)} for the round?`)) return;
    setCheckingInId(b.id);
    let res: Response; let data: Record<string, unknown> & { error?: string; totalCharged: number };
    try {
      res = await fetch('/api/operator/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, action: 'checkin', ...(partial ? { checkedInPlayers: partial } : {}) }) });
      data = await res.json().catch(() => ({}));
    } catch {
      setCheckingInId(null);
      toast('Network error — the card may or may not have been charged. Refresh before trying again.');
      return;
    }
    setCheckingInId(null);
    if (!res.ok) {
      // SD-4: a declined card was a dead end — an alert, the row unchanged,
      // the reason written to the DB and shown only to the admin. The modal
      // that takes a fresh card already existed for no-card bookings; a
      // decline opens it as a retry, with the decline reason on it.
      if (res.status === 402) {
        setCardModalReason(data.error || 'The saved card was declined.');
        setCardModalBooking(b);
        loadTimes(selectedDate); // the row now carries the decline
        return;
      }
      toast(data.error || 'Check-in failed'); return;
    }
    chargeOutcome(data);
    loadTimes(selectedDate);
  }

  async function checkInWithCard(b: Booking, paymentMethodId: string) {
    setCheckingInId(b.id);
    let res: Response; let data: Record<string, unknown> & { error?: string; totalCharged: number };
    try {
      res = await fetch('/api/operator/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, action: 'checkin', paymentMethodId }) });
      data = await res.json().catch(() => ({}));
    } catch {
      setCheckingInId(null);
      return 'Network error — the card may or may not have been charged. Refresh the sheet before trying again.';
    }
    setCheckingInId(null);
    if (!res.ok) {
      // A second decline: show the new reason where the first one was, and let
      // the row catch up.
      const msg = data.error || 'Check-in failed';
      setCardModalReason(msg); loadTimes(selectedDate);
      return msg;
    }
    chargeOutcome(data);
    setCardModalBooking(null); setCardModalReason('');
    loadTimes(selectedDate);
    return null;
  }

  // AN-1 (Cam 2026-10-01): the sheet carries ONE line of numbers — the day's
  // booked and checked-in groups. Every other figure lives on Analytics.
  const liveGroups = teeTimes.reduce((s, t) => s + (t.bookings?.filter(b => b.status !== 'cancelled').length ?? 0), 0);
  const checkedIn = teeTimes.reduce((s, t) => s + (t.bookings?.filter(b => b.status === 'completed').length ?? 0), 0);
  // When every slot shares one rate the per-row "18 holes · $50 +$10 cart" is
  // noise: say it once in the header and drop the column.
  const rateLabel = (t: TeeTime) => `${t.product?.label ? `${t.product.label} · ` : ''}${t.holes} holes · $${t.greenFee}${t.cartFee > 0 ? ` +$${t.cartFee} cart` : ''}`;
  const rateLabels = new Set(teeTimes.map(rateLabel));
  const commonRate = teeTimes.length > 0 && rateLabels.size === 1 ? [...rateLabels][0] : null;

  const loadTimes = useCallback(async (date: string) => {
    setLoading(true);
    const r = await dfetch<TeeTime[]>(`/api/operator/tee-times?date=${date}&withBookings=1`);
    if (r.status === 401) { setLoading(false); toast('Your session ended — sign in again.', 'warn'); router.push('/dashboard/login'); return; }
    if (!r.ok) { setTeeTimes([]); setSheetError(r.error); }
    // FLOW-1 fix: the API sends greenFeeCents / cartFeeCents (the columns moved
    // to cents); the sheet, the walk-in total and the revenue line all read
    // dollars, so every price rendered as a bare "$" and every total as NaN.
    else {
      type Raw = TeeTime & { greenFeeCents?: number; cartFeeCents?: number };
      const rows = (Array.isArray(r.data) ? r.data : []) as Raw[];
      setTeeTimes(rows.map(tt => ({
        ...tt,
        greenFee: typeof tt.greenFeeCents === 'number' ? tt.greenFeeCents / 100 : (tt.greenFee ?? 0),
        cartFee: typeof tt.cartFeeCents === 'number' ? tt.cartFeeCents / 100 : (tt.cartFee ?? 0),
      })));
      setSheetError('');
    }
    setLoading(false);
  }, [router]);

  const loadCourseStatus = useCallback(() => {
    // An error body has no `active`, so it used to read as "draft" and put the
    // "your course isn't live" banner on a live course. Keep what we had.
    fetch('/api/operator/courses').then(r => r.ok ? r.json() : null).then(c => {
      // Review (admin-UX): say when the status could not be read rather than
      // silently keeping a possibly stale live/draft/Stripe state.
      if (!c) { setStatusError(true); return; }
      setStatusError(false);
      if (c?.name) setCourseName(c.name);
      if (c?.timezone && c.timezone !== DEFAULT_TZ) {
        // SD-3: re-seed the selected day on the course's clock (once, on load).
        setCourseTz(c.timezone);
        setSelectedDate(prev => prev === todayFallback() ? todayIn(c.timezone) : prev);
      }
      setCourseArchived(!!c?.archivedAt);
      setCourseDraft(!c?.active || c?.liveStatus !== 'live');
      setPageApprovalStatus(c?.pageApprovalStatus === 'approved' || c?.pageApprovalStatus === 'changes_requested' ? c.pageApprovalStatus : 'none');
      setStripeAccountActive(!!c?.stripeAccountActive);
      if (c?.conditions) { setConditions(c.conditions); setConditionsInput(c.conditions); }
    }).catch(() => setStatusError(true));
  }, []);

  async function connectStripeFromChecklist() {
    setConnectingStripe(true);
    try {
      const r = await dfetch<{ url?: string; connected?: boolean }>('/api/operator/stripe/connect?from=dashboard');
      if (!r.ok) { toast(r.error); return; }
      if (r.data?.url) { window.location.href = r.data.url; return; }
      if (r.data?.connected) { toast('Stripe is already connected.', 'ok'); loadCourseStatus(); return; }
      toast('Stripe did not return a setup link — try again in a minute.');
    } finally {
      setConnectingStripe(false);
    }
  }

  async function acceptAgreement() {
    setAcceptingAgreement(true);
    try {
      const r = await dfetch('/api/operator/agreement', { method: 'POST' });
      if (r.ok) setAgreementAccepted(true);
      else toast(r.error);
    } finally {
      setAcceptingAgreement(false);
    }
  }

  async function viewOwnPreview() {
    const r = await dfetch<{ url?: string }>('/api/operator/preview-link');
    if (!r.ok) { toast(r.error); return; }
    if (r.data?.url) window.open(r.data.url, '_blank', 'noopener,noreferrer');
    else toast('No preview link came back — try again.');
  }

  // SD-10: Block / Unblock / Del were fire-and-forget with no result check —
  // a 500 refetched the list and it looked identical; two fast taps fired twice.
  async function toggleBlock(tt: TeeTime) {
    setSlotBusy(tt.id);
    const r = await dfetch('/api/operator/tee-times', { method: 'PATCH', body: JSON.stringify({ id: tt.id, status: tt.status === 'blocked' ? 'available' : 'blocked' }) });
    if (!r.ok) toast(r.error);
    await loadTimes(selectedDate);
    setSlotBusy(null);
  }
  async function deleteTime(tt: TeeTime) {
    if (!confirm('Delete this tee time?')) return;
    setSlotBusy(tt.id);
    const r = await dfetch('/api/operator/tee-times', { method: 'DELETE', body: JSON.stringify({ id: tt.id }) });
    if (!r.ok) toast(r.error);
    await loadTimes(selectedDate);
    setSlotBusy(null);
  }

  async function approvePage() {
    setApprovingPage(true); setApproveError('');
    try {
      const res = await fetch('/api/operator/approve-page', { method: 'POST' });
      if (res.ok) { setPageApprovalStatus('approved'); }
      else { const d = await res.json().catch(() => ({})); setApproveError(d.error || 'Could not submit approval.'); }
    } catch { setApproveError('Could not submit approval — try again.'); }
    setApprovingPage(false);
  }

  function toggleChangeCategory(key: string) {
    setChangesChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function submitChanges() {
    if (changesChecked.size === 0) return;
    const items = Array.from(changesChecked).map(category => ({
      category, detail: (changesDetails[category] || '').trim(),
    }));
    setSendingChanges(true); setChangesError('');
    try {
      const res = await fetch('/api/operator/request-changes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      });
      if (res.ok) {
        setPageApprovalStatus('changes_requested'); setShowChangesModal(false);
        setChangesChecked(new Set()); setChangesDetails({});
        setChangesConfirmMsg("Got it — we'll make the changes and send you an updated preview.");
      }
      else { const d = await res.json().catch(() => ({})); setChangesError(d.error || 'Could not send.'); }
    } catch { setChangesError('Could not send — try again.'); }
    setSendingChanges(false);
  }

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p) { setStatusError(true); return; } // could not load — never guess at a redirect from an error body
      if (!p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3)   { router.push('/dashboard/onboarding'); return; }
      setEmailVerified(!!p.emailVerified);
      setOnboardingStepNum(p.onboardingStep);
    }).catch(() => setStatusError(true));
    loadCourseStatus();
    fetch('/api/operator/agreement').then(r => r.ok ? r.json() : null).then(d => {
      setAgreementAccepted(!!d?.agreement);
      setAgreementChecked(true);
    }).catch(() => setAgreementChecked(true));
    fetch('/api/operator/sign?status=1').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.status) setAgreementsCount({ signed: d.status.signed, total: d.status.total });
    }).catch(() => { /* the count is a label on the setup checklist only; the checklist reads "Review & sign" without it */ });
    // Admin can flip a course live while this tab sits open in the
    // background — refresh live/draft status when the operator tabs back in
    // instead of showing whatever was true at page load.
    const onFocus = () => loadCourseStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [router, loadCourseStatus]);

  useEffect(() => { loadTimes(selectedDate); }, [selectedDate, loadTimes]);
  useEffect(() => { if (searchParams.get('tab') === 'analytics') router.replace('/dashboard/analytics'); }, [searchParams, router]);

  async function saveConditions() {
    setSavingConditions(true);
    const r = await dfetch('/api/operator/conditions', { method: 'PATCH', body: JSON.stringify({ conditions: conditionsInput }) });
    setSavingConditions(false);
    if (!r.ok) { toast(r.error); return; } // the modal stays open with the text intact
    setConditions(conditionsInput); setShowConditions(false);
    toast(conditionsInput.trim() ? 'Course alert saved — golfers see it on your page.' : 'Course alert cleared.', 'ok');
  }

  const nowHM = clockIn(courseTz); // SD-3: the course's clock, not the browser's
  // B-8: a group is late when its tee time went off 10+ minutes ago today and
  // nobody in it is checked in. Read straight off the sheet already loaded.
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const lateGroups = selectedDate === today()
    ? teeTimes.flatMap(tt => {
        const [h, m] = tt.time.split(':').map(Number);
        const ago = nowMin - (h * 60 + m);
        if (tt.status === 'blocked' || ago < 10) return [];
        return (tt.bookings ?? [])
          .filter(b => b.status === 'confirmed' && !stillComing.has(b.id) && !b.noShowAt)
          .map(b => ({ tt, b, ago }));
      })
    : [];
  const nextUpId = selectedDate === today()
    ? (teeTimes.find(t => t.time >= nowHM && t.status !== 'blocked')?.id ?? null)
    : null;

  const q = search.trim().toLowerCase();
  const visibleTimes = q
    ? teeTimes.filter(t => t.bookings?.some(b => b.golferName.toLowerCase().includes(q) || b.golferEmail.toLowerCase().includes(q)))
    : teeTimes;

  useEffect(() => { setPanelId(null); }, [selectedDate]);
  useEffect(() => {
    // Esc closes the panel — not while a dialog opened from it is on top.
    if (!panelId || moveTarget || walkInSlot || cardModalBooking) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelId(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [panelId, moveTarget, walkInSlot, cardModalBooking]);
  const panelSlot = panelId ? teeTimes.find(t => t.id === panelId) ?? null : null;
  // One group's line and its buttons, in the board's panel (narrow, so the name
  // sits on its own line above the buttons).
  const groupRow = (b: Booking, tt: TeeTime) => {
    const bStatus = getBookingStatus(b.status, b.paymentStatus);
    return (
      <div key={b.id} className={'flex flex-wrap items-center justify-between text-[13.5px] bg-paper/60 rounded-md px-3 py-2 gap-2 ' + (b.checkInFailReason && b.status === 'confirmed' ? 'shadow-[inset_3px_0_0_var(--color-bad)]' : '')}>
        <div className="basis-full min-w-0">
          <span className="font-medium text-ink">{b.golferName}</span>
          <span className="text-ink-muted ml-2">{b.players} player{b.players!==1?'s':''}</span>
          {(b.source === 'walk_in' || b.source === 'phone') && (
            <span className="ml-2 text-[12px] font-medium text-ink-muted">{b.source === 'phone' ? 'Phone' : 'Walk-in'}</span>
          )}
          {b.noShowAt && b.status === 'confirmed' && (
            <span className="ml-2 text-[12px] font-medium text-bad">No-show</span>
          )}
          {access.can('sheet.golfer_contact') && <div className="text-[12.5px] text-ink-muted truncate">{b.golferEmail.endsWith('@noemail.greenreserve.app') ? (b.golferPhone || 'no contact on file') : b.golferEmail}</div>}
        </div>
        {b.status === 'confirmed' && b.checkInFailReason ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink" title={b.checkInFailReason}><StatusDot status="bad" />Card declined</span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink"><StatusDot {...statusDot(bStatus.tone)} />{bStatus.label}</span>
        )}
        {((b.status === 'confirmed' && !b.noShowAt) || (b.status === 'completed' && selectedDate >= today())) && access.can('sheet.move') && (
          <button onClick={e => { e.stopPropagation(); setMoveTarget({ booking: { id: b.id, golferName: b.golferName, players: b.players, emailable: !b.golferEmail.endsWith('@noemail.greenreserve.app'), checkedIn: b.status === 'completed' }, fromTeeTimeId: tt.id }); }}
            className="shrink-0 text-xs text-ink-soft hover:text-ink px-2 py-1">Move</button>
        )}
        {b.status === 'confirmed' && b.noShowAt && access.can('sheet.no_show') && (
          <button onClick={e => { e.stopPropagation(); bookingLifecycle(b, 'still_coming'); }} disabled={rowBusy === b.id}
            className="shrink-0 text-xs text-ink-soft hover:text-ink px-2 py-1 disabled:opacity-50">{rowBusy === b.id ? '…' : 'Still coming'}</button>
        )}
        {b.status === 'confirmed' && b.paymentStatus === 'manual' && access.can('sheet.counter_payment') && (
          <button onClick={e => { e.stopPropagation(); bookingLifecycle(b, 'paid_offline'); }} disabled={rowBusy === b.id}
            className="shrink-0 text-white px-2.5 min-h-[36px] md:min-h-0 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors bg-pine hover:bg-pine-hover">
            {rowBusy === b.id ? 'Saving…' : 'Check in · paid at counter'}
          </button>
        )}
        {b.status === 'confirmed' && b.hasCard === false && access.can('sheet.checkin') && b.hasPhone && (
          <button onClick={e => { e.stopPropagation(); sendPayLink(b, 'sms'); }} disabled={rowBusy === b.id}
            title="Text them a link to pay on their phone (Apple Pay, Google Pay or card); the booking fee is collected with the round"
            className="shrink-0 text-xs text-ink-soft hover:text-ink px-2 py-1 disabled:opacity-50">{rowBusy === b.id ? 'Sending…' : 'Text pay link'}</button>
        )}
        {b.status === 'confirmed' && b.hasCard === false && b.paymentStatus !== 'manual' && access.can('sheet.checkin') && !b.golferEmail.endsWith('@noemail.greenreserve.app') && (
          <button onClick={e => { e.stopPropagation(); sendPayLink(b); }} disabled={rowBusy === b.id}
            title="Email them their link to check in and pay online — the booking fee is collected with the round"
            className="shrink-0 text-xs text-ink-soft hover:text-ink px-2 py-1 disabled:opacity-50">{rowBusy === b.id ? 'Sending…' : 'Email pay link'}</button>
        )}
        {b.status !== 'completed' && b.status !== 'cancelled' && b.paymentStatus !== 'manual' && access.can('sheet.checkin') && (
          <button
            onClick={e => { e.stopPropagation(); if (b.checkInFailReason) { setCardModalReason(b.checkInFailReason); setCardModalBooking(b); } else checkInBooking(b); }}
            disabled={checkingInId===b.id}
            className={'shrink-0 text-white px-2.5 min-h-[36px] md:min-h-0 py-1 rounded-md text-xs font-medium disabled:opacity-50 transition-colors ' + (b.checkInFailReason ? 'bg-bad hover:bg-bad/90' : 'bg-pine hover:bg-pine-hover')}>
            {checkingInId===b.id ? 'Charging…' : b.checkInFailReason ? 'Retry with new card' : 'Check in'}
          </button>
        )}
        {b.status === 'confirmed' && access.can('sheet.cancel') && (
          <button onClick={e => { e.stopPropagation(); cancelGroup(b, false); }} disabled={rowBusy === b.id}
            className="shrink-0 text-xs text-bad hover:bg-bad/5 px-2 py-1 rounded-md disabled:opacity-50">{rowBusy === b.id ? '…' : 'Cancel booking'}</button>
        )}
        {b.status === 'confirmed' && access.can('sheet.cancel') && access.can('sheet.waive_fee') && (b.cancellationFeeTotal ?? 0) > 0 && (
          <button onClick={e => { e.stopPropagation(); cancelGroup(b, true); }} disabled={rowBusy === b.id}
            className="shrink-0 text-xs text-ink-soft hover:text-ink px-2 py-1 disabled:opacity-50">Cancel, no fee</button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active={tab} onAlertClick={() => setShowConditions(true)}/>

      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        {courseDraft && !courseArchived && (
          <div className="bg-pine/5 border-b border-pine/20 px-6 py-3">
            <div className="flex items-center gap-2 text-sm text-ink-soft flex-wrap">
                            <span>Your course isn&apos;t live yet &mdash; golfers can&apos;t book until you approve the page.</span>
              <div className="flex items-center gap-2 ml-auto">
                {pageApprovalStatus === 'approved' ? (
                  <span className="text-xs text-ink font-medium inline-flex items-center gap-1.5"><span className="w-[5px] h-[5px] rounded-full bg-ok" aria-hidden="true"/>You approved this page</span>
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
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-card max-h-[85vh] overflow-y-auto">
              <div className="text-ink font-medium mb-1">What would you like changed?</div>
              <div className="text-xs text-ink-muted mb-3">Check everything that applies — you can add a note for each.</div>
              <div className="space-y-2 mb-3">
                {CHANGE_CATEGORIES.map(cat => {
                  const checked = changesChecked.has(cat.key);
                  return (
                    <div key={cat.key} className="border border-line rounded-md p-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleChangeCategory(cat.key)} />
                        <span className="text-sm font-medium text-ink">{cat.label}</span>
                      </label>
                      {checked && (
                        <textarea
                          value={changesDetails[cat.key] || ''}
                          onChange={e => setChangesDetails(prev => ({ ...prev, [cat.key]: e.target.value }))}
                          rows={2}
                          placeholder="What should change?"
                          className="w-full mt-2 bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {changesError && <p className="text-xs text-bad mb-2">{changesError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowChangesModal(false); setChangesChecked(new Set()); setChangesDetails({}); setChangesError(''); }}
                  className="text-xs text-ink-muted hover:text-ink px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={submitChanges}
                  disabled={sendingChanges || changesChecked.size === 0}
                  className="text-xs font-medium text-white bg-pine hover:bg-pine-hover px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
                >
                  {sendingChanges ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
        {statusError && (
          <div className="bg-warn/5 border-b border-warn/20 px-6 py-2.5 flex items-center gap-2 text-[13px] text-warn">
            <span>We couldn&apos;t load your course&apos;s status (live, Stripe, setup). The tee sheet works; the setup reminders may be out of date.</span>
            <button onClick={() => { setStatusError(false); loadCourseStatus(); }} className="ml-auto underline font-medium">Retry</button>
          </div>
        )}
        {courseArchived && (
          <div className="bg-bad/5 border-b border-bad/20 px-6 py-3 flex items-center gap-2 text-sm text-bad">
            <span>This course has been archived. The public booking page is offline. Contact GreenReserve support to restore it.</span>
          </div>
        )}
        {conditions && (
          <div className="bg-warn/10 border-b border-warn/20 px-6 py-2 flex items-center gap-2 text-sm font-medium text-warn">
            <span>Course alert: {conditions}</span>
            <button onClick={() => setShowConditions(true)} className="ml-auto underline text-xs">Update</button>
          </div>
        )}

        {/* SHEET-2: the board gets the screen's width, so more of the day shows at once. */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">

          {/* AN-1 (Cam: no "Getting Started" banner on the sheet): it shows only
              while a step that blocks taking bookings or money is unfinished —
              verify email, approve the page, connect Stripe, sign the agreement.
              A fully set-up course never sees it. */}
          {tab === 'teesheet' && !courseArchived && (!emailVerified || courseDraft || !stripeAccountActive || (agreementChecked && !agreementAccepted)) && (
            <GettingStartedChecklist
              startCollapsed
              emailVerified={emailVerified}
              onboardingStep={onboardingStepNum}
              courseDraft={courseDraft}
              pageApprovalStatus={pageApprovalStatus}
              onApprovePage={approvePage}
              approvingPage={approvingPage}
              approveError={approveError}
              onRequestChanges={() => setShowChangesModal(true)}
              stripeAccountActive={stripeAccountActive}
              onConnectStripe={connectStripeFromChecklist}
              connectingStripe={connectingStripe}
              onNavigate={(href) => href === '#preview' ? viewOwnPreview() : router.push(href)}
              agreementAccepted={agreementAccepted}
              onAcceptAgreement={acceptAgreement}
              acceptingAgreement={acceptingAgreement}
              agreementsSigned={agreementsCount?.signed}
              agreementsTotal={agreementsCount?.total}
            />
          )}

          {/* AGREEMENT = GO-LIVE GATE (RUN_QUEUE) item 3 — legacy operators
              (predate the clickwrap) with an ALREADY-LIVE course get a
              prominent accept prompt at next login. The course stays live —
              this never blocks anything, it's a nudge, not a gate (going
              live retroactively isn't a thing; the gate only applies to the
              NEXT time a course goes live). Dismissed only by accepting. */}
          {agreementChecked && !agreementAccepted && !courseDraft && !courseArchived && (
            <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-4">
              <div className="bg-white rounded-lg border border-line max-w-md w-full p-6">
                <h2 className="text-[18px] font-serif font-semibold text-ink mb-2">Please sign the Operator Agreement</h2>
                <p className="text-sm text-ink-soft mb-5">
                  We&apos;ve updated our terms since {courseName || 'your course'} went live. Please review and accept the Operator Agreement to keep your account in good standing — this doesn&apos;t affect your live status.
                </p>
                <div className="flex items-center gap-3">
                  <a href="/operator-agreement" target="_blank" className="text-sm text-pine hover:underline">Read the agreement</a>
                  {/* AG-2: signing captures legal name, signer and the text
                      read to the end — it lives on its own page now. */}
                  <button
                    onClick={() => router.push('/dashboard/sign')}
                    className="ml-auto bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Review and sign
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Tee Sheet ── */}
          {tab === 'teesheet' && (
            <>
              {/* U-O (UI_REVISE_SPEC §1b): page header — serif title, then one
                  sentence carrying the day's numbers, then the day's actions. */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="min-w-0">
                  {/* CLUB-3b: the day is the title (the course name lives in the top bar). */}
                  <h1 className="text-[30px] sm:text-[38px] font-serif leading-none text-ink">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </h1>
                  <p className="text-[14px] text-ink mt-2">
                    {liveGroups} booked · {checkedIn} checked in{commonRate ? <span className="text-ink-muted"> · {commonRate}</span> : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find golfer..."
                    className="w-36 sm:w-44 bg-white border border-line rounded-md px-3 py-1.5 text-[13.5px] text-ink placeholder-ink-faint focus:ring-2 focus:ring-pine/10 focus:border-pine/40 outline-none"/>
                  <button onClick={() => loadTimes(selectedDate)} className="text-[13px] font-medium text-ink bg-white px-3.5 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
                    Refresh
                  </button>
                  {selectedDate >= today() && wxTabs.length > 0 && (
                    <button onClick={() => { setFrostOpen(true); setWxMode(wxTabs[0][0]); setFrostPlan(null); setFrostErr(''); setFrostResult(null); setWxPlan(null); setWxErr(''); setWxResult(null); }} className="text-[13px] font-medium text-ink bg-white px-3.5 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
                      Weather
                    </button>
                  )}
                  {access.can('sheet.message_golfers') && (
                    <button onClick={() => setMessageOpen(true)} className="text-[13px] font-medium text-ink bg-white px-3.5 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
                      Message golfers
                    </button>
                  )}
                  {access.can('sheet.edit_times') && (
                  <button onClick={() => setShowAddModal(true)} className="text-[13px] font-semibold bg-pine hover:bg-pine-hover text-white px-3.5 py-1.5 rounded-md transition-colors">
                    Add time
                  </button>
                  )}
                </div>
              </div>

              {sheetError && <LoadError message={sheetError} onRetry={() => loadTimes(selectedDate)} />}

              {/* B-8: needs attention — late groups surface above the sheet. "Mark
                  no-show" needs a place to record it (schema, attended); until then
                  the two honest actions are the existing check-in and "Still coming". */}
              {lateGroups.length > 0 && (
                <div className="space-y-2 mb-4">
                  {lateGroups.map(({ tt, b, ago }) => (
                    <div key={b.id} className="bg-white border border-line border-l-[3px] border-l-warn px-4 py-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[220px] text-[13.5px] leading-snug text-ink">
                        <b className="font-semibold">{fmtTime(tt.time)} group ({b.golferName}) hasn&apos;t checked in</b> — tee time was {ago} minute{ago === 1 ? '' : 's'} ago · {b.players} player{b.players === 1 ? '' : 's'}.
                      </div>
                      {!(b.paymentStatus === 'manual' ? access.can('sheet.counter_payment') : access.can('sheet.checkin')) ? null : b.paymentStatus === 'manual' ? (
                        <button
                          onClick={() => bookingLifecycle(b, 'paid_offline')}
                          disabled={rowBusy === b.id}
                          className="h-[34px] px-3 text-[12.5px] font-medium border border-ink text-ink hover:bg-paper disabled:opacity-50 transition-colors">
                          {rowBusy === b.id ? 'Saving…' : 'Check in · paid at counter'}
                        </button>
                      ) : (
                        <button
                          onClick={() => { if (b.checkInFailReason) { setCardModalReason(b.checkInFailReason); setCardModalBooking(b); } else checkInBooking(b); }}
                          disabled={checkingInId === b.id}
                          className="h-[34px] px-3 text-[12.5px] font-medium border border-ink text-ink hover:bg-paper disabled:opacity-50 transition-colors">
                          {checkingInId === b.id ? 'Charging…' : b.checkInFailReason ? 'Retry with new card' : 'Check in now'}
                        </button>
                      )}
                      <button
                        onClick={() => setStillComing(prev => new Set(prev).add(b.id))}
                        className="h-[34px] px-3 text-[12.5px] text-ink-soft hover:text-ink transition-colors">
                        Still coming
                      </button>
                      {/* SD-5: recorded on the booking; the fee cron treats the booking as before. */}
                      {access.can('sheet.no_show') && <button
                        onClick={() => bookingLifecycle(b, 'no_show')}
                        disabled={rowBusy === b.id}
                        className="h-[34px] px-3 text-[12.5px] text-bad hover:bg-bad/5 disabled:opacity-50 transition-colors">
                        {rowBusy === b.id ? 'Saving…' : 'Mark no-show'}
                      </button>}
                    </div>
                  ))}
                </div>
              )}

              {/* FLOW-1 (Cam 2026-10-01: "why does the dashboard not look like the
                  greenreserve.app demo"): the sheet IS the homepage demo now — one
                  sheet with its own bar (course, date, arrows), Time / Group /
                  Status columns, check-in on the row, and a count underneath. */}
              {/* No overflow-hidden: it would clip the date picker's popover. */}
              <div className={CARD}>
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-line">
                  <div className="flex items-center gap-2 text-[13.5px] text-ink">
                    {/* SD-3: back is never clamped — yesterday's sheet must stay reachable. */}
                    <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} aria-label="Previous day"
                      className="w-7 h-7 rounded-md border border-line inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper transition-colors">
                      <ChevronLeft className="w-4 h-4"/>
                    </button>
                    <MonthPicker value={selectedDate} onChange={setSelectedDate} today={today()}
                      label={new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} />
                    <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} aria-label="Next day"
                      className="w-7 h-7 rounded-md border border-line inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper transition-colors">
                      <ChevronRight className="w-4 h-4"/>
                    </button>
                    {selectedDate !== today() && (
                      <button onClick={() => setSelectedDate(today())} className="ml-1 text-[12.5px] font-semibold text-pine hover:underline underline-offset-4">Today</button>
                    )}
                  </div>
                </div>
              {loading ? (
                <div className="flex items-center justify-center py-16 text-ink-muted gap-2">
                  <Loader2 className="w-5 h-5 animate-spin"/>Loading tee times...
                </div>
              ) : sheetError ? null : teeTimes.length === 0 ? (
                <div className="text-center py-16">
                  <p className="font-medium text-ink mb-1">No tee times for this date</p>
                  <p className="text-sm text-ink-soft mb-4">Add times manually or check your schedule covers this day</p>
                  {access.can('sheet.edit_times') && <button onClick={() => setShowAddModal(true)} className="bg-pine hover:bg-pine-hover text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors">Add tee time</button>}
                </div>
              ) : (
                <div className="bg-paper/70 p-3 sm:p-4 rounded-b-lg">
                  {q && visibleTimes.length === 0 && <p className="text-center py-6 text-ink-muted text-sm">No bookings match &quot;{search}&quot; on this date.</p>}
                  <TeeSheetBoard
                    slots={visibleTimes}
                    isPast={t => selectedDate < today() || (selectedDate === today() && t.time <= nowHM)}
                    nextUpId={nextUpId}
                    selectedId={panelId}
                    canMove={access.can('sheet.move')}
                    canMoveCheckedIn={selectedDate >= today()}
                    onMove={(g: BoardGroup, fromId, toId) => setMoveTarget({
                      booking: { id: g.id, golferName: g.golferName, players: g.players, emailable: !g.golferEmail.endsWith('@noemail.greenreserve.app'), checkedIn: g.status === 'completed' },
                      fromTeeTimeId: fromId, toTeeTimeId: toId,
                    })}
                    onSelect={setPanelId} />
                </div>
              )}
                {!loading && teeTimes.length > 0 && (
                  <div className="flex justify-end px-4 py-2 border-t border-line bg-paper rounded-b-lg text-[12.5px] text-ink-muted tabular-nums">
                    {teeTimes.reduce((n, x) => n + (x.bookings?.length ?? 0), 0)} group{teeTimes.reduce((n, x) => n + (x.bookings?.length ?? 0), 0) === 1 ? '' : 's'} booked · {teeTimes.filter(x => x.status !== 'blocked').length} tee times
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── MSG-1: message the day's golfers ── */}
      {messageOpen && <GolferMessageModal date={selectedDate} onClose={() => setMessageOpen(false)} />}

      {/* ── SHEET-2: the board's open square ── */}
      {panelSlot && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setPanelId(null)}>
          <div className="absolute inset-0 bg-ink/10" aria-hidden="true" />
          <aside role="dialog" aria-label={`${fmtTime(panelSlot.time)} tee time`} onClick={e => e.stopPropagation()}
            className="relative bg-white w-full sm:w-[420px] h-full overflow-y-auto shadow-card px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <h2 className="font-sans font-bold text-ink text-[24px] leading-tight tabular-nums">{fmtTime(panelSlot.time)}</h2>
                <p className="text-[13px] text-ink-soft">{fmtDate(selectedDate)} · {panelSlot.playersBooked} of {panelSlot.playersAvailable} players{panelSlot.id === nextUpId ? ' · Next up' : ''}</p>
              </div>
              <button onClick={() => setPanelId(null)} className="text-ink-muted hover:text-ink p-1" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-[13px] mb-4">{slotStatus(panelSlot)}</div>
            {(panelSlot.bookings ?? []).length > 0
              ? <div className="space-y-1.5 mb-5">{(panelSlot.bookings ?? []).map(b => groupRow(b, panelSlot))}</div>
              : <p className="text-[13.5px] text-ink-soft mb-5">No bookings yet.</p>}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {panelSlot.status !== 'blocked' && panelSlot.playersBooked < panelSlot.playersAvailable && access.can('sheet.walkin') && (
                <button onClick={() => setWalkInSlot(panelSlot)} className="px-3.5 py-2 rounded-md border border-line text-[13px] font-medium text-ink hover:bg-paper">Walk-in or phone booking</button>
              )}
              {access.can('sheet.block') && (
                <button onClick={() => toggleBlock(panelSlot)} disabled={slotBusy === panelSlot.id} className="px-3.5 py-2 rounded-md border border-line text-[13px] font-medium text-ink hover:bg-paper disabled:opacity-50">
                  {slotBusy === panelSlot.id ? '…' : panelSlot.status === 'blocked' ? 'Unblock' : 'Block'}
                </button>
              )}
              {access.can('sheet.edit_times') && !(selectedDate < today() || (selectedDate === today() && panelSlot.time < nowHM)) && (
                <button onClick={() => deleteTime(panelSlot)} disabled={slotBusy === panelSlot.id} className="px-3.5 py-2 rounded-md text-[13px] font-medium text-ink-muted hover:text-bad hover:bg-bad/5 disabled:opacity-50">Delete time</button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ── ACT-1: move a group to another time ── */}
      {moveTarget && (
        <MoveGroupModal booking={moveTarget.booking} fromTeeTimeId={moveTarget.fromTeeTimeId} initialPickId={moveTarget.toTeeTimeId} date={selectedDate} today={today()} nowHM={nowHM}
          onClose={() => setMoveTarget(null)}
          onMoved={toDate => { setMoveTarget(null); if (toDate !== selectedDate) setSelectedDate(toDate); else loadTimes(selectedDate); }} />
      )}

      {/* ── Add Tee Time Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-line w-full sm:max-w-sm rounded-t-lg sm:rounded-lg p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-semibold text-ink text-[17px]">Add a tee time — {fmtDate(selectedDate)}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5"/></button>
            </div>
            <AddTeeTimeForm date={selectedDate} onSave={()=>{setShowAddModal(false);loadTimes(selectedDate);}} onCancel={()=>setShowAddModal(false)}/>
          </div>
        </div>
      )}

      {/* ── WX-1 Weather: cancel times, or B-9 delay start — preview, then confirm ── */}
      {frostOpen && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg shadow-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-serif font-semibold text-ink text-[17px]">Weather — {fmtDate(selectedDate)}</h3>
              <button onClick={() => setFrostOpen(false)} disabled={frostBusy || wxBusy} className="text-ink-muted hover:text-ink disabled:opacity-40" aria-label="Close"><X className="w-5 h-5"/></button>
            </div>
            {!frostResult && !wxResult && (
              <div role="tablist" className={'grid gap-1 p-1 bg-paper rounded-md mb-4 ' + (wxTabs.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                {wxTabs.map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={wxMode === k} disabled={frostBusy || wxBusy} onClick={() => setWxMode(k)}
                    className={'py-1.5 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-60 ' + (wxMode === k ? 'bg-white text-ink shadow-card' : 'text-ink-muted hover:text-ink')}>{l}</button>
                ))}
              </div>
            )}
            {wxMode === 'cancel' ? (wxResult ? (
              <div>
                <p className="text-[13.5px] text-ink mb-3"><b>Play called off.</b> {wxResult.cancelled} group{wxResult.cancelled === 1 ? '' : 's'} cancelled with no fee, {wxResult.blocked} time{wxResult.blocked === 1 ? '' : 's'} blocked.</p>
                {wxResult.feeRefundsFailed > 0 && <p className="text-[13px] text-bad mb-3">{wxResult.feeRefundsFailed} hold fee{wxResult.feeRefundsFailed === 1 ? '' : 's'} could not be refunded automatically — refund {wxResult.feeRefundsFailed === 1 ? 'it' : 'them'} from Money → Cancellations.</p>}
                {wxResult.calls.length > 0 ? (
                  <>
                    <p className="text-[13px] text-bad font-semibold mb-1.5">Call these golfers:</p>
                    <ul className="divide-y divide-line border-y border-line text-[13px] mb-4">
                      {wxResult.calls.map((c, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span>{c.name} · {c.players}</span><span className="text-ink-soft text-right">{c.why}</span></li>)}
                    </ul>
                  </>
                ) : <p className="text-[13px] text-ink-soft mb-4">Every cancelled golfer was emailed.</p>}
                <button onClick={() => { setFrostOpen(false); setWxResult(null); }} className="w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[13px] font-semibold">Done</button>
              </div>
            ) : (<>
            <p className="text-[13px] text-ink-soft mb-4">Every group in the window is cancelled with no fee — a hold already taken is refunded — and emailed why. The times are blocked so nobody books into the weather.</p>
            <div className="grid grid-cols-2 gap-1 mb-3 text-[13px]">
              {([[true, 'Whole day'], [false, 'Part of the day']] as const).map(([v, l]) => (
                <label key={l} className={'flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer ' + (wxWhole === v ? 'border-pine/40 bg-pine/5 text-ink' : 'border-line text-ink-soft')}>
                  <input type="radio" name="wx-span" checked={wxWhole === v} onChange={() => { setWxWhole(v); setWxPlan(null); }} className="accent-pine"/>{l}
                </label>
              ))}
            </div>
            {!wxWhole && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="block text-[12.5px] text-ink-muted mb-1.5">From</label>
                  <input type="time" value={wxFrom} onChange={e => { setWxFrom(e.target.value); setWxPlan(null); }} className={iCls}/></div>
                <div><label className="block text-[12.5px] text-ink-muted mb-1.5">To <span className="text-ink-faint">(blank = close)</span></label>
                  <input type="time" value={wxTo} onChange={e => { setWxTo(e.target.value); setWxPlan(null); }} className={iCls}/></div>
              </div>
            )}
            <label className="block text-[12.5px] text-ink-muted mb-1.5">Note for golfers <span className="text-ink-faint">(optional)</span></label>
            <div className="flex gap-2 mb-4">
              <input value={wxReason} maxLength={200} onChange={e => setWxReason(e.target.value)} placeholder="Lightning in the forecast" className={iCls + ' flex-1'}/>
              <button disabled={wxBusy} onClick={async () => {
                setWxBusy(true); setWxErr('');
                const r = await dfetch<{ plan: WxPlan }>('/api/operator/weather-cancel', { method: 'POST', body: JSON.stringify({ date: selectedDate, ...(wxWhole ? {} : { from: wxFrom, to: wxTo || '24:00' }) }) });
                setWxBusy(false);
                if (!r.ok) { setWxErr(r.error); return; }
                setWxPlan(r.data.plan);
              }} className="px-4 rounded-md border border-line text-[13px] font-semibold text-ink hover:bg-paper disabled:opacity-50">{wxBusy && !wxPlan ? 'Checking…' : 'Preview'}</button>
            </div>
            {wxErr && <p className="text-[13px] text-bad mb-3">{wxErr}</p>}
            {wxPlan && (
              <div className="mb-4">
                {wxPlan.groups.length === 0 ? (
                  <p className="text-[13px] text-ink-soft">No groups are booked in that window.</p>
                ) : (
                  <ul className="divide-y divide-line text-[13px] border-y border-line max-h-56 overflow-y-auto">
                    {wxPlan.groups.map(g => (
                      <li key={g.bookingId} className="flex justify-between gap-3 py-1.5"><span>{g.name} · {g.players}</span><span className="tabular-nums text-ink-soft">{fmtTime(g.time)}{g.noEmail ? ' · no email, call' : ''}</span></li>
                    ))}
                  </ul>
                )}
                <p className="text-[12px] text-ink-soft mt-2">{wxPlan.teeTimeIds.length} time{wxPlan.teeTimeIds.length === 1 ? '' : 's'} will be blocked.{wxPlan.startedBefore ? ` Times up to ${fmtTime(wxPlan.startedBefore)} have already gone out and are left alone.` : ''}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setFrostOpen(false)} disabled={wxBusy} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[13px] font-medium hover:border-line-strong disabled:opacity-50">Close</button>
              <button disabled={!wxPlan || wxBusy || wxPlan.teeTimeIds.length === 0} onClick={async () => {
                if (!wxPlan) return;
                setWxBusy(true); setWxErr('');
                const r = await dfetch<{ cancelled: WxGroup[]; failed: (WxGroup & { error: string })[]; feeRefundsFailed: number; blocked: number }>('/api/operator/weather-cancel', { method: 'POST', body: JSON.stringify({ date: selectedDate, ...(wxWhole ? {} : { from: wxFrom, to: wxTo || '24:00' }), reason: wxReason, apply: true }) });
                setWxBusy(false);
                if (!r.ok) {
                  // Review 2026-10-04: a failure partway used to read "Nothing was changed" —
                  // some groups may already be cancelled and emailed. Say so and refresh.
                  setWxErr(r.status >= 500 || r.status === 0
                    ? `The cancellation stopped partway${r.status ? ` (error ${r.status})` : ''}. Some groups may already be cancelled and emailed — the sheet has been refreshed; check it, then run Weather again for any still booked.`
                    : r.error);
                  loadTimes(selectedDate); return;
                }
                const calls: FrostCall[] = [
                  ...r.data.failed.map(f => ({ name: f.name, players: f.players, why: `${fmtTime(f.time)} — NOT cancelled: ${f.error}` })),
                  ...r.data.cancelled.filter(c => c.noEmail).map(c => ({ name: c.name, players: c.players, why: `${fmtTime(c.time)} — cancelled, no email on file` })),
                ];
                toast(`Play called off: ${r.data.cancelled.length} group${r.data.cancelled.length === 1 ? '' : 's'} cancelled.`, calls.length ? 'warn' : 'ok');
                setWxPlan(null); setWxResult({ cancelled: r.data.cancelled.length, blocked: r.data.blocked, feeRefundsFailed: r.data.feeRefundsFailed, calls }); loadTimes(selectedDate);
              }} className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[13px] font-semibold disabled:opacity-50">
                {wxBusy && wxPlan ? 'Cancelling…' : !wxPlan ? 'Preview first'
                  : wxPlan.groups.length > 0 ? `Cancel ${wxPlan.groups.length} group${wxPlan.groups.length === 1 ? '' : 's'}`
                  : wxPlan.teeTimeIds.length > 0 ? `Block ${wxPlan.teeTimeIds.length} time${wxPlan.teeTimeIds.length === 1 ? '' : 's'}` : 'Nothing to do'}
              </button>
            </div>
            </>)) : frostResult ? (
              <div>
                <p className="text-[13.5px] text-ink mb-3"><b>Frost delay set.</b> {frostResult.moved} group{frostResult.moved === 1 ? '' : 's'} moved, {frostResult.blocked} time{frostResult.blocked === 1 ? '' : 's'} blocked.</p>
                {frostResult.calls.length > 0 ? (
                  <>
                    <p className="text-[13px] text-bad font-semibold mb-1.5">Call these golfers:</p>
                    <ul className="divide-y divide-line border-y border-line text-[13px] mb-4">
                      {frostResult.calls.map((c, i) => <li key={i} className="flex justify-between py-1.5"><span>{c.name} · {c.players}</span><span className="text-ink-soft">{c.why}</span></li>)}
                    </ul>
                  </>
                ) : <p className="text-[13px] text-ink-soft mb-4">Every moved golfer was emailed their new time.</p>}
                <button onClick={() => { setFrostOpen(false); setFrostResult(null); }} className="w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[13px] font-semibold">Done</button>
              </div>
            ) : (<>
            <p className="text-[13px] text-ink-soft mb-4">Every group booked before the new first tee time moves, in tee-time order, to the earliest open time that fits them. The early times are blocked and each moved golfer is emailed. Prices don&apos;t change. Nobody is cancelled.</p>
            <label className="block text-[12.5px] text-ink-muted mb-1.5">New first tee time</label>
            <div className="flex gap-2 mb-4">
              <input type="time" value={frostTime} onChange={e => { setFrostTime(e.target.value); setFrostPlan(null); }} className={iCls + ' flex-1'}/>
              <button disabled={frostBusy} onClick={async () => {
                setFrostBusy(true); setFrostErr('');
                const r = await dfetch<{ plan: FrostPlan }>('/api/operator/frost-delay', { method: 'POST', body: JSON.stringify({ date: selectedDate, newStart: frostTime }) });
                setFrostBusy(false);
                if (!r.ok) { setFrostErr(r.error); return; }
                setFrostPlan(r.data.plan);
              }} className="px-4 rounded-md border border-line text-[13px] font-semibold text-ink hover:bg-paper disabled:opacity-50">{frostBusy && !frostPlan ? 'Checking…' : 'Preview'}</button>
            </div>
            {frostErr && <p className="text-[13px] text-bad mb-3">{frostErr}</p>}
            {frostPlan && (
              <div className="mb-4">
                {frostPlan.moves.length + frostPlan.unplaced.length === 0 ? (
                  <p className="text-[13px] text-ink-soft">No groups are booked before {fmtTime(frostTime)}. {frostPlan.blockTeeTimeIds.length} empty time{frostPlan.blockTeeTimeIds.length === 1 ? '' : 's'} will be blocked.</p>
                ) : (
                  <ul className="divide-y divide-line text-[13px] border-y border-line">
                    {frostPlan.moves.map(m => (
                      <li key={m.bookingId} className="flex justify-between py-1.5"><span>{m.name} · {m.players}</span><span className="tabular-nums text-ink-soft">{fmtTime(m.fromTime)} → <b className="text-ink">{fmtTime(m.toTime)}</b></span></li>
                    ))}
                    {frostPlan.unplaced.map(u => (
                      <li key={u.bookingId} className="flex justify-between py-1.5 text-bad"><span>{u.name} · {u.players}</span><span>{fmtTime(u.time)} — no open time fits, call them</span></li>
                    ))}
                  </ul>
                )}
                <p className="text-[12px] text-ink-soft mt-2">{frostPlan.blockTeeTimeIds.length} time{frostPlan.blockTeeTimeIds.length === 1 ? '' : 's'} before {fmtTime(frostTime)} will be blocked.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setFrostOpen(false)} disabled={frostBusy} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[13px] font-medium hover:border-line-strong disabled:opacity-50">Cancel</button>
              <button disabled={!frostPlan || frostBusy || frostPlan.blockTeeTimeIds.length + frostPlan.moves.length === 0} onClick={async () => {
                setFrostBusy(true); setFrostErr('');
                const r = await dfetch<{ moved: { name: string; players: number; toTime: string; emailed: boolean | null }[]; unplaced: { name: string; players: number; time: string }[]; blocked: number }>('/api/operator/frost-delay', { method: 'POST', body: JSON.stringify({ date: selectedDate, newStart: frostTime, apply: true }) });
                setFrostBusy(false);
                if (!r.ok) { setFrostErr(r.error); return; }
                const calls: FrostCall[] = [
                  ...r.data.unplaced.map(u => ({ name: u.name, players: u.players, why: `${fmtTime(u.time)} — no open time fit` })),
                  ...r.data.moved.filter(m => m.emailed !== true).map(m => ({ name: m.name, players: m.players, why: `moved to ${fmtTime(m.toTime)} — ${m.emailed === false ? 'email failed' : 'no email on file'}` })),
                ];
                toast(`Frost delay set: ${r.data.moved.length} group${r.data.moved.length === 1 ? '' : 's'} moved.`, calls.length ? 'warn' : 'ok');
                setFrostPlan(null); setFrostResult({ moved: r.data.moved.length, blocked: r.data.blocked, calls }); loadTimes(selectedDate);
              }} className="flex-1 bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[13px] font-semibold disabled:opacity-50">
                {frostBusy && frostPlan ? 'Applying…' : !frostPlan ? 'Preview first'
                  : frostPlan.moves.length > 0 ? `Move ${frostPlan.moves.length} group${frostPlan.moves.length === 1 ? '' : 's'}`
                  : frostPlan.blockTeeTimeIds.length > 0 ? `Block ${frostPlan.blockTeeTimeIds.length} time${frostPlan.blockTeeTimeIds.length === 1 ? '' : 's'}` : 'Nothing to do'}
              </button>
            </div>
            {frostPlan && frostPlan.moves.length === 0 && frostPlan.blockTeeTimeIds.length === 0 && (
              <p className="text-[12px] text-ink-soft mt-2">There are no tee times before {fmtTime(frostTime)} to move or block{frostPlan.unplaced.length ? ' — the groups in red have nowhere to go; call them' : ''}.</p>
            )}
            </>)}
          </div>
        </div>
      )}

      {/* ── SD-5: Walk-in / phone booking ── */}
      {walkInSlot && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white border border-line w-full sm:max-w-sm rounded-t-lg sm:rounded-lg p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-semibold text-ink text-[17px]">Walk-in — {fmtTime(walkInSlot.time)}</h3>
              <button onClick={() => setWalkInSlot(null)} className="text-ink-muted hover:text-ink"><X className="w-5 h-5"/></button>
            </div>
            <WalkInForm slot={walkInSlot} onSave={(msg) => { setWalkInSlot(null); toast(msg, 'ok'); loadTimes(selectedDate); }} onCancel={() => setWalkInSlot(null)} />
          </div>
        </div>
      )}

      {/* ── Card Check-In Modal ── */}
      {cardModalBooking && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4">
          <Elements stripe={stripePromise}>
            <CardCheckInModal booking={cardModalBooking} reason={cardModalReason} onConfirm={(pmId) => checkInWithCard(cardModalBooking, pmId)} onCancel={() => { setCardModalBooking(null); setCardModalReason(''); }}/>
          </Elements>
        </div>
      )}

      {/* ── Course Alert Modal ── */}
      {showConditions && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-line w-full max-w-sm rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-semibold text-ink text-[17px]">Course alert</h3>
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
                {savingConditions ? 'Saving...' : conditionsInput ? 'Save alert' : 'Clear alert'}
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

/* ─── SD-5: Walk-in / phone booking form ───────────────────────────────── */
function WalkInForm({ slot, onSave, onCancel }: { slot: TeeTime; onSave: (msg: string) => void; onCancel: () => void }) {
  const spots = Math.max(0, slot.playersAvailable - slot.playersBooked);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [players, setPlayers] = useState(Math.min(2, spots) || 1);
  const [cart, setCart] = useState(slot.cartFee > 0);
  const [source, setSource] = useState<'walk_in' | 'phone'>('walk_in');
  // Cam 2026-10-01: "when one person gets checked in it's automatically
  // checking in other people — this has to be separate." No code path checks
  // in more than one booking; this box being ON by default did — every walk-in
  // added to a slot arrived already checked in and paid. Each group is now
  // checked in on its own row, by choice, unless staff tick this.
  const [checkInNow, setCheckInNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inp = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full';
  const total = (slot.greenFee + (cart ? slot.cartFee : 0)) * players;

  async function save() {
    setSaving(true); setErr('');
    const r = await dfetch<{ emailSent: boolean | null }>('/api/operator/bookings', {
      method: 'POST', body: JSON.stringify({ teeTimeId: slot.id, golferName: name, golferPhone: phone, golferEmail: email, players, cartSelected: cart, source, checkInNow: source === 'walk_in' && checkInNow }),
    });
    setSaving(false);
    if (!r.ok) { setErr(r.error); return; }
    const sent = r.data?.emailSent;
    onSave(`${name} added${source === 'walk_in' && checkInNow ? ' and checked in' : ''}${sent === true ? ' — confirmation emailed' : sent === false ? ' — the confirmation email did not send' : ''}.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-paper border border-line rounded-md p-1">
        {([['walk_in', 'Walk-in'], ['phone', 'Phone booking']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSource(k)}
            className={'flex-1 py-1.5 rounded-md text-[12.5px] font-medium transition-colors ' + (source === k ? 'bg-white text-ink border border-line' : 'text-ink-muted hover:text-ink')}>{label}</button>
        ))}
      </div>
      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Golfer’s name" autoFocus className={inp} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[13px] font-semibold text-ink mb-1">Phone <span className="font-normal text-ink-muted">(optional)</span></label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-ink mb-1">Players <span className="font-normal text-ink-muted">({spots} open)</span></label>
          <input type="number" min={1} max={Math.max(1, spots)} value={players} onChange={e => setPlayers(Math.max(1, Math.min(Math.max(1, spots), Number(e.target.value) || 1)))} className={inp} />
        </div>
      </div>
      <div>
        <label className="block text-[13px] font-semibold text-ink mb-1">Email <span className="font-normal text-ink-muted">(optional — sends a confirmation with a check-in link)</span></label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} />
      </div>
      {slot.cartFee > 0 && (
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input type="checkbox" checked={cart} onChange={e => setCart(e.target.checked)} className="accent-pine" />Cart (${slot.cartFee} / player)
        </label>
      )}
      {source === 'walk_in' && (
        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input type="checkbox" checked={checkInNow} onChange={e => setCheckInNow(e.target.checked)} className="accent-pine" />They&apos;ve already paid at the counter — check this group in now
        </label>
      )}
      <div className="text-[12.5px] text-ink-muted">Pays at the counter: <b className="text-ink">${total.toFixed(2)}</b> — no card, no booking fee.</div>
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} disabled={saving} className="flex-1 px-4 py-2.5 border border-line text-ink-soft hover:text-ink rounded-md text-[12.5px] font-medium transition-colors">Cancel</button>
        <button onClick={save} disabled={saving || name.trim().length < 2 || spots === 0}
          className="flex-1 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white rounded-md text-[12.5px] font-medium transition-colors">
          {saving ? 'Adding…' : source === 'walk_in' && checkInNow ? 'Add + check in' : 'Add booking'}
        </button>
      </div>
    </div>
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
  const [err,      setErr]      = useState('');

  const inp = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors w-full';

  async function save() {
    setSaving(true); setErr('');
    const r = await dfetch('/api/operator/tee-times', { method:'POST', body:JSON.stringify({date,time,holes,playersAvailable:players,greenFee,cartFee,walkingAllowed:walking}) });
    setSaving(false);
    // SD-10: this closed the modal and refetched no matter what the server said.
    if (!r.ok) { setErr(r.error); return; }
    onSave();
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-xs text-bad bg-bad/5 border border-bad/20 rounded-md px-3 py-2">{err}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-[13px] font-semibold text-ink mb-1.5">Time</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} className={inp}/></div>
        <div><label className="block text-[13px] font-semibold text-ink mb-1.5">Holes</label><select value={holes} onChange={e=>setHoles(Number(e.target.value))} className={inp}><option value={9}>9</option><option value={18}>18</option></select></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label className="block text-[13px] font-semibold text-ink mb-1.5">Slots</label><input type="number" value={players} min={1} max={8} onChange={e=>setPlayers(Number(e.target.value))} className={inp}/></div>
        <div><label className="block text-[13px] font-semibold text-ink mb-1.5">Green $</label><input type="number" value={greenFee} min={0} onChange={e=>setGreenFee(Number(e.target.value))} className={inp}/></div>
        <div><label className="block text-[13px] font-semibold text-ink mb-1.5">Cart $</label><input type="number" value={cartFee} min={0} onChange={e=>setCartFee(Number(e.target.value))} className={inp}/></div>
      </div>
      <div className="flex items-center justify-between py-1">
        <span className="text-sm text-ink">Walking allowed</span>
        <button onClick={() => setWalking(!walking)} className={'relative w-11 h-6 rounded-sm transition-colors ' + (walking ? 'bg-pine' : 'bg-line-strong')}>
          <span className={'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-sm shadow-card transition-transform ' + (walking ? 'translate-x-5' : '')}/>
        </button>
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">
          {saving ? 'Adding...' : 'Add time'}
        </button>
      </div>
    </div>
  );
}

/* ─── Card Check-In Modal ───────────────────────────────────────────────── */
function CardCheckInModal({ booking, reason, onConfirm, onCancel }: {
  booking: Booking;
  /** SD-4: why this opened — the decline message when it is a retry. */
  reason?: string;
  onConfirm: (paymentMethodId: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cardStyle = { style: { base: { fontSize: '14px', color: '#141814', '::placeholder': { color: '#979B94' } }, invalid: { color: '#A3452F' } } };

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
          <h3 className="font-serif font-semibold text-ink text-[17px]">{reason ? 'Retry with a new card' : 'Check in'} — {booking.golferName}</h3>
          <p className="text-xs text-ink-soft mt-0.5">Enter golfer&apos;s card to charge ${(booking.totalAmount / 100).toFixed(2)}</p>
        </div>
        <button onClick={onCancel} className="text-ink-muted hover:text-ink"><X className="w-5 h-5"/></button>
      </div>
      {reason && (
        <div className="mb-4 text-xs text-bad bg-bad/5 border border-bad/20 rounded-md px-3 py-2">
          {reason} The booking still stands — take a different card, or collect in person and leave it for the operator to mark.
        </div>
      )}
      <div className="mb-4">
        <label className="block text-[13px] font-semibold text-ink mb-1.5">Card details</label>
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
        <span>Powered by Stripe</span>
      </div>
    </div>
  );
}
