'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Phone, Globe, Star, Users, Clock, ChevronLeft, ChevronRight, Check, Flag } from 'lucide-react';
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

// Build the 7-day date strip
function buildDateStrip() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export default function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [notFound, setNotFound] = useState(false);

  const dates = buildDateStrip();
  const [selectedDate, setSelectedDate] = useState(formatDate(dates[0]));
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [players, setPlayers] = useState(2);
  const [selectedTime, setSelectedTime] = useState<TeeTime | null>(null);
  const [withCart, setWithCart] = useState(false);
  const [showAllTimes, setShowAllTimes] = useState(false);
  const [dateOffset, setDateOffset] = useState(0);

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
    setShowAllTimes(false);
    fetch(`/api/courses/${slug}/tee-times?date=${selectedDate}`)
      .then(r => r.json())
      .then(setTeeTimes)
      .catch(() => setTeeTimes([]))
      .finally(() => setLoadingTimes(false));
  }, [slug, selectedDate, course]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf9]">
        <div className="text-center">
          <Flag size={40} className="mx-auto mb-4 text-emerald-600" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Course Not Found</h1>
          <p className="text-gray-400 mb-6">We couldn&apos;t find that course.</p>
          <button onClick={() => router.push('/courses')} className="px-5 py-2.5 rounded-md text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors">
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[#f8faf9] animate-pulse">
        <div className="h-64 bg-gray-300" />
        <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-24 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  const badge = TYPE_BADGES[course.type] ?? TYPE_BADGES.public;
  const amenities = course.amenities ? course.amenities.split(',').map(s => s.trim()) : [];
  const visibleDates = dates.slice(dateOffset, dateOffset + 5);

  // Group tee times into morning / afternoon
  const morning = teeTimes.filter(t => {
    const h = parseInt(t.time.split(':')[0]);
    return h < 12;
  });
  const afternoon = teeTimes.filter(t => {
    const h = parseInt(t.time.split(':')[0]);
    return h >= 12;
  });

  const TIME_CAP = 10;
  const morningAvail = morning.filter(t => t.players_available >= players);
  const afternoonAvail = afternoon.filter(t => t.players_available >= players);
  const morningShown = showAllTimes ? morningAvail : morningAvail.slice(0, TIME_CAP);
  const afternoonShown = showAllTimes ? afternoonAvail : afternoonAvail.slice(0, TIME_CAP);
  const hiddenCount = (morningAvail.length - morningShown.length) + (afternoonAvail.length - afternoonShown.length);

  function handleBook() {
    if (!selectedTime) return;
    // Price is intentionally left out of the URL — /book re-fetches live pricing
    // from the server rather than trusting query params.
    const params = new URLSearchParams({
      tee_time_id: String(selectedTime.id),
      course_name: course!.name,
      course_slug: course!.slug,
      date: selectedDate,
      time: selectedTime.time,
      players: String(players),
      cart: withCart ? '1' : '0',
    });
    router.push(`/book?${params}`);
  }

  return (
    <>
      {/* Course hero header */}
      <div
        className="relative h-56 sm:h-72 flex items-end"
        style={{ background: course.image_gradient }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 0,transparent 50%)',
            backgroundSize: '14px 14px',
          }}
        />
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-4 transition-colors"
          >
            <ChevronLeft size={16} /> Back to courses
          </button>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className} mb-3 inline-block`}>
                {badge.label}
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">{course.name}</h1>
              <p className="text-white/60 flex items-center gap-1.5 mt-1">
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid lg:grid-cols-3 gap-8">

            {/* LEFT: Course info */}
            <div className="lg:col-span-2 space-y-6 order-last lg:order-first">

              {/* About */}
              <div className="bg-white rounded-lg p-7 border border-gray-100 shadow-sm">
                <h2 className="font-bold text-gray-900 text-xl mb-4">About This Course</h2>
                <p className="text-gray-600 leading-relaxed">{course.description}</p>

                {/* Quick facts */}
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

              {/* Amenities */}
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

              {/* Contact */}
              <div className="bg-white rounded-lg p-7 border border-gray-100 shadow-sm">
                <h2 className="font-bold text-gray-900 text-xl mb-4">Contact & Booking</h2>
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

            {/* RIGHT: Tee time picker */}
            <div className="lg:col-span-1 order-first lg:order-last">
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm sticky top-24">
                <div className="p-6 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900 text-lg mb-1">Book a Tee Time</h2>
                  {course.type !== 'member' && (
                    <p className="text-gray-400 text-xs">$1.50/player GreenReserve access fee · Book & pay securely online</p>
                  )}
                </div>

                {course.type === 'member' ? (
                  <div className="p-6 text-center">
                    <Phone size={32} className="mx-auto mb-3 text-emerald-600" />
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
                  <div className="p-5 space-y-5">

                    {/* Players selector */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Players
                      </label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map(n => (
                          <button
                            key={n}
                            onClick={() => { setPlayers(n); setSelectedTime(null); }}
                            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-md border text-sm font-semibold transition-all ${
                              players === n
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            <Users size={14} />
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date strip */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Date
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDateOffset(Math.max(0, dateOffset - 1))}
                          disabled={dateOffset === 0}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div className="flex-1 grid grid-cols-5 gap-1">
                          {visibleDates.map(d => {
                            const ds = formatDate(d);
                            const isSelected = ds === selectedDate;
                            const isToday = ds === formatDate(new Date());
                            return (
                              <button
                                key={ds}
                                onClick={() => { setSelectedDate(ds); setSelectedTime(null); }}
                                className={`flex flex-col items-center py-2 rounded-md text-xs font-semibold transition-all ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                <span className="text-[10px] font-medium opacity-70">
                                  {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                                </span>
                                <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                                <span className="text-[10px] opacity-70">
                                  {d.toLocaleDateString('en-US', { month: 'short' })}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setDateOffset(Math.min(2, dateOffset + 1))}
                          disabled={dateOffset >= 2}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                      <p className="text-center text-xs text-gray-400 mt-1">{displayDate(selectedDate)}</p>
                    </div>

                    {/* Tee times */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Tee Times
                      </label>

                      {loadingTimes ? (
                        <div className="space-y-2">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-12 bg-gray-100 rounded-md animate-pulse" />
                          ))}
                        </div>
                      ) : teeTimes.length === 0 ? (
                        <div className="text-center py-6 text-gray-400 text-sm">
                          No tee times available for this date.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {morningShown.length > 0 && (
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Clock size={10} /> Morning
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                                {morningShown.map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => setSelectedTime(t)}
                                    className={`flex flex-col items-center py-2.5 px-2 rounded-md border text-xs font-semibold transition-all ${
                                      selectedTime?.id === t.id
                                        ? 'border-emerald-600 bg-emerald-600 text-white'
                                        : 'border-gray-200 hover:border-emerald-600 hover:text-emerald-700 bg-white'
                                    }`}
                                  >
                                    <span className="font-bold text-sm">{formatTime(t.time)}</span>
                                    <span className={`text-[10px] mt-0.5 ${selectedTime?.id === t.id ? 'text-white/70' : STATUS_STYLE[t.status] || 'text-gray-400'}`}>
                                      {STATUS_LABEL[t.status]} · {t.players_available} spots
                                    </span>
                                    <span className={`text-[10px] mt-0.5 ${selectedTime?.id === t.id ? 'text-white/70' : 'text-gray-400'}`}>
                                      ${t.green_fee}/player
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {afternoonShown.length > 0 && (
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Clock size={10} /> Afternoon
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                                {afternoonShown.map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => setSelectedTime(t)}
                                    className={`flex flex-col items-center py-2.5 px-2 rounded-md border text-xs font-semibold transition-all ${
                                      selectedTime?.id === t.id
                                        ? 'border-emerald-600 bg-emerald-600 text-white'
                                        : 'border-gray-200 hover:border-emerald-600 hover:text-emerald-700 bg-white'
                                    }`}
                                  >
                                    <span className="font-bold text-sm">{formatTime(t.time)}</span>
                                    <span className={`text-[10px] mt-0.5 ${selectedTime?.id === t.id ? 'text-white/70' : STATUS_STYLE[t.status] || 'text-gray-400'}`}>
                                      {STATUS_LABEL[t.status]} · {t.players_available} spots
                                    </span>
                                    <span className={`text-[10px] mt-0.5 ${selectedTime?.id === t.id ? 'text-white/70' : 'text-gray-400'}`}>
                                      ${t.green_fee}/player
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {hiddenCount > 0 && !showAllTimes && (
                            <button
                              onClick={() => setShowAllTimes(true)}
                              className="w-full py-2 rounded-md border border-gray-200 text-xs font-semibold text-gray-600 hover:border-emerald-600 hover:text-emerald-700 transition-colors"
                            >
                              Show {hiddenCount} more times
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Selected summary + Book button */}
                    {selectedTime && (
                      <div className="border-t border-gray-100 pt-4 space-y-3">
                        <div className="bg-[#f8faf9] rounded-md p-3 space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Tee time</span>
                            <span className="font-semibold text-gray-900">{formatTime(selectedTime.time)}, {displayDate(selectedDate)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Players</span>
                            <span className="font-semibold text-gray-900">{players}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Green fee</span>
                            <span className="font-semibold text-gray-900">${selectedTime.green_fee} × {players}</span>
                          </div>
                          {selectedTime.cart_fee > 0 && course.cart_required && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Cart fee (required)</span>
                              <span className="font-semibold text-gray-900">${selectedTime.cart_fee} × {players}</span>
                            </div>
                          )}
                          {selectedTime.cart_fee > 0 && !course.cart_required && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-500">Cart · ${selectedTime.cart_fee}/player</span>
                              <button
                                onClick={() => setWithCart(!withCart)}
                                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${withCart ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              >
                                {withCart ? 'Added' : 'Add cart'}
                              </button>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-gray-200 pt-1.5">
                            <span className="text-gray-500">GR access fee</span>
                            <span className="font-semibold text-gray-900">${(1.5 * players).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-gray-900 text-base">
                            <span>Total</span>
                            <span>${((selectedTime.green_fee + (withCart ? selectedTime.cart_fee : 0)) * players + 1.5 * players).toFixed(2)}</span>
                          </div>
                        </div>
                        <button
                          onClick={handleBook}
                          className="w-full py-3.5 rounded-md font-bold text-white text-sm bg-emerald-600 hover:bg-emerald-500 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        >
                          Continue to Book →
                        </button>
                        <p className="text-center text-xs text-gray-400">
                          Secure checkout — pay online, no need to call ahead.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
