import Link from 'next/link';
import CourseCard from '@/components/CourseCard';
import { searchCourses } from '@/lib/courses-data';

export default async function HomePage() {
  const courses = searchCourses({ featured: true }).slice(0, 6);

  return (
    <>
      {/* ── HERO ── */}
      <section
        className="relative min-h-[92vh] flex flex-col justify-center overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 85% 20%, rgba(82,183,136,0.18) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 15% 80%, rgba(45,106,79,0.25) 0%, transparent 55%), linear-gradient(150deg, #050f09 0%, #0f2218 35%, #1b4332 70%, #0d2418 100%)',
        }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Decorative rings */}
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full border border-white/5 pointer-events-none" />
        <div className="absolute -top-16 -right-16 w-[400px] h-[400px] rounded-full border border-white/5 pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 text-center">

          {/* Live badge */}
          <div className="inline-flex items-center gap-2 mb-8 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/80 text-sm font-medium">Now listing courses across 12+ states</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-[4.5rem] font-black text-white leading-[1.08] tracking-tight mb-6">
            Discover Great Golf.<br />
            <span style={{ color: '#c9a84c' }}>Book&nbsp;Directly.</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/65 max-w-2xl mx-auto leading-relaxed mb-10">
            Green Reserve is golf&apos;s transparent discovery layer — find tee times, understand access rules, and book directly with the course. A $1 access fee applies.
          </p>

          {/* Search bar */}
          <form action="/courses" method="GET" className="bg-white rounded-2xl p-2 max-w-xl mx-auto flex flex-col sm:flex-row gap-2 shadow-2xl mb-8">
            <div className="flex items-center gap-3 px-4 flex-1">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <input
                type="text"
                name="q"
                placeholder="City, state, or course name…"
                className="flex-1 py-3 text-gray-800 placeholder-gray-400 outline-none text-sm bg-transparent"
              />
            </div>
            <button
              type="submit"
              className="px-7 py-3 rounded-xl font-semibold text-sm text-white whitespace-nowrap transition-all"
              style={{ background: '#1b4332' }}
            >
              Find a Course
            </button>
          </form>

          {/* Browse tags */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <span className="text-white/35 text-sm">Browse:</span>
            {[
              { label: 'Public Courses', type: 'public' },
              { label: 'Semi-Private', type: 'semi-private' },
              { label: 'Member / Guest', type: 'member' },
              { label: 'Resort', type: 'resort' },
            ].map(t => (
              <Link
                key={t.type}
                href={`/courses?type=${t.type}`}
                className="text-white/60 hover:text-white text-sm border border-white/20 hover:border-white/50 px-3.5 py-1 rounded-full transition-all"
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* Scroll caret */}
          <div className="bob absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
            <svg className="w-5 h-5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
            {[
              { value: '200+', label: 'Courses Listed' },
              { value: '$1', label: 'Access Fee Per Booking' },
              { value: '12+', label: 'States Covered' },
              { value: '100%', label: 'Direct to Course' },
            ].map(s => (
              <div key={s.label} className="text-center py-10 px-4">
                <div className="text-4xl font-black mb-1" style={{ color: '#1b4332' }}>
                  {s.value.replace(/(\d+)/, m => m)}
                  <span style={{ color: '#c9a84c' }}>{s.value.replace(/[^+%$]/g, '')}</span>
                </div>
                <div className="text-gray-500 text-sm font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED COURSES ── */}
      <section className="py-24 bg-[#f8faf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
            <div>
              <div
                className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full mb-3"
                style={{ background: '#f0fdf4', color: '#065f46' }}
              >
                Featured Courses
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Popular Near You</h2>
            </div>
            <Link href="/courses" className="text-[#1b4332] font-semibold text-sm hover:underline whitespace-nowrap">
              View all courses →
            </Link>
          </div>

          {courses.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.slice(0, 6).map(c => <CourseCard key={c.id} course={c} />)}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-12">Loading courses…</p>
          )}

          <div className="text-center mt-12">
            <Link
              href="/courses"
              className="inline-block px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ background: '#1b4332' }}
            >
              Browse All Courses
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block bg-[#f0fdf4] text-[#065f46] text-xs font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
              Simple by Design
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Three steps. No account required to browse.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                color: '#1b4332',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                ),
                title: 'Search & Discover',
                desc: 'Browse courses by location, access type, or availability. Find courses you didn\'t even know existed near you.',
              },
              {
                step: '2',
                color: '#c9a84c',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                ),
                title: 'Pick a Tee Time',
                desc: 'See live availability. Choose your date, time, and number of players. Know the price before you book.',
              },
              {
                step: '3',
                color: '#2d6a4f',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                ),
                title: 'Book Direct',
                desc: 'We send you straight to the course\'s own booking system. They control the price, the tee sheet, everything. Just a $1 access fee from us.',
              },
            ].map(s => (
              <div
                key={s.step}
                className="bg-[#f8faf9] rounded-3xl p-8 relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className="absolute top-4 right-5 text-[7rem] font-black leading-none select-none"
                  style={{ color: `${s.color}12` }}
                >
                  {s.step}
                </div>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: s.color }}
                >
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {s.icon}
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{s.title}</h3>
                <p className="text-gray-500 leading-relaxed text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DUAL VALUE PROP ── */}
      <section className="py-24 bg-[#f8faf9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Built for Both Sides of the Tee Sheet</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Golfers */}
            <div className="bg-white rounded-3xl p-10 border border-gray-100 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-2">For Golfers</div>
              <div className="font-bold text-gray-900 text-xl mb-6">Play More. Stress Less.</div>
              <ul className="space-y-3">
                {[
                  'Discover courses you didn\'t know you could play',
                  'See access rules clearly — public, semi-private, member/guest, resident',
                  'Book at the course\'s own rate — paid directly to them',
                  'No account required to browse',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-600 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href="/courses"
                  className="inline-block px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:shadow-lg"
                  style={{ background: '#1b4332' }}
                >
                  Browse Courses →
                </Link>
              </div>
            </div>

            {/* Courses */}
            <div
              className="rounded-3xl p-10 border border-[#1b4332]/20 shadow-sm"
              style={{ background: 'linear-gradient(145deg,#0f2218,#1b4332)' }}
            >
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#c9a84c' }}>For Courses</div>
              <div className="font-bold text-white text-xl mb-6">More Visibility. Zero Interference.</div>
              <ul className="space-y-3">
                {[
                  'Free to list — always. No commission from courses',
                  'You keep full control over pricing, booking, and operations',
                  'We drive qualified traffic directly to your booking system',
                  'You\'re never locked in — update or remove anytime',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-white/70 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href="/for-courses"
                  className="inline-block px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all"
                  style={{ background: 'linear-gradient(135deg,#c9a84c,#d4b96e)' }}
                >
                  Learn More for Courses →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-[#f8faf9] rounded-3xl p-12 md:p-16 border border-gray-100">
            <div className="inline-block bg-[#f0fdf4] text-[#065f46] text-xs font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6">
              Join the Platform
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 leading-tight mb-6">
              Golf discovery,<br /><span style={{ color: '#1b4332' }}>done right.</span>
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
              Whether you&apos;re a golfer looking for your next round or a course looking to reach more players — Green Reserve was built for you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/courses"
                className="px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
                style={{ background: '#1b4332' }}
              >
                Find a Course
              </Link>
              <Link
                href="/for-courses#get-listed"
                className="px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg,#c9a84c,#d4b96e)' }}
              >
                List Your Course
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
