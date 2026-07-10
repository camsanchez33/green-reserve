'use client';
import { useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Phone, Globe, Star, Users, Clock, ChevronLeft, ChevronRight, Check, Flag, SlidersHorizontal, ExternalLink, Navigation, Bell, ArrowRight, Eye } from 'lucide-react';
import type { Course, TeeTime } from '@/lib/courses-data';
import { TrustNote } from '@/components/TrustNote';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';

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
  brand_color?: string;
  gift_card_url?: string;
  photos?: { id: string; url: string; sortOrder: number }[];
};

type ActiveTeeTime = TeeTime & { member_green_fee?: number; has_member_rate?: boolean };
type ActiveMemberSession = {
  email: string;
  name: string;
  tier: { name: string; color?: string } | null;
};

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
  const [tab, setTab] = useState<'tee-times' | 'about' | 'photos'>('tee-times');
  const [nextAvailable, setNextAvailable] = useState<string | null>(null);
  const [searchingNext, setSearchingNext] = useState(false);
  const didMount = useRef(false);

  const [alertModal, setAlertModal] = useState<{ teeTimeId?: string; date: string; courseId: string } | null>(null);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertName, setAlertName] = useState('');
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertSent, setAlertSent] = useState(false);

  const [memberSession, setMemberSession] = useState<ActiveMemberSession | null>(null);
  const [memberTeeTimes, setMemberTeeTimes] = useState<ActiveTeeTime[]>([]);

  useEffect(() => {
    const url = previewMode
      ? `/api/preview/${previewMode.courseId}?token=${previewMode.token}`
      : `/api/courses/${slug}`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((c: CourseWithBrand) => { setCourse(c); if (c?.cart_required) setWithCart(true); })
      .catch(() => setNotFound(true));
  }, [slug, previewMode]);

  useEffect(() => {
    if (!course || course.type === 'member' || course.type === 'private') return;
    setLoadingTimes(true);
    setSelectedTime(null);
    setMaxPrice(null);
    setNextAvailable(null);
    const url = previewMode
      ? `/api/preview/${previewMode.courseId}/tee-times?token=${previewMode.token}&date=${selectedDate}`
      : `/api/courses/${slug}/tee-times?date=${selectedDate}`;
    fetch(url)
      .then(r => r.json())
      .then(setTeeTimes)
      .catch(() => setTeeTimes([]))
      .finally(() => setLoadingTimes(false));
  }, [slug, selectedDate, course, previewMode]);

  // Fetch member session — silent 401 is normal (just means not signed in)
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
    if (todFilter !== 'all') p.set('tod', todFilter);
    if (players !== 2) p.set('players', String(players));
    if (holesFilter !== 'all') p.set('holes', holesFilter);
    const q = p.toString();
    router.replace(`/courses/${slug}${q ? '?' + q : ''}`, { scroll: false });
  }, [selectedDate, todFilter, players, holesFilter, slug, router, previewMode]);

  // Find next date with availability when current date is empty
  useEffect(() => {
    if (loadingTimes || teeTimes.length > 0 || !course || course.type === 'member' || course.type === 'private') return;
    let cancelled = false;
    setSearchingNext(true);
    const scan = async () => {
      for (let i = 1; i <= 7; i++) {
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
          if (!cancelled && Array.isArray(times) && times.length > 0) {
            setNextAvailable(ds);
            setSearchingNext(false);
            return;
          }
        } catch { /* continue */ }
      }
      if (!cancelled) setSearchingNext(false);
    };
    scan();
    return () => { cancelled = true; };
  }, [teeTimes.length, loadingTimes, selectedDate, slug, course, previewMode]);

  const hasHolesData = useMemo(() => {
    const vals = new Set(teeTimes.map(t => holesOf(t)).filter(h => h !== undefined));
    return vals.size > 1;
  }, [teeTimes]);

  const priceBounds = useMemo(() => {
    if (teeTimes.length === 0) return null;
    const fees = teeTimes.map(t => t.green_fee);
    return { min: Math.min(...fees), max: Math.max(...fees) };
  }, [teeTimes]);

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
    setAlertEmail('');
    setAlertName('');
    setAlertSent(false);
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
    try {
      await fetch('/api/alerts', {
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
      setAlertSent(true);
    } catch { /* ignore */ } finally {
      setAlertSubmitting(false);
    }
  }

  async function memberSignOut() {
    await fetch(`/api/member/${slug}/logout`, { method: 'POST' }).catch(() => {});
    setMemberSession(null);
    setMemberTeeTimes([]);
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center">
          <Flag size={40} className="mx-auto mb-4 text-pine" />
          <h1 className="text-2xl font-semibold text-ink mb-2">Course Not Found</h1>
          <p className="text-ink-muted">We couldn&apos;t find that course.</p>
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
    const heroStyle = course.hero_image_url
      ? { backgroundImage: `url(${course.hero_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: course.image_gradient };
    const amenities = course.amenities ? course.amenities.filter(Boolean) : [];
    return (
      <>
        <div className="relative h-44 sm:h-56 flex items-end overflow-hidden" style={heroStyle}>
          {course.hero_image_url
            ? <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/5" />
            : <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 0,transparent 50%)', backgroundSize: '14px 14px' }} />}
          <div className="absolute bottom-2.5 right-4 z-10 text-[10px] text-white/40">Powered by GreenReserve</div>
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
                className="block w-full text-center py-3 px-5 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-all"
              >
                Member sign in
              </Link>
              <p className="text-center text-xs text-ink-faint mt-4">
                Not a member? Contact the club directly.
              </p>
            </div>
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
  const tabList: { key: 'tee-times' | 'about' | 'photos'; label: string }[] = [
    { key: 'tee-times', label: 'Tee Times' },
    { key: 'about', label: 'About' },
    ...(hasPhotos ? [{ key: 'photos' as const, label: 'Photos' }] : []),
  ];
  const directionsUrl = course.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(course.address)}` : '';

  const heroStyle = course.hero_image_url
    ? { backgroundImage: `url(${course.hero_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: course.image_gradient };
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
      {previewMode && (
        <div className="bg-pine/10 border-b border-pine/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 text-sm">
            <Eye size={14} className="text-pine shrink-0" />
            <span className="text-ink-soft">
              Preview of your GreenReserve page &mdash; not live yet. Booking is disabled. Reply to our email with any changes.
            </span>
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
        <div className="absolute bottom-2.5 right-4 z-10 text-[10px] text-white/40">
          Powered by GreenReserve
        </div>
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

      {/* Tab bar */}
      <div className="border-b border-line bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex">
          {tabList.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={'px-5 py-3.5 text-sm font-medium border-b-2 transition-colors -mb-px ' + (tab === t.key ? 'border-pine text-pine' : 'border-transparent text-ink-muted hover:text-ink')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="bg-paper min-h-screen">
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${selectedTime ? 'pb-48' : ''}`}>

          {tab === 'tee-times' && (course.type === 'member' ? (
            <div className="max-w-md mx-auto bg-white rounded-lg border border-line p-8 text-center">
              <Phone size={32} className="mx-auto mb-3 text-pine" />
              <h2 className="font-semibold text-ink text-lg mb-2">Member-Only Club</h2>
              <p className="text-ink-soft text-sm mb-4">
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
                      <button onClick={resetFilters} className="text-xs font-medium text-pine hover:text-pine-hover transition-colors">
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
                        let cls = 'text-ink hover:bg-pine/5';
                        if (isPast) cls = 'text-ink-faint cursor-default';
                        if (isToday && !isSelected) cls = 'text-pine ring-1 ring-pine/30 hover:bg-pine/5';
                        const selStyle = isSelected ? { backgroundColor: accent, color: '#fff' } : {};
                        if (isSelected) cls = '';
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
                    <h2 className="font-semibold text-ink text-lg">
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

                {/* List */}
                {loadingTimes ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-16 bg-line rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="bg-white rounded-lg border border-line text-center py-14 px-6">
                    <Clock size={28} className="mx-auto mb-3 text-ink-faint" />
                    {teeTimes.length === 0 ? (
                      <div>
                        <p className="text-ink-muted text-sm mb-4">No tee times available for this date.</p>
                        {searchingNext ? (
                          <p className="text-xs text-ink-faint">Looking for next available date…</p>
                        ) : nextAvailable ? (
                          <button
                            onClick={() => setSelectedDate(nextAvailable)}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-pine hover:text-pine-hover transition-colors"
                          >
                            Next available: {displayDate(nextAvailable)} →
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div>
                        <p className="text-ink-soft text-sm mb-3">No tee times match your filters.</p>
                        <button onClick={resetFilters} className="text-sm font-medium text-pine hover:text-pine-hover transition-colors">
                          Reset filters
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
                                  style={{ backgroundColor: isSel ? `${accent}0a` : '#fff', cursor: isFull ? 'default' : 'pointer' }}
                                  onClick={isFull ? undefined : () => {
                                    const next = isSel ? null : t;
                                    setSelectedTime(next);
                                    if (next && players > next.players_available) setPlayers(next.players_available);
                                  }}
                                >
                                  <div className="min-w-0">
                                    <div className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                                      {formatTime(t.time)}
                                    </div>
                                    <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                                      {isFull ? (
                                        <span className="text-ink-faint">Full</span>
                                      ) : (
                                        <>
                                          <span className={STATUS_STYLE[t.status] || 'text-ink-muted'}>{STATUS_LABEL[t.status] || 'Available'}</span>
                                          <span className="text-ink-muted">· {t.players_available} {t.players_available === 1 ? 'spot' : 'spots'} left</span>
                                        </>
                                      )}
                                      {h !== undefined && <span className="text-ink-muted">· {h} holes</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
                                    <div className="text-right">
                                      <div className="font-semibold text-ink">${displayGreenFee}</div>
                                      {hasMemberRate && (
                                        <div className="text-[10px] text-ink-faint line-through">${t.green_fee}</div>
                                      )}
                                      <div className="text-[11px] text-ink-muted">{hasMemberRate ? 'member rate' : 'per player'}</div>
                                    </div>
                                    {isFull ? (
                                      <span className="hidden sm:inline-flex px-4 py-2 rounded-md text-xs font-medium border border-line text-ink-faint">Full</span>
                                    ) : (
                                      <span
                                        className="hidden sm:inline-flex px-4 py-2 rounded-md text-xs font-medium transition-colors"
                                        style={isSel ? { backgroundColor: accent, color: '#fff' } : { border: `1px solid ${accent}`, color: accent }}
                                      >
                                        {isSel ? 'Selected' : 'Select'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {isFull && (
                                  <div className="border-t border-line/60 px-4 sm:px-5 py-2.5 flex justify-end">
                                    <button
                                      onClick={() => openAlert(t.id)}
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-pine hover:text-pine-hover transition-colors"
                                    >
                                      <Bell size={10} /> Alert me if this opens
                                    </button>
                                  </div>
                                )}

                                {isSel && (
                                  <div className="border-t px-4 sm:px-5 py-5 space-y-4" style={{ borderColor: `${accent}25`, backgroundColor: `${accent}05` }}>
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
                                      <TrustNote className="pt-1.5">Green fees go 100% to the course.</TrustNote>
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

          {/* About tab */}
          {tab === 'about' && (
            <div className="grid lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-lg p-7 border border-line">
                  <h2 className="font-semibold text-ink text-xl mb-4">About This Course</h2>
                  <p className="text-ink-soft leading-relaxed">{course.description}</p>
                  {course.gift_card_url && (
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
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:underline ml-7"
                        >
                          <Navigation size={12} />
                          Get directions
                        </a>
                      )}
                    </div>
                  )}
                  {course.phone && (
                    <a href={`tel:${course.phone}`} className="flex items-center gap-3 text-sm text-ink-soft hover:text-pine transition-colors">
                      <Phone size={16} className="text-ink-muted" />
                      {course.phone}
                    </a>
                  )}
                  {course.website && (
                    <a href={course.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-pine hover:underline">
                      <Globe size={16} className="text-ink-muted" />
                      {course.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Photos tab */}
          {tab === 'photos' && hasPhotos && (
            <div>
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
            </div>
          )}
        </div>
      </div>

      {/* Alert modal */}
      {alertModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => { if (!alertSubmitting) { setAlertModal(null); setAlertSent(false); } }}
        >
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            {alertSent ? (
              <div className="text-center py-2">
                <div className="w-10 h-10 rounded-full bg-ok/10 flex items-center justify-center mx-auto mb-3">
                  <Check size={20} className="text-ok" />
                </div>
                <p className="font-semibold text-ink mb-1">Alert set!</p>
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
                <div className="flex items-center gap-2 mb-1">
                  <Bell size={16} className="text-pine" />
                  <h3 className="font-semibold text-ink text-base">Get an alert</h3>
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
                    className="flex-1 py-2.5 rounded-md bg-pine hover:bg-pine-hover text-white text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {alertSubmitting ? 'Setting…' : 'Set Alert'}
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
