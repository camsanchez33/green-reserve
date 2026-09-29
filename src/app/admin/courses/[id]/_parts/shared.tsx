'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse(). Module-level types and helpers.

import { type CourseCallRow } from '@/components/admin/CourseCheckInCard';
import { type CourseHealthStatus } from '@/lib/course-metrics';
import { INPUT } from '@/components/ui/field';

export type TabName = 'overview' | 'money' | 'records' | 'messages' | 'operate' | 'setup';

// MP-5d: nine tabs became six. Transactions and Documents are named for what
// they hold (Money, Records) rather than the table they read. Tee Sheet and
// Schedule merged into Operate — one is the output of the other, and every
// mutation there now goes through the shared schedule service the operator's
// own dashboard calls. Staff died as a tab: its only action (resend login)
// sits on the Overview contact rail. Members is a read-only card on Operate.
export const TABS: { key: TabName; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'money', label: 'Money' },
  { key: 'records', label: 'Records' },
  { key: 'messages', label: 'Messages' },
  { key: 'operate', label: 'Operate' },
  { key: 'setup', label: 'Setup' },
];

export const TX_STATUS: Record<string, { dot: string; label: string }> = {
  card_saved: { dot: 'neutral', label: 'Card saved' },
  manual: { dot: 'neutral', label: 'Manual' },
  completed: { dot: 'ok', label: 'Completed' },
  fee_charged: { dot: 'bad', label: 'Fee charged' },
  cancelled: { dot: 'bad', label: 'Cancelled' },
  paid: { dot: 'ok', label: 'Paid' },
  refunded: { dot: 'neutral', label: 'Refunded' },
};

export interface TimelineEventDTO {
  type: string;
  at: string;
  data: Record<string, unknown>;
}

export interface CourseDetail {
  course: {
    id: string; name: string; slug: string; city: string; state: string; type: string; phone?: string;
    active: boolean; featured: boolean; stripeAccountActive: boolean; stripeAccountId?: string;
    cancellationHours: number; hasMemberPricing: boolean; hasResidentPricing: boolean;
    walkingAllowed: string; cartRequired: boolean; hasCaddies: boolean;
    residentCounty: string; residentState: string;
    archivedAt?: string | null; archivedBy?: string | null;
    adminNotes?: string | null; createdAt?: string;
    welcomeEmailSentAt?: string | null;
    liveStatus?: string;
    nextCheckInAt?: string | null;
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
  // COURSE_LAYOUT L3: read-only view of what the course configured.
  layout?: {
    nines: { id: string; name: string; par: number }[];
    products: { id: string; label: string; holes: number; active: boolean; nines: string[]; ratings: { teeSet: string; rating: number; slope: number }[] }[];
    teeSets: { id: string; name: string; yardage: number; rating: number; slope: number; perNine: { nine: string; yardage: number }[] }[];
    configured: boolean;
  };
  approval: { status: 'none' | 'approved' | 'changes_requested'; approvedAt: string | null };
  health: { status: CourseHealthStatus; label: string; dot: 'ok' | 'bad' | 'warn' | 'neutral'; reason: string };
  openItems: { unreadMessages: number; openChanges: string[]; hasSchedule: boolean };
  timeline: TimelineEventDTO[] | null;
  /** MP-5e part 3 — see lib/course-feed.ts. */
  relationship?: {
    feed: { at: string; kind: string; text: string; by?: string }[];
    operatorLastLoginAt: string | null; earnedCents: number; paidRounds: number; firstWentLiveAt: string | null;
  };
  /** CS-3: check-in calls + the linked inquiry's discovery calls, newest first. */
  calls?: CourseCallRow[];
  remindersPaused: boolean;
  // ORPHAN SWEEP item 2 (FUTURE-PROOF) — null means no linked inquiry; the
  // origin card shows that loudly instead of pretending it doesn't matter.
  origin: { inquiryId: string; acceptedAt: string } | null;
  // AGREEMENT = GO-LIVE GATE (RUN_QUEUE)
  agreementAccepted: boolean;
  // AG-2: signed / total signable documents
  agreements?: { signed: number; total: number; missing: string[] };
}

export interface TeeSlot {
  id: string; time: string; holes: number; product?: { label: string } | null; playersAvailable: number; playersBooked: number;
  greenFee: number; cartFee: number; status: string; tierName: string;
  bookings: {
    id: string; golferName: string; golferEmail: string; golferPhone: string;
    players: number; totalAmount: number; paymentStatus: string;
  }[];
}

export interface TxRow {
  id: string; type: 'booking' | 'membership_payment';
  golferName: string; golferEmail: string;
  amount: number; platformFee: number;
  status: string; date: string; detail: string;
}

export interface TierRow {
  id: string; name: string; annualFee: number; active: boolean; memberCount: number;
}

export interface MemberRow {
  id: string;
  golfer: { firstName: string; lastName: string; email: string } | null;
  inviteName: string; inviteEmail: string;
  tierName: string | null; status: string; paymentStatus: string;
  expiresAt: string | null; createdAt: string;
}

export const iCls = `${INPUT} w-full`;

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ScheduleRow {
  id: string; daysOfWeek: number[]; startTime: string; endTime: string;
  intervalMinutes: number; greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: number | null; memberRateWeekend: number | null;
  cartFee: number; walkingAllowed: boolean; active: boolean;
  productId?: string | null; productLabel?: string | null;
}

// What the schedule editor holds. Member rates are strings so an empty field
// can mean "no member rate" — the wire gets null, never 0.
export interface ScheduleFormState {
  /** L2: the round this schedule sells (required on a course with bookable rounds). */
  productId?: string;
  daysOfWeek: number[]; startTime: string; endTime: string; intervalMinutes: number;
  greenFeeWeekday: number; greenFeeWeekend: number;
  memberRateWeekday: string; memberRateWeekend: string;
  cartFee: number; walkingAllowed: boolean;
}

export const EMPTY_SCHEDULE: ScheduleFormState = {
  productId: '',
  daysOfWeek: [], startTime: '06:00', endTime: '18:00',
  intervalMinutes: 8, greenFeeWeekday: 65, greenFeeWeekend: 85,
  memberRateWeekday: '', memberRateWeekend: '', cartFee: 18, walkingAllowed: true,
};

// MP-5d: ONE set of fields for add and edit. Before this only "add" had a
// form; the PATCH endpoint existed with no UI caller.
export function ScheduleFields({ value, onChange, showMemberRates, products = [] }: {
  value: ScheduleFormState;
  onChange: (patch: Partial<ScheduleFormState>) => void;
  showMemberRates: boolean;
  /** L2: the course's active rounds; when there are any, every schedule belongs to one. */
  products?: { id: string; label: string; holes: number }[];
}) {
  const toggleDay = (d: number) => onChange({
    daysOfWeek: value.daysOfWeek.includes(d) ? value.daysOfWeek.filter(x => x !== d) : [...value.daysOfWeek, d],
  });
  return (
    <>
      {products.length > 0 && (
        <div>
          <label className="block"><span className="text-xs text-ink-muted block mb-1">Which round</span>
          <select value={value.productId ?? ''} onChange={e => onChange({ productId: e.target.value })} className={iCls}>
            <option value="">Select…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.label} · {p.holes} holes</option>)}
          </select></label>
        </div>
      )}
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
          <label className="block"><span className="text-xs text-ink-muted block mb-1">First tee</span>
          <input type="time" value={value.startTime} onChange={e => onChange({ startTime: e.target.value })} className={iCls} /></label>
        </div>
        <div>
          <label className="block"><span className="text-xs text-ink-muted block mb-1">Last tee</span>
          <input type="time" value={value.endTime} onChange={e => onChange({ endTime: e.target.value })} className={iCls} /></label>
        </div>
        <div>
          <label className="block"><span className="text-xs text-ink-muted block mb-1">Interval</span>
          <select value={value.intervalMinutes} onChange={e => onChange({ intervalMinutes: Number(e.target.value) })} className={iCls}>
            {[7, 8, 9, 10, 12, 15].map(v => <option key={v} value={v}>{v} min</option>)}
          </select></label>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block"><span className="text-xs text-ink-muted block mb-1">WD Green fee $</span>
          <input type="number" value={value.greenFeeWeekday} onChange={e => onChange({ greenFeeWeekday: Number(e.target.value) })} className={iCls} /></label>
        </div>
        <div>
          <label className="block"><span className="text-xs text-ink-muted block mb-1">WE Green fee $</span>
          <input type="number" value={value.greenFeeWeekend} onChange={e => onChange({ greenFeeWeekend: Number(e.target.value) })} className={iCls} /></label>
        </div>
        <div>
          <label className="block"><span className="text-xs text-ink-muted block mb-1">Cart fee $</span>
          <input type="number" value={value.cartFee} onChange={e => onChange({ cartFee: Number(e.target.value) })} className={iCls} /></label>
        </div>
      </div>
      {showMemberRates && (
        <div className="grid grid-cols-2 gap-3 bg-pine/5 border border-pine/20 rounded-md p-3">
          <div>
            <label className="block"><span className="text-xs font-medium text-pine block mb-1">Member rate WD $</span>
            <input type="number" value={value.memberRateWeekday} onChange={e => onChange({ memberRateWeekday: e.target.value })} className={iCls} /></label>
          </div>
          <div>
            <label className="block"><span className="text-xs font-medium text-pine block mb-1">Member rate WE $</span>
            <input type="number" value={value.memberRateWeekend} onChange={e => onChange({ memberRateWeekend: e.target.value })} className={iCls} /></label>
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

// A-05 item 4a — the onboarding checklist as named steps with date/state,
// replacing "Verified 3/3" everywhere. Dates are shown only where a real
// timestamp exists (no fabricated dates) — several steps don't have a
// dedicated timestamp field today (kept out of scope for a no-migration
// pass), so those render state-only.
export interface OnboardingStep { key: string; label: string; done: boolean; at: string | null }

export function onboardingSteps(d: CourseDetail): OnboardingStep[] {
  const c = d.course;
  return [
    { key: 'email_verified', label: 'Email verified', done: !!c.operator?.emailVerified, at: null },
    { key: 'password_set', label: 'Password set', done: !!c.operator, at: c.createdAt ?? null },
    { key: 'page_approved', label: 'Page approved', done: d.approval.status === 'approved', at: d.approval.approvedAt },
    { key: 'stripe_connected', label: 'Stripe connected', done: c.stripeAccountActive, at: null },
    { key: 'schedule_confirmed', label: 'Schedule confirmed', done: d.openItems.hasSchedule, at: (c.schedules && c.schedules[0]) ? c.schedules[0].createdAt : null },
    {
      key: 'agreement_accepted',
      label: d.agreements && d.agreements.total > 0 ? `Sign the agreements (${d.agreements.signed}/${d.agreements.total})` : 'Operator Agreement accepted',
      done: d.agreements && d.agreements.total > 0 ? d.agreements.signed >= d.agreements.total : d.agreementAccepted,
      at: d.timeline?.find(e => e.type === 'agreement_accepted')?.at ?? null,
    },
    { key: 'live', label: 'Live', done: c.active, at: c.welcomeEmailSentAt ?? null },
  ];
}
