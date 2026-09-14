'use client';
import { useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Phone, Globe, Star, Users, Clock, ChevronLeft, ChevronRight, Check, Flag, SlidersHorizontal, ExternalLink, Navigation, Bell, ArrowRight, Eye, CheckCircle } from 'lucide-react';
import type { Course, TeeTime } from '@/lib/courses-data';
import { TrustNote } from '@/components/TrustNote';
import { ACCESS_FEE_PER_PLAYER, hoursLabel } from '@/lib/booking-fees';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import { CHANGE_CATEGORIES } from '@/lib/change-requests';

const TYPE_LABELS: Record<string, string> = {
  public:         'Public',
  private:        'Private Club',
  'semi-private': 'Semi-Private',
  member:         'Member / Guest',
  resident:       'Resident',
  resort:         'Resort',
  municipal:      'Municipal',
};

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
  { key: 'afternoon', label: 'Afternoon' },
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

function todOf(t: TeeTime): TimeOfDay {
  const h = parseInt(t.time.split(':')[0]);
  if (h < 12) return 'morning';
  if (h < 16) return 'afternoon';
  return 'twilight';
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
  // B-1: the trust line reads the course's own policy. normalize-course.ts has
  // always sent these; the type just never named them.
  cancellation_hours?: number;
  late_cancellation_fee?: number;
  brand_color?: string;
  gift_card_url?: string;
  photos?: { id: string; url: string; sortOrder: number }[];
  page_approval_status?: 'none' | 'approved' | 'changes_requested';
  is_live?: boolean;
};

type ActiveTeeTime = TeeTime & { member_green_fee?: number; has_member_rate?: boolean };
type ActiveMemberSession = {
  email: string;
  name: string;
  tier: { name: string; color?: string } | null;
  source?: 'member' | 'golfer';
};
type GolferProfile = { firstName: string; lastName: string; email: string };

type PreviewMode = { courseId: string; token: string } | null;

export default function CourseDetailPage({
  params,
  previewMode = null,
}: {
  params: Promise<{ slug: string }>;
  previewMode?: PreviewMode;
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

  const [course, setCourse] = useState<CourseWithBrand | null>(null);
  const [notFound, setNotFound] = useState(false);

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
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  useEffect(() => {
    const url = previewMode
      ? `/api/preview/${previewMode.courseId}?token=${previewMode.token}`
      : `/api/courses/${slug}`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((c: CourseWithBrand) => {
        setCourse(c);
        if (c?.cart_required) setWithCart(true);
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
      .then(setTeeTimes)
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
    const q = p.toString();
    router.replace(`/courses/${slug}${q ? '?' + q : ''}`, { scroll: false });
  }, [selectedDate, todFilter, players, holesFilter, slug, router, previewMode]);

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
      for (let i = 1; i <= 7 && found.length < 2; i++) {
        if (cancelled) return;
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() + i);
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

  const filtered = useMemo(() => {
    const source: ActiveTeeTime[] = memberSession ? memberTeeTimes : teeTimes;
    return source.filter(t => {
      // Full slots (0 seats) always show greyed — player filter doesn't hide them
      if (t.players_available > 0 && t.players_available < players) return false;
      if (todFilter !== 'all' && todOf(t) !== todFilter) return false;
      if (maxPrice !== null && t.green_fee > maxPrice) return false;
      if (holesFilter !== 'all') {
        const h = holesOf(t);
        if (h !== undefined && String(h) !== holesFilter) return false;
      }
      return true;
    });
  }, [memberSession, memberTeeTimes, teeTimes, players, todFilter, maxPrice, holesFilter]);

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
      afternoon: { windowStart: '12:00', windowEnd: '15:59' },
      twilight:  { windowStart: '16:00', windowEnd: '23:59' },
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
          <Image src="/brand/birdie-sitting.png" alt="" width={72} height={101} className="mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-ink mb-2">Birdie couldn&apos;t find that course.</h1>
          <p className="text-ink-muted text-sm mt-2">Please use the booking link on your course&apos;s website, or contact <a href="mailto:hello@greenreserve.app" className="text-pine hover:underline">hello@greenreserve.app</a>.</p>
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
      : { backgroundColor: course.brand_color || '#24513B' };
    const amenities = course.amenities ? course.amenities.filter(Boolean) : [];
    return (
      <>
        <div className="relative h-44 sm:h-56 flex items-end overflow-hidden" style={heroStyle}>
          {course.hero_image_url
            ? <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/5" />
            : <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 0,transparent 50%)', backgroundSize: '14px 14px' }} />}
          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 w-full pb-6">
            {course.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.logo_url} alt={`${course.name} logo`} className="h-12 w-12 rounded-md bg-white object-contain p-1 shadow-lg mb-3" loading="lazy" />
            )}
            <span className="text-xs font-medium text-white/70 mb-1 inline-block">Private Club</span>
            <h1 className="text-2xl sm:text-3xl font-serif font-medium text-white leading-tight">{course.name}</h1>
            <p className="text-white/60 flex items-center gap-1.5 mt-1 text-sm">
              <MapPin size={14} />
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
                  <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-3">Amenities</p>
                  <div className="flex flex-wrap gap-2">
                    {amenities.map((a: string) => (
                      <span key={a} className="text-xs text-ink-soft border border-line rounded-md px-2.5 py-1">{a}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-ink-muted">
                {course.phone && <span><span className="text-ink-faint">Phone</span> · {course.phone}</span>}
                {course.website && (
                  <a href={course.website} target="_blank" rel="noopener noreferrer" className="text-pine hover:underline">
                    Website
                  </a>
                )}
              </div>
            </div>

            <div className="bg-white border border-line rounded-lg p-6 sticky top-20">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">Member access</p>
              <p className="text-ink text-sm leading-relaxed mb-5">
                This is a private club. Tee time booking is reserved for members. Sign in to your member account to view availability and book.
              </p>
              <Link
                href={`/courses/${slug}/member`}
                className="block w-full text-center py-3 px-5 text-white text-sm font-medium rounded-md transition-opacity hover:opacity-90"
                style={{ backgroundColor: course.brand_color || '#24513B' }}
              >
                Member sign in
              </Link>
              <p className="text-center text-xs text-ink-faint mt-4">
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

  const accent = course.brand_color || '#24513B';
  const typeLabel = TYPE_LABELS[course.type] ?? 'Public';
  const amenities = course.amenities ? course.amenities.filter((s: string) => s.trim()) : [];
  const strip = buildDateStrip();
  const todayStr = formatDate(startOfToday());

  const morningItems = filtered.filter(t => todOf(t) === 'morning');
  const afternoonItems = filtered.filter(t => todOf(t) === 'afternoon');
  const twilightItems = filtered.filter(t => todOf(t) === 'twilight');
  const groups = [
    { key: 'morning',   label: 'Morning',   items: morningItems },
    { key: 'afternoon', label: 'Afternoon', items: afternoonItems },
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
    router.push(`/book?${qp}`);
  }

  const coursePhotos = course.photos ?? [];
  const hasPhotos = coursePhotos.length > 0;
  // B-1: the trust line's policy facts, from the course itself.
  const cancelHours = course.cancellation_hours ?? 24;
  const hasLateFee = (course.late_cancellation_fee ?? 0) > 0;
  const directionsUrl = course.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(course.address)}` : '';

  // Public look: a real photo when the course has one, otherwise a flat tint
  // of the course's own accent — never a stock gradient.
  const heroStyle = course.hero_image_url
    ? { backgroundImage: `url(${course.hero_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: accent };
  const heroOverlay = course.hero_image_url ? (
    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/5" />
  ) : (
    <div
      className="absolute inset-0 opacity-10"
      style={{
        backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 0,transparent 50%)',
        backgroundSize: '14px 14px',
      }}
    />
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
            <Eye size={14} className="text-pine shrink-0" />
            <span className="text-ink-soft">
              This course is already live — you&apos;re viewing it as golfers see it. Questions or changes? Message the GreenReserve team from your dashboard, or reply to any of our emails.
            </span>
          </div>
        </div>
      )}
      {previewMode && !course.is_live && (
        <div className="bg-pine/10 border-b border-pine/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 text-sm flex-wrap">
            <Eye size={14} className="text-pine shrink-0" />
            <span className="text-ink-soft">
              Preview of your GreenReserve page &mdash; not live yet. Booking is disabled.
            </span>
            <div className="flex items-center gap-2 ml-auto">
              {previewApprovalStatus === 'approved' ? (
                <span className="text-xs text-ok font-medium flex items-center gap-1"><CheckCircle size={14}/>Approved</span>
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
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="text-ink font-medium mb-1">What would you like changed?</div>
            <div className="text-xs text-ink-muted mb-3">Check everything that applies — you can add a note for each.</div>
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
                className="text-xs text-ink-muted hover:text-ink px-3 py-2"
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
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
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
            <Link href="/for-courses" className="text-pine font-medium hover:underline whitespace-nowrap">
              List your course <ArrowRight size={12} className="inline -mt-0.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Course hero */}
      <div className="relative h-44 sm:h-56 flex items-end overflow-hidden" style={heroStyle}>
        {heroOverlay}
        {memberSession ? (
          <Link
            href={`/courses/${slug}/account`}
            className="absolute top-3 right-4 z-10 flex items-center gap-1.5 text-xs text-white/80 hover:text-white transition-colors"
          >
            <span>{memberSession.name}</span>
            <span className="bg-white/15 rounded px-1.5 py-0.5 text-[10px] font-medium">Member{memberSession.tier?.name ? ` — ${memberSession.tier.name}` : ''}</span>
          </Link>
        ) : golferProfile ? (
          <Link
            href={`/courses/${slug}/account`}
            className="absolute top-3 right-4 z-10 text-xs text-white/70 hover:text-white transition-colors"
          >
            Hi, {golferProfile.firstName}
          </Link>
        ) : (
          <Link
            href={`/courses/${slug}/account`}
            className="absolute top-3 right-4 z-10 text-xs text-white/60 hover:text-white transition-colors"
          >
            Sign in
          </Link>
        )}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex items-end gap-4">
              {course.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.logo_url}
                  alt={`${course.name} logo`}
                  className="h-12 w-12 sm:h-16 sm:w-16 rounded-md bg-white object-contain p-1 shadow-lg flex-shrink-0"
                  loading="lazy"
                />
              )}
              <div>
                <span className="text-xs font-medium text-white/70 mb-2 inline-block">{typeLabel}</span>
                <h1 className="text-2xl sm:text-3xl font-serif font-medium text-white leading-tight">{course.name}</h1>
                <p className="text-white/60 flex items-center gap-1.5 mt-1 text-sm">
                  <MapPin size={14} />
                  {course.city}, {course.state} · {course.holes} holes · Par {course.par}
                </p>
              </div>
            </div>
            {course.review_count > 0 && (
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-4 py-2">
                <Star size={16} className="fill-[#c9a84c] text-[#c9a84c]" />
                <span className="text-white font-semibold">{course.rating.toFixed(1)}</span>
                <span className="text-white/50 text-sm">({course.review_count.toLocaleString()} reviews)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Course alert banner */}
      {course.conditions && (
        <div className="bg-warn/5 border-b border-warn/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2 text-sm text-warn">
            <Flag size={14} className="flex-shrink-0" />
            <span><span className="font-medium">Course notice:</span> {course.conditions}</span>
          </div>
        </div>
      )}

      {/* B-1: no tab bar. The sheet is the page; About and Photos are sections
          below it (the framework's fixed section order: identity → book
          controls → trust line → tee sheet → the place → GreenReserve line). */}

      {/* Main content */}
      <div className="bg-paper min-h-screen">
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${selectedTime ? 'pb-48' : ''}`}>

          {(course.type === 'member' ? (
            <div className="max-w-md mx-auto bg-white rounded-lg border border-line p-8 text-center">
              <Phone size={28} className="mx-auto mb-4" style={{ color: accent }} />
              <h2 className="font-serif font-medium text-ink text-xl mb-2">Member-only club</h2>
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
          ) : (
            <div className="grid lg:grid-cols-[260px_1fr] gap-8 items-start">

              {/* LEFT: Filters */}
              <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>
                <div className="lg:sticky lg:top-20 bg-white rounded-lg border border-line divide-y divide-line">

                  <div className="px-5 py-4 flex items-center justify-between">
                    <span className="font-medium text-ink text-sm flex items-center gap-2">
                      <SlidersHorizontal size={14} /> Filters
                    </span>
                    {activeFilterCount > 0 && (
                      <button onClick={resetFilters} className="text-xs font-medium transition-opacity hover:opacity-70" style={{ color: accent }}>
                        Reset all
                      </button>
                    )}
                  </div>

                  {/* Calendar */}
                  <div className="px-5 py-4">
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
                    <div className="grid grid-cols-7 text-center text-[10px] font-medium text-ink-muted uppercase mb-1">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {buildMonthGrid(calMonth).map((d, i) => {
                        if (!d) return <div key={`e${i}`} />;
                        const ds = formatDate(d);
                        const isPast = d < startOfToday();
                        const isSelected = ds === selectedDate;
                        const isToday = ds === todayStr;
                        const base = 'aspect-square flex items-center justify-center rounded-md text-xs font-medium transition-colors';
                        let cls = 'text-ink hover:bg-line-soft';
                        if (isPast) cls = 'text-ink-faint cursor-default';
                        // Today and the selected day both wear the course's colour.
                        let selStyle: React.CSSProperties = {};
                        if (isToday && !isSelected) { cls = ''; selStyle = { color: accent, boxShadow: `inset 0 0 0 1px ${accent}4d` }; }
                        if (isSelected) { cls = ''; selStyle = { backgroundColor: accent, color: '#fff' }; }
                        return (
                          <button key={ds} disabled={isPast} onClick={() => setSelectedDate(ds)}
                            className={`${base} ${cls}`} style={selStyle}>
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Players */}
                  <div className="px-5 py-4">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">Players</div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map(n => {
                        const isSel = players === n;
                        return (
                          <button
                            key={n}
                            onClick={() => { setPlayers(n); setSelectedTime(null); }}
                            className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-md border text-sm font-medium transition-all"
                            style={isSel ? { borderColor: accent, backgroundColor: `${accent}12`, color: accent } : { borderColor: '#E6E3D7', color: '#87867C' }}
                          >
                            <Users size={13} />
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time of day */}
                  <div className="px-5 py-4">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">Time of Day</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TOD_OPTIONS.map(o => {
                        const isSel = todFilter === o.key;
                        return (
                          <button
                            key={o.key}
                            onClick={() => setTodFilter(o.key)}
                            className="py-2 rounded-md border text-xs font-medium transition-all"
                            style={isSel ? { borderColor: accent, backgroundColor: `${accent}12`, color: accent } : { borderColor: '#E6E3D7', color: '#87867C' }}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Max price */}
                  {priceBounds && priceBounds.min < priceBounds.max && (
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Max Price</span>
                        <span className="text-xs font-medium text-ink">${maxPrice ?? priceBounds.max}</span>
                      </div>
                      <input
                        type="range"
                        min={priceBounds.min}
                        max={priceBounds.max}
                        step={1}
                        value={maxPrice ?? priceBounds.max}
                        onChange={e => setMaxPrice(Number(e.target.value))}
                        className="w-full accent-pine"
                      />
                      <div className="flex justify-between text-[10px] text-ink-faint mt-1">
                        <span>${priceBounds.min}</span>
                        <span>${priceBounds.max}</span>
                      </div>
                    </div>
                  )}

                  {/* Holes */}
                  {hasHolesData && (
                    <div className="px-5 py-4">
                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">Holes</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['all', '9', '18'] as const).map(h => {
                          const isSel = holesFilter === h;
                          return (
                            <button
                              key={h}
                              onClick={() => setHolesFilter(h)}
                              className="py-2 rounded-md border text-xs font-medium transition-all"
                              style={isSel ? { borderColor: accent, backgroundColor: `${accent}12`, color: accent } : { borderColor: '#E6E3D7', color: '#87867C' }}
                            >
                              {h === 'all' ? 'Any' : h}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </aside>

              {/* RIGHT: Tee sheet */}
              <section className="min-w-0">

                {/* Mobile controls */}
                <div className="lg:hidden mb-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFiltersOpen(!filtersOpen)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-line bg-white text-sm font-medium text-ink shrink-0"
                    >
                      <SlidersHorizontal size={14} />
                      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                    {/* Inline player count — saves opening the filter panel just to change players */}
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => { setPlayers(p => Math.max(1, p - 1)); setSelectedTime(null); }}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white text-ink font-medium text-sm leading-none hover:bg-paper transition-colors"
                        aria-label="Fewer players"
                      >−</button>
                      <div className="flex items-center gap-1 px-1.5">
                        <Users size={12} className="text-ink-muted" />
                        <span className="text-sm font-medium text-ink tabular-nums">{players}</span>
                      </div>
                      <button
                        onClick={() => { setPlayers(p => Math.min(4, p + 1)); setSelectedTime(null); }}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white text-ink font-medium text-sm leading-none hover:bg-paper transition-colors"
                        aria-label="More players"
                      >+</button>
                    </div>
                    <span className="text-sm font-medium text-ink-soft ml-auto">{displayDate(selectedDate)}</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {strip.map(d => {
                      const ds = formatDate(d);
                      const isSelected = ds === selectedDate;
                      const isToday = ds === todayStr;
                      return (
                        <button
                          key={ds}
                          onClick={() => setSelectedDate(ds)}
                          className="flex flex-col items-center px-3 py-2 rounded-md text-xs font-medium min-w-[3.25rem] transition-all"
                          style={isSelected
                            ? { backgroundColor: accent, color: '#fff' }
                            : { backgroundColor: '#fff', border: '1px solid #E6E3D7', color: '#1C1C18' }}
                        >
                          <span className="text-[10px] font-medium opacity-70">
                            {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span className="text-base font-semibold leading-tight">{d.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="font-serif font-medium tracking-tight text-ink text-xl">
                      Tee times for <span style={{ color: accent }}>{displayDate(selectedDate)}</span>
                    </h2>
                    {!loadingTimes && teeTimes.length > 0 && (
                      <span className="text-sm text-ink-muted">{filtered.length} available</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => openAlert()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-line bg-white text-ink-soft hover:text-ink transition-colors"
                    >
                      <Bell size={12} /> Set alert
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
                  <b className="text-ink font-semibold">Nothing charged today.</b>{' '}
                  {hasLateFee
                    ? (selectedTime
                        ? <>Cancel free until <b className="text-ink font-medium">{deadlineLabel(selectedDate, selectedTime.time, cancelHours)}</b> (course time).</>
                        : <>Cancel free until {hoursLabel(cancelHours)} before your tee time.</>)
                    : <>No card needed — cancel any time.</>}
                  {' '}${ACCESS_FEE_PER_PLAYER.toFixed(2)}/player booking fee.
                </p>

                {/* B-4: the day is sold out for this party but the full rows still
                    render below (each with "Tell me if it opens") — so the nearest
                    fits sit here, above them, instead of in an empty state that
                    never shows. */}
                {!loadingTimes && teeTimes.length > 0 && !teeTimes.some(t => t.players_available >= players) && (
                  <div className="mb-4 bg-white rounded-lg border border-line px-4 py-3.5 flex flex-wrap items-center gap-3">
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

                {/* List */}
                {loadingTimes ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-16 bg-line rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="bg-white rounded-lg border border-line text-center py-16 px-6">
                    <Clock size={24} className="mx-auto mb-4 text-ink-faint" />
                    {teeTimes.length === 0 ? (
                      <div>
                        <p className="font-serif font-medium text-ink text-xl mb-1.5">Nothing open on {displayDate(selectedDate)}</p>
                        <p className="text-ink-muted text-sm mb-5">Every slot for this date is taken.</p>
                        {/* B-4: nearest fits — the two closest dates with room for this party. */}
                        {searchingNext ? (
                          <p className="text-xs text-ink-faint">Looking for the nearest open dates…</p>
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
                          <p className="text-xs text-ink-faint">Nothing with room for {players} in the next week.</p>
                        )}
                        <div className="mt-5">
                          <button
                            onClick={() => openAlert()}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
                          >
                            <Bell size={12} /> Tell me if something opens up
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="font-serif font-medium text-ink text-xl mb-1.5">No times match your filters</p>
                        <p className="text-ink-muted text-sm mb-5">There are tee times on this date — your filters rule them all out.</p>
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
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groups.map(g => (
                      <div key={g.key}>
                        {todFilter === 'all' && (
                          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2 flex items-center gap-1.5">
                            <Clock size={11} /> {g.label}
                          </div>
                        )}
                        <div className="space-y-2">
                          {g.items.map(t => {
                            const isSel = selectedTime?.id === t.id;
                            const h = holesOf(t);
                            const isFull = t.players_available === 0;
                            const slotBorder = isSel ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : { borderColor: '#E6E3D7' };
                            const slotPlayers = Math.min(players, t.players_available || players);
                            const hasMemberRate = !!(t.member_green_fee != null && t.has_member_rate && t.member_green_fee < t.green_fee);
                            const displayGreenFee = hasMemberRate ? t.member_green_fee! : t.green_fee;
                            const cartFee = isSel && withCart && t.cart_fee > 0 ? t.cart_fee : 0;
                            const slotTotal = (displayGreenFee + cartFee) * slotPlayers + 1.5 * slotPlayers;

                            return (
                              <div key={t.id} className={`rounded-lg border overflow-hidden transition-all ${isFull ? 'opacity-60' : ''}`} style={slotBorder}>
                                <div
                                  className="w-full flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5"
                                  style={{ backgroundColor: isSel ? `${accent}0a` : '#fff', cursor: 'pointer' }}
                                  onClick={isFull ? () => openAlert(t.id) : () => {
                                    const next = isSel ? null : t;
                                    setSelectedTime(next);
                                    if (next && players > next.players_available) setPlayers(next.players_available);
                                  }}
                                >
                                  <div className="min-w-0">
                                    <div className="text-xl sm:text-2xl font-serif font-medium tracking-tight text-ink leading-none">
                                      {formatTime(t.time)}
                                    </div>
                                    <div className="text-xs mt-1.5 flex items-center gap-1.5 flex-wrap">
                                      {isFull ? (
                                        <span className="text-ink-faint">Full</span>
                                      ) : (
                                        <>
                                          <span className={STATUS_STYLE[t.status] || 'text-ink-muted'}>{STATUS_LABEL[t.status] || 'Available'}</span>
                                          <span className="text-ink-muted">· {t.players_available} {t.players_available === 1 ? 'spot' : 'spots'} open</span>
                                        </>
                                      )}
                                      {h !== undefined && <span className="text-ink-muted">· {h} holes</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
                                    <div className="text-right">
                                      {/* The unit always rides with the number — a bare
                                          "$62" reads as the total, which it never is. */}
                                      <div className="font-medium text-ink whitespace-nowrap">
                                        ${displayGreenFee}<span className="text-ink-muted font-normal"> / player</span>
                                      </div>
                                      {hasMemberRate && (
                                        <div className="text-[11px] text-ink-faint">
                                          <span className="line-through">${t.green_fee}</span> · member rate
                                        </div>
                                      )}
                                    </div>
                                    {isFull ? (
                                      <span className="inline-flex items-center gap-1 px-3 sm:px-4 py-2 rounded-md text-xs font-medium border border-line text-ink-soft">
                                        <Bell size={11} /> Tell me if it opens
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 px-3 sm:px-4 py-2 rounded-md text-xs font-medium transition-colors"
                                        style={isSel ? { backgroundColor: accent, color: '#fff' } : { border: `1px solid ${accent}`, color: accent }}
                                      >
                                        {isSel ? <><Check size={12} /> Selected</> : 'Select'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* B-2: the alert form opens inside the full row — no modal. Same API. */}
                                {isFull && alertModal?.teeTimeId === t.id && (
                                  <div className="border-t px-4 sm:px-5 py-4" style={{ borderColor: `${accent}25`, backgroundColor: `${accent}05` }} onClick={e => e.stopPropagation()}>
                                    {alertSent ? (
                                      <p className="text-sm text-ink"><b className="font-semibold">Alert set.</b> We&apos;ll email you the moment {formatTime(t.time)} opens up on {displayDate(selectedDate)}.</p>
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

                                {isSel && (
                                  <div className="border-t px-4 sm:px-5 py-5 grid gap-4 lg:grid-cols-2 lg:gap-6 lg:items-start" style={{ borderColor: `${accent}25`, backgroundColor: `${accent}05` }}>
                                    {/* LEFT on desktop: what you're choosing */}
                                    <div className="space-y-4">
                                    {/* Party size */}
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">Players</div>
                                      <div className="flex gap-1.5">
                                        {([1, 2, 3, 4] as const).map(n => {
                                          const ok = n <= t.players_available;
                                          return (
                                            <button
                                              key={n}
                                              disabled={!ok}
                                              onClick={() => setPlayers(n)}
                                              className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-md border text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                              style={slotPlayers === n && ok ? { borderColor: accent, backgroundColor: `${accent}12`, color: accent } : { borderColor: '#E6E3D7', color: '#87867C' }}
                                            >
                                              <Users size={13} />
                                              {n}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {/* Cart toggle */}
                                    {t.cart_fee > 0 && !course.cart_required && (
                                      <button
                                        onClick={() => setWithCart(!withCart)}
                                        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-md border text-sm font-medium transition-colors"
                                        style={withCart ? { borderColor: accent, backgroundColor: `${accent}12`, color: accent } : { borderColor: '#E6E3D7', color: '#6E6D64' }}
                                      >
                                        <span>Add cart</span>
                                        <span>${t.cart_fee} / player</span>
                                      </button>
                                    )}
                                    </div>

                                    {/* RIGHT on desktop: what it costs, and the way out */}
                                    <div className="space-y-4">
                                    {/* Itemized pricing */}
                                    <div className="bg-white rounded-md border border-line px-4 py-3 space-y-1.5">
                                      <div className="flex justify-between text-sm text-ink-soft">
                                        <span>Green fee{hasMemberRate ? ' (member)' : ''} × {slotPlayers}</span>
                                        <span>${(displayGreenFee * slotPlayers).toFixed(2)}</span>
                                      </div>
                                      {withCart && t.cart_fee > 0 && (
                                        <div className="flex justify-between text-sm text-ink-soft">
                                          <span>Cart × {slotPlayers}</span>
                                          <span>${(t.cart_fee * slotPlayers).toFixed(2)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between text-sm text-ink-soft">
                                        <span>GR booking fee × {slotPlayers}</span>
                                        <span>${(1.5 * slotPlayers).toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between font-semibold text-ink pt-2 border-t border-line">
                                        <span>Total</span>
                                        <span>${slotTotal.toFixed(2)}</span>
                                      </div>
                                      <TrustNote className="pt-1.5">Your green fee goes to the course; the $1.50 per player is GreenReserve&apos;s.</TrustNote>
                                    </div>

                                    {/* Continue to Book */}
                                    <button
                                      onClick={handleBook}
                                      className="w-full py-3 rounded-md font-medium text-white text-sm transition-colors"
                                      style={{ backgroundColor: accent }}
                                    >
                                      Continue to Book →
                                    </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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
            </div>
          ))}

          {/* About — a section under the sheet (B-1), not a tab */}
          <section id="about" className="mt-14 scroll-mt-6">{(
            <div className="grid lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-lg p-7 border border-line">
                  <h2 className="font-semibold text-ink text-xl mb-4">About This Course</h2>
                  <p className="text-ink-soft leading-relaxed">{course.description}</p>
                  {/* SD-1: defence in depth — the settings API validates this
                      now, but a row written before that rule is rendered as a
                      raw href here, so the render refuses anything but http(s). */}
                  {course.gift_card_url && /^https?:\/\//i.test(course.gift_card_url) && (
                    <a
                      href={course.gift_card_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 rounded-md text-sm font-medium border border-line text-ink hover:border-pine/40 transition-colors"
                    >
                      <ExternalLink size={14} />
                      Gift Cards
                    </a>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-line">
                    {[
                      { label: 'Course Type', value: typeLabel },
                      { label: 'Holes', value: String(course.holes) },
                      { label: 'Par', value: String(course.par) },
                      { label: 'Walking', value: course.walking_allowed ? 'Allowed' : 'Cart Only' },
                      { label: 'Cart', value: course.cart_required ? 'Required' : 'Optional' },
                      { label: 'State', value: course.state },
                    ].map(f => (
                      <div key={f.label}>
                        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-0.5">{f.label}</div>
                        <div className="text-ink font-medium text-sm">{f.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {amenities.length > 0 && (
                  <div className="bg-white rounded-lg p-7 border border-line">
                    <h2 className="font-semibold text-ink text-xl mb-4">Amenities</h2>
                    <div className="flex flex-wrap gap-2">
                      {amenities.map(a => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium"
                          style={{ backgroundColor: `${accent}10`, color: accent }}
                        >
                          <Check size={13} />
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg p-7 border border-line">
                <h2 className="font-semibold text-ink text-xl mb-4">Contact</h2>
                <div className="space-y-3">
                  {course.address && (
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-3 text-sm text-ink-soft">
                        <MapPin size={16} className="text-ink-muted mt-0.5 flex-shrink-0" />
                        {course.address}
                      </div>
                      {directionsUrl && (
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline ml-7"
                          style={{ color: accent }}
                        >
                          <Navigation size={12} />
                          Get directions
                        </a>
                      )}
                    </div>
                  )}
                  {course.phone && (
                    <a href={`tel:${course.phone}`} className="flex items-center gap-3 text-sm text-ink-soft hover:opacity-70 transition-opacity">
                      <Phone size={16} className="text-ink-muted" />
                      {course.phone}
                    </a>
                  )}
                  {course.website && (
                    <a href={course.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm hover:underline" style={{ color: accent }}>
                      <Globe size={16} className="text-ink-muted" />
                      {course.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}</section>

          {/* Photos — a section under the sheet (B-1), not a tab */}
          {hasPhotos && (
            <section id="photos" className="mt-14 scroll-mt-6">
              <h2 className="font-serif font-medium tracking-tight text-ink text-xl mb-4">Photos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {coursePhotos.map(p => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.id}
                    src={p.url}
                    alt=""
                    className="w-full aspect-video object-cover rounded-lg border border-line"
                    loading="lazy"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Quiet GreenReserve credit — the page belongs to the course, so the
              platform signs it at the bottom instead of over the hero photo. */}
          <div className="mt-12 pt-6 border-t border-line-soft text-center text-[11px] text-ink-faint">
            Booking by GreenReserve
          </div>
        </div>
      </div>

      {/* Alert modal */}
      {alertModal && !alertModal.teeTimeId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => { if (!alertSubmitting) { setAlertModal(null); setAlertSent(false); } }}
        >
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            {alertSent ? (
              <div className="text-center py-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${accent}14`, color: accent }}>
                  <Check size={20} />
                </div>
                <p className="font-serif font-medium text-ink text-xl mb-1.5">Alert set</p>
                <p className="text-sm text-ink-muted mb-5">We&apos;ll email you when a spot opens up at {course.name}.</p>
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
                  <Bell size={15} style={{ color: accent }} />
                  <h3 className="font-serif font-medium text-ink text-xl leading-none">Get an alert</h3>
                </div>
                <p className="text-sm text-ink-muted mb-5">
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
          <div className="bg-white rounded-lg max-w-sm w-full p-7 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full bg-pine/10 flex items-center justify-center mx-auto mb-4">
              <Flag size={20} className="text-pine" />
            </div>
            <h3 className="font-serif font-medium text-ink text-xl text-center mb-2">Demo course</h3>
            <p className="text-sm text-ink-soft text-center leading-relaxed mb-6">
              Bookings are disabled on this demo page. This is where your golfers would receive their confirmation — with your course name, their tee time, and a check-in link.
            </p>
            <Link
              href="/for-courses"
              className="block w-full text-center py-3 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-colors mb-3"
            >
              List your course for free
            </Link>
            <button
              onClick={() => setDemoModal(false)}
              className="block w-full text-center py-3 text-sm text-ink-muted hover:text-ink transition-colors"
            >
              Keep exploring
            </button>
          </div>
        </div>
      )}

    </>
  );
}
