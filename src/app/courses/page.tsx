'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import CourseCard from '@/components/CourseCard';
import type { Course } from '@/lib/courses-data';
import { Search, SlidersHorizontal, X } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'public', label: 'Public' },
  { value: 'semi-private', label: 'Semi-Private' },
  { value: 'member', label: 'Member / Guest' },
  { value: 'resident', label: 'Resident' },
  { value: 'resort', label: 'Resort' },
  { value: 'municipal', label: 'Municipal' },
];

const STATE_OPTIONS = [
  { value: '', label: 'All States' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NY', label: 'New York' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'CO', label: 'Colorado' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'FL', label: 'Florida' },
  { value: 'TX', label: 'Texas' },
  { value: 'CA', label: 'California' },
];

function CoursesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [state, setState] = useState(searchParams.get('state') || '');
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCourses = useCallback(async (q: string, t: string, s: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (t) params.set('type', t);
      if (s) params.set('state', s);
      const res = await fetch(`/api/courses?${params}`);
      const data = await res.json();
      setCourses(data);
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses(query, type, state);
  }, [fetchCourses, query, type, state]);

  function handleTypeClick(t: string) {
    setType(t === type ? '' : t);
  }

  function clearFilters() {
    setQuery('');
    setType('');
    setState('');
    router.push('/courses');
  }

  const activeFilters = [query, type, state].filter(Boolean).length;

  return (
    <>
      {/* Hero */}
      <section
        className="relative overflow-hidden pt-20 pb-10"
        style={{ background: 'linear-gradient(150deg,#050f09 0%,#0f2218 35%,#1b4332 70%,#0d2418 100%)' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle,rgba(255,255,255,.06) 1px,transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div
          className="absolute -bottom-px left-0 right-0 h-10"
          style={{ background: 'linear-gradient(to top,#f8faf9,transparent)' }}
        />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-4">
            Find Your Next Round
          </h1>
          <p className="text-white/60 mb-8 max-w-lg mx-auto">
            Browse courses by location, access type, and more. Book directly with each course.
          </p>

          {/* Search bar */}
          <div className="bg-white rounded-2xl p-2 shadow-2xl flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-3 px-4 flex-1">
              <Search size={18} className="text-gray-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Course name, city, or state…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 py-3 text-gray-800 placeholder-gray-400 outline-none text-sm bg-transparent"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={() => fetchCourses(query, type, state)}
              className="px-7 py-3 rounded-xl font-semibold text-sm text-white whitespace-nowrap"
              style={{ background: '#1b4332' }}
            >
              Search
            </button>
          </div>
        </div>
      </section>

      {/* Filters + Results */}
      <section className="bg-[#f8faf9] min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
              <SlidersHorizontal size={15} />
              <span>Filter:</span>
            </div>

            {/* Type chips */}
            {TYPE_OPTIONS.slice(1).map(t => (
              <button
                key={t.value}
                onClick={() => handleTypeClick(t.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                  type === t.value
                    ? 'bg-[#1b4332] border-[#1b4332] text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#1b4332] hover:text-[#1b4332]'
                }`}
              >
                {t.label}
              </button>
            ))}

            {/* State select */}
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold border border-gray-200 bg-white text-gray-600 outline-none cursor-pointer hover:border-[#1b4332] transition-colors"
            >
              {STATE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            {/* Clear */}
            {activeFilters > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <X size={13} />
                Clear all
              </button>
            )}
          </div>

          {/* Result count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-500 text-sm">
              {loading ? 'Loading…' : `${courses.length} course${courses.length !== 1 ? 's' : ''} found`}
            </p>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="h-32 bg-gray-200" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">⛳</div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">No courses found</h3>
              <p className="text-gray-400 text-sm mb-6">Try adjusting your search or filters.</p>
              <button
                onClick={clearFilters}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: '#1b4332' }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map(c => <CourseCard key={c.id} course={c} />)}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8faf9]" />}>
      <CoursesPageInner />
    </Suspense>
  );
}
