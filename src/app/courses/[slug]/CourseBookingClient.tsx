'use client';
import { CoursePacks } from '@/components/CoursePacks';
import { CourseJoin } from '@/components/CourseJoin';
import { describePolicy, policyFrom, afterCutoffShort, insideWindowLine, policyMoney, type CancelPolicy } from '@/lib/cancel-policy';
import { lastBookableDate } from '@/lib/booking-window';
import { cartsFor } from '@/lib/cart-pricing';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Course, TeeTime } from '@/lib/courses-data';
import { TrustNote } from '@/components/TrustNote';
import { CARD, Card } from '@/components/ui/Card';
import { ACCESS_FEE_PER_PLAYER, hoursLabel } from '@/lib/booking-fees';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import { CHANGE_CATEGORIES } from '@/lib/change-requests';
import { StatusDot } from '@/components/ui/StatusDot';
import { CourseHeader, CourseFooter } from '@/components/golfer/CourseFrame';
import { SUPPORT_EMAIL } from '@/lib/contact';

const STATUS_STYLE: Record<string, string> = {
  available:   'text-ok',
  limited:     'text-warn',
  almost_full: 'text-bad',
};

const STATUS_LABEL: Record<string, string> = {
  available:   'Available',
  limited:     'Limited',
  almost_full: 'Almost Full',
};

type TimeOfDay = 'all' | 'morning' | 'afternoon' | 'twilight';

const TOD_OPTIONS: { key: TimeOfDay; label: string }[] = [
  { key: 'all',       label: 'All Times' },
  { key: 'morning',   label: 'Morning' },
  { key: 'afternoon', label: 'Midday' },
  { key: 'twilight',  label: 'Twilight' },
];

function formatDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function displayDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

// B-1: "Cancel free until <real date+time>" once a slot is picked. The tee
// time is a wall-clock time at the course; the arithmetic runs on UTC
// components and formats in UTC so the golfer's own timezone never shifts it.
function deadlineLabel(dateStr: string, timeStr: string, hoursBefore: number) {
  if (!dateStr || !timeStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.slice(0, 5).split(':').map(Number);
  if ([y, m, d, hh, mm].some(n => Number.isNaN(n))) return '';
  const cutoff = new Date(Date.UTC(y, m - 1, d, hh, mm) - hoursBefore * 3600_000);
  const day = cutoff.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const clock = cutoff.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${day}, ${clock}`;
}

/** Twilight starts where the course's twilight price period does (normalize-course), else 4 PM. */
function todOf(t: TeeTime, twilightStart: string | null | undefined): TimeOfDay {
  const tw = twilightStart && /^\d{2}:\d{2}$/.test(twilightStart) ? twilightStart : '16:00';
  const hm = t.time.slice(0, 5);
  if (hm < '12:00') return 'morning';
  if (hm < tw) return 'afternoon';
  return 'twilight';
}

/** The minute before a HH:MM time ("15:00" → "14:59"). */
function minuteBefore(hm: string): string {
  const m = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) - 1;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function holesOf(t: TeeTime): number | undefined {
  return (t as TeeTime & { holes?: number }).holes;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDateStrip() {
  const dates = [];
  const today = startOfToday();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function buildMonthGrid(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  return cells;
}

type CourseWithBrand = Course & {
  /** The course's IANA timezone, for "is this slot already past the cutoff" (R-GOLF-009). */
  timezone?: string | null;
  // B-1: the trust line reads the course's own policy. normalize-course.ts has
  // always sent these; the type just never named them.
  cancellation_hours?: number;
  late_cancellation_fee?: number;
  /** SP-B: the full policy (cents) — describePolicy() words. */
  cancel_policy?: CancelPolicy;
  brand_color?: string;
  gift_card_url?: string;
  photos?: { id: string; url: string; sortOrder: number }[];
  tee_sets?: { name: string; yardage: number; rating: number; slope: number }[];
  walking_policy?: string;
  walking_note?: string;
  dress_code?: string[];
  facilities?: string[];
  nines?: { name: string; par: number }[];
  page_approval_status?: 'none' | 'approved' | 'changes_requested';
  is_live?: boolean;
  // BOOKING WINDOWS
  public_advance_days?: number;
  twilight_start?: string | null;
  member_advance_days?: number;
  has_member_pricing?: boolean;
};
type WindowNotice = { windowDays: number; scope: 'public' | 'member'; lastDate: string; memberWindowDays: number; membersBookEarlier: boolean };

type ActiveTeeTime = TeeTime & { member_green_fee?: number; has_member_rate?: boolean };
type ActiveMemberSession = {
  email: string;
  name: string;
  tier: { name: string; color?: string } | null;
  source?: 'member' | 'golfer';
  /** BOOKING WINDOWS: how far ahead this member can book */
  windowDays?: number;
};
type GolferProfile = { firstName: string; lastName: string; email: string };

type PreviewMode = { courseId: string; token: string; /** the admin's view-only look — no approve / request changes */ look?: boolean } | null;

export default function CourseDetailPage({
  params,
  previewMode = null,
  initialCourse,
}: {
  params: Promise<{ slug: string }>;
  previewMode?: PreviewMode;
  /** PERF-1: server-rendered course (null = not found); undefined = fetch it here (preview). */
  initialCourse?: CourseWithBrand | null;
}) {
  const { slug } = use(params);
  const isDemo = DEMO_COURSE_SLUGS.includes(slug) && !previewMode;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [demoModal, setDemoModal] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [previewApprovalStatus, setPreviewApprovalStatus] = useState<'none' | 'approved' | 'changes_requested'>('none');
  const [approvingPreview, setApprovingPreview] = useState(false);
  const [previewApproveError, setPreviewApproveError] = useState('');
  const [showPreviewChangesModal, setShowPreviewChangesModal] = useState(false);
  const [previewChangesChecked, setPreviewChangesChecked] = useState<Set<string>>(new Set());
  const [previewChangesDetails, setPreviewChangesDetails] = useState<Record<string, string>>({});
  const [sendingPreviewChanges, setSendingPreviewChanges] = useState(false);
  const [previewChangesError, setPreviewChangesError] = useState('');
  const [previewChangesConfirmMsg, setPreviewChangesConfirmMsg] = useState('');

  // Set on mount; the date-dependent booking area renders only after it (see below).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [course, setCourse] = useState<CourseWithBrand | null>(initialCourse ?? null);
  const [notFound, setNotFound] = useState(initialCourse === null);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = searchParams.get('date');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= formatDate(startOfToday()) ? d : formatDate(startOfToday());
  });
  const [calMonth, setCalMonth] = useState(() => {
    const t = startOfToday();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [players, setPlayers] = useState(() => {
    const p = Number(searchParams.get('players'));
    return [1, 2, 3, 4].includes(p) ? p : 2;
  });
  const [selectedTime, setSelectedTime] = useState<TeeTime | null>(null);
  // GRP-1: a group page (/g/[slug]) links a time as ?tt={id}; it is picked once
  // the day's times load, if it still has room for the group.
  const pendingPick = useRef(searchParams.get('tt'));
  // A required cart is each tee time's call (cart_required, from its price-table cell — CART-1).
  const [withCart, setWithCart] = useState(false);
  const [todFilter, setTodFilter] = useState<TimeOfDay>(() => {
    const t = searchParams.get('tod');
    return ['all', 'morning', 'afternoon', 'twilight'].includes(t ?? '') ? (t as TimeOfDay) : 'all';
  });
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [holesFilter, setHolesFilter] = useState<'all' | '9' | '18'>(() => {
    const h = searchParams.get('holes');
    return ['all', '9', '18'].includes(h ?? '') ? (h as 'all' | '9' | '18') : 'all';
  });
  // L2: which bookable product the golfer is looking at ('all' until they pick;
  // the selector only shows when the day has more than one product).
  const [productFilter, setProductFilter] = useState<string>(() => searchParams.get('product') || 'all');
  const [showCal, setShowCal] = useState(false);
  // B-4: the nearest dates (up to two) with a slot that fits the party.
  const [nearestDates, setNearestDates] = useState<string[]>([]);
  const [searchingNext, setSearchingNext] = useState(false);
  const didMount = useRef(false);

  const [alertModal, setAlertModal] = useState<{ teeTimeId?: string; date: string; courseId: string } | null>(null);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertName, setAlertName] = useState('');
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [alertError, setAlertError] = useState('');

  const [memberSession, setMemberSession] = useState<ActiveMemberSession | null>(null);
  const [golferProfile, setGolferProfile] = useState<GolferProfile | null>(null);
  const [memberTeeTimes, setMemberTeeTimes] = useState<ActiveTeeTime[]>([]);
  // BOOKING WINDOWS: the API said this date is past the viewer's window.
  const [windowNotice, setWindowNotice] = useState<WindowNotice | null>(null);

  useEffect(() => {
    if (!previewMode && initialCourse !== undefined) {
      return; // server already sent it (cart default set from it in useState)
    }
    const url = previewMode
      ? `/api/preview/${previewMode.courseId}?token=${previewMode.token}`
      : `/api/courses/${slug}`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((c: CourseWithBrand) => {
        setCourse(c);
        if (previewMode && (c.page_approval_status === 'approved' || c.page_approval_status === 'changes_requested')) {
          setPreviewApprovalStatus(c.page_approval_status);
        }
      })
      .catch(() => setNotFound(true));
  }, [slug, previewMode]);

  async function approvePreview() {
    if (!previewMode) return;
    setApprovingPreview(true); setPreviewApproveError('');
    try {
      const res = await fetch(`/api/preview/${previewMode.courseId}/approve?token=${previewMode.token}`, { method: 'POST' });
      if (res.ok) setPreviewApprovalStatus('approved');
      else { const d = await res.json().catch(() => ({})); setPreviewApproveError(d.error || 'Could not submit approval.'); }
    } catch { setPreviewApproveError('Could not submit approval — try again.'); }
    setApprovingPreview(false);
  }

  function togglePreviewChangeCategory(key: string) {
    setPreviewChangesChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function submitPreviewChanges() {
    if (!previewMode || previewChangesChecked.size === 0) return;
    const items = Array.from(previewChangesChecked).map(category => ({
      category, detail: (previewChangesDetails[category] || '').trim(),
    }));
    setSendingPreviewChanges(true); setPreviewChangesError('');
    try {
      const res = await fetch(`/api/preview/${previewMode.courseId}/request-changes?token=${previewMode.token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      });
      if (res.ok) {
        setPreviewApprovalStatus('changes_requested'); setShowPreviewChangesModal(false);
        setPreviewChangesChecked(new Set()); setPreviewChangesDetails({});
        setPreviewChangesConfirmMsg("Got it — we'll make the changes and send you an updated preview.");
      } else {
        const d = await res.json().catch(() => ({})); setPreviewChangesError(d.error || 'Could not send.');
      }
    } catch { setPreviewChangesError('Could not send — try again.'); }
    setSendingPreviewChanges(false);
  }

  useEffect(() => {
    if (!course || course.type === 'member' || course.type === 'private') return;
    setLoadingTimes(true);
    setSelectedTime(null);
    setMaxPrice(null);
    setNearestDates([]);
    const url = previewMode
      ? `/api/preview/${previewMode.courseId}/tee-times?token=${previewMode.token}&date=${selectedDate}`
      : `/api/courses/${slug}/tee-times?date=${selectedDate}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTeeTimes(data); setWindowNotice(null);
          const pick = pendingPick.current && (data as TeeTime[]).find(t => String(t.id) === pendingPick.current);
          pendingPick.current = null;
          // A time with fewer spots than the default group size is still the one
          // they tapped: shrink the group to fit rather than drop the pick.
          if (pick && pick.players_available > 0) {
            if (pick.players_available < players) setPlayers(pick.players_available);
            setSelectedTime(pick);
          }
          return;
        }
        setTeeTimes([]);
        setWindowNotice(data && data.error === 'outside_window' ? data as WindowNotice : null);
      })
      .catch(() => setTeeTimes([]))
      .finally(() => setLoadingTimes(false));
  }, [slug, selectedDate, course, previewMode]);

  // Fetch member session — silent 401 is normal (just means not signed in).
  // Recognizes EITHER a gr_member session OR a gr_golfer session matched to
  // an active membership at this course (G5b).
  useEffect(() => {
    if (previewMode) return;
    fetch(`/api/member/${slug}/session`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setMemberSession(data))
      .catch(() => {});
  }, [slug, previewMode]);

  // Golfer header recognition (G5b) — independent of membership: a signed-in
  // golfer who isn't a member here still gets their name instead of "Sign in".
  useEffect(() => {
    if (previewMode) return;
    fetch('/api/golfer/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => setGolferProfile(data))
      .catch(() => {});
  }, [previewMode]);

  // Member tee times — fetched when member session is active, uses member API for correct pricing
  useEffect(() => {
    if (!memberSession || !course || course.type === 'member' || course.type === 'private') {
      setMemberTeeTimes([]);
      return;
    }
    fetch(`/api/member/${slug}/tee-times?date=${selectedDate}`)
      .then(r => r.ok ? r.json() : [])
      .then(setMemberTeeTimes)
      .catch(() => setMemberTeeTimes([]));
  }, [memberSession, slug, selectedDate, course]);

  // Sync filter state to URL (skip first render and preview pages)
  useEffect(() => {
    if (previewMode) return;
    if (!didMount.current) { didMount.current = true; return; }
    const p = new URLSearchParams();
    const todayStr2 = formatDate(startOfToday());
    if (selectedDate !== todayStr2) p.set('date', selectedDate);
    if (todFilter !== 'all') p.set('tod', todFilter);
    if (players !== 2) p.set('players', String(players));
    if (holesFilter !== 'all') p.set('holes', holesFilter);
    if (productFilter !== 'all') p.set('product', productFilter);
    const q = p.toString();
    router.replace(`/courses/${slug}${q ? '?' + q : ''}`, { scroll: false });
  }, [selectedDate, todFilter, players, holesFilter, productFilter, slug, router, previewMode]);

  // B-4: when the day is sold out, find the nearest dates (up to two, within
  // a week) that have a slot fitting the current party size — from the same
  // tee-times API the sheet already reads.
  useEffect(() => {
    // A sold-out day still returns rows (full ones render greyed), so the
    // trigger is "no row fits this party", not "no rows".
    if (loadingTimes || teeTimes.some(t => t.players_available >= players) || !course || course.type === 'member' || course.type === 'private') return;
    let cancelled = false;
    setSearchingNext(true);
    const scan = async () => {
      const found: string[] = [];
      // BOOKING WINDOWS: never suggest a date the viewer cannot book.
      const winDays = memberSession?.windowDays ?? course.public_advance_days ?? 7;
      const limit = lastBookableDate(winDays, new Date(), course.timezone);
      for (let i = 1; i <= 7 && found.length < 2; i++) {
        if (cancelled) return;
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() + i);
        if (formatDate(d) > limit) break;
        const ds = formatDate(d);
        try {
          const url = previewMode
            ? `/api/preview/${previewMode.courseId}/tee-times?token=${previewMode.token}&date=${ds}`
            : `/api/courses/${slug}/tee-times?date=${ds}`;
          const res = await fetch(url);
          const times = await res.json();
          if (Array.isArray(times) && times.some((t: TeeTime) => t.players_available >= players)) found.push(ds);
        } catch { /* continue */ }
      }
      if (!cancelled) { setNearestDates(found); setSearchingNext(false); }
    };
    scan();
    return () => { cancelled = true; };
  }, [teeTimes, loadingTimes, selectedDate, slug, course, previewMode, players]);

  const hasHolesData = useMemo(() => {
    const vals = new Set(teeTimes.map(t => holesOf(t)).filter(h => h !== undefined));
    return vals.size > 1;
  }, [teeTimes]);

  // L2: the day's bookable products, in first-seen order. One product = no selector.
  const dayProducts = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; holes?: number }>();
    for (const t of teeTimes) {
      if (t.product_id && t.product_label && !seen.has(t.product_id)) seen.set(t.product_id, { id: t.product_id, label: t.product_label, holes: holesOf(t) });
    }
    return Array.from(seen.values());
  }, [teeTimes]);
  const productActive = dayProducts.length > 1 && productFilter !== 'all' && dayProducts.some(p => p.id === productFilter) ? productFilter : 'all';

  const priceBounds = useMemo(() => {
    if (teeTimes.length === 0) return null;
    const fees = teeTimes.map(t => t.green_fee);
    return { min: Math.min(...fees), max: Math.max(...fees) };
  }, [teeTimes]);

  // B-4: the day has seats, just not enough for this party — the largest
  // party that does fit today.
  const bestFewer = useMemo(() => {
    const source: ActiveTeeTime[] = memberSession ? memberTeeTimes : teeTimes;
    const c = source.filter(t => t.players_available > 0 && t.players_available < players).map(t => t.players_available);
    return c.length ? Math.max(...c) : 0;
  }, [memberSession, memberTeeTimes, teeTimes, players]);

  // W2-6 slice 3: when every open time today is for a bigger group than picked, say so.
  const groupMin = useMemo(() => {
    const source: ActiveTeeTime[] = memberSession ? memberTeeTimes : teeTimes;
    const open = source.filter(t => t.players_available >= players);
    return open.length && open.every(t => (t.min_players ?? 1) > players) ? Math.min(...open.map(t => t.min_players ?? 1)) : 0;
  }, [memberSession, memberTeeTimes, teeTimes, players]);

  const filtered = useMemo(() => {
    const source: ActiveTeeTime[] = memberSession ? memberTeeTimes : teeTimes;
    return source.filter(t => {
      // Full slots (0 seats) always show greyed — player filter doesn't hide them
      if (t.players_available > 0 && t.players_available < players) return false;
      // W2-6 slice 3: a round can be for bigger groups only.
      if (t.players_available > 0 && (t.min_players ?? 1) > players) return false;
      if (todFilter !== 'all' && todOf(t, course?.twilight_start) !== todFilter) return false;
      if (maxPrice !== null && t.green_fee > maxPrice) return false;
      if (holesFilter !== 'all') {
        const h = holesOf(t);
        if (h !== undefined && String(h) !== holesFilter) return false;
      }
      if (productActive !== 'all' && t.product_id !== productActive) return false;
      return true;
    });
  }, [memberSession, memberTeeTimes, teeTimes, players, todFilter, maxPrice, holesFilter, productActive, course?.twilight_start]);

  const activeFilterCount =
    (todFilter !== 'all' ? 1 : 0) +
    (maxPrice !== null ? 1 : 0) +
    (holesFilter !== 'all' ? 1 : 0);

  function resetFilters() {
    setTodFilter('all');
    setMaxPrice(null);
    setHolesFilter('all');
  }

  function openAlert(teeTimeId?: string) {
    if (!course) return;
    // B-2: a full slot's alert lives inside its own row now; tapping the same
    // row again folds it back up. The date-level alert (no slot) keeps the modal.
    if (teeTimeId && alertModal?.teeTimeId === teeTimeId) { setAlertModal(null); return; }
    setAlertEmail('');
    setAlertName('');
    setAlertSent(false);
    setAlertError('');
    setAlertModal({ teeTimeId, date: selectedDate, courseId: String(course.id) });
  }

  async function submitAlert() {
    if (!alertModal || !alertEmail.trim()) return;
    setAlertSubmitting(true);
    const todWindows: Record<TimeOfDay, { windowStart: string; windowEnd: string }> = {
      all:       { windowStart: '', windowEnd: '' },
      morning:   { windowStart: '06:00', windowEnd: '11:59' },
      afternoon: { windowStart: '12:00', windowEnd: minuteBefore(course?.twilight_start ?? '16:00') },
      twilight:  { windowStart: course?.twilight_start ?? '16:00', windowEnd: '23:59' },
    };
    const windows = alertModal.teeTimeId ? { windowStart: '', windowEnd: '' } : todWindows[todFilter];
    setAlertError('');
    try {
      const r = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: alertModal.courseId,
          email: alertEmail.trim(),
          name: alertName.trim(),
          date: alertModal.date,
          windowStart: windows.windowStart,
          windowEnd: windows.windowEnd,
          players: alertModal.teeTimeId ? 1 : players,
          teeTimeId: alertModal.teeTimeId || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setAlertError(d.error || 'That did not go through — try again.');
        return;
      }
      setAlertSent(true);
    } catch {
      setAlertError('Network error — the alert was not set. Check your connection and try again.');
    } finally {
      setAlertSubmitting(false);
    }
  }

  async function memberSignOut() {
    // Golfer-recognized membership (G5b) rides the gr_golfer session, not
    // gr_member — clearing the member cookie alone would do nothing and
    // they'd be "signed back in" as a member on the very next page load.
    const endpoint = memberSession?.source === 'golfer' ? '/api/golfer/auth/logout' : `/api/member/${slug}/logout`;
    await fetch(endpoint, { method: 'POST' }).catch(() => {});
    setMemberSession(null);
    setMemberTeeTimes([]);
    setGolferProfile(null);
  }

  if (notFound) {
    // AMENDED BIRDIE RULE: no course resolved here, so there's nothing to
    // white-label — this state is a GreenReserve page even though it lives
    // under /courses/*. The ban on Birdie/GreenReserve branding still holds
    // on every other course-world page, where a real course renders.
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <Image src="/brand/golfer.svg" unoptimized alt="" width={56} height={69} className="mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-ink mb-2">We couldn&apos;t find that course.</h1>
          <p className="text-ink text-sm mt-2">Please use the booking link on your course&apos;s website, or contact <a href={`mailto:${SUPPORT_EMAIL}`} className="text-pine hover:underline">{SUPPORT_EMAIL}</a>.</p>
          <Link href="/" className="mt-6 inline-block text-sm text-pine hover:underline">← Back to home</Link>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-paper animate-pulse">
        <div className="h-44 bg-line" />
        <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-[260px_1fr] gap-8">
          <div className="h-96 bg-line rounded-lg" />
          <div className="space-y-3">
            <div className="h-8 bg-line rounded w-1/2" />
            <div className="h-16 bg-line rounded" />
            <div className="h-16 bg-line rounded" />
            <div className="h-16 bg-line rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Private course: show info + member sign-in only, no public booking
  if (course.type === 'private') {
    // Public look: a real photo when the course has one, otherwise a flat tint
    // of the course's own accent — never a stock gradient.
    const heroStyle = course.hero_image_url
      ? { backgroundImage: `url(${course.hero_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: course.brand_color || '#173B2A' };
    const amenities = course.facilities ?? [];
    return (
      <>
        <div className="relative h-44 sm:h-56 flex items-end overflow-hidden" style={heroStyle}>
          {course.hero_image_url
            ? <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/5" />
            : null}
          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 w-full pb-6">
            {course.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.logo_url} alt={`${course.name} logo`} className="h-12 w-12 rounded-md bg-white object-contain p-1 shadow-card mb-3" loading="lazy" />
            )}
            <span className="text-xs font-medium text-white/70 mb-1 inline-block">Private Club</span>
            <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-white leading-tight">{course.name}</h1>
            <p className="text-white/60 flex items-center gap-1.5 mt-1 text-sm">
              
              {course.city}, {course.state}
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid sm:grid-cols-[1fr_280px] gap-8 items-start">
            <div>
              {course.description && (
                <div className="mb-8">
                  <p className="text-sm text-ink-soft leading-relaxed">{course.description}</p>
                </div>
              )}
              {amenities.length > 0 && (
                <div className="mb-8">
                  <p className="text-[15px] font-semibold text-ink mb-3">Facilities</p>
                  <ul className="text-sm text-ink-soft list-disc pl-5 space-y-0.5">
                    {amenities.map((a: string, i: number) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-ink">
                {course.phone && <span><span className="text-ink-muted">Phone</span> · {course.phone}</span>}
                {course.website && (
                  <a href={course.website} target="_blank" rel="noopener noreferrer" className="text-pine hover:underline">
                    Website
                  </a>
                )}
              </div>
            </div>

            <div className={`${CARD} p-6 sticky top-20`}>
              <p className="text-[15px] font-semibold text-ink mb-1">Member access</p>
              <p className="text-ink text-sm leading-relaxed mb-5">
                This is a private club. Tee time booking is reserved for members. Sign in to your member account to view availability and book.
              </p>
              <Link
                href={`/courses/${slug}/member`}
                className="block w-full text-center py-3 px-5 text-white text-sm font-medium rounded-md transition-opacity hover:opacity-90"
                style={{ backgroundColor: course.brand_color || '#173B2A' }}
              >
                Member sign in
              </Link>
              <p className="text-center text-xs text-ink mt-4">
                Not a member? Contact the club directly.
              </p>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-line-soft text-center text-[11px] text-ink-faint">
            Booking by GreenReserve
          </div>
        </div>
      </>
    );
  }

  const accent = course.brand_color || '#173B2A';
  const amenities = course.facilities ?? [];
  const strip = buildDateStrip();
  const todayStr = formatDate(startOfToday());
  // BOOKING WINDOWS: the viewer's horizon — a member's tier window, else the
  // course's public window. Days beyond it are shown but not bookable.
  const viewerWindowDays = memberSession?.windowDays ?? course.public_advance_days ?? 7;
  // Counted from the course's today, as the server counts it (lib/booking-window, Revamp 3 fix 8).
  const lastBookableStr = lastBookableDate(viewerWindowDays, new Date(), course.timezone);
  const beyondWindow = (d: Date) => formatDate(d) > lastBookableStr;
  const memberWindowDays = course.member_advance_days ?? 14;
  const membersBookEarlier = !memberSession && !!course.has_member_pricing && memberWindowDays > viewerWindowDays;

  const morningItems = filtered.filter(t => todOf(t, course.twilight_start) === 'morning');
  const afternoonItems = filtered.filter(t => todOf(t, course.twilight_start) === 'afternoon');
  const twilightItems = filtered.filter(t => todOf(t, course.twilight_start) === 'twilight');
  const groups = [
    { key: 'morning',   label: 'Morning',   items: morningItems },
    { key: 'afternoon', label: 'Midday',    items: afternoonItems },
    { key: 'twilight',  label: 'Twilight',  items: twilightItems },
  ].filter(g => g.items.length > 0);

  const todayMonth = (() => { const t = startOfToday(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
  const maxMonth = new Date(todayMonth.getFullYear(), todayMonth.getMonth() + 2, 1);
  const canPrevMonth = calMonth > todayMonth;
  const canNextMonth = calMonth < maxMonth;

  function handleBook() {
    if (!selectedTime) return;
    if (previewMode) { setPreviewModal(true); return; }
    if (isDemo) { setDemoModal(true); return; }
    const qp = new URLSearchParams({
      tee_time_id: String(selectedTime.id),
      course_name: course!.name,
      course_slug: course!.slug,
      date: selectedDate,
      time: selectedTime.time,
      players: String(players),
      cart: withCart ? '1' : '0',
    });
    // /book's "Back to tee times" rebuilds this page's filters from these.
    if (todFilter !== 'all') qp.set('tod', todFilter);
    if (holesFilter !== 'all') qp.set('holes', holesFilter);
    if (productFilter !== 'all') qp.set('product', productFilter);
    router.push(`/book?${qp}`);
  }

  // B-1: the trust line's policy facts, from the course itself.
  const cancelHours = course.cancellation_hours ?? 24;
  const hasLateFee = (course.late_cancellation_fee ?? 0) > 0;
  // SP-B: a card is asked for only when the policy can charge one.
  const coursePolicy = course.cancel_policy ?? policyFrom({ cancellationHours: cancelHours, lateCancellationFeeCents: Math.round((course.late_cancellation_fee ?? 0) * 100) });
  // FEE-AT-BOOKING: with GreenReserve's fee charged at booking, every booking takes a card.
  const cardNeeded = describePolicy(coursePolicy).cardAtBooking;
  // The trust line's fee, worded as describePolicy words it ("$20", "$5 per player").
  const lateFeeWords = `${policyMoney(coursePolicy.lateCancellationFeeCents)}${coursePolicy.lateFeeBasis === 'player' ? ' per player' : ''}`;
  // R-GOLF-009: the picked slot's free-cancellation cutoff has already passed (course clock).
  const slotPastCutoff = hasLateFee && !!selectedTime && !!course.timezone
    && teeToUtcMs(selectedDate, selectedTime.time, course.timezone) - cancelHours * 3600_000 <= Date.now();

  // GOLFER-REDO: the picked time's summary — a sticky card on a laptop, a bar at the bottom of a phone.
  // Same arithmetic the rows use; the server still prices the booking.
  const sheetSource: ActiveTeeTime[] = memberSession ? memberTeeTimes : teeTimes;
  const selT = selectedTime ? (sheetSource.find(x => x.id === selectedTime.id) ?? (selectedTime as ActiveTeeTime)) : null;
  let summaryCard: React.ReactNode = null;
  let summaryBar: React.ReactNode = null;
  if (selT) {
    const sp = Math.min(players, selT.players_available || players);
    const memberRate = !!(selT.member_green_fee != null && selT.has_member_rate && selT.member_green_fee < selT.green_fee);
    const greenEach = memberRate ? selT.member_green_fee! : selT.green_fee;
    const perCartSel = course.cart_pricing === 'per_cart';
    const cartsSel = perCartSel ? cartsFor(sp) : sp;
    const cartOn = (withCart || selT.cart_required) && selT.cart_fee > 0;
    const total = greenEach * sp + (cartOn ? selT.cart_fee : 0) * cartsSel + ACCESS_FEE_PER_PLAYER * sp;
    const lines = (
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm text-ink-soft">
          <span>Green fee{memberRate ? ' (member)' : ''} × {sp}</span>
          <span>${(greenEach * sp).toFixed(2)}</span>
        </div>
        {cartOn && (
          <div className="flex justify-between text-sm text-ink-soft">
            <span>{perCartSel ? `${cartsSel} cart${cartsSel === 1 ? '' : 's'}` : `Cart × ${sp}`}{selT.cart_required ? ' (required)' : ''}</span>
            <span>${(selT.cart_fee * cartsSel).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-ink-soft">
          <span>Service fee × {sp}</span>
          <span>${(ACCESS_FEE_PER_PLAYER * sp).toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold text-ink pt-2 border-t border-line">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    );
    const continueBtn = (
      <button onClick={handleBook} className="w-full py-3 rounded-md font-medium text-white text-sm transition-colors" style={{ backgroundColor: accent }}>
        Continue to Book →
      </button>
    );
    summaryCard = (
      <div className="space-y-4">
        <div>
          <div className="font-serif font-semibold text-ink text-[22px] leading-none">{formatTime(selT.time)}</div>
          <div className="text-sm text-ink-muted mt-1.5">{displayDate(selectedDate)}</div>
        </div>
        <div>
          <div className="text-[13px] font-semibold text-ink mb-2">Players</div>
          <div className="flex gap-1.5">
            {([1, 2, 3, 4] as const).map(n => {
              const ok = n <= selT.players_available && n >= (selT.min_players ?? 1);
              return (
                <button key={n} disabled={!ok} onClick={() => setPlayers(n)}
                  className="flex-1 py-2 rounded-md border text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={sp === n && ok ? { borderColor: accent, backgroundColor: `${accent}12`, color: accent } : { borderColor: 'var(--color-line)', color: 'var(--color-ink-muted)' }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        {lines}
        <TrustNote>Your green fee goes to the course; the ${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player service fee is GreenReserve&apos;s.</TrustNote>
        {continueBtn}
      </div>
    );
    summaryBar = (
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden bg-white border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <details className="mb-2">
          <summary className="flex items-center justify-between cursor-pointer text-sm text-ink list-none">
            <span><b className="font-semibold">{formatTime(selT.time)}</b> · {displayDate(selectedDate)} · {sp} player{sp === 1 ? '' : 's'}</span>
            <span className="font-semibold">${total.toFixed(2)}</span>
          </summary>
          <div className="pt-3">
            {lines}
            <TrustNote className="pt-2">Your green fee goes to the course; the ${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player service fee is GreenReserve&apos;s.</TrustNote>
          </div>
        </details>
        {continueBtn}
      </div>
    );
  }

  const signInLink = memberSession ? (
    <Link href={`/courses/${slug}/account`} className="absolute top-3 right-4 z-10 flex items-center gap-1.5 text-xs font-medium text-white bg-black/55 hover:bg-black/70 rounded-md px-2.5 py-1.5 transition-colors">
      <span>{memberSession.name}</span>
      <span className="bg-white/15 rounded px-1.5 py-0.5 text-[10px] font-medium">Member{memberSession.tier?.name ? ` — ${memberSession.tier.name}` : ''}</span>
    </Link>
  ) : (
    <Link href={`/courses/${slug}/account`} className="absolute top-3 right-4 z-10 text-xs font-medium text-white bg-black/55 hover:bg-black/70 rounded-md px-2.5 py-1.5 transition-colors">
      {golferProfile ? `Hi, ${golferProfile.firstName}` : 'Sign in'}
    </Link>
  );

  return (
    <>
      {/* Preview banner */}
      {previewMode && course.is_live && (
        // Going live SUPERSEDES the pre-live review loop — an old preview
        // link visited after go-live must never show approve/request-changes
        // controls again. Route to Messages/support instead (V13b sanity
        // check, RUN_QUEUE "review loop doesn't understand already-live").
        <div className="bg-pine/10 border-b border-pine/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2 text-sm flex-wrap">
            
            <span className="text-ink-soft">
              This course is already live — you&apos;re viewing it as golfers see it. Questions or changes? Message the GreenReserve team from your dashboard, or reply to any of our emails.
            </span>
          </div>
        </div>
      )}
      {previewMode?.look && !course.is_live && (
        <div className="bg-pine/10 border-b border-pine/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 text-sm text-ink-soft">
            Your look at this page before the course sees it — not live, booking is off. Send them the preview from the inquiry when it&apos;s right.
          </div>
        </div>
      )}
      {previewMode && !previewMode.look && !course.is_live && (
        <div className="bg-pine/10 border-b border-pine/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 text-sm flex-wrap">
            
            <span className="text-ink-soft">
              Preview of your GreenReserve page &mdash; not live yet. Booking is disabled.
            </span>
            <div className="flex items-center gap-2 ml-auto">
              {previewApprovalStatus === 'approved' ? (
                <span className="text-xs text-ok font-medium flex items-center gap-1"><StatusDot status="ok" />Approved</span>
              ) : (
                <button onClick={approvePreview} disabled={approvingPreview}
                  className="text-xs font-medium text-white bg-pine hover:bg-pine-hover px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors">
                  {approvingPreview ? 'Submitting...' : 'Looks good — approve my page'}
                </button>
              )}
              {previewApprovalStatus === 'changes_requested' ? (
                <span className="text-xs text-warn font-medium">Changes requested</span>
              ) : (
                <button onClick={() => setShowPreviewChangesModal(true)}
                  className="text-xs font-medium text-ink-soft bg-white border border-line hover:border-line-strong px-3 py-1.5 rounded-md transition-colors">
                  Request changes
                </button>
              )}
            </div>
          </div>
          {(previewApproveError || previewChangesConfirmMsg) && (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-2 text-xs">
              {previewApproveError && <p className="text-bad">{previewApproveError}</p>}
              {previewChangesConfirmMsg && <p className="text-ok">{previewChangesConfirmMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* Request changes modal (preview) — structured categories, V13b */}
      {showPreviewChangesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-card max-h-[85vh] overflow-y-auto">
            <div className="text-ink font-medium mb-1">What would you like changed?</div>
            <div className="text-xs text-ink mb-3">Check everything that applies — you can add a note for each.</div>
            <div className="space-y-2 mb-3">
              {CHANGE_CATEGORIES.map(cat => {
                const checked = previewChangesChecked.has(cat.key);
                return (
                  <div key={cat.key} className="border border-line rounded-md p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => togglePreviewChangeCategory(cat.key)} />
                      <span className="text-sm font-medium text-ink">{cat.label}</span>
                    </label>
                    {checked && (
                      <textarea
                        value={previewChangesDetails[cat.key] || ''}
                        onChange={e => setPreviewChangesDetails(prev => ({ ...prev, [cat.key]: e.target.value }))}
                        rows={2}
                        placeholder="What should change?"
                        className="w-full mt-2 bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {previewChangesError && <p className="text-xs text-bad mb-2">{previewChangesError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowPreviewChangesModal(false); setPreviewChangesChecked(new Set()); setPreviewChangesDetails({}); setPreviewChangesError(''); }}
                className="text-xs text-ink-soft hover:text-ink px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={submitPreviewChanges}
                disabled={sendingPreviewChanges || previewChangesChecked.size === 0}
                className="text-xs font-medium text-white bg-pine hover:bg-pine-hover px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
              >
                {sendingPreviewChanges ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-card">
            <div className="text-ink font-medium mb-2">Booking disabled in preview</div>
            <p className="text-ink-soft text-sm mb-5">This is a preview page &mdash; bookings are not active yet. Reply to the preview email with any changes you&apos;d like before going live.</p>
            <button
              onClick={() => setPreviewModal(false)}
              className="w-full bg-pine hover:bg-pine-hover text-white rounded-md py-2.5 text-sm font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Demo banner */}
      {isDemo && (
        <div className="bg-pine/10 border-b border-pine/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4 flex-wrap text-sm">
            <span className="text-ink-soft">
              This is a live demo of a GreenReserve course page — your course gets one just like it, free.
            </span>
            <a href="/demo" className="text-pine font-medium hover:underline whitespace-nowrap">
              Book a demo
            </a>
          </div>
        </div>
      )}

      {/* GOLFER-REDO: banner, logo, name, details, Find a tee time, and the two tabs. */}
      <CourseHeader course={course} accent={accent} active="times" right={signInLink} showTabs={!previewMode} />

      {/* DASH-D (Cam 2026-11-01): today's course conditions, set on the dashboard's Home — a plain line, not an alert. */}
      {(course.conditions_today?.length ?? 0) > 0 && (
        <div className="border-b border-line bg-white">
          <p className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-[13px] text-ink-soft"><span className="font-medium text-ink">Today</span> · {course.conditions_today!.join(' · ')}</p>
        </div>
      )}

      {/* Course alert banner */}
      {course.conditions && (
        <div className="bg-warn/5 border-b border-warn/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2 text-sm text-warn">
            
            <span><span className="font-medium">Course notice:</span> {course.conditions}</span>
          </div>
        </div>
      )}

      {/* B-1: no tab bar. The sheet is the page; About and Photos are sections
          below it (the framework's fixed section order: identity → book
          controls → trust line → tee sheet → the place → GreenReserve line). */}

      {/* Main content */}
      <div className="bg-paper min-h-screen">
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${selectedTime ? 'pb-40 lg:pb-8' : ''}`}>

          {(course.type === 'member' ? (
            <div className={`${CARD} max-w-md mx-auto p-8 text-center`}>
              
              <h2 className="font-serif font-semibold text-ink text-xl mb-2">Member-only club</h2>
              <p className="text-ink-soft text-sm mb-5">
                This is a member-only or invitation-based club. Contact the pro shop for guest access.
              </p>
              {course.phone && (
                <a
                  href={`tel:${course.phone}`}
                  className="inline-block w-full py-3 rounded-md font-medium text-sm text-white text-center transition-colors"
                  style={{ backgroundColor: accent }}
                >
                  Call Pro Shop
                </a>
              )}
            </div>
          ) : !mounted ? (
            // PERF-1: the course arrives in the first HTML now, but everything in
            // the booking area hangs off "today" in the GOLFER's timezone (the
            // date strip, the calendar, "Today", the booking window), which the
            // server — on UTC — cannot know; rendering it there broke hydration
            // every US evening. So the shell is server-rendered and this area
            // fills in on mount. Tall on purpose: anything it pushes is below the fold.
            // A <section> with its own key, not a <div>: React must REPLACE it
            // with the grid, not morph it — a morphed node counts as a layout
            // shift (measured 0.24), a newly inserted one does not.
            <section key="booking-placeholder" className="min-h-[900px] animate-pulse" aria-hidden="true">
              <div className="h-10 bg-line/60 rounded-md mb-4 lg:ml-[292px]" />
              <div className="space-y-3 lg:ml-[292px]">
                <div className="h-16 bg-line/60 rounded-md" />
                <div className="h-16 bg-line/60 rounded-md" />
                <div className="h-16 bg-line/60 rounded-md" />
              </div>
            </section>
          ) : (
            <div key="booking" className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">

              {/* RIGHT: Tee sheet */}
              <section id="times" className="min-w-0 scroll-mt-4">

                {/* GOLFER-REDO (Cam 2026-11-11): ONE filter row — dates, players, holes, walking or riding. */}
                <Card className="p-4 sm:p-5 mb-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-2 overflow-x-auto pb-1 flex-1" role="group" aria-label="Date">
                      {strip.map(d => {
                        const ds = formatDate(d);
                        const isSelected = ds === selectedDate;
                        const isToday = ds === todayStr;
                        const isBeyond = beyondWindow(d);
                        return (
                          <button key={ds} disabled={isBeyond} aria-pressed={isSelected}
                            title={isBeyond ? (membersBookEarlier ? 'Members can book earlier — sign in' : `Opens ${viewerWindowDays} days ahead`) : undefined}
                            onClick={() => setSelectedDate(ds)}
                            className="flex-none w-[64px] sm:w-[76px] py-2 rounded-lg text-center transition-colors disabled:cursor-not-allowed"
                            style={isSelected
                              ? { border: `1px solid ${accent}`, backgroundColor: `${accent}14`, boxShadow: `inset 0 0 0 1px ${accent}`, color: 'var(--color-ink)' }
                              : isBeyond
                                ? { backgroundColor: '#fff', border: '1px dashed var(--color-line)', color: 'var(--color-ink-faint)' }
                                : { backgroundColor: '#fff', border: '1px solid var(--color-line)', color: 'var(--color-ink)' }}>
                            <span className="block text-xs text-ink-muted">{isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            <span className="block text-xl font-semibold leading-tight">{d.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => setShowCal(v => !v)} aria-expanded={showCal}
                      className="flex-none text-[13px] font-medium rounded-md border border-line bg-white px-3 py-2 text-ink-soft hover:text-ink transition-colors">
                      More dates
                    </button>
                  </div>
                  {showCal && <div className="max-w-xs border-t border-line pt-4">
                  {/* Calendar */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                        disabled={!canPrevMonth}
                        className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-25 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-sm font-medium text-ink">{monthLabel(calMonth)}</span>
                      <button
                        onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                        disabled={!canNextMonth}
                        className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-25 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[11px] font-medium text-ink-muted mb-1">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {buildMonthGrid(calMonth).map((d, i) => {
                        if (!d) return <div key={`e${i}`} />;
                        const ds = formatDate(d);
                        const isPast = d < startOfToday();
                        const isBeyond = !isPast && beyondWindow(d);
                        const isSelected = ds === selectedDate;
                        const isToday = ds === todayStr;
                        const base = 'aspect-square flex items-center justify-center rounded-md text-xs font-medium transition-colors';
                        let cls = 'text-ink hover:bg-line-soft';
                        if (isPast || isBeyond) cls = 'text-ink-faint cursor-default';
                        // Today and the selected day both wear the course's colour.
                        let selStyle: React.CSSProperties = {};
                        if (isToday && !isSelected) { cls = ''; selStyle = { color: accent, boxShadow: `inset 0 0 0 1px ${accent}4d` }; }
                        if (isSelected) { cls = ''; selStyle = { backgroundColor: accent, color: '#fff' }; }
                        return (
                          <button key={ds} disabled={isPast || isBeyond} onClick={() => setSelectedDate(ds)}
                            title={isBeyond ? (membersBookEarlier ? 'Members can book earlier — sign in' : `Opens ${viewerWindowDays} days ahead`) : undefined}
                            className={`${base} ${cls}`} style={selStyle}>
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  </div>}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-ink-muted">Players</span>
                      <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Players">
                        {[1, 2, 3, 4].map(n => (
                          <button key={n} type="button" aria-pressed={players === n}
                            onClick={() => { setPlayers(n); setSelectedTime(null); }}
                            className="px-3.5 py-2 font-medium border-r border-line last:border-r-0 transition-colors"
                            style={players === n ? { backgroundColor: accent, color: '#fff' } : { backgroundColor: '#fff', color: 'var(--color-ink-soft)' }}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {hasHolesData && (
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-ink-muted">Holes</span>
                        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Holes">
                          {(['9', '18'] as const).map(h => (
                            <button key={h} type="button" aria-pressed={holesFilter === h}
                              onClick={() => setHolesFilter(holesFilter === h ? 'all' : h)}
                              className="px-3.5 py-2 font-medium border-r border-line last:border-r-0 transition-colors"
                              style={holesFilter === h ? { backgroundColor: accent, color: '#fff' } : { backgroundColor: '#fff', color: 'var(--color-ink-soft)' }}>
                              {h}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {teeTimes.some(t => t.cart_fee > 0 && !t.cart_required) && (
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-ink-muted">Getting around</span>
                        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Walking or riding">
                          {([['Walking', false], ['Riding', true]] as const).map(([label, riding]) => (
                            <button key={label} type="button" aria-pressed={withCart === riding} onClick={() => setWithCart(riding)}
                              className="px-3.5 py-2 font-medium border-r border-line last:border-r-0 transition-colors"
                              style={withCart === riding ? { backgroundColor: accent, color: '#fff' } : { backgroundColor: '#fff', color: 'var(--color-ink-soft)' }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* L2: product selector — only when the day sells more than one product. */}
                {dayProducts.length > 1 && (
                  <div className="mb-4">
                    <div className="text-[13px] font-semibold text-ink mb-2">Which round</div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Which round">
                      {[{ id: 'all', label: 'All', holes: undefined as number | undefined }, ...dayProducts].map(p => {
                        const isSel = productActive === p.id;
                        return (
                          <button key={p.id} type="button" aria-pressed={isSel}
                            onClick={() => { setProductFilter(p.id); setSelectedTime(null); }}
                            className="px-3.5 py-2 rounded-md border text-sm font-medium transition-colors"
                            style={isSel ? { borderColor: accent, backgroundColor: `${accent}12`, color: accent } : { borderColor: 'var(--color-line)', color: 'var(--color-ink-muted)', backgroundColor: '#fff' }}>
                            {p.label}{p.holes ? <span className="font-normal opacity-70"> · {p.holes}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="font-serif text-ink text-[28px] sm:text-[34px] leading-none">
                      Tee times for <span style={{ color: accent }}>{displayDate(selectedDate)}</span>
                    </h2>
                    {/* Always takes its place (hidden while loading): appearing later, it wrapped onto a second
                        line on a phone and pushed the page down (perf budget: CLS). */}
                    <span className={'text-sm text-ink-muted' + (!loadingTimes && teeTimes.length > 0 ? '' : ' invisible')} aria-hidden={loadingTimes || teeTimes.length === 0}>{loadingTimes || teeTimes.length === 0 ? '0 available' : `${filtered.length} available`}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => openAlert()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-line bg-white text-ink-soft hover:text-ink transition-colors"
                    >
                       Set alert
                    </button>
                    {memberSession && (
                      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <span className="font-medium text-ink-soft">{memberSession.name}</span>
                        <span>·</span>
                        <button onClick={memberSignOut} className="hover:text-ink transition-colors">Sign out</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* B-1: the trust line, above the first slot, from the course's
                    own policy — the same facts /book states after the golfer
                    has already committed. */}
                <p className="mb-3 text-[13px] leading-relaxed text-ink-soft">
                  {!slotPastCutoff && <><b className="text-ink font-semibold">Nothing charged today.</b>{' '}</>}
                  {hasLateFee
                    ? (slotPastCutoff
                        ? <>{insideWindowLine(coursePolicy.lateFeeTiming, lateFeeWords)}</>
                        : selectedTime
                        ? <>Cancel free until <b className="text-ink font-medium">{deadlineLabel(selectedDate, selectedTime.time, cancelHours)}</b> (course time), {afterCutoffShort(coursePolicy.lateFeeTiming, lateFeeWords)}.</>
                        : <>Cancel free until {hoursLabel(cancelHours)} before your tee time, {afterCutoffShort(coursePolicy.lateFeeTiming, lateFeeWords)}.</>)
                    : cardNeeded ? <>Cancel any time — a card is saved for no-shows.</> : <>No card needed — cancel any time.</>}
                  {' '}${ACCESS_FEE_PER_PLAYER.toFixed(2)}/player service fee.
                </p>

                {/* B-4: the day is sold out for this party but the full rows still
                    render below (each with "Tell me if it opens") — so the nearest
                    fits sit here, above them, instead of in an empty state that
                    never shows. */}
                {/* BOOKING WINDOWS: the soft line under the picker, and the
                    honest state when a chosen date is past the window. */}
                {(membersBookEarlier || windowNotice) && !loadingTimes && (
                  <div className={`${CARD} mb-4 px-4 py-3 text-sm text-ink-soft flex flex-wrap items-center gap-x-3 gap-y-1`}>
                    {windowNotice ? (
                      <span>
                        <b className="font-semibold text-ink">{displayDate(selectedDate)} isn&rsquo;t open for booking yet.</b>{' '}
                        {windowNotice.scope === 'member' ? 'Your membership lets you' : 'Golfers can'} book up to {windowNotice.windowDays} days ahead.
                      </span>
                    ) : (
                      <span>Golfers can book up to {viewerWindowDays} days ahead.</span>
                    )}
                    {membersBookEarlier && !previewMode && (
                      <a href={`/courses/${slug}/member`} className="font-medium hover:underline" style={{ color: accent }}>Members can book earlier — sign in →</a>
                    )}
                  </div>
                )}
                {!loadingTimes && teeTimes.length > 0 && !teeTimes.some(t => t.players_available >= players) && (
                  <div className={`${CARD} mb-4 px-4 py-3.5 flex flex-wrap items-center gap-3`}>
                    <div className="text-sm text-ink flex-1 min-w-[200px]">
                      <b className="font-semibold">Nothing fits {players} on {displayDate(selectedDate)}.</b>{' '}
                      {searchingNext ? 'Looking for the nearest open dates…' : nearestDates.length > 0 ? 'Nearest dates with room:' : bestFewer > 0 ? '' : 'Nothing with room in the next week either.'}
                    </div>
                    {!searchingNext && nearestDates.map((ds, i) => (
                      <button key={ds} onClick={() => setSelectedDate(ds)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium transition-colors"
                        style={i === 0 ? { backgroundColor: accent, color: '#fff' } : { border: `1px solid ${accent}`, color: accent }}>
                        {displayDate(ds)} →
                      </button>
                    ))}
                    {bestFewer > 0 && (
                      <button onClick={() => setPlayers(bestFewer)}
                        className="inline-flex items-center px-3.5 py-2 rounded-md text-sm font-medium transition-colors"
                        style={{ border: `1px solid ${accent}`, color: accent }}>
                        Same day for {bestFewer} →
                      </button>
                    )}
                  </div>
                )}

                {/* List. It keeps the loading placeholder's height (6 rows × 4rem + gaps), so a
                    short afternoon list never pulls the page up under the golfer (perf budget: CLS). */}
                <div className="min-h-[26.5rem]">
                {loadingTimes ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-16 bg-line rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className={`${CARD} text-center py-16 px-6`}>
                    
                    {teeTimes.length === 0 ? (
                      <div>
                        <p className="font-serif font-semibold text-ink text-xl mb-1.5">Nothing open on {displayDate(selectedDate)}</p>
                        <p className="text-ink text-sm mb-5">No times left to book on this date.</p>
                        {/* B-4: nearest fits — the two closest dates with room for this party. */}
                        {searchingNext ? (
                          <p className="text-xs text-ink">Looking for the nearest open dates…</p>
                        ) : nearestDates.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-2">
                            {nearestDates.map((ds, i) => (
                              <button
                                key={ds}
                                onClick={() => setSelectedDate(ds)}
                                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
                                style={i === 0 ? { backgroundColor: accent, color: '#fff' } : { border: `1px solid ${accent}`, color: accent }}
                              >
                                {displayDate(ds)} for {players} →
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-ink">Nothing with room for {players} in the next week.</p>
                        )}
                        <div className="mt-5">
                          <button
                            onClick={() => openAlert()}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
                          >
                             Tell me if something opens up
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {groupMin > players ? (<>
                          <p className="font-serif font-semibold text-ink text-xl mb-1.5">These times are for groups of {groupMin} or more</p>
                          <p className="text-ink text-sm mb-5">You picked {players} player{players === 1 ? '' : 's'}. Add players to see them.</p>
                          <button onClick={() => setPlayers(groupMin)} className="inline-flex items-center px-4 py-2.5 rounded-md text-sm font-medium text-white transition-colors mr-2 mb-2" style={{ backgroundColor: accent }}>
                            Show times for {groupMin} players
                          </button>
                        </>) : (<>
                        <p className="font-serif font-semibold text-ink text-xl mb-1.5">No times match your filters</p>
                        <p className="text-ink text-sm mb-5">There are tee times on this date — your filters rule them all out.</p>
                        {/* B-4: same day, smaller party. */}
                        {bestFewer > 0 && (
                          <button
                            onClick={() => setPlayers(bestFewer)}
                            className="inline-flex items-center px-4 py-2.5 rounded-md text-sm font-medium text-white transition-colors mr-2 mb-2"
                            style={{ backgroundColor: accent }}
                          >
                            Same day for {bestFewer} player{bestFewer === 1 ? '' : 's'} →
                          </button>
                        )}
                        <button
                          onClick={resetFilters}
                          className="inline-flex items-center px-4 py-2.5 rounded-md text-sm font-medium border transition-colors"
                          style={{ borderColor: accent, color: accent }}
                        >
                          Clear filters
                        </button>
                        </>)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-7">
                    {groups.map(g => {
                      const alertItem = g.items.find(t => t.players_available === 0 && alertModal?.teeTimeId === t.id);
                      return (
                      <div key={g.key}>
                        {todFilter === 'all' && (
                          <h3 className="text-sm font-semibold text-ink mb-2.5">{g.label}</h3>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                          {g.items.map(t => {
                            const isSel = selectedTime?.id === t.id;
                            const h = holesOf(t);
                            const isFull = t.players_available === 0;
                            const hasMemberRate = !!(t.member_green_fee != null && t.has_member_rate && t.member_green_fee < t.green_fee);
                            const displayGreenFee = hasMemberRate ? t.member_green_fee! : t.green_fee;
                            return (
                              <button key={t.id} type="button" aria-pressed={isSel}
                                className={`text-left rounded-lg border bg-white px-3.5 py-3 flex flex-col gap-0.5 transition-colors hover:border-ink-faint ${isFull ? 'opacity-60' : ''}`}
                                style={isSel ? { borderColor: accent, backgroundColor: `${accent}14`, boxShadow: `inset 0 0 0 1px ${accent}` } : { borderColor: 'var(--color-line)' }}
                                onClick={isFull ? () => openAlert(t.id) : () => {
                                  const next = isSel ? null : t;
                                  setSelectedTime(next);
                                  if (next && players > next.players_available) setPlayers(next.players_available);
                                }}
                              >
                                <span className="text-lg font-semibold text-ink tabular-nums whitespace-nowrap">{formatTime(t.time)}</span>
                                {/* The unit always rides with the number — a bare "$62" reads as the total, which it never is. */}
                                <span className="text-sm font-semibold" style={{ color: accent }}>${displayGreenFee} a player</span>
                                <span className="text-xs text-ink-muted">
                                  {isFull ? 'Full · tell me if it opens' : (
                                    <>
                                      {STATUS_LABEL[t.status] && t.status !== 'available' && <span className={STATUS_STYLE[t.status] || 'text-ink-muted'}>{STATUS_LABEL[t.status]} · </span>}
                                      {t.players_available} {t.players_available === 1 ? 'spot' : 'spots'}
                                    </>
                                  )}
                                </span>
                                {(h !== undefined && (hasHolesData || t.product_label)) && (
                                  <span className="text-[11px] text-ink-faint">{t.product_label ? `${t.product_label} · ` : ''}{h} holes{t.product_rating ? ` · ${t.product_rating.toFixed(1)} / ${t.product_slope}` : ''}</span>
                                )}
                                {!hasMemberRate && t.list_green_fee != null && (
                                  <span className="text-[11px] text-ink-faint"><span className="line-through">${t.list_green_fee}</span> · last-minute</span>
                                )}
                                {hasMemberRate && (
                                  <span className="text-[11px] text-ink-faint"><span className="line-through">${t.green_fee}</span> · member rate</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                                {alertItem && (
                                  <div className="mt-3 rounded-lg border px-4 sm:px-5 py-4" style={{ borderColor: `${accent}25`, backgroundColor: `${accent}05` }} onClick={e => e.stopPropagation()}>
                                    {alertSent ? (
                                      <p className="text-sm text-ink"><b className="font-semibold">Alert set.</b> We&apos;ll email you the moment {formatTime(alertItem.time)} opens up on {displayDate(selectedDate)}.</p>
                                    ) : (
                                      <>
                                        <p className="text-sm text-ink-soft mb-3">We&apos;ll email you the moment this time opens up. One email, nothing else.</p>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                          <input
                                            type="email"
                                            placeholder="Your email"
                                            value={alertEmail}
                                            onChange={e => setAlertEmail(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') submitAlert(); }}
                                            className="flex-1 bg-white border border-line rounded-md px-3 py-2.5 text-ink placeholder-ink-faint text-sm outline-none focus:ring-2"
                                            style={{ '--tw-ring-color': `${accent}33` } as React.CSSProperties}
                                          />
                                          <button
                                            onClick={submitAlert}
                                            disabled={!alertEmail.trim() || alertSubmitting}
                                            className="px-4 py-2.5 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                                            style={{ backgroundColor: accent }}
                                          >
                                            {alertSubmitting ? 'Setting…' : 'Tell me'}
                                          </button>
                                        </div>
                                        {alertError && <p className="text-xs text-bad mt-2">{alertError}</p>}
                                      </>
                                    )}
                                  </div>
                                )}
                      </div>
                      );
                    })}
                  </div>
                )}
                </div>

                {/* Quiet member sign-in link — unobtrusive, below the slot list */}
                {!memberSession && (
                  <div className="mt-6 text-center">
                    <Link
                      href={`/courses/${slug}/member`}
                      className="text-xs text-ink-faint hover:text-ink-muted transition-colors"
                    >
                      Member? Sign in
                    </Link>
                  </div>
                )}
              </section>

              {/* GOLFER-REDO: the sticky summary on a laptop (always there, so the page doesn't shift when a time is picked)… */}
              <Card className="hidden lg:block lg:sticky lg:top-6 p-5" aria-label="Your booking">
                {summaryCard ?? <p className="text-sm text-ink-muted">Pick a time to see what it costs.</p>}
              </Card>
              {/* …and the bar at the bottom of a phone. */}
              {summaryBar}
            </div>
          ))}

          {/* PRICE-3: round packs the course sells online (nothing renders when it sells none). */}
          {course.joins_online && <CourseJoin slug={slug} accent={accent} className="mt-14" />}
          {course.sells_packs && <CoursePacks slug={slug} accent={accent} className="mt-14" />}
        </div>
      </div>
      <CourseFooter course={course} accent={accent} />

      {/* Alert modal */}
      {alertModal && !alertModal.teeTimeId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => { if (!alertSubmitting) { setAlertModal(null); setAlertSent(false); } }}
        >
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-card" onClick={e => e.stopPropagation()}>
            {alertSent ? (
              <div className="text-center py-2">
                <p className="font-serif font-semibold text-ink text-xl mb-1.5">Alert set</p>
                <p className="text-sm text-ink mb-5">We&apos;ll email you when a spot opens up at {course.name}.</p>
                <button
                  onClick={() => { setAlertModal(null); setAlertSent(false); }}
                  className="w-full py-2.5 rounded-md border border-line text-sm font-medium text-ink-soft hover:text-ink transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1.5">
                  
                  <h3 className="font-serif font-semibold text-ink text-xl leading-none">Get an alert</h3>
                </div>
                <p className="text-sm text-ink mb-5">
                  {alertModal.teeTimeId
                    ? `We'll notify you if this time opens up on ${displayDate(alertModal.date)}.`
                    : `We'll notify you when a tee time matching your current filters is available on ${displayDate(alertModal.date)}.`}
                </p>
                <div className="space-y-3">
                  <input
                    type="email"
                    placeholder="Your email"
                    value={alertEmail}
                    onChange={e => setAlertEmail(e.target.value)}
                    className="w-full bg-paper border border-line rounded-md px-3 py-2.5 text-ink placeholder-ink-faint text-sm focus:border-pine/40 focus:ring-2 focus:ring-pine/10 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Your name (optional)"
                    value={alertName}
                    onChange={e => setAlertName(e.target.value)}
                    className="w-full bg-paper border border-line rounded-md px-3 py-2.5 text-ink placeholder-ink-faint text-sm focus:border-pine/40 focus:ring-2 focus:ring-pine/10 outline-none"
                  />
                </div>
                {alertError && <p className="text-xs text-bad mt-3">{alertError}</p>}
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => setAlertModal(null)}
                    className="flex-1 py-2.5 rounded-md border border-line text-sm font-medium text-ink-soft hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitAlert}
                    disabled={!alertEmail.trim() || alertSubmitting}
                    className="flex-1 py-2.5 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: accent }}
                  >
                    {alertSubmitting ? 'Setting…' : 'Set alert'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Demo booking intercept modal */}
      {demoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setDemoModal(false)}
        >
          <div className="bg-white rounded-lg max-w-sm w-full p-7 shadow-card" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif font-semibold text-ink text-xl text-center mb-2">Demo course</h3>
            <p className="text-sm text-ink-soft text-center leading-relaxed mb-6">
              Bookings are disabled on this demo page. This is where your golfers would receive their confirmation — with your course name, their tee time, and a check-in link.
            </p>
            <a
              href="/demo"
              className="block w-full text-center py-3 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-colors mb-3"
            >
              Book a demo
            </a>
            <button
              onClick={() => setDemoModal(false)}
              className="block w-full text-center py-3 text-sm text-ink-soft hover:text-ink transition-colors"
            >
              Keep exploring
            </button>
          </div>
        </div>
      )}

    </>
  );
}
