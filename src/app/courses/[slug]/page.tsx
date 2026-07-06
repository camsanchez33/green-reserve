'use client';
import { useEffect, useMemo, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Phone, Globe, Star, Users, Clock, ChevronLeft, ChevronRight, Check, Flag, SlidersHorizontal, X } from 'lucide-react';
import type { Course, TeeTime } from '@/lib/courses-data';

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  public:         { label: 'Public',         className: 'bg-emerald-100 text-emerald-800' },
  'semi-private': { label: 'Semi-Private',   className: 'bg-amber-100 text-amber-800' },
  member:         { label: 'Member / Guest', className: 'bg-violet-100 text-violet-800' },
  resident:       { label: 'Resident',       className: 'bg-blue-100 text-blue-800' },
  resort:         { label: 'Resort',         className: 'bg-pink-100 text-pink-800' },
  municipal:      { label: 'Municipal',      className: 'bg-gray-100 text-gray-700' },
};

const STATUS_STYLE: Record<string, string> = {
  available:   'text-emerald-600',
  limited:     'text-amber-600',
  almost_full: 'text-red-500',
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

// 7-day quick strip (mobile)
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

export default function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
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

  // Fetch course
  useEffect(() => {
    fetch(`/api/courses/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((c: Course) => { setCourse(c); if (c?.cart_required) setWithCart(true); })
      .catch(() => setNotFound(true));
  }, [slug]);

  // Fetch tee times when date changes
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

  const hasHolesData = useMemo(() => teeTimes.some(t => holesOf(t) !== undefined), [teeTimes]);

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
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf9]">
        <div className="text-center">
          <Flag size={40} className="mx-auto mb-4 text-emerald-600" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Course Not Found</h1>
          <p className="text-gray-400">We couldn&apos;t find that course.</p>
          <p className="text-gray-400 text-sm mt-2">Please use the booking link on your course&apos;s website, or contact <a href="mailto:hello@greenreserve.app" className="text-emerald-600 hover:text-emerald-500">hello@greenreserve.app</a>.</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[#f8faf9] animate-pulse">
        <div className="h-40 bg-gray-300" />
        <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-[260px_1fr] gap-8">
          <div className="h-96 bg-gray-200 rounded-lg" />
          <div className="space-y-3">
            <div className="h-8 bg-gray-200 rounded w-1/2" />
            <div className="h-16 bg-gray-200 rounded" />
            <div className="h-16 bg-gray-200 rounded" />
            <div className="h-16 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  const badge = TYPE_BADGES[course.type] ?? TYPE_BADGES.public;
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

  // Calendar nav bounds: current month .. +2 months
  const todayMonth = (() => { const t = startOfToday(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
  const maxMonth = new Date(todayMonth.getFullYear(), todayMonth.getMonth() + 2, 1);
  const canPrevMonth = calMonth > todayMonth;
  const canNextMonth = calMonth < maxMonth;

  function handleBook() {
    if (!selectedTime) return;
    // Price is intentionally left out of the URL — /book re-fetches live pricing
    // from the server rather than trusting query params.
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

  return (
    <>
      {/* Course hero header */}
      <div
        className="relative h-44 sm:h-56 flex items-end"
        style={{ background: course.image_gradient }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 0,transparent 50%)',
            backgroundSize: '14px 14px',
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className} mb-2 inline-block`}>
                {badge.label}
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">{course.name}</h1>
              <p className="text-white/60 flex items-center gap-1.5 mt-1 text-sm">
                <MapPin size={14} />
                {course.city}, {course.state} · {course.holes} holes · Par {course.par}
              </p>
            </div>
            {course.review_count > 0 && (
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-4 py-2">
                <Star size={16} className="fill-[#c9a84c] text-[#c9a84c]" />
                <span className="text-white font-bold">{course.rating.toFixed(1)}</span>
                <span className="text-white/50 text-sm">({course.review_count.toLocaleString()} reviews)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="bg-[#f8faf9] min-h-screen">
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${selectedTime ? 'pb-48' : ''}`}>

          {course.type === 'member' ? (
            <div className="max-w-md mx-auto bg-white rounded-lg border border-gray-100 shadow-sm p-8 text-center">
              <Phone size={32} className="mx-auto mb-3 text-emerald-600" />
              <h2 className="font-bold text-gray-900 text-lg mb-2">Member-Only Club</h2>
              <p className="text-gray-600 text-sm mb-4">
                This is a member-only or invitation-based club. Contact the pro shop for guest access.
              </p>
              {course.phone && (
                <a
                  href={`tel:${course.phone}`}
                  className="inline-block w-full py-3 rounded-md font-semibold text-sm text-white text-center bg-emerald-600 hover:bg-emerald-500 transition-colors"
                >
                  Call Pro Shop
                </a>
              )}
            </div>
          ) : (
            <div className="grid lg:grid-cols-[260px_1fr] gap-8 items-start">

              {/* LEFT: Filters */}
              <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>
                <div className="lg:sticky lg:top-20 bg-white rounded-lg border border-gray-100 shadow-sm divide-y divide-gray-100">

                  <div className="px-5 py-4 flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <SlidersHorizontal size={14} /> Filters
                    </span>
                    {activeFilterCount > 0 && (
                      <button onClick={resetFilters} className="text-xs font-semibold text-emerald-700 hover:text-emerald-600">
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
                        className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-sm font-bold text-gray-900">{monthLabel(calMonth)}</span>
                      <button
                        onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                        disabled={!canNextMonth}
                        className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 uppercase mb-1">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {buildMonthGrid(calMonth).map((d, i) => {
                        if (!d) return <div key={`e${i}`} />;
                        const ds = formatDate(d);
                        const isPast = d < startOfToday();
                        const isSelected = ds === selectedDate;
                        const isToday = ds === todayStr;
                        const base = 'aspect-square flex items-center justify-center rounded-md text-xs font-semibold transition-colors';
                        let cls = 'text-gray-700 hover:bg-emerald-50';
                        if (isPast) cls = 'text-gray-300 cursor-default';
                        if (isToday && !isSelected) cls = 'text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50';
                        if (isSelected) cls = 'bg-emerald-600 text-white';
                        return (
                          <button key={ds} disabled={isPast} onClick={() => setSelectedDate(ds)} className={`${base} ${cls}`}>
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Players */}
                  <div className="px-5 py-4">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Players</div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => { setPlayers(n); setSelectedTime(null); }}
                          className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-md border text-sm font-semibold transition-all ${
                            players === n
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <Users size={13} />
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time of day */}
                  <div className="px-5 py-4">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Time of Day</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TOD_OPTIONS.map(o => (
                        <button
                          key={o.key}
                          onClick={() => setTodFilter(o.key)}
                          className={`py-2 rounded-md border text-xs font-semibold transition-all ${
                            todFilter === o.key
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max price */}
                  {priceBounds && priceBounds.min < priceBounds.max && (
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Max Price</span>
                        <span className="text-xs font-bold text-gray-900">${maxPrice ?? priceBounds.max}</span>
                      </div>
                      <input
                        type="range"
                        min={priceBounds.min}
                        max={priceBounds.max}
                        step={1}
                        value={maxPrice ?? priceBounds.max}
                        onChange={e => setMaxPrice(Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>${priceBounds.min}</span>
                        <span>${priceBounds.max}</span>
                      </div>
                    </div>
                  )}

                  {/* Holes (only when tee times carry hole data) */}
                  {hasHolesData && (
                    <div className="px-5 py-4">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Holes</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['all', '9', '18'] as const).map(h => (
                          <button
                            key={h}
                            onClick={() => setHolesFilter(h)}
                            className={`py-2 rounded-md border text-xs font-semibold transition-all ${
                              holesFilter === h
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {h === 'all' ? 'Any' : h}
                          </button>
                        ))}
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
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-gray-200 bg-white text-sm font-semibold text-gray-700"
                    >
                      <SlidersHorizontal size={14} />
                      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                    <span className="text-sm font-semibold text-gray-500">{displayDate(selectedDate)}</span>
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
                          className={`flex flex-col items-center px-3 py-2 rounded-md text-xs font-semibold min-w-[3.25rem] transition-all ${
                            isSelected ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-700'
                          }`}
                        >
                          <span className="text-[10px] font-medium opacity-70">
                            {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Header */}
                <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                  <h2 className="font-bold text-gray-900 text-lg">
                    Tee times for <span className="text-emerald-700">{displayDate(selectedDate)}</span>
                  </h2>
                  {!loadingTimes && teeTimes.length > 0 && (
                    <span className="text-sm text-gray-400">{filtered.length} available</span>
                  )}
                </div>

                {/* List */}
                {loadingTimes ? (
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-100 shadow-sm text-center py-14 px-6">
                    <Clock size={28} className="mx-auto mb-3 text-gray-300" />
                    {teeTimes.length === 0 ? (
                      <p className="text-gray-400 text-sm">No tee times available for this date. Try another day.</p>
                    ) : (
                      <div>
                        <p className="text-gray-500 text-sm mb-3">No tee times match your filters.</p>
                        <button onClick={resetFilters} className="text-sm font-semibold text-emerald-700 hover:text-emerald-600">
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
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
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
                                className={`w-full flex items-center justify-between gap-4 rounded-lg border px-4 sm:px-5 py-3.5 text-left transition-all ${
                                  isSel
                                    ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                                    : 'bg-white border-gray-200 hover:border-emerald-500 hover:shadow-sm'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="text-lg sm:text-xl font-black tracking-tight text-gray-900">
                                    {formatTime(t.time)}
                                  </div>
                                  <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    <span className={STATUS_STYLE[t.status] || 'text-gray-400'}>{STATUS_LABEL[t.status] || 'Available'}</span>
                                    <span className="text-gray-400">· {t.players_available} spots</span>
                                    {h !== undefined && <span className="text-gray-400">· {h} holes</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
                                  <div className="text-right">
                                    <div className="font-bold text-gray-900">${t.green_fee}</div>
                                    <div className="text-[11px] text-gray-400">per player</div>
                                  </div>
                                  <span className={`hidden sm:inline-flex px-4 py-2 rounded-md text-xs font-bold transition-colors ${
                                    isSel
                                      ? 'bg-emerald-600 text-white'
                                      : 'border border-emerald-600 text-emerald-700'
                                  }`}>
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
              <div className="bg-white rounded-lg p-7 border border-gray-100 shadow-sm">
                <h2 className="font-bold text-gray-900 text-xl mb-4">About This Course</h2>
                <p className="text-gray-600 leading-relaxed">{course.description}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
                  {[
                    { label: 'Course Type', value: badge.label },
                    { label: 'Holes', value: String(course.holes) },
                    { label: 'Par', value: String(course.par) },
                    { label: 'Walking', value: course.walking_allowed ? 'Allowed' : 'Cart Only' },
                    { label: 'Cart', value: course.cart_required ? 'Required' : 'Optional' },
                    { label: 'State', value: course.state },
                  ].map(f => (
                    <div key={f.label}>
                      <div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-0.5">{f.label}</div>
                      <div className="text-gray-900 font-semibold text-sm">{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {amenities.length > 0 && (
                <div className="bg-white rounded-lg p-7 border border-gray-100 shadow-sm">
                  <h2 className="font-bold text-gray-900 text-xl mb-4">Amenities</h2>
                  <div className="flex flex-wrap gap-2">
                    {amenities.map(a => (
                      <span
                        key={a}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-sm font-medium"
                      >
                        <Check size={13} />
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg p-7 border border-gray-100 shadow-sm">
              <h2 className="font-bold text-gray-900 text-xl mb-4">Contact</h2>
              <div className="space-y-3">
                {course.address && (
                  <div className="flex items-start gap-3 text-sm text-gray-600">
                    <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    {course.address}
                  </div>
                )}
                {course.phone && (
                  <a href={`tel:${course.phone}`} className="flex items-center gap-3 text-sm text-gray-600 hover:text-emerald-700 transition-colors">
                    <Phone size={16} className="text-gray-400" />
                    {course.phone}
                  </a>
                )}
                {course.website && (
                  <a href={course.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-emerald-700 hover:underline">
                    <Globe size={16} className="text-gray-400" />
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
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-6px_24px_rgba(0,0,0,0.08)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-sm sm:text-base">
                {formatTime(selectedTime.time)} · {displayDate(selectedDate)} · {players} {players === 1 ? 'player' : 'players'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Green fee ${selectedTime.green_fee} × {players}
                {withCart && selectedTime.cart_fee > 0 ? ` · Cart $${selectedTime.cart_fee} × ${players}` : ''}
                {` · GR access fee $${(1.5 * players).toFixed(2)}`}
              </div>
            </div>

            {selectedTime.cart_fee > 0 && !course.cart_required && (
              <button
                onClick={() => setWithCart(!withCart)}
                className={`self-start sm:self-auto px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                  withCart ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {withCart ? `Cart added · $${selectedTime.cart_fee}/player` : `Add cart · $${selectedTime.cart_fee}/player`}
              </button>
            )}

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</div>
                <div className="font-black text-gray-900 text-xl leading-tight">${total.toFixed(2)}</div>
              </div>
              <button
                onClick={handleBook}
                className="px-6 py-3 rounded-md font-bold text-white text-sm bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                Continue to Book →
              </button>
              <button
                onClick={() => setSelectedTime(null)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
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
