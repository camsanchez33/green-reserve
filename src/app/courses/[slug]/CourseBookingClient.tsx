'use client';
import { useEffect, useMemo, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Phone, Globe, Star, Users, Clock, ChevronLeft, ChevronRight, Check, Flag, SlidersHorizontal, X } from 'lucide-react';
import type { Course, TeeTime } from '@/lib/courses-data';

const TYPE_LABELS: Record<string, string> = {
  public:         'Public',
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

type CourseWithBrand = Course & { brand_color?: string };

export default function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [course, setCourse] = useState<CourseWithBrand | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [selectedDate, setSelectedDate] = useState(formatDate(startOfToday()));
  const [calMonth, setCalMonth] = useState(() => {
    const t = startOfToday();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [players, setPlayers] = useState(2);
  const [selectedTime, setSelectedTime] = useState<TeeTime | null>(null);
  const [withCart, setWithCart] = useState(false);
  const [todFilter, setTodFilter] = useState<TimeOfDay>('all');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [holesFilter, setHolesFilter] = useState<'all' | '9' | '18'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/courses/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((c: CourseWithBrand) => { setCourse(c); if (c?.cart_required) setWithCart(true); })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!course || course.type === 'member') return;
    setLoadingTimes(true);
    setSelectedTime(null);
    setMaxPrice(null);
    fetch(`/api/courses/${slug}/tee-times?date=${selectedDate}`)
      .then(r => r.json())
      .then(setTeeTimes)
      .catch(() => setTeeTimes([]))
      .finally(() => setLoadingTimes(false));
  }, [slug, selectedDate, course]);

  const hasHolesData = useMemo(() => {
    const vals = new Set(teeTimes.map(t => holesOf(t)).filter(h => h !== undefined));
    return vals.size > 1;
  }, [teeTimes]);

  const priceBounds = useMemo(() => {
    if (teeTimes.length === 0) return null;
    const fees = teeTimes.map(t => t.green_fee);
    return { min: Math.min(...fees), max: Math.max(...fees) };
  }, [teeTimes]);

  const filtered = useMemo(() => teeTimes.filter(t => {
    if (t.players_available < players) return false;
    if (todFilter !== 'all' && todOf(t) !== todFilter) return false;
    if (maxPrice !== null && t.green_fee > maxPrice) return false;
    if (holesFilter !== 'all') {
      const h = holesOf(t);
      if (h !== undefined && String(h) !== holesFilter) return false;
    }
    return true;
  }), [teeTimes, players, todFilter, maxPrice, holesFilter]);

  const activeFilterCount =
    (todFilter !== 'all' ? 1 : 0) +
    (maxPrice !== null ? 1 : 0) +
    (holesFilter !== 'all' ? 1 : 0);

  function resetFilters() {
    setTodFilter('all');
    setMaxPrice(null);
    setHolesFilter('all');
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

  const accent = course.brand_color || '#24513B';
  const typeLabel = TYPE_LABELS[course.type] ?? 'Public';
  const amenities = course.amenities ? course.amenities.split(',').map(s => s.trim()) : [];
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

  const cartFeeApplied = selectedTime && withCart ? selectedTime.cart_fee : 0;
  const total = selectedTime
    ? (selectedTime.green_fee + cartFeeApplied) * players + 1.5 * players
    : 0;

  const todayMonth = (() => { const t = startOfToday(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
  const maxMonth = new Date(todayMonth.getFullYear(), todayMonth.getMonth() + 2, 1);
  const canPrevMonth = calMonth > todayMonth;
  const canNextMonth = calMonth < maxMonth;

  function handleBook() {
    if (!selectedTime) return;
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

      {/* Main content */}
      <div className="bg-paper min-h-screen">
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${selectedTime ? 'pb-48' : ''}`}>

          {course.type === 'member' ? (
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
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setFiltersOpen(!filtersOpen)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-line bg-white text-sm font-medium text-ink"
                    >
                      <SlidersHorizontal size={14} />
                      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                    <span className="text-sm font-medium text-ink-soft">{displayDate(selectedDate)}</span>
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
                  <Link
                    href={`/courses/${slug}/member`}
                    className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors flex-shrink-0"
                    style={{ color: accent, border: `1px solid ${accent}30`, backgroundColor: `${accent}08` }}
                  >
                    Member sign in
                  </Link>
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
                      <p className="text-ink-muted text-sm">No tee times available for this date. Try another day.</p>
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
                            return (
                              <button
                                key={t.id}
                                onClick={() => setSelectedTime(isSel ? null : t)}
                                className="w-full flex items-center justify-between gap-4 rounded-lg border px-4 sm:px-5 py-3.5 text-left transition-all"
                                style={isSel
                                  ? { borderColor: accent, backgroundColor: `${accent}0a`, boxShadow: `0 0 0 1px ${accent}` }
                                  : { backgroundColor: '#fff', borderColor: '#E6E3D7' }}
                              >
                                <div className="min-w-0">
                                  <div className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                                    {formatTime(t.time)}
                                  </div>
                                  <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    <span className={STATUS_STYLE[t.status] || 'text-ink-muted'}>{STATUS_LABEL[t.status] || 'Available'}</span>
                                    <span className="text-ink-muted">· {t.players_available} spots</span>
                                    {h !== undefined && <span className="text-ink-muted">· {h} holes</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
                                  <div className="text-right">
                                    <div className="font-semibold text-ink">${t.green_fee}</div>
                                    <div className="text-[11px] text-ink-muted">per player</div>
                                  </div>
                                  <span
                                    className="hidden sm:inline-flex px-4 py-2 rounded-md text-xs font-medium transition-colors"
                                    style={isSel
                                      ? { backgroundColor: accent, color: '#fff' }
                                      : { border: `1px solid ${accent}`, color: accent }}
                                  >
                                    {isSel ? 'Selected' : 'Select'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Course info below the tee sheet */}
          <div className="mt-10 grid lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-lg p-7 border border-line">
                <h2 className="font-semibold text-ink text-xl mb-4">About This Course</h2>
                <p className="text-ink-soft leading-relaxed">{course.description}</p>
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
                  <div className="flex items-start gap-3 text-sm text-ink-soft">
                    <MapPin size={16} className="text-ink-muted mt-0.5 flex-shrink-0" />
                    {course.address}
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
        </div>
      </div>

      {/* Sticky booking bar */}
      {selectedTime && course.type !== 'member' && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line shadow-[0_-6px_24px_rgba(0,0,0,0.06)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink text-sm sm:text-base">
                {formatTime(selectedTime.time)} · {displayDate(selectedDate)} · {players} {players === 1 ? 'player' : 'players'}
              </div>
              <div className="text-xs text-ink-muted mt-0.5">
                Green fee ${selectedTime.green_fee} × {players}
                {withCart && selectedTime.cart_fee > 0 ? ` · Cart $${selectedTime.cart_fee} × ${players}` : ''}
                {` · GR access fee $${(1.5 * players).toFixed(2)}`}
              </div>
            </div>

            {selectedTime.cart_fee > 0 && !course.cart_required && (
              <button
                onClick={() => setWithCart(!withCart)}
                className="self-start sm:self-auto px-3.5 py-2 rounded-md text-xs font-medium transition-colors"
                style={withCart
                  ? { backgroundColor: accent, color: '#fff' }
                  : { backgroundColor: '#F0EDE2', color: '#6E6D64' }}
              >
                {withCart ? `Cart added · $${selectedTime.cart_fee}/player` : `Add cart · $${selectedTime.cart_fee}/player`}
              </button>
            )}

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] font-medium text-ink-muted uppercase tracking-[0.06em]">Total</div>
                <div className="font-bold text-ink text-xl leading-tight">${total.toFixed(2)}</div>
              </div>
              <button
                onClick={handleBook}
                className="px-6 py-3 rounded-md font-medium text-white text-sm transition-colors"
                style={{ backgroundColor: accent }}
              >
                Continue to Book →
              </button>
              <button
                onClick={() => setSelectedTime(null)}
                className="p-2 rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
