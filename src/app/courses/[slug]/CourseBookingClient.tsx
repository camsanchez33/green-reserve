'use client';
import type { CancelPolicy } from '@/lib/cancel-policy';
import { lastBookableDate } from '@/lib/booking-window';
import { useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Course, TeeTime } from '@/lib/courses-data';
import { CARD } from '@/components/ui/Card';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import { CHANGE_CATEGORIES } from '@/lib/change-requests';
import { StatusDot } from '@/components/ui/StatusDot';
import { golferLookVars, type CourseLook } from '@/components/golfer/look';
import { CourseFooter } from '@/components/golfer/CourseFrame';
import g from '@/components/golfer/golfer.module.css';
import { SUPPORT_EMAIL } from '@/lib/contact';

// Option A (Cam 2026-11-18, lanes/golfer.md item 1): times of day are tiles, choose any (at least one).
// The tee time cards group the same way. The "Tee off between" and "Price up to" sliders were removed
// in the mockup's comment threads.
type TimeOfDay = 'morning' | 'midday' | 'afternoon';
const TODS: { key: TimeOfDay; label: string; hint: string }[] = [
  { key: 'morning',   label: 'Morning',   hint: 'Before 11 AM' },
  { key: 'midday',    label: 'Mid day',   hint: '11 AM–2 PM' },
  { key: 'afternoon', label: 'Afternoon', hint: 'After 2 PM' },
];
const ALL_TODS: TimeOfDay[] = ['morning', 'midday', 'afternoon'];
/** The windows an alert for a time of day covers (the same edges the cards group by). */
const TOD_WINDOWS: Record<TimeOfDay, { windowStart: string; windowEnd: string }> = {
  morning:   { windowStart: '05:00', windowEnd: '10:59' },
  midday:    { windowStart: '11:00', windowEnd: '13:59' },
  afternoon: { windowStart: '14:00', windowEnd: '23:59' },
};
function parseTods(v: string | null): TimeOfDay[] {
  const picked = (v ?? '').split(',').filter((x): x is TimeOfDay => (ALL_TODS as string[]).includes(x));
  return picked.length ? ALL_TODS.filter(t => picked.includes(t)) : ALL_TODS;
}

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

function todOf(t: TeeTime): TimeOfDay {
  const hm = t.time.slice(0, 5);
  if (hm < '11:00') return 'morning';
  if (hm < '14:00') return 'midday';
  return 'afternoon';
}

function holesOf(t: TeeTime): number | undefined {
  return (t as TeeTime & { holes?: number }).holes;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  /** GOLFER-LOOK: the course's Light or Dark look and preset accent (Course.bookingLook/bookingAccent). */
  booking_look?: CourseLook;
  /** "Have a promo code?" shows only when the course has a live code (Build). Absent = unknown. */
  has_live_promo?: boolean;
  /** How far ahead a resident books, for the calendar note (Build). Absent = not shown. */
  resident_advance_days?: number | null;
  /** Days the course is closed inside the window, with the reason the calendar shows (Build). */
  closed_dates?: { date: string; reason: string }[];
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
  source?: 'member';
  /** BOOKING WINDOWS: how far ahead this member can book */
  windowDays?: number;
};

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
  // GRP-1: the time a group page linked (?tt=), once the day's times load with room for it.
  const [groupPick, setGroupPick] = useState<TeeTime | null>(null);
  // GRP-1: a group page (/g/[slug]) links a time as ?tt={id}; it is picked once
  // the day's times load, if it still has room for the group.
  const pendingPick = useRef(searchParams.get('tt'));
  const [tods, setTods] = useState<TimeOfDay[]>(() => parseTods(searchParams.get('tod')));
  // Walking or riding, as a filter: shown only when it depends on the time (Cam, mockup thread 11ad6b6e).
  const [cartFilter, setCartFilter] = useState<'any' | 'walk' | 'ride'>('any');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreInfo, setMoreInfo] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [liveNote, setLiveNote] = useState('');
  // Focus goes back to whatever opened the filters sheet or the alert.
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const sideCloseRef = useRef<HTMLButtonElement>(null);
  const alertOpener = useRef<HTMLElement | null>(null);
  const [holesFilter, setHolesFilter] = useState<'all' | '9' | '18'>(() => {
    const h = searchParams.get('holes');
    return ['all', '9', '18'].includes(h ?? '') ? (h as 'all' | '9' | '18') : 'all';
  });
  // L2: which bookable product the golfer is looking at ('all' until they pick;
  // the selector only shows when the day has more than one product).
  const [productFilter, setProductFilter] = useState<string>(() => searchParams.get('product') || 'all');
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
            setGroupPick(pick);
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
  // Only this course's member sign-in (gr_member) counts (Cam 2026-11-18: no golfer accounts).
  useEffect(() => {
    if (previewMode) return;
    fetch(`/api/member/${slug}/session`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setMemberSession(data))
      .catch(() => {});
  }, [slug, previewMode]);

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
    if (tods.length < ALL_TODS.length) p.set('tod', tods.join(','));
    if (players !== 2) p.set('players', String(players));
    if (holesFilter !== 'all') p.set('holes', holesFilter);
    if (productFilter !== 'all') p.set('product', productFilter);
    const q = p.toString();
    router.replace(`/courses/${slug}${q ? '?' + q : ''}`, { scroll: false });
  }, [selectedDate, tods, players, holesFilter, productFilter, slug, router, previewMode]);

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

  // Walking or riding depends on the time when some of the day's times need a cart and others can be walked.
  const cartVaries = useMemo(() => {
    const open = teeTimes.filter(t => t.players_available > 0);
    return open.some(t => t.cart_required) && open.some(t => !t.cart_required);
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
      if (!tods.includes(todOf(t))) return false;
      if (cartVaries && cartFilter === 'walk' && t.cart_required) return false;
      if (cartVaries && cartFilter === 'ride' && !(t.cart_fee > 0 || t.cart_required)) return false;
      if (holesFilter !== 'all') {
        const h = holesOf(t);
        if (h !== undefined && String(h) !== holesFilter) return false;
      }
      if (productActive !== 'all' && t.product_id !== productActive) return false;
      return true;
    });
  }, [memberSession, memberTeeTimes, teeTimes, players, tods, cartVaries, cartFilter, holesFilter, productActive]);

  function resetFilters() {
    setTods(ALL_TODS);
    setHolesFilter('all');
    setProductFilter('all');
    setCartFilter('any');
  }

  function openAlert(teeTimeId?: string) {
    if (!course) return;
    // B-2: a full slot's alert lives inside its own row now; tapping the same
    // row again folds it back up. The date-level alert (no slot) keeps the modal.
    setAlertEmail('');
    setAlertName('');
    setAlertSent(false);
    setAlertError('');
    alertOpener.current = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    setAlertModal({ teeTimeId, date: selectedDate, courseId: String(course.id) });
  }

  function closeAlert() {
    if (alertSubmitting) return;
    setAlertModal(null);
    setAlertSent(false);
    alertOpener.current?.focus();
  }

  async function submitAlert() {
    if (!alertModal || !alertEmail.trim()) return;
    setAlertSubmitting(true);
    // One time of day picked: the alert covers it. Several or all: the whole day (the API takes one window).
    const windows = alertModal.teeTimeId || tods.length !== 1 ? { windowStart: '', windowEnd: '' } : TOD_WINDOWS[tods[0]];
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
    // A failed log-out leaves the session as it was, so the header must keep saying so.
    const r = await fetch(`/api/member/${slug}/logout`, { method: 'POST' }).catch(() => null);
    if (!r || !r.ok) { setLogoutError(true); return; }
    setLogoutError(false);
    setMemberSession(null);
    setMemberTeeTimes([]);
  }

  // Picking a tee time opens its own Book page (Option A).
  function bookTime(t: TeeTime, replace = false) {
    if (!course) return;
    if (previewMode) { setPreviewModal(true); return; }
    if (isDemo) { setDemoModal(true); return; }
    const sp = Math.min(players, t.players_available || players);
    const qp = new URLSearchParams({
      tee_time_id: String(t.id),
      course_name: course!.name,
      course_slug: course!.slug,
      date: selectedDate,
      time: t.time,
      players: String(sp),
      cart: cartFilter === 'ride' || t.cart_required ? '1' : '0',
    });
    // /book's "Back to tee times" rebuilds this page's filters from these.
    if (tods.length < ALL_TODS.length) qp.set('tod', tods.join(','));
    if (holesFilter !== 'all') qp.set('holes', holesFilter);
    if (productFilter !== 'all') qp.set('product', productFilter);
    if (replace) router.replace(`/book?${qp}`); else router.push(`/book?${qp}`);
  }

  // GRP-1: a group page's linked time goes straight to its Book page.
  useEffect(() => {
    if (!groupPick) return;
    setGroupPick(null);
    bookTime(groupPick, true);
    // bookTime reads the current filters; it runs once per pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupPick]);

  function closeFilters() {
    setFiltersOpen(false);
    filterBtnRef.current?.focus();
  }
  // The phone Filters sheet and the alert close on Escape; the sheet's close button takes focus when it opens.
  useEffect(() => {
    if (!filtersOpen && !alertModal) return;
    if (filtersOpen) sideCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const box = document.querySelector<HTMLElement>(alertModal ? '[aria-labelledby="alert-h"]' : '#filters');
        const items = box ? Array.from(box.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea')).filter(el => el.offsetParent !== null) : [];
        if (items.length) {
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (e.key !== 'Escape') return;
      if (alertModal) closeAlert(); else closeFilters();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // closeAlert/closeFilters read only refs and setters plus alertSubmitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersOpen, alertModal, alertSubmitting]);

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

  // GOLFER-LOOK: the course's Light or Dark look and its one accent, as --g-* tokens on this page's root.
  const look = golferLookVars(course);
  const todayStr = formatDate(startOfToday());
  // BOOKING WINDOWS: the viewer's horizon — a member's tier window, else the
  // course's public window. Days beyond it are shown but not bookable.
  const publicDays = course.public_advance_days ?? 7;
  const viewerWindowDays = memberSession?.windowDays ?? publicDays;
  // Counted from the course's today, as the server counts it (lib/booking-window, Revamp 3 fix 8).
  const lastBookableStr = lastBookableDate(viewerWindowDays, new Date(), course.timezone);
  const lastPublicStr = lastBookableDate(publicDays, new Date(), course.timezone);
  const memberWindowDays = course.member_advance_days ?? 14;
  const membersBookEarlier = !memberSession && !!course.has_member_pricing && memberWindowDays > viewerWindowDays;
  const closedOn = new Map((course.closed_dates ?? []).map(c => [c.date, c.reason]));
  const shortDay = (ds: string) => { const d = new Date(ds + 'T12:00:00'); return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`; };
  const longDate = (ds: string) => new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const groups = TODS.map(t => ({ ...t, items: filtered.filter(x => todOf(x) === t.key) })).filter(gr => gr.items.length > 0);
  const openCount = filtered.filter(t => t.players_available > 0).length;

  const todayMonth = (() => { const t = startOfToday(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
  const maxMonth = new Date(todayMonth.getFullYear(), todayMonth.getMonth() + 2, 1);
  const canPrevMonth = calMonth > todayMonth;
  const canNextMonth = calMonth < maxMonth;

  function pickDay(ds: string) {
    setSelectedDate(ds);
  }
  function toggleTod(k: TimeOfDay) {
    if (tods.length === 1 && tods[0] === k) { setLiveNote('Keep at least one time of day.'); return; }
    setLiveNote('');
    setTods(cur => {
      if (cur.includes(k)) return cur.length === 1 ? cur : cur.filter(x => x !== k);
      return ALL_TODS.filter(x => x === k || cur.includes(x));
    });
  }

  const safeSite = course.website && /^https?:\/\//i.test(course.website) ? course.website : '';
  const directionsUrl = course.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([course.address, course.city, course.state].filter(Boolean).join(', '))}` : '';
  const telHref = course.phone ? `tel:${course.phone.replace(/[^\d+]/g, '')}` : '';
  const noteLine = (course.dress_code ?? []).join('. ');
  const hasMore = !!course.walking_note || (course.facilities?.length ?? 0) > 0;

  // The filters: the sidebar on a laptop, a sheet from the bottom on a phone.
  const filters = (
    <>
      <div className={g.field}>
        <span className={g.lab} id="cal-label">Date</span>
        <div className={g.cal} role="group" aria-labelledby="cal-label">
          <div className={g.calh}>
            <button type="button" aria-label="Previous month" disabled={!canPrevMonth} onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}>‹</button>
            <span>{monthLabel(calMonth)}</span>
            <button type="button" aria-label="Next month" disabled={!canNextMonth} onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>›</button>
          </div>
          <div className={g.calg}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} aria-hidden="true">{d}</span>)}
            {buildMonthGrid(calMonth).map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const ds = formatDate(d);
              const opens = new Date(d); opens.setDate(opens.getDate() - viewerWindowDays);
              const why = ds < todayStr ? 'Past'
                : closedOn.get(ds) ? closedOn.get(ds)!
                : ds > lastBookableStr ? `Opens ${opens.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : '';
              // Logged in, the days the longer window opens are outlined and read "members only" (item 3).
              const membersOnly = !why && !!memberSession && ds > lastPublicStr;
              const label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + (why ? `, ${why}` : membersOnly ? ', members only' : '') + (ds === todayStr ? ', today' : '');
              return (
                <button key={ds} type="button" aria-pressed={ds === selectedDate} aria-disabled={why ? true : undefined}
                  aria-label={label} title={why || (membersOnly ? 'Members only' : undefined)}
                  style={membersOnly && ds !== selectedDate ? { boxShadow: 'inset 0 0 0 1.5px var(--g-acc)' } : undefined}
                  onClick={why ? undefined : () => pickDay(ds)}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className={g.calnote}>
            <p><b>How far ahead you can book</b></p>
            <ul>
              <li>Everyone: {publicDays} days</li>
              {course.resident_advance_days ? <li>Residents (with a resident card): {course.resident_advance_days} days</li> : null}
              {course.has_member_pricing && memberWindowDays !== publicDays ? <li>Members: {memberWindowDays} days</li> : null}
            </ul>
            {memberSession
              ? <p>Logged in{memberSession.tier?.name ? ` as ${memberSession.tier.name}` : ''} · showing {viewerWindowDays} days.{viewerWindowDays > publicDays ? ' Outlined days are members only.' : ''}</p>
              : membersBookEarlier && !previewMode
                ? <p>Showing {viewerWindowDays} days. <Link className={g.lnk} href={`/courses/${slug}/member`}>Log in</Link> to see your longer window.</p>
                : null}
          </div>
        </div>
      </div>

      <div className={g.field}>
        <span className={g.lab} id="pl-label">Players</span>
        <div className={g.stepper} role="group" aria-labelledby="pl-label">
          <button type="button" aria-label="One fewer player" disabled={players <= 1} onClick={() => { setPlayers(Math.max(1, players - 1)); }}>−</button>
          <output aria-live="polite">{players} {players === 1 ? 'player' : 'players'}</output>
          <button type="button" aria-label="One more player" disabled={players >= 4} onClick={() => { setPlayers(Math.min(4, players + 1)); }}>+</button>
        </div>
      </div>

      <div className={g.field}>
        <span className={g.lab} id="tod-label">Time of day · choose any</span>
        <div className={g.todrow} role="group" aria-labelledby="tod-label">
          {TODS.map(t => {
            const on = tods.includes(t.key);
            return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => toggleTod(t.key)}>
                <span className={g.ck} aria-hidden="true">{on ? '✓' : ''}</span>{t.label}<small>{t.hint}</small>
              </button>
            );
          })}
        </div>
      </div>

      {/* The rounds the course sells (Cam, mockup thread 2d321156); one round = no filter. */}
      {dayProducts.length > 1 ? (
        <div className={g.field}>
          <span className={g.lab} id="rnd-label">Round</span>
          <div className={g.rnd} role="group" aria-labelledby="rnd-label">
            {[{ id: 'all', label: 'Any', holes: undefined as number | undefined }, ...dayProducts].map(p => (
              <button key={p.id} type="button" aria-pressed={productActive === p.id} onClick={() => { setProductFilter(p.id); }}>
                <b>{p.label}</b><small>{p.id === 'all' ? 'All rounds' : p.holes ? `${p.holes} holes` : ''}</small>
              </button>
            ))}
          </div>
        </div>
      ) : hasHolesData ? (
        <div className={g.field}>
          <span className={g.lab} id="rnd-label">Round</span>
          <div className={g.rnd} role="group" aria-labelledby="rnd-label">
            {([['all', 'Any', 'All rounds'], ['9', '9 holes', ''], ['18', '18 holes', '']] as const).map(([v, l, h]) => (
              <button key={v} type="button" aria-pressed={holesFilter === v} onClick={() => setHolesFilter(v)}>
                <b>{l}</b>{h ? <small>{h}</small> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {cartVaries && (
        <div className={g.field}>
          <span className={g.lab} id="cart-label">Cart</span>
          <div className={g.seg} role="group" aria-labelledby="cart-label">
            {([['any', 'Either'], ['walk', 'Walk'], ['ride', 'Ride']] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={cartFilter === v} onClick={() => setCartFilter(v)}>{l}</button>
            ))}
          </div>
          <p className={g.calnote}>Walking and carts depend on the time here.</p>
        </div>
      )}

      <p className={g.calnote} role="status">{liveNote}</p>
      <button className={g.lnk} type="button" onClick={resetFilters}>Reset all</button>
    </>
  );

  const nextFit = nearestDates[0];
  let timesArea: React.ReactNode;
  if (loadingTimes) {
    timesArea = (
      <div className={g.cards} aria-busy="true" aria-label="Loading tee times">
        {[...Array(8)].map((_, i) => <div key={i} className={g.skel} />)}
      </div>
    );
  } else if (windowNotice) {
    timesArea = (
      <div className={g.empty} role="status">
        <h2>{longDate(selectedDate)} isn&rsquo;t open for booking yet</h2>
        <p>{windowNotice.scope === 'member' ? 'Your membership lets you' : 'Golfers can'} book up to {windowNotice.windowDays} days ahead.</p>
        {membersBookEarlier && !previewMode && (
          <div className={g.opts}><Link className={g.chip} href={`/courses/${slug}/member`}>Log in to book earlier</Link></div>
        )}
      </div>
    );
  } else if (openCount === 0) {
    const dayHasTimes = teeTimes.some(t => t.players_available > 0);
    timesArea = (
      <div className={g.empty} role="status">
        {groupMin > players ? (<>
          <h2>These times are for groups of {groupMin} or more</h2>
          <p>You picked {players} player{players === 1 ? '' : 's'}. Add players to see them.</p>
          <div className={g.opts}><button type="button" className={`${g.chip} ${g.fill}`} onClick={() => setPlayers(groupMin)}>Show times for {groupMin} players</button></div>
        </>) : (<>
          <h2>No times match on {longDate(selectedDate)}</h2>
          <p>{!dayHasTimes ? 'This day is fully booked.' : bestFewer > 0 && !teeTimes.some(t => t.players_available >= players) ? `Nothing has room for ${players} this day.` : 'Try a wider time or more holes.'}</p>
          <div className={g.opts}>
            {searchingNext ? <p>Looking for the nearest open days…</p> : nextFit ? (
              <button type="button" className={`${g.chip} ${g.fill}`} onClick={() => pickDay(nextFit)}>
                See {shortDay(nextFit)}
              </button>
            ) : null}
            {bestFewer > 0 && <button type="button" className={g.chip} onClick={() => setPlayers(bestFewer)}>Same day for {bestFewer}</button>}
            {dayHasTimes && <button type="button" className={g.chip} onClick={resetFilters}>Widen my search</button>}
            <button type="button" className={g.chip} onClick={() => openAlert()}>Tell me when a time opens</button>
          </div>
        </>)}
      </div>
    );
  } else {
    timesArea = (
      <>
        <p className={g.count} aria-live="polite">{openCount} {openCount === 1 ? 'time' : 'times'} on {longDate(selectedDate)} · prices are per player</p>
        {groups.map(gr => (
          <section key={gr.key} className={g.grp} aria-label={gr.label}>
            <h2>{gr.label}<small>{gr.items.length} {gr.items.length === 1 ? 'time' : 'times'}</small></h2>
            <div className={g.cards}>
              {gr.items.map(t => {
                const h = holesOf(t);
                const isFull = t.players_available === 0;
                const hasMemberRate = !!(t.member_green_fee != null && t.has_member_rate && t.member_green_fee < t.green_fee);
                const price = hasMemberRate ? t.member_green_fee! : t.green_fee;
                const struck = hasMemberRate ? t.green_fee : t.list_green_fee != null ? t.list_green_fee : null;
                const round = t.product_label || (h ? `${h} holes` : 'Tee time');
                return (
                  <button key={t.id} type="button" className={`${g.tc} ${isFull ? g.full : ''}`}
                    aria-label={isFull
                      ? `${formatTime(t.time)}, ${round}, full. Tell me if it opens`
                      : `${formatTime(t.time)}, ${round}, ${t.players_available} ${t.players_available === 1 ? 'spot' : 'spots'} open, $${price} per player${hasMemberRate ? `, member price, public price $${t.green_fee}` : ''}`}
                    onClick={isFull ? () => openAlert(t.id) : () => bookTime(t)}>
                    <span className={g.t}>{formatTime(t.time)}</span>
                    <span className={g.c}>{round} · {isFull ? 'Full' : `${t.players_available} open`}</span>
                    <span className={g.b}>
                      <span>{isFull ? 'Tell me if it opens' : hasMemberRate ? 'Your price' : t.list_green_fee != null ? 'Last-minute' : h ? `${h} holes` : ''}</span>
                      <b>{struck != null && <s>${struck}</s>}${price}</b>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </>
    );
  }

  return (
    <div className={g.root} style={look}>
      {/* Preview banner */}
      {previewMode && course.is_live && (
        // Going live SUPERSEDES the pre-live review loop — an old preview
        // link visited after go-live must never show approve/request-changes
        // controls again. Route to Messages/support instead (V13b sanity
        // check, RUN_QUEUE "review loop doesn't understand already-live").
        <div className={g.banner}>
          This course is already live — you&apos;re viewing it as golfers see it. Questions or changes? Message the GreenReserve team from your dashboard, or reply to any of our emails.
        </div>
      )}
      {previewMode?.look && !course.is_live && (
        <div className={g.banner}>
          Your look at this page before the course sees it — not live, booking is off. Send them the preview from the inquiry when it&apos;s right.
        </div>
      )}
      {previewMode && !previewMode.look && !course.is_live && (
        <div className={g.banner}>
          <div className="flex items-center gap-3 flex-wrap">
            <span>Preview of your GreenReserve page &mdash; not live yet. Booking is disabled.</span>
            <div className="flex items-center gap-2 ml-auto">
              {previewApprovalStatus === 'approved' ? (
                <StatusDot status="ok" label="Approved" />
              ) : (
                <button onClick={approvePreview} disabled={approvingPreview}
                  className="text-xs font-medium text-white bg-pine hover:bg-pine-hover px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors">
                  {approvingPreview ? 'Submitting...' : 'Looks good — approve my page'}
                </button>
              )}
              {previewApprovalStatus === 'changes_requested' ? (
                <StatusDot status="warn" label="Changes requested" />
              ) : (
                <button onClick={() => setShowPreviewChangesModal(true)}
                  className="text-xs font-medium text-ink-soft bg-white border border-line hover:border-line-strong px-3 py-1.5 rounded-md transition-colors">
                  Request changes
                </button>
              )}
            </div>
          </div>
          {previewApproveError && <p className="text-bad text-xs mt-1">{previewApproveError}</p>}
          {previewChangesConfirmMsg && <p className="text-xs mt-1">{previewChangesConfirmMsg}</p>}
        </div>
      )}

      {/* Request changes modal (preview) — structured categories, V13b */}
      {showPreviewChangesModal && (
        <div className={g.modalBack}>
          <div className={g.modal} role="dialog" aria-modal="true" aria-labelledby="chg-h" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 id="chg-h">What would you like changed?</h2>
            <p>Check everything that applies — you can add a note for each.</p>
            <div className="space-y-2 mb-3">
              {CHANGE_CATEGORIES.map(cat => {
                const checked = previewChangesChecked.has(cat.key);
                return (
                  <div key={cat.key} className={g.card}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => togglePreviewChangeCategory(cat.key)} />
                      <span className="text-sm font-medium">{cat.label}</span>
                    </label>
                    {checked && (
                      <textarea
                        value={previewChangesDetails[cat.key] || ''}
                        onChange={e => setPreviewChangesDetails(prev => ({ ...prev, [cat.key]: e.target.value }))}
                        rows={2}
                        aria-label={`What should change: ${cat.label}`}
                        className="w-full mt-2 border rounded-md px-3 py-2 text-sm resize-none"
                        style={{ borderColor: 'var(--g-line)', background: 'var(--g-paper)' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {previewChangesError && <p className={g.formerr}>{previewChangesError}</p>}
            <button type="button" className={g.btn} onClick={submitPreviewChanges} disabled={sendingPreviewChanges || previewChangesChecked.size === 0}>
              {sendingPreviewChanges ? 'Sending...' : 'Send'}
            </button>
            <button type="button" className={g.ghost}
              onClick={() => { setShowPreviewChangesModal(false); setPreviewChangesChecked(new Set()); setPreviewChangesDetails({}); setPreviewChangesError(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewModal && (
        <div className={g.modalBack}>
          <div className={g.modal} role="dialog" aria-modal="true" aria-labelledby="pv-h">
            <h2 id="pv-h">Booking disabled in preview</h2>
            <p>This is a preview page &mdash; bookings are not active yet. Reply to the preview email with any changes you&apos;d like before going live.</p>
            <button type="button" className={g.btn} onClick={() => setPreviewModal(false)}>Got it</button>
          </div>
        </div>
      )}

      {/* Demo banner */}
      {isDemo && (
        <div className={g.banner}>
          This is a live demo of a GreenReserve course page — your course gets one just like it, free. <a href="/demo">Book a demo</a>
        </div>
      )}

      <div className={g.site}>
        <header className={g.top}>
          <h1>{course.name}</h1>
          {!previewMode && (
            <nav className={g.topLinks} aria-label="Your account at this course">
              {memberSession ? (<>
                <span>Logged in · {memberSession.name}{memberSession.tier?.name ? ` · ${memberSession.tier.name}` : ''}</span>
                <Link className={g.lnk} href={`/courses/${slug}/member`}>Your {course.name}</Link>
                <button type="button" className={g.lnk} onClick={memberSignOut}>Log out</button>
                {logoutError && <span role="alert">Couldn&rsquo;t log out. Try again.</span>}
              </>) : (
                <Link className={g.lnk} href={`/courses/${slug}/member`}>Log in</Link>
              )}
            </nav>
          )}
        </header>

        {/* Course information: today's notice (only while one is posted), directions, website, phone and notes. */}
        {course.type !== 'member' && (
          <section className={g.cinfo} aria-label="Course information">
            {course.conditions && (
              <p className={g.alert}><StatusDot status="warn" /><span><b>Course notice:</b> {course.conditions}</span></p>
            )}
            {/* DASH-D (Cam 2026-11-01): today's course conditions, set on the dashboard's Home — a plain line, not an alert. */}
            {(course.conditions_today?.length ?? 0) > 0 && (
              <p className={g.cnote} style={{ margin: '0 0 6px' }}><b>Today</b> · {course.conditions_today!.join(' · ')}</p>
            )}
            {(directionsUrl || safeSite || telHref) && (
              <div className={g.crow}>
                {directionsUrl && (
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                    <span><b>Directions</b> {[course.address, course.city, course.state].filter(Boolean).join(', ')}</span>
                  </a>
                )}
                {safeSite && (
                  <a href={safeSite} target="_blank" rel="noopener noreferrer">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
                    <span><b>Website</b> {safeSite.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</span>
                  </a>
                )}
                {telHref && (
                  <a href={telHref}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
                    <span><b>Call</b> {course.phone}</span>
                  </a>
                )}
              </div>
            )}
            <p className={g.cnote}>
              {noteLine ? `${noteLine}. ` : ''}
              {hasMore ? (
                <button className={g.lnk} type="button" aria-expanded={moreInfo} aria-controls="more-info" onClick={() => setMoreInfo(v => !v)}>{moreInfo ? 'Less' : 'More'}</button>
              ) : (
                <Link className={g.lnk} href={`/courses/${slug}/info`}>Course details and photos</Link>
              )}
            </p>
            {hasMore && moreInfo && (
              <div className={g.more} id="more-info">
                {course.walking_note && <p style={{ margin: '0 0 4px' }}>{course.walking_note}</p>}
                {(course.facilities?.length ?? 0) > 0 && <p style={{ margin: '0 0 4px' }}>{course.facilities!.join(' · ')}</p>}
                <Link className={g.lnk} href={`/courses/${slug}/info`}>Course details and photos</Link>
              </div>
            )}
          </section>
        )}

        <main className={g.wrap}>
          {course.type === 'member' ? (
            <div className={g.empty}>
              <h2>Member-only club</h2>
              <p>This is a member-only or invitation-based club. Contact the pro shop for guest access.</p>
              {course.phone && <div className={g.opts}><a className={`${g.chip} ${g.fill}`} href={telHref}>Call the pro shop</a></div>}
            </div>
          ) : !mounted ? (
            // PERF-1: the course arrives in the first HTML now, but everything in
            // the booking area hangs off "today" in the GOLFER's timezone (the
            // calendar, "Today", the booking window), which the server — on UTC —
            // cannot know; rendering it there broke hydration every US evening.
            // So the shell is server-rendered and this area fills in on mount.
            // A <section> with its own key, not a <div>: React must REPLACE it
            // with the grid, not morph it — a morphed node counts as a layout shift.
            <section key="booking-placeholder" className="min-h-[900px]" aria-hidden="true">
              <div className={g.cards}>{[...Array(8)].map((_, i) => <div key={i} className={g.skel} />)}</div>
            </section>
          ) : (
            <div key="booking" className={g.grid}>
              {filtersOpen && <div className={`${g.scrim} ${g.open}`} onClick={closeFilters} aria-hidden="true" />}
              <aside id="filters" className={`${g.side} ${filtersOpen ? g.open : ''}`} aria-label="Filters"
                role={filtersOpen ? 'dialog' : undefined} aria-modal={filtersOpen ? true : undefined}>
                <div className={g.shead}>
                  <h2>Filters</h2>
                  <button ref={sideCloseRef} className={g.close} type="button" aria-label="Close filters" onClick={closeFilters}>×</button>
                </div>
                {filters}
                <button className={`${g.btn} ${g.sdone}`} type="button" onClick={closeFilters}>Show {openCount} {openCount === 1 ? 'time' : 'times'}</button>
              </aside>

              <section id="times" className="min-w-0 min-h-[26.5rem]" aria-label="Tee times">
                <div className={g.mbar}>
                  <span><b>{shortDay(selectedDate)}</b> · {players} {players === 1 ? 'player' : 'players'}</span>
                  <button ref={filterBtnRef} className={`${g.chip} ${g.fill} ${g.filterbtn}`} type="button" aria-expanded={filtersOpen} aria-controls="filters" onClick={() => setFiltersOpen(true)}>Filters</button>
                </div>
                {timesArea}
              </section>
            </div>
          )}
        </main>
      </div>
      <CourseFooter course={course} accent={course.brand_color || '#173B2A'} />

      {/* Alert: the date (or the full time) the golfer wants to hear about. The alerts sheet (item 7) replaces this. */}
      {alertModal && (
        <div className={g.modalBack} onClick={closeAlert}>
          <div className={g.modal} role="dialog" aria-modal="true" aria-labelledby="alert-h" onClick={e => e.stopPropagation()}>
            {alertSent ? (<>
              <h2 id="alert-h">Alert set</h2>
              <p>We&apos;ll email you when {alertModal.teeTimeId ? 'that time' : 'a time'} opens on {longDate(alertModal.date)}. First come, first served.</p>
              <button type="button" className={g.btn} onClick={closeAlert} autoFocus>Done</button>
            </>) : (<>
              <h2 id="alert-h">Tell me when a time opens</h2>
              <p>{alertModal.teeTimeId
                ? `We'll email you if this time opens on ${longDate(alertModal.date)}.`
                : `We'll email you when a time opens on ${longDate(alertModal.date)}${tods.length === 1 ? `, ${(h => h[0].toLowerCase() + h.slice(1))(TODS.find(t => t.key === tods[0])!.hint)}` : ''}.`}</p>
              <form noValidate onSubmit={e => { e.preventDefault(); submitAlert(); }}>
                <div className={g.inp}>
                  <label className={g.lab} htmlFor="alert-email">Email</label>
                  <input id="alert-email" type="email" autoComplete="email" autoFocus value={alertEmail} onChange={e => setAlertEmail(e.target.value)}
                    aria-invalid={alertError ? true : undefined} aria-describedby="alert-err" />
                </div>
                <div className={g.inp}>
                  <label className={g.lab} htmlFor="alert-name">Name (optional)</label>
                  <input id="alert-name" type="text" autoComplete="name" value={alertName} onChange={e => setAlertName(e.target.value)} />
                </div>
                <div className={g.err} id="alert-err" role="alert">{alertError}</div>
                <button type="submit" className={g.btn} disabled={!alertEmail.trim() || alertSubmitting}>{alertSubmitting ? 'Setting…' : 'Set alert'}</button>
              </form>
              <button type="button" className={g.ghost} onClick={closeAlert}>Cancel</button>
            </>)}
          </div>
        </div>
      )}

      {/* Demo booking intercept modal */}
      {demoModal && (
        <div className={g.modalBack} onClick={() => setDemoModal(false)}>
          <div className={g.modal} role="dialog" aria-modal="true" aria-labelledby="demo-h" onClick={e => e.stopPropagation()}>
            <h2 id="demo-h">Demo course</h2>
            <p>Bookings are disabled on this demo page. This is where your golfers would receive their confirmation — with your course name, their tee time, and a check-in link.</p>
            <a href="/demo" className={g.btn}>Book a demo</a>
            <button type="button" className={g.ghost} onClick={() => setDemoModal(false)}>Keep exploring</button>
          </div>
        </div>
      )}
    </div>
  );
}
