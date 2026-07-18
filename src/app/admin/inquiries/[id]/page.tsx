'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Mail, Wrench, Power, CheckCircle, Clock, Trash2,
  XCircle, ArrowUpRight, Copy, Archive, Pencil, Save, RefreshCw, Eye, MoreHorizontal, Check,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface InquiryStatusEvent {
  id: string; fromStatus: string; toStatus: string;
  trigger: 'system' | 'admin' | 'course'; actorName: string | null; createdAt: string;
}
interface Inquiry {
  id: string; contactName: string; contactTitle: string; email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string;
  website: string; courseType: string; currentBookingMethod: string; teeTimesPerDay: number | null;
  greenFeeRange: string; hasResidentPricing: boolean; hasMemberPricing: boolean;
  hasCaddies: boolean; pricingNotes: string; lookingFor: string[]; additionalNotes: string;
  status: string; adminNotes: string; builtCourseId: string | null; createdAt: string;
  updatedAt?: string;
  detailsToken?: string | null; detailsJson?: string; needsJson?: string;
  events: InquiryStatusEvent[];
}
interface ApproveResult {
  tempPassword?: string; setupLink?: string; detailsLink?: string;
  emailSent?: boolean; emailError?: string;
}

const STATUS_DOT_MAP: Record<string, string> = {
  pending: 'warn', in_review: 'neutral', details_requested: 'neutral',
  details_submitted: 'neutral', building: 'warn', live: 'ok', rejected: 'bad', archived: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review', details_requested: 'Sheet Sent',
  details_submitted: 'Sheet In', building: 'Building', live: 'Live', rejected: 'Rejected',
  archived: 'Archived',
};
const ARCHIVED_STATUSES = new Set(['live', 'rejected', 'archived']);
const ALL_STATUSES = ['pending', 'in_review', 'details_requested', 'details_submitted', 'building', 'live', 'rejected', 'archived'];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function daysAgo(d: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)));
}

function whyArchived(inq: Inquiry): { reason: string; date: string } {
  if (inq.status === 'live') return { reason: 'Went live', date: inq.updatedAt || inq.createdAt };
  if (inq.status === 'rejected') return { reason: 'Rejected', date: inq.updatedAt || inq.createdAt };
  const lastEvent = inq.events.length > 0 ? inq.events[inq.events.length - 1] : null;
  const actorName = lastEvent?.actorName || '';
  if (actorName.toLowerCase().includes('permanently deleted')) return { reason: 'Course deleted', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  if (actorName.toLowerCase().includes('archived')) return { reason: 'Course archived', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  return { reason: 'Archived', date: inq.updatedAt || inq.createdAt };
}

type CheckpointState = 'done' | 'current' | 'pending' | 'skipped';
interface Checkpoint { key: string; label: string; state: CheckpointState; date?: string; }

function getCheckpoints(inq: Inquiry, hasSheet: boolean): Checkpoint[] {
  const reviewEvent = inq.events.find(e => e.toStatus === 'in_review');
  const submittedEvent = [...inq.events].reverse().find(e => e.toStatus === 'details_submitted');
  const sheetSentEvent = [...inq.events].reverse().find(e => e.toStatus === 'details_requested');
  const buildingEvent = [...inq.events].reverse().find(e => e.toStatus === 'building');
  const liveEvent = [...inq.events].reverse().find(e => e.toStatus === 'live');

  const reviewDone = inq.status !== 'pending';
  const skipBuilt = !hasSheet && !!inq.builtCourseId;
  const sheetDone = hasSheet && ['details_submitted', 'building', 'live'].includes(inq.status);
  const buildDone = !!inq.builtCourseId;
  const liveDone = inq.status === 'live';

  return [
    { key: 'inquiry', label: 'Inquiry', state: 'done', date: inq.createdAt },
    {
      key: 'review', label: 'Review',
      state: reviewDone ? 'done' : 'current',
      date: reviewEvent?.createdAt,
    },
    {
      key: 'sheet', label: 'Sheet',
      state: skipBuilt ? 'skipped' : sheetDone ? 'done' : (inq.status === 'in_review' || inq.status === 'details_requested') ? 'current' : 'pending',
      date: submittedEvent?.createdAt || sheetSentEvent?.createdAt,
    },
    {
      key: 'build', label: 'Build',
      state: buildDone ? 'done' : inq.status === 'details_submitted' ? 'current' : 'pending',
      date: buildingEvent?.createdAt,
    },
    {
      key: 'live', label: 'Live',
      state: liveDone ? 'done' : inq.status === 'building' ? 'current' : 'pending',
      date: liveEvent?.createdAt,
    },
  ];
}

function CheckpointStepper({ checkpoints }: { checkpoints: Checkpoint[] }) {
  return (
    <div className="flex items-center gap-1.5 mt-4">
      {checkpoints.map((c, i) => (
        <div key={c.key} className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={
              'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-medium ' + (
                c.state === 'done' ? 'bg-ok text-white'
                : c.state === 'current' ? 'bg-pine text-white'
                : c.state === 'skipped' ? 'bg-line text-ink-faint'
                : 'bg-line-soft text-ink-faint border border-line'
              )
            }>
              {c.state === 'done' ? <Check className="w-3 h-3"/> : i + 1}
            </div>
            <div className="min-w-0">
              <div className={
                'text-xs font-medium ' + (
                  c.state === 'current' ? 'text-pine' : c.state === 'skipped' ? 'text-ink-faint line-through' : 'text-ink'
                )
              }>
                {c.label}
              </div>
              {c.state === 'done' && c.date && <div className="text-[10px] text-ink-faint">{fmtDate(c.date)}</div>}
              {c.state === 'skipped' && <div className="text-[10px] text-ink-faint">skipped</div>}
            </div>
          </div>
          {i < checkpoints.length - 1 && <div className={'h-px flex-1 ' + (c.state === 'done' ? 'bg-ok/40' : 'bg-line')} />}
        </div>
      ))}
    </div>
  );
}

function MoreMenu({ open, onToggle, onClose, children }: { open: boolean; onToggle: () => void; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <button onClick={onToggle}
        className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper border border-line transition-colors">
        <MoreHorizontal className="w-4 h-4"/>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose}/>
          <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-line rounded-md shadow-lg z-20 py-1.5 px-1.5">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function ModalShell({ title, danger, onClose, children }: { title: string; danger?: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg border border-line max-w-md w-full p-5">
        <div className={'text-sm font-medium mb-3 ' + (danger ? 'text-bad' : 'text-ink')}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, disabled, danger, working }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean; danger?: boolean; working?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <button onClick={onCancel} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 transition-colors">Cancel</button>
      <button
        onClick={onConfirm}
        disabled={disabled || working}
        className={
          'text-xs font-medium px-3 py-1.5 rounded-md text-white transition-colors disabled:opacity-40 ' +
          (danger ? 'bg-bad hover:bg-bad/90' : 'bg-pine hover:bg-pine-hover')
        }
      >
        {working ? 'Working…' : confirmLabel}
      </button>
    </div>
  );
}

function fmtMoney(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  if (s.startsWith('$')) return s;
  const n = parseFloat(s);
  if (isNaN(n) || n === 0) return '';
  return '$' + (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2));
}

const WALKING_LABELS: Record<string, string> = {
  yes: 'Always allowed', weekdays: 'Weekdays only', no: 'Cart required',
};
const NINE_WHICH_LABELS: Record<string, string> = {
  front: 'Front nine only', back: 'Back nine only', both: 'Either nine',
};
const LAYOUT27_LABELS: Record<string, string> = {
  three_9s: 'Three separate 9s', '18_plus_9': 'One 18 + one separate 9',
};
const LAYOUT36_LABELS: Record<string, string> = {
  two_18s: 'Two 18-hole courses', other: 'Other / non-standard',
};
const PASS_TYPE_LABEL: Record<string, string> = {
  membership: 'Membership', season_pass: 'Season Pass', resident_card: 'Resident Card',
  resident_rate: 'Resident Rate (no card)', punch_card: 'Punch Card',
};
const BOOL_LABELS: Record<string, string> = { yes: 'Yes', no: 'No', true: 'Yes', false: 'No' };
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SField({ label, value, amber, span2 }: {
  label: string; value: string | null | undefined; amber?: boolean; span2?: boolean;
}) {
  const empty = !value || value.trim() === '';
  if (empty && !amber) return null;
  return (
    <div className={'bg-white border border-line rounded-lg px-4 py-3' + (span2 ? ' col-span-2' : '')}>
      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
      {empty
        ? <div className="text-[13px] text-warn font-medium">Not provided</div>
        : <div className="text-ink text-sm whitespace-pre-wrap">{value}</div>
      }
    </div>
  );
}

function SSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function renderFacilities(fv2: Record<string, unknown>): { label: string; detail?: string }[] {
  const items: { label: string; detail?: string }[] = [];
  if (fv2.range) {
    let detail = fv2.rangeTeeType === 'grass' ? 'Grass tees' : 'Mats';
    if (Array.isArray(fv2.rangeBuckets)) {
      const buckets = (fv2.rangeBuckets as Array<{ label: string; price: string; balls: string }>)
        .filter(b => b.price || b.balls)
        .map(b => (b.label || '?') + ': $' + b.price + '/' + b.balls + ' balls')
        .join(', ');
      if (buckets) detail += ' · ' + buckets;
    }
    items.push({ label: 'Driving range', detail });
  }
  if (fv2.puttingGreen) items.push({ label: 'Putting green' });
  if (fv2.chippingArea) items.push({ label: 'Chipping / short-game area' });
  if (fv2.proShop) items.push({ label: 'Pro shop' });
  if (fv2.lessons) {
    const d = [fv2.lessonsProName, fv2.lessonsProPhone].filter(Boolean).join(' · ');
    items.push({ label: 'Lessons', detail: d || undefined });
  }
  if (fv2.clubRental) {
    const d = String(fv2.clubRentalContact || '');
    items.push({ label: 'Club rental', detail: d || undefined });
  }
  if (fv2.cartRental) {
    items.push({ label: 'Cart rental', detail: fv2.cartRentalCost ? '$' + String(fv2.cartRentalCost) : undefined });
  }
  if (fv2.bagStorage) items.push({ label: 'Bag storage' });
  if (fv2.gpsCarts) items.push({ label: 'GPS carts' });
  if (fv2.eventSpace) {
    const d = String(fv2.eventSpaceContact || '');
    items.push({ label: 'Event / banquet space', detail: d || undefined });
  }
  if (fv2.lockerRooms) items.push({ label: 'Locker rooms' });
  if (fv2.tournaments) {
    items.push({ label: 'Hosts tournaments & outings', detail: String(fv2.tournamentsFrequency || '') || undefined });
  }
  // Must match the <option value=...> set in for-courses/details exactly —
  // this map previously used different keys (restaurant/bev_cart/multiple)
  // than the real form values, so raw enum strings like "beverage_cart"
  // leaked straight into the admin UI instead of a readable label.
  const rtMap: Record<string, string> = {
    full: 'Full restaurant', bar: 'Bar only', snack_bar: 'Snack bar', beverage_cart: 'Beverage cart only',
  };
  const rt = String(fv2.restaurantType || '');
  if (rt && rt !== 'none') items.push({ label: rtMap[rt] || rt });
  return items;
}

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10 focus:outline-none transition-colors';

const NEEDS_LABELS: Record<string, string> = {
  residentRates: 'Resident rates', hasMemberships: 'Memberships / season passes',
  roundsPerMonth: 'Rounds per month', publicTeeTimes: 'Non-member tee times',
  memberCount: 'Member count', outsideOutings: 'Outside outings',
  memberBookingToday: 'Current booking method', chargesMembersPerRound: 'Charges per round',
};
const NEEDS_VALUES: Record<string, string> = {
  yes: 'Yes', no: 'No', yes_regularly: 'Yes, regularly', limited: 'Limited windows',
  no_members_only: 'No, members only', under_100: 'Under 100', '100_300': '100–300',
  '300_plus': '300+', under_500: 'Under 500', '500_1500': '500–1,500',
  '1500_3000': '1,500–3,000', '3000_plus': '3,000+',
  pro_shop_phone: 'Pro shop / phone', signup_sheet: 'Sign-up sheet',
  booking_software: 'Booking software', other: 'Other',
};

function InquiryDetailInner() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const searchParams = useSearchParams();

  const backTab = searchParams.get('tab') || '';
  const backSearch = searchParams.get('q') || '';
  const backSort = searchParams.get('sort') || '';
  const backUrl = '/admin/inquiries' + (backTab || backSearch || backSort
    ? '?' + new URLSearchParams(
        Object.fromEntries([
          backTab && ['tab', backTab],
          backSearch && ['q', backSearch],
          backSort && ['sort', backSort],
        ].filter(Boolean) as [string, string][])
      ).toString()
    : '');

  const [adminReady, setAdminReady] = useState(false);
  const [inq, setInq] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'contact' | 'answers' | 'sheet' | 'activity'>('contact');
  const [editContact, setEditContact] = useState(false);
  const [contactEdits, setContactEdits] = useState<Record<string, string>>({});
  const [stageOverride, setStageOverride] = useState('');
  const [noteText, setNoteText] = useState('');
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [actionError, setActionError] = useState('');
  const [sendingPreview, setSendingPreview] = useState(false);
  const [previewMsg, setPreviewMsg] = useState('');
  const [nameConflict, setNameConflict] = useState<{ existingCourseId: string; existingCourseName: string; message: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    'delete' | 'send_sheet' | 'resend_sheet' | 'create_draft' | 'reject' | 'build_without_sheet' | 'dashboard_access' | 'send_preview' | 'go_live' | null
  >(null);
  const [goLiveChecks, setGoLiveChecks] = useState<{ label: string; ok: boolean }[] | null>(null);
  const [goLiveOverride, setGoLiveOverride] = useState('');
  const [buildConfirmText, setBuildConfirmText] = useState('');

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadInquiry = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/inquiries?id=' + params.id, { headers: H() });
    if (r.ok) {
      const data = await r.json();
      setInq(data);
      setStageOverride(data.status);
    } else {
      router.push('/admin/inquiries');
    }
    setLoading(false);
  }, [params.id, H, router]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadInquiry();
  }, [adminReady, loadInquiry]);

  useEffect(() => {
    if (pendingAction !== 'go_live' || !inq?.builtCourseId) return;
    setGoLiveChecks(null);
    const hasSheetForCheck = !!inq.detailsJson && inq.detailsJson !== '{}';
    const approved = [...inq.events].reverse().find(
      e => e.actorName === 'Course approved their page' || e.actorName === 'Course requested changes to their page'
    )?.actorName === 'Course approved their page';
    fetch('/api/admin/courses?statusOf=' + inq.builtCourseId, { headers: H() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setGoLiveChecks([
          { label: 'Setup sheet submitted', ok: hasSheetForCheck },
          { label: 'Course approved their preview', ok: approved },
          { label: 'Stripe connected', ok: !!d?.stripeAccountActive },
          { label: 'Operator email verified', ok: !!d?.operatorEmailVerified },
        ]);
      })
      .catch(() => setGoLiveChecks([
        { label: 'Setup sheet submitted', ok: hasSheetForCheck },
        { label: 'Course approved their preview', ok: approved },
        { label: 'Stripe connected', ok: false },
        { label: 'Operator email verified', ok: false },
      ]));
  }, [pendingAction, inq?.builtCourseId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function action(act: string, extra: Record<string, unknown> = {}) {
    setProcessing(true);
    setActionError('');
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id: params.id, action: act, ...extra }),
      });
      const text = await r.text();
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(text); } catch { /* ignore */ }
      if (r.ok) {
        if (['build_course', 'resend_welcome', 'send_dashboard_access', 'request_details', 'resend_details'].includes(act)) {
          setApproveResult(d as ApproveResult);
        }
        if (act === 'add_note') setNoteText('');
        await loadInquiry();
      } else {
        setActionError('Failed (' + r.status + '): ' + ((d.error as string) || text.slice(0, 200)));
      }
    } catch (e) { setActionError('Error: ' + e); }
    setProcessing(false);
  }

  async function createDraftCourse(force = false) {
    setProcessing(true);
    setActionError('');
    if (!force) setNameConflict(null);
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id: params.id, action: 'create_draft_course', force }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.error === 'name_conflict') {
          setNameConflict({ existingCourseId: d.existingCourseId, existingCourseName: d.existingCourseName, message: d.message });
          setProcessing(false);
          return;
        }
        setActionError((d.error as string) || 'Failed to create draft'); setProcessing(false); return;
      }
      if (d.courseId) router.push('/admin/courses/' + d.courseId);
    } catch (e) { setActionError('Error: ' + e); }
    setProcessing(false);
  }

  async function sendPreview() {
    if (!inq?.builtCourseId) return;
    setSendingPreview(true);
    setPreviewMsg('');
    try {
      const r = await fetch('/api/preview/send', {
        method: 'POST', headers: H(), body: JSON.stringify({ inquiryId: inq.id }),
      });
      const d = await r.json();
      if (r.ok) {
        setPreviewMsg('Preview email sent to ' + inq.email);
        await loadInquiry();
      } else {
        setPreviewMsg('Error: ' + (d.error || 'Failed to send'));
      }
    } catch { setPreviewMsg('Error: network failure'); }
    setSendingPreview(false);
  }

  async function deleteInquiry() {
    if (!inq) return;
    await fetch('/api/admin/inquiries?id=' + inq.id, { method: 'DELETE', headers: H() });
    router.push(backUrl);
  }

  async function saveContact() {
    setProcessing(true);
    setActionError('');
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id: params.id, action: 'update_contact', ...contactEdits }),
      });
      if (r.ok) { setEditContact(false); await loadInquiry(); }
      else { setActionError('Could not save — please try again'); }
    } catch (e) { setActionError('Error: ' + e); }
    setProcessing(false);
  }

  if (!adminReady || loading) return null;
  if (!inq) return null;

  const isArchived = ARCHIVED_STATUSES.has(inq.status);
  const dot = (STATUS_DOT_MAP[inq.status] || 'neutral') as 'ok' | 'bad' | 'warn' | 'neutral';
  const days = daysAgo(inq.updatedAt || inq.createdAt);

  const sheetSentEvent = [...inq.events].reverse().find(e => e.toStatus === 'details_requested');
  const liveEvent = [...inq.events].reverse().find(e => e.toStatus === 'live');
  const previewSentEvent = [...inq.events].reverse().find(e => e.actorName?.startsWith('Preview sent'));
  const latestApprovalEvent = [...inq.events].reverse().find(
    e => e.actorName === 'Course approved their page' || e.actorName === 'Course requested changes to their page'
  );
  const pageApproved = latestApprovalEvent?.actorName === 'Course approved their page';
  const pageChangesRequested = latestApprovalEvent?.actorName === 'Course requested changes to their page';

  let sd: Record<string, unknown> = {};
  if (inq.detailsJson) { try { sd = JSON.parse(inq.detailsJson); } catch { /* ignore */ } }
  const shHoles = parseInt(String(sd.holes || '18'), 10);
  const shLayout27 = String(sd.layout27 || '');
  const shLayout36 = String(sd.layout36 || '');
  const shPasses = Array.isArray(sd.passes) ? sd.passes as Record<string, unknown>[] : [];
  const shTeeSets = Array.isArray(sd.teeSets) ? sd.teeSets as Record<string, unknown>[] : [];
  const shFv2 = (sd.facilitiesV2 || {}) as Record<string, unknown>;
  const shPhotos = Array.isArray(sd.photos) ? sd.photos as string[] : [];
  const shDaysOpen = Array.isArray(sd.daysOpen) ? sd.daysOpen as number[] : [];
  const shDaysStr = shDaysOpen.length > 0 ? shDaysOpen.map(n => DAYS_SHORT[n]).join(', ') : 'Every day';
  const shNine27Names = Array.isArray(sd.nine27Names) ? sd.nine27Names as string[] : [];
  const shCourse36Names = Array.isArray(sd.course36Names) ? sd.course36Names as string[] : [];
  const facilityItems = Object.keys(shFv2).length > 0 ? renderFacilities(shFv2) : [];
  const hasCancelPolicy = String(sd.cancellationPolicy || '') === 'yes';
  const noCancel = String(sd.cancellationPolicy || '') === 'no';
  const hasSheet = !!inq.detailsJson && Object.keys(sd).length > 0;

  const wizardParams = new URLSearchParams({
    name: inq.courseName || '', city: inq.city || '', state: inq.state || '',
    zip: inq.zipCode || '', address: inq.address || '', website: inq.website || '',
    type: inq.courseType || 'public', contactName: inq.contactName || '',
    contactEmail: inq.email || '', inquiryId: inq.id,
  });

  const btnP = 'bg-pine hover:bg-pine-hover disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors';
  const btnO = 'bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors';
  const btnD = 'bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors';

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="inquiries" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">

        {/* ── Page header ──────────────────────────────────────────── */}
        <div className="px-8 py-6 border-b border-line bg-white shrink-0">
          <button
            onClick={() => router.push(backUrl)}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to inquiries
          </button>

          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink leading-snug">{inq.courseName}</h1>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <StatusDot status={dot} label={STATUS_LABEL[inq.status] || inq.status} />
                <span className="text-sm text-ink-muted">{inq.city}, {inq.state}</span>
                {!isArchived && <span className="text-sm text-ink-faint">{days}d in stage</span>}
                {isArchived && inq.status !== 'live' && inq.status !== 'rejected' && (() => {
                  const { reason, date } = whyArchived(inq);
                  return (
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Archive className="w-3.5 h-3.5" />{reason} · {fmtDate(date)}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Primary action + everything else in "More" */}
            <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
              <button onClick={loadInquiry} disabled={loading}
                className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper border border-line transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {inq.status === 'pending' && (
                <button onClick={() => action('mark_in_review')} disabled={processing} className={btnP}>
                  <Clock className="w-3.5 h-3.5" />In Review
                </button>
              )}
              {inq.status === 'in_review' && (
                <button onClick={() => setPendingAction('send_sheet')} disabled={processing} className={btnP}>
                  <Mail className="w-3.5 h-3.5" />Send Sheet
                </button>
              )}
              {inq.status === 'details_requested' && (
                <button onClick={() => setPendingAction('resend_sheet')} disabled={processing} className={btnO}>
                  <Mail className="w-3.5 h-3.5" />Resend Sheet
                </button>
              )}
              {inq.status === 'details_submitted' && (
                <button onClick={() => setPendingAction('create_draft')} disabled={processing} className={btnP}>
                  <CheckCircle className="w-3.5 h-3.5" />Create Draft Course
                </button>
              )}
              {inq.status === 'building' && pageChangesRequested && (
                <button onClick={() => router.push('/admin/messages?courseId=' + inq.builtCourseId)} className={btnP}>
                  <Mail className="w-3.5 h-3.5" />See Messages
                </button>
              )}
              {inq.status === 'building' && !pageChangesRequested && (
                <button onClick={() => setPendingAction('go_live')} disabled={processing} className={btnP}>
                  <Power className="w-3.5 h-3.5" />Go Live
                </button>
              )}
              {inq.status === 'live' && inq.builtCourseId && (
                <button onClick={() => router.push('/admin/courses/' + inq.builtCourseId)}
                  className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover bg-pine/5 hover:bg-pine/10 border border-pine/20 px-3 py-2 rounded-md transition-colors">
                  <Wrench className="w-3.5 h-3.5" />Manage course <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
              {(inq.status === 'archived' || inq.status === 'rejected') && (
                <button onClick={() => setPendingAction('delete')}
                  className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-bad hover:bg-bad/5 px-3 py-1.5 rounded-md border border-line hover:border-bad/20 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />Delete permanently
                </button>
              )}

              <MoreMenu open={moreOpen} onToggle={() => setMoreOpen(v => !v)} onClose={() => setMoreOpen(false)}>
                {!isArchived && (
                  <div className="px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Override stage</div>
                    <select
                      value={stageOverride}
                      onChange={e => {
                        const ns = e.target.value;
                        setStageOverride(ns);
                        setMoreOpen(false);
                        if (ns !== inq.status) action('set_status', { newStatus: ns });
                      }}
                      className="w-full bg-paper border border-line rounded-md px-2 py-1.5 text-xs text-ink outline-none cursor-pointer"
                    >
                      {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                    </select>
                  </div>
                )}
                {(inq.status === 'pending' || inq.status === 'in_review' || inq.status === 'details_requested' || inq.status === 'details_submitted') && (
                  <button onClick={() => { setMoreOpen(false); setPendingAction('reject'); }} disabled={processing}
                    className="w-full flex items-center gap-2 px-2 py-2 text-xs text-bad hover:bg-bad/5 rounded-md transition-colors">
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                )}
                {inq.status === 'in_review' && (
                  <button onClick={() => { setMoreOpen(false); setPendingAction('build_without_sheet'); }} disabled={processing}
                    className="w-full flex items-center gap-2 px-2 py-2 text-xs text-ink hover:bg-paper rounded-md transition-colors">
                    <Wrench className="w-3.5 h-3.5" />Build without sheet
                  </button>
                )}
                {inq.status === 'building' && (
                  <>
                    {inq.builtCourseId && (
                      <button onClick={() => { setMoreOpen(false); router.push('/admin/courses/' + inq.builtCourseId); }}
                        className="w-full flex items-center gap-2 px-2 py-2 text-xs text-ink hover:bg-paper rounded-md transition-colors">
                        <Wrench className="w-3.5 h-3.5" />Manage Course
                      </button>
                    )}
                    <button onClick={() => { setMoreOpen(false); setPendingAction('dashboard_access'); }} disabled={processing}
                      className="w-full flex items-center gap-2 px-2 py-2 text-xs text-ink hover:bg-paper rounded-md transition-colors">
                      <Mail className="w-3.5 h-3.5" />Send dashboard access
                    </button>
                    {inq.builtCourseId && (
                      <button onClick={() => { setMoreOpen(false); setPendingAction('send_preview'); }} disabled={sendingPreview}
                        className="w-full flex items-center gap-2 px-2 py-2 text-xs text-ink hover:bg-paper rounded-md transition-colors">
                        <Eye className="w-3.5 h-3.5" />{sendingPreview ? 'Sending…' : 'Send Preview'}
                      </button>
                    )}
                    {pageChangesRequested && (
                      <button onClick={() => { setMoreOpen(false); setPendingAction('go_live'); }} disabled={processing}
                        className="w-full flex items-center gap-2 px-2 py-2 text-xs text-ink hover:bg-paper rounded-md transition-colors">
                        <Power className="w-3.5 h-3.5" />Go Live anyway
                      </button>
                    )}
                    <button onClick={() => { setMoreOpen(false); setPendingAction('delete'); }}
                      className="w-full flex items-center gap-2 px-2 py-2 text-xs text-bad hover:bg-bad/5 rounded-md transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </>
                )}
              </MoreMenu>
            </div>
          </div>

          {/* Stage checkpoints — the flight plan */}
          {!isArchived && inq.status !== 'rejected' && (
            <CheckpointStepper checkpoints={getCheckpoints(inq, hasSheet)} />
          )}

          {/* Next-step guidance — merged from the old Next Steps card */}
          {!isArchived && inq.status !== 'rejected' && (
            <div className="mt-3 text-sm text-ink max-w-3xl">
              {(inq.status === 'pending' || inq.status === 'in_review') && (
                <>Review the <button onClick={() => setActiveTab('answers')} className="font-medium text-pine hover:underline">Answers tab</button>, then send the course their setup sheet.</>
              )}
              {inq.status === 'details_requested' && (
                <>Waiting on {inq.courseName}
                  {sheetSentEvent
                    ? ' — sheet sent ' + daysAgo(sheetSentEvent.createdAt) + ' day' + (daysAgo(sheetSentEvent.createdAt) !== 1 ? 's' : '') + ' ago.'
                    : ' — sheet sent recently.'}
                </>
              )}
              {inq.status === 'details_submitted' && (
                <>Sheet received. Review the <button onClick={() => setActiveTab('sheet')} className="font-medium text-pine hover:underline">Sheet tab</button>, then create the draft course.</>
              )}
              {inq.status === 'building' && (
                pageApproved
                  ? <>{inq.courseName} approved their page — ready to go live.</>
                  : pageChangesRequested
                  ? <>{inq.courseName} requested changes — see the Messages tab.</>
                  : previewSentEvent
                  ? <>Waiting on course review — sent {daysAgo(previewSentEvent.createdAt)} day{daysAgo(previewSentEvent.createdAt) !== 1 ? 's' : ''} ago.</>
                  : <>Course is built. Review it, then set it live when ready.</>
              )}
              {inq.status === 'live' && (
                <>Live since {liveEvent ? fmtDate(liveEvent.createdAt) : fmtDate(inq.updatedAt || inq.createdAt)}.</>
              )}
            </div>
          )}

          {/* Approve result */}
          {approveResult && (() => {
            const isDetails = !!approveResult.detailsLink;
            const rows: [string, string][] = isDetails
              ? [['Setup Sheet Link', approveResult.detailsLink as string]]
              : [['Temp Password', approveResult.tempPassword || ''], ['Setup Link', approveResult.setupLink || '']];
            const failed = approveResult.emailSent === false;
            return (
              <div className={'mt-4 rounded-md px-4 py-3 ' + (failed ? 'bg-bad/5 border border-bad/20' : 'bg-ok/5 border border-ok/20')}>
                <div className={'text-xs font-medium mb-2 ' + (failed ? 'text-bad' : 'text-ok')}>
                  {failed
                    ? 'Email failed (' + (approveResult.emailError || 'unknown') + '). Share manually:'
                    : (isDetails ? 'Setup sheet sent.' : 'Course built, welcome email sent.')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {rows.filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-2 bg-white rounded-md px-3 py-2 border border-line">
                      <span className="text-xs text-ink-muted shrink-0">{label}:</span>
                      <span className="text-xs text-ink font-mono">{val}</span>
                      <button onClick={() => navigator.clipboard.writeText(val)} className="text-ink-muted hover:text-pine transition-colors ml-1">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Inline action error */}
          {actionError && (
            <div className="mt-3 bg-bad/5 border border-bad/20 rounded-md px-4 py-2.5 flex items-center justify-between gap-3">
              <p className="text-bad text-xs leading-relaxed">{actionError}</p>
              <button onClick={() => setActionError('')} className="text-bad/60 hover:text-bad shrink-0 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}
          {/* Draft-build name conflict — never a dead-end */}
          {nameConflict && (
            <div className="mt-3 bg-warn/5 border border-warn/20 rounded-md px-4 py-3">
              <p className="text-warn text-xs leading-relaxed mb-2.5">{nameConflict.message}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => router.push('/admin/courses/' + nameConflict.existingCourseId)} className={btnO}>
                  <Wrench className="w-3.5 h-3.5" />View existing course
                </button>
                <button onClick={() => createDraftCourse(true)} disabled={processing} className={btnO}>
                  <CheckCircle className="w-3.5 h-3.5" />Create anyway
                </button>
                <button onClick={() => setNameConflict(null)} className="text-xs text-ink-faint hover:text-ink transition-colors ml-1">Dismiss</button>
              </div>
            </div>
          )}
          {/* Preview send feedback */}
          {previewMsg && (
            <div className={'mt-3 rounded-md px-4 py-2.5 flex items-center justify-between gap-3 ' + (previewMsg.startsWith('Error') ? 'bg-bad/5 border border-bad/20' : 'bg-ok/5 border border-ok/20')}>
              <p className={'text-xs leading-relaxed ' + (previewMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{previewMsg}</p>
              <button onClick={() => setPreviewMsg('')} className="text-ink-muted hover:text-ink shrink-0 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Tab nav ──────────────────────────────────────────────── */}
        <div className="border-b border-line bg-white shrink-0 px-8">
          <div className="flex gap-0">
            {(['contact', 'answers', 'sheet', 'activity'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={'px-4 py-3 text-sm font-medium border-b-2 transition-colors ' + (
                  activeTab === t ? 'border-pine text-pine' : 'border-transparent text-ink-muted hover:text-ink'
                )}>
                {t === 'contact' ? 'Contact' : t === 'answers' ? 'Answers' : t === 'sheet' ? 'Sheet' : 'Activity'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ──────────────────────────────────────────── */}
        <div className="flex-1 px-8 py-7">

          {/* Contact tab */}
          {activeTab === 'contact' && (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Contact Info</div>
                {!editContact ? (
                  <button onClick={() => {
                    setContactEdits({
                      contactName: inq.contactName || '', email: inq.email || '',
                      phone: inq.phone || '', courseName: inq.courseName || '',
                      city: inq.city || '', state: inq.state || '',
                    });
                    setEditContact(true);
                  }} className="flex items-center gap-1 text-xs text-ink-muted hover:text-pine transition-colors">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditContact(false)} className="text-xs text-ink-muted hover:text-ink transition-colors">Cancel</button>
                    <button onClick={saveContact} disabled={processing}
                      className="flex items-center gap-1 text-xs bg-pine text-white px-2.5 py-1 rounded-md hover:bg-pine-hover disabled:opacity-50 transition-colors">
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                )}
              </div>
              {editContact ? (
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['contactName', 'Contact name'], ['email', 'Email'], ['phone', 'Phone'],
                    ['courseName', 'Course name'], ['city', 'City'], ['state', 'State'],
                  ] as [string, string][]).map(([field, label]) => (
                    <div key={field}>
                      <label className="block text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">{label}</label>
                      <input value={contactEdits[field] ?? ''} onChange={e => setContactEdits(p => ({ ...p, [field]: e.target.value }))} className={iCls} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="text-base font-medium text-ink">{inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''}</div>
                    <a href={'mailto:' + inq.email} className="text-sm text-pine hover:underline block mt-1">{inq.email}</a>
                    {inq.phone && <div className="text-sm text-ink-muted mt-0.5">{inq.phone}</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-line rounded-lg px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">City / State</div>
                      <div className="text-ink font-medium">{inq.city}, {inq.state}</div>
                    </div>
                    <div className="bg-white border border-line rounded-lg px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Course type</div>
                      <div className="text-ink font-medium capitalize">{inq.courseType}</div>
                    </div>
                    {inq.website && (
                      <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Website</div>
                        <a href={inq.website} target="_blank" rel="noreferrer" className="text-pine hover:underline text-sm">{inq.website}</a>
                      </div>
                    )}
                    {inq.address && (
                      <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Address</div>
                        <div className="text-ink text-sm">{inq.address}{inq.zipCode ? ', ' + inq.zipCode : ''}</div>
                      </div>
                    )}
                    <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Submitted</div>
                      <div className="text-ink text-sm">{fmtDate(inq.createdAt)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Answers tab */}
          {activeTab === 'answers' && (
            <div className="max-w-3xl space-y-5">
              {(() => {
                const rows: [string, string][] = [];
                if (inq.currentBookingMethod) rows.push(['Current booking', inq.currentBookingMethod]);
                if (inq.teeTimesPerDay) rows.push(['Tee times/day', String(inq.teeTimesPerDay)]);
                if (inq.greenFeeRange) rows.push(['Green fees', inq.greenFeeRange]);
                return rows.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {rows.map(([label, val]) => (
                      <div key={label} className="bg-white border border-line rounded-lg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
                        <div className="text-ink font-medium">{val}</div>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              {(inq.hasMemberPricing || inq.hasResidentPricing || inq.hasCaddies) && (
                <div className="flex gap-2 flex-wrap">
                  {inq.hasMemberPricing && <span className="text-[11px] px-2.5 py-1 rounded-md bg-white text-ink-muted border border-line">Members</span>}
                  {inq.hasResidentPricing && <span className="text-[11px] px-2.5 py-1 rounded-md bg-white text-ink-muted border border-line">Residents</span>}
                  {inq.hasCaddies && <span className="text-[11px] px-2.5 py-1 rounded-md bg-white text-ink-muted border border-line">Caddies</span>}
                </div>
              )}
              {inq.lookingFor && inq.lookingFor.length > 0 && (
                <div className="bg-white border border-line rounded-lg px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Looking for</div>
                  <div className="text-ink font-medium">{inq.lookingFor.join(', ')}</div>
                </div>
              )}
              {inq.additionalNotes && (
                <div className="bg-white border border-line rounded-lg px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Additional notes</div>
                  <div className="text-ink text-sm">{inq.additionalNotes}</div>
                </div>
              )}
              {inq.pricingNotes && (
                <div className="bg-white border border-line rounded-lg px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Pricing notes</div>
                  <div className="text-ink text-sm">{inq.pricingNotes}</div>
                </div>
              )}
              {inq.needsJson && (() => {
                let n: Record<string, unknown> = {};
                try { n = JSON.parse(inq.needsJson || ''); } catch { /* ignore */ }
                const entries = Object.entries(n).filter(([, v]) => v !== '' && v !== null);
                if (entries.length === 0) return null;
                return (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em] text-warn mb-2">Branch Answers</div>
                    <div className="grid grid-cols-2 gap-3">
                      {entries.map(([k, v]) => (
                        <div key={k} className="bg-warn/5 border border-warn/20 rounded-lg px-4 py-3">
                          <div className="text-[10px] text-warn/80 mb-0.5">{NEEDS_LABELS[k] || k}</div>
                          <div className="text-warn font-medium">{NEEDS_VALUES[String(v)] || String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {!inq.currentBookingMethod && !inq.teeTimesPerDay && !inq.greenFeeRange &&
               !inq.hasMemberPricing && !inq.hasResidentPricing && !inq.hasCaddies &&
               (!inq.lookingFor || inq.lookingFor.length === 0) &&
               !inq.additionalNotes && !inq.pricingNotes &&
               (!inq.needsJson || inq.needsJson === '{}' || inq.needsJson === '') && (
                <p className="text-sm text-ink-faint text-center py-10">No inquiry answers on record.</p>
              )}
            </div>
          )}

          {/* Sheet tab */}
          {activeTab === 'sheet' && (
            <div className="max-w-3xl space-y-7">
              {!inq.builtCourseId && !isArchived && inq.status !== 'building' && (
                <div className="flex items-center justify-between bg-paper border border-line rounded-lg px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-ink-muted">Manual build (in person)</div>
                    <div className="text-[10px] text-ink-faint mt-0.5">Opens pre-fill wizard for in-person setup sessions</div>
                  </div>
                  <button onClick={() => router.push('/admin/create?' + wizardParams.toString())}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink bg-white hover:bg-paper border border-line px-3 py-1.5 rounded-md transition-colors shrink-0">
                    Open Wizard <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {!inq.detailsJson && (
                <p className="text-sm text-ink-faint text-center py-10">No sheet submitted yet.</p>
              )}
              {inq.detailsJson && !hasSheet && (
                <p className="text-sm text-ink-faint text-center py-10">Sheet submitted but appears empty.</p>
              )}

              {hasSheet && (
                <>
                  {/* Course Basics */}
                  <SSection title="Course Basics">
                    <SField label="Holes" value={sd.holes ? String(sd.holes) + '-hole course' : null} amber />
                    <SField label="Par" value={sd.par ? 'Par ' + String(sd.par) : null} />
                    <SField label="Season opens" value={sd.seasonOpen ? String(sd.seasonOpen) : null} />
                    <SField label="Season closes" value={sd.seasonClose ? String(sd.seasonClose) : null} />
                  </SSection>

                  {/* Playability — 9 holes */}
                  {shHoles === 9 && (
                    <SSection title="Playability">
                      <SField label="Replay for 18?" value={BOOL_LABELS[String(sd.nineReplay || '')] || null} amber />
                      <SField label="18-hole replay rate" value={fmtMoney(sd.nineReplayFee) || null} />
                    </SSection>
                  )}

                  {/* Playability — 18 holes */}
                  {shHoles === 18 && (
                    <SSection title="Playability">
                      <SField label="Can golfers book 9 holes?" value={BOOL_LABELS[String(sd.nineHoleSupport || '')] || null} amber />
                      {String(sd.nineHoleSupport) === 'yes' && (
                        <>
                          <SField label="Which nines can be booked" value={NINE_WHICH_LABELS[String(sd.nineHoleWhich || '')] || null} amber />
                          <SField label="9-hole green fee" value={fmtMoney(sd.nineHoleFee) || null} />
                          <SField label="9-hole par" value={sd.nineHolePar ? String(sd.nineHolePar) : null} />
                        </>
                      )}
                    </SSection>
                  )}

                  {/* Playability — 27 holes */}
                  {shHoles === 27 && (
                    <SSection title="Playability">
                      <SField label="27-hole layout" value={LAYOUT27_LABELS[shLayout27] || null} amber />
                      {shLayout27 === 'three_9s' && (
                        <>
                          <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Nine names</div>
                            {shNine27Names.every(n => !n.trim())
                              ? <div className="text-[13px] text-warn font-medium">Not provided</div>
                              : <div className="flex gap-2 flex-wrap">
                                  {shNine27Names.map((n, i) => (
                                    <span key={i} className="bg-paper border border-line px-2.5 py-1 rounded-md text-sm text-ink">{n || 'Nine ' + (i + 1)}</span>
                                  ))}
                                </div>
                            }
                          </div>
                          {/* V7: structured combos */}
                          {Array.isArray(sd.nine27CombosEnabled) && (sd.nine27CombosEnabled as string[]).length > 0 ? (
                            <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                              <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">18-hole combos offered</div>
                              <div className="flex gap-2 flex-wrap">
                                {(sd.nine27CombosEnabled as string[]).map(k => (
                                  <span key={k} className="bg-paper border border-line px-2.5 py-1 rounded-md text-sm text-ink">
                                    {k.replace('+', ' + ')}
                                    {(sd.nine27ComboNotes as Record<string, string> | undefined)?.[k]
                                      ? <span className="text-ink-muted text-xs ml-1">— {(sd.nine27ComboNotes as Record<string, string>)[k]}</span>
                                      : null}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : sd.nine27Combos ? (
                            <SField label="18-hole combos" value={String(sd.nine27Combos)} />
                          ) : null}
                          {/* V7: par per nine */}
                          {sd.nine27ParsPerNine && Object.keys(sd.nine27ParsPerNine as object).length > 0 && (
                            <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                              <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Par per nine</div>
                              <div className="flex gap-3 flex-wrap">
                                {Object.entries(sd.nine27ParsPerNine as Record<string, string>).map(([name, par]) => (
                                  <span key={name} className="text-sm text-ink"><span className="text-ink-muted">{name}:</span> {par}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <SField label="Each nine bookable alone?" value={BOOL_LABELS[String(sd.nine27BookableAlone || '')] || null} />
                        </>
                      )}
                      {shLayout27 === '18_plus_9' && (
                        <>
                          <SField label="Can golfers book 9 on the 18?" value={BOOL_LABELS[String(sd.nineHoleSupport || '')] || null} />
                          {String(sd.nineHoleSupport) === 'yes' && (
                            <SField label="Which nines" value={NINE_WHICH_LABELS[String(sd.nineHoleWhich || '')] || null} />
                          )}
                          <SField label="Separate 9 — name" value={sd.separate9Name ? String(sd.separate9Name) : null} amber />
                          <SField label="Separate 9 — par" value={sd.separate9Par ? String(sd.separate9Par) : null} />
                          <SField label="Separate 9 bookable alone?" value={BOOL_LABELS[String(sd.separate9Bookable || '')] || null} />
                          <SField label="Separate 9 green fee" value={fmtMoney(sd.separate9Fee) || null} />
                        </>
                      )}
                    </SSection>
                  )}

                  {/* Playability — 36 holes */}
                  {shHoles === 36 && (
                    <SSection title="Playability">
                      <SField label="36-hole layout" value={LAYOUT36_LABELS[shLayout36] || null} amber />
                      {shCourse36Names.length > 0 && (
                        <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                          <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Course names</div>
                          {shCourse36Names.every(n => !n.trim())
                            ? <div className="text-[13px] text-warn font-medium">Not provided</div>
                            : <div className="flex gap-2 flex-wrap">
                                {shCourse36Names.map((n, i) => (
                                  <span key={i} className="bg-paper border border-line px-2.5 py-1 rounded-md text-sm text-ink">{n || 'Course ' + (i + 1)}</span>
                                ))}
                              </div>
                          }
                        </div>
                      )}
                      <SField label="Layout notes" value={sd.course36LayoutDesc ? String(sd.course36LayoutDesc) : null} />
                    </SSection>
                  )}

                  {/* Tee Sets */}
                  {shTeeSets.length > 0 && shTeeSets.some(ts => ts.name) && (
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Tee Sets</div>
                      <div className="bg-white border border-line rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-line bg-paper">
                              {['Name', 'Color', 'Designation', 'Yardage', 'Par', 'Rating / Slope'].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {shTeeSets.filter(ts => ts.name).map((ts, i) => (
                              <tr key={i} className={'border-b border-line last:border-b-0 ' + (i % 2 === 0 ? '' : 'bg-paper/40')}>
                                <td className="px-4 py-2.5 font-medium text-ink">{String(ts.name || '—')}</td>
                                <td className="px-4 py-2.5 text-ink-muted">{String(ts.color || '—')}</td>
                                <td className="px-4 py-2.5 text-ink-muted capitalize">{String(ts.designation || '—')}</td>
                                <td className="px-4 py-2.5 text-ink-muted">{String(ts.yardage || '—')}</td>
                                <td className="px-4 py-2.5 text-ink-muted">{String(ts.par || '—')}</td>
                                <td className="px-4 py-2.5 text-ink-muted">
                                  {ts.rating && ts.slope
                                    ? String(ts.rating) + ' / ' + String(ts.slope)
                                    : ts.rating ? String(ts.rating) : ts.slope ? String(ts.slope) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tee Sheet Schedule */}
                  <SSection title="Tee Sheet Schedule">
                    <SField label="First tee time" value={sd.firstTeeTime ? String(sd.firstTeeTime) : null} amber />
                    <SField label="Last tee time" value={sd.lastTeeTime ? String(sd.lastTeeTime) : null} amber />
                    <SField label="Interval" value={sd.intervalMinutes ? String(sd.intervalMinutes) + ' min' : null} />
                    <SField label="Days open" value={shDaysStr} />
                    <SField label="Walking policy" value={WALKING_LABELS[String(sd.walkingAllowed || '')] || null} amber />
                  </SSection>

                  {/* Green Fees */}
                  <SSection title="Green Fees">
                    <SField label="Weekday green fee" value={fmtMoney(sd.greenFeeWeekday) || null} amber />
                    <SField label="Weekend green fee" value={fmtMoney(sd.greenFeeWeekend) || null} amber />
                    <SField label="Twilight rate" value={fmtMoney(sd.twilightFee) || null} />
                    <SField label="Cart fee" value={fmtMoney(sd.cartFee) || null} />
                    {shHoles === 9 && String(sd.nineReplay) === 'yes' && (
                      <SField label="18-hole replay rate" value={fmtMoney(sd.nineReplayFee) || null} />
                    )}
                    {shHoles === 18 && String(sd.nineHoleSupport) === 'yes' && (
                      <SField label="9-hole green fee" value={fmtMoney(sd.nineHoleFee) || null} />
                    )}
                  </SSection>

                  {/* Private: member / public access */}
                  {inq.courseType === 'private' && (sd.memberAdvanceDays || sd.publicGreenFee || sd.memberRate || sd.outingsVolume) && (
                    <SSection title="Member &amp; Public Access">
                      <SField label="Member advance booking" value={sd.memberAdvanceDays ? String(sd.memberAdvanceDays) + ' days' : null} />
                      <SField label="Protected tee times" value={sd.protectedTimes ? String(sd.protectedTimes) : null} />
                      <SField label="Non-member green fee" value={fmtMoney(sd.publicGreenFee) || null} />
                      <SField label="Public booking window" value={sd.publicWindow ? String(sd.publicWindow) : null} />
                      <SField label="Member rate" value={fmtMoney(sd.memberRate) || null} />
                      <SField label="Outings frequency" value={sd.outingsVolume ? String(sd.outingsVolume) : null} />
                    </SSection>
                  )}

                  {/* Memberships & Passes */}
                  {shPasses.length > 0 && shPasses.some(p => p.name || p.type) && (
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Memberships &amp; Passes</div>
                      <div className="space-y-3">
                        {shPasses.filter(p => p.name || p.type).map((p, i) => {
                          const isResident = p.type === 'resident_card' || p.type === 'resident_rate';
                          return (
                            <div key={i} className="bg-white border border-line rounded-lg px-4 py-3">
                              <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">
                                {PASS_TYPE_LABEL[String(p.type || '')] || String(p.type || 'Pass')}
                              </div>
                              <div className="text-sm font-medium text-ink mb-2">{String(p.name || 'Unnamed')}</div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-soft">
                                {!!p.fee && <span>Fee: {fmtMoney(p.fee)}{p.feePeriod ? ' / ' + String(p.feePeriod) : ''}</span>}
                                {!!p.includes && <span>Includes: {String(p.includes)}</span>}
                                {p.perRound === 'yes' && !!p.perRoundFee && <span>Per-round: {fmtMoney(p.perRoundFee)}</span>}
                                {isResident && !!p.residentWho && <span>Who qualifies: {String(p.residentWho)}</span>}
                                {isResident && !!p.residentVerifType && <span>Verification: {String(p.residentVerifType)}</span>}
                                {isResident && !!p.residentCardCost && <span>Card cost: {fmtMoney(p.residentCardCost)}</span>}
                                {p.type === 'resident_rate' && !!p.residentWeekday && <span>WD rate: {fmtMoney(p.residentWeekday)}</span>}
                                {p.type === 'resident_rate' && !!p.residentWeekend && <span>WE rate: {fmtMoney(p.residentWeekend)}</span>}
                                {p.type === 'resident_rate' && !!p.residentTwilight && <span>Twilight: {fmtMoney(p.residentTwilight)}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cancellation */}
                  <SSection title="Cancellation Policy">
                    <SField label="Charges for late cancel / no-show?" value={BOOL_LABELS[String(sd.cancellationPolicy || '')] || null} amber />
                    {hasCancelPolicy && (
                      <>
                        <SField label="Cancellation window" value={sd.cancellationHours ? String(sd.cancellationHours) + ' hours' : null} amber />
                        <SField label="Late cancel fee" value={fmtMoney(sd.lateFee) || null} amber />
                      </>
                    )}
                    {noCancel && (
                      <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">Note</div>
                        <div className="text-sm text-ink-soft">No cancellation policy — golfers pay at the course (no card required at booking).</div>
                      </div>
                    )}
                  </SSection>

                  {/* Facilities */}
                  {facilityItems.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Facilities</div>
                      <div className="bg-white border border-line rounded-lg divide-y divide-line">
                        {facilityItems.map((item, i) => (
                          <div key={i} className="px-4 py-2.5 flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-ok/60 mt-1.5 shrink-0" />
                            <div>
                              <span className="text-sm font-medium text-ink">{item.label}</span>
                              {item.detail && <span className="text-sm text-ink-muted ml-2">{item.detail}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.keys(shFv2).length > 0 && facilityItems.length === 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Facilities</div>
                      <div className="bg-white border border-line rounded-lg px-4 py-3 text-sm text-ink-soft">None selected.</div>
                    </div>
                  )}

                  {/* About */}
                  <SSection title="About">
                    <SField label="Course description" value={sd.description ? String(sd.description) : null} amber span2 />
                    <SField label="Website" value={sd.website ? String(sd.website) : null} />
                    <SField label="Additional notes" value={sd.additionalNotes ? String(sd.additionalNotes) : null} />
                    {shPhotos.length > 0 && (
                      <div className="col-span-2">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Photos ({shPhotos.length})</div>
                        <div className="flex gap-2 flex-wrap">
                          {shPhotos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt={'Photo ' + (i + 1)} className="w-28 h-20 object-cover rounded-md border border-line hover:border-pine/40 transition-colors" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </SSection>

                  {/* Build Checklist */}
                  {(() => {
                    const checks = [
                      { label: 'Weekday green fee', ok: !!(fmtMoney(sd.greenFeeWeekday)) },
                      { label: 'Weekend green fee', ok: !!(fmtMoney(sd.greenFeeWeekend)) },
                      { label: 'First tee time', ok: !!(sd.firstTeeTime) },
                      { label: 'Last tee time', ok: !!(sd.lastTeeTime) },
                      { label: 'Cancellation policy', ok: !!(sd.cancellationPolicy) },
                      { label: 'Course description', ok: !!(sd.description) },
                    ];
                    const allGood = checks.every(c => c.ok);
                    return (
                      <div className="bg-white border border-line rounded-lg p-4">
                        <div className={'text-[11px] uppercase tracking-[0.06em] mb-3 ' + (allGood ? 'text-ok' : 'text-warn')}>
                          {allGood ? 'Ready to Build' : 'Build Checklist'}
                        </div>
                        <div className="space-y-2">
                          {checks.map(c => (
                            <div key={c.label} className="flex items-center gap-2 text-sm">
                              <div className={'w-1.5 h-1.5 rounded-full shrink-0 ' + (c.ok ? 'bg-ok' : 'bg-warn')} />
                              <span className={c.ok ? 'text-ink' : 'text-warn'}>{c.label}</span>
                              {!c.ok && <span className="text-ink-faint text-xs">missing</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Activity tab */}
          {activeTab === 'activity' && (
            <div className="max-w-3xl space-y-6">
              {inq.events && inq.events.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">History</div>
                  <div className="bg-white border border-line rounded-lg divide-y divide-line">
                    {inq.events.map(ev => (
                      <div key={ev.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ' + (ev.trigger === 'system' ? 'bg-ink-faint' : 'bg-pine/60')} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink">
                            {ev.fromStatus === 'contact_updated' ? 'Contact info updated' : (
                              <>
                                <span>{STATUS_LABEL[ev.fromStatus] || ev.fromStatus}</span>
                                <span className="text-ink-muted mx-1.5">→</span>
                                <span className="font-medium">{STATUS_LABEL[ev.toStatus] || ev.toStatus}</span>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-ink-faint mt-0.5">
                            {ev.trigger === 'admin' && ev.actorName ? 'by ' + ev.actorName : ev.actorName || 'auto'}
                            {' · '}{fmtDate(ev.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Internal Notes</div>
                {inq.adminNotes && (
                  <pre className="text-sm text-ink-soft bg-white border border-line rounded-lg px-4 py-3 mb-3 whitespace-pre-wrap font-sans">
                    {inq.adminNotes}
                  </pre>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    rows={3}
                    className="flex-1 bg-white border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none"
                  />
                  <button
                    onClick={() => action('add_note', { note: noteText })}
                    disabled={!noteText.trim() || processing}
                    className="px-4 py-2 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors self-start"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Every risky/email-sending action goes through one of these instead of
          a bare browser confirm() — each states exactly what happens and who
          gets emailed before firing. */}
      {pendingAction && (() => {
        const close = () => { setPendingAction(null); setGoLiveOverride(''); setBuildConfirmText(''); setGoLiveChecks(null); };
        const fire = (fn: () => void) => { fn(); close(); };

        if (pendingAction === 'delete') {
          return (
            <ModalShell title={`Permanently delete "${inq.courseName}"?`} danger onClose={close}>
              <p className="text-sm text-ink-soft">This cannot be undone — the inquiry and its history are gone for good.</p>
              <ModalActions onCancel={close} onConfirm={() => fire(deleteInquiry)} confirmLabel="Delete permanently" danger/>
            </ModalShell>
          );
        }
        if (pendingAction === 'reject') {
          return (
            <ModalShell title="Reject this inquiry?" danger onClose={close}>
              <p className="text-sm text-ink-soft">Moves it to Archived. No email is sent to {inq.contactName}.</p>
              <ModalActions onCancel={close} onConfirm={() => fire(() => action('reject'))} confirmLabel="Reject" danger disabled={processing}/>
            </ModalShell>
          );
        }
        if (pendingAction === 'create_draft') {
          return (
            <ModalShell title="Create draft course?" onClose={close}>
              <p className="text-sm text-ink-soft">Builds a draft course for <strong>{inq.courseName}</strong> from their submitted sheet. No email is sent — you'll review it before anything goes live.</p>
              <ModalActions onCancel={close} onConfirm={() => fire(() => createDraftCourse())} confirmLabel="Create Draft Course" disabled={processing}/>
            </ModalShell>
          );
        }
        if (pendingAction === 'send_sheet' || pendingAction === 'resend_sheet') {
          const isResend = pendingAction === 'resend_sheet';
          return (
            <ModalShell title={isResend ? 'Resend the setup sheet?' : 'Send the setup sheet?'} onClose={close}>
              <p className="text-sm text-ink-soft">
                Sends the setup-sheet link to <strong>{inq.contactName}</strong> at <strong>{inq.email}</strong>. They'll fill in course details, pricing, and policies for us to build from.
              </p>
              <ModalActions onCancel={close} onConfirm={() => fire(() => action(isResend ? 'resend_details' : 'request_details'))} confirmLabel={isResend ? 'Resend Sheet' : 'Send Sheet'} disabled={processing}/>
            </ModalShell>
          );
        }
        if (pendingAction === 'dashboard_access') {
          return (
            <ModalShell title="Send dashboard access?" onClose={close}>
              <p className="text-sm text-ink-soft">
                Emails <strong>{inq.contactName}</strong> at <strong>{inq.email}</strong> a temporary password and login link to their operator dashboard, so they can start reviewing/editing their course before it's live.
              </p>
              <ModalActions onCancel={close} onConfirm={() => fire(() => action('send_dashboard_access'))} confirmLabel="Send Access" disabled={processing}/>
            </ModalShell>
          );
        }
        if (pendingAction === 'send_preview') {
          return (
            <ModalShell title="Send preview link?" onClose={close}>
              <p className="text-sm text-ink-soft">
                Emails <strong>{inq.contactName}</strong> at <strong>{inq.email}</strong> a link to preview their built course page, so they can approve it or request changes before going live.
              </p>
              <ModalActions onCancel={close} onConfirm={() => fire(sendPreview)} confirmLabel="Send Preview" disabled={sendingPreview}/>
            </ModalShell>
          );
        }
        if (pendingAction === 'build_without_sheet') {
          const canConfirm = buildConfirmText.trim().toUpperCase() === 'BUILD';
          return (
            <ModalShell title="Build without sheet?" danger onClose={close}>
              <p className="text-sm text-ink-soft mb-3">
                No setup sheet was submitted — this builds a draft course for <strong>{inq.courseName}</strong> from the inquiry answers alone. It immediately:
              </p>
              <ul className="text-sm text-ink-soft list-disc pl-5 mb-3 space-y-1">
                <li>Emails a welcome message + temporary password to <strong>{inq.email}</strong></li>
                <li>Attempts to create a Stripe Connect account for the course</li>
              </ul>
              <label className="block text-[10px] uppercase tracking-[0.06em] text-bad mb-1">Type BUILD to confirm</label>
              <input value={buildConfirmText} onChange={e => setBuildConfirmText(e.target.value)}
                className="w-full bg-paper border border-bad/30 rounded-md px-3 py-2 text-sm outline-none focus:border-bad/50" placeholder="BUILD"/>
              <ModalActions onCancel={close} onConfirm={() => fire(() => action('build_course'))} confirmLabel="Build & Email" danger disabled={!canConfirm || processing}/>
            </ModalShell>
          );
        }
        if (pendingAction === 'go_live') {
          const allOk = goLiveChecks?.every(c => c.ok) ?? false;
          const canConfirm = allOk || (goLiveChecks && goLiveOverride.trim() === inq.courseName);
          return (
            <ModalShell title={`Go live: ${inq.courseName}?`} danger={!!goLiveChecks && !allOk} onClose={close}>
              <p className="text-xs text-ink-muted mb-3">Makes the course bookable by golfers immediately.</p>
              {!goLiveChecks ? (
                <p className="text-xs text-ink-faint">Checking readiness…</p>
              ) : (
                <div className="space-y-1.5 mb-1">
                  {goLiveChecks.map(c => (
                    <div key={c.label} className="flex items-center gap-2 text-sm">
                      <StatusDot status={c.ok ? 'ok' : 'bad'}/>
                      <span className={c.ok ? 'text-ink' : 'text-bad'}>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {goLiveChecks && !allOk && (
                <div className="mt-3">
                  <label className="block text-[10px] uppercase tracking-[0.06em] text-bad mb-1">
                    Type &quot;{inq.courseName}&quot; to override and go live anyway
                  </label>
                  <input value={goLiveOverride} onChange={e => setGoLiveOverride(e.target.value)}
                    className="w-full bg-paper border border-bad/30 rounded-md px-3 py-2 text-sm outline-none focus:border-bad/50"/>
                </div>
              )}
              <ModalActions
                onCancel={close}
                onConfirm={() => fire(() => action('mark_live'))}
                confirmLabel={allOk ? 'Go Live' : 'Override & Go Live'}
                danger={!allOk}
                disabled={!goLiveChecks || !canConfirm || processing}
              />
            </ModalShell>
          );
        }
        return null;
      })()}
    </div>
  );
}

export default function InquiryDetailPage() {
  return (
    <Suspense fallback={null}>
      <InquiryDetailInner />
    </Suspense>
  );
}
