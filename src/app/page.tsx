import Link from 'next/link';
import CourseCard from '@/components/CourseCard';
import { searchCourses } from '@/lib/courses-data';

export default async function HomePage() {
  const courses = searchCourses({ featured: true }).slice(0, 6);

  return (
    <>
      {/* ── HERO ── */}
      <section className="relative min-h-[96vh] flex flex-col justify-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=1920&q=80"
            alt="Golf course aerial view"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(150deg,rgba(5,15,9,0.85) 0%,rgba(15,34,24,0.80) 35%,rgba(27,67,50,0.70) 70%,rgba(13,36,24,0.85) 100%)' }} />
        </div>

        {/* Dot grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24 text-center">

          {/* Live badge */}
          <div className="inline-flex items-center gap-2 mb-8 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/80 text-sm font-medium">Now live in 12+ states</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6">
            Your next great round<br />
            <span style={{ color: '#c9a84c' }}>starts here.</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed mb-10">
            Discover public, semi-private, resort, and member-access golf courses in one place.
            Browse tee times and book directly with the course at their own rates.
          </p>

          {/* Hero search */}
          <form
            action="/courses"
            method="GET"
            className="bg-white rounded-2xl p-3 max-w-2xl mx-auto shadow-2xl mb-6"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input
                  name="q"
                  type="text"
                  placeholder="City, state, or course name"
                  className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 outline-none text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-8 py-3 rounded-xl font-bold text-sm text-white whitespace-nowrap transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{ background: '#1b4332' }}
              >
                Search Tee Times
              </button>
            </div>
          </form>

          {/* Quick filters */}
          <div className="flex flex-wrap justify-center gap-2">
            {['Public', 'Semi-Private', 'Resort', 'Municipal'].map(t => (
              <Link
                key={t}
                href={`/courses?type=${t.toLowerCase().replace(' ', '-')}`}
                className="px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/75 text-xs font-medium hover:bg-white/20 hover:text-white transition-all backdrop-blur"
              >
                {t}
              </Link>
            ))}
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-white/30">
          <span className="text-xs">Scroll</span>
          <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ── */}
      <section className="bg-[#0f2218] border-y border-white/10 py-5">
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-center gap-8 text-center">
          {[
            { n: '200+', label: 'Courses Listed' },
            { n: '12', label: 'States Covered' },
            { n: '100%', label: 'Direct Booking' },
            { n: '$0', label: 'Hidden Fees' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-2xl font-black" style={{ color: '#c9a84c' }}>{s.n}</div>
              <div className="text-white/50 text-xs font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── VALUE PROPS ── */}
      <section className="bg-[#f8faf9] py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
              Golf discovery, done right.
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              We built the platform golfers actually deserve — transparent, direct, and built around the course experience.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                icon: '🔍',
                title: 'Find Hidden Courses',
                body: "Discover semi-private and resident courses you didn't know existed — with full access rules explained upfront.",
              },
              {
                icon: '🎯',
                title: 'Book Direct',
                body: 'No third-party markups. No course commissions. You book directly with the course at their own rates.',
              },
              {
                icon: '📋',
                title: 'Transparent Access Rules',
                body: 'Know before you go — whether a course requires residency, membership, or is open to all.',
              },
            ].map(v => (
              <div key={v.title} className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl mb-4">{v.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{v.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED COURSES ── */}
      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[#c9a84c] text-sm font-bold uppercase tracking-widest mb-2">Hand-Picked</p>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Featured Courses</h2>
            </div>
            <Link href="/courses" className="hidden sm:block text-sm font-semibold text-[#1b4332] hover:underline">
              View all →
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(c => <CourseCard key={c.id} course={c} />)}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: '#1b4332' }}
            >
              Browse All Courses →
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20" style={{ background: 'linear-gradient(150deg,#050f09 0%,#0f2218 50%,#1b4332 100%)' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[#c9a84c] text-sm font-bold uppercase tracking-widest mb-3">Simple Process</p>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">How Green Reserve works</h2>
          <p className="text-white/50 mb-16 max-w-lg mx-auto">Three steps to your next tee time.</p>

          <div className="grid sm:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-10 left-[22%] right-[22%] h-px bg-white/10" />

            {[
              { step: '01', icon: '🔎', title: 'Search & Discover', body: 'Browse by location, course type, or access rules. Filter for exactly what fits your game.' },
              { step: '02', icon: '⛳', title: 'Pick Your Tee Time', body: 'See real availability with transparent pricing — green fees and cart fees listed upfront.' },
              { step: '03', icon: '📲', title: 'Book Direct', body: "We connect you to the course's own booking page. They handle the reservation — you pay them directly." },
            ].map(s => (
              <div key={s.step} className="relative">
                <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-3xl mx-auto mb-5 backdrop-blur">
                  {s.icon}
                </div>
                <div className="text-[#c9a84c] text-xs font-black tracking-widest mb-2">{s.step}</div>
                <h3 className="text-white font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="bg-[#f8faf9] py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-[#c9a84c] text-sm font-bold uppercase tracking-widest mb-3">Golfers Love It</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Trusted by golfers across 12 states</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                quote: "I had no idea there was a semi-private course 10 minutes from my house. Green Reserve showed me courses I'd driven past for years without knowing I could play them.",
                name: 'Marcus T.',
                detail: 'Handicap 8 · New Jersey',
                rating: 5,
              },
              {
                quote: "Finally a site that tells you exactly who can play and what you'll pay. I booked a round at Blackwolf Run in 2 minutes. No hidden fees, no nonsense.",
                name: 'Sarah K.',
                detail: 'Handicap 14 · Wisconsin',
                rating: 5,
              },
              {
                quote: "GolfNow always inflated prices. Here I booked directly with the course at their actual rate. The $1 fee is beyond fair for what you get.",
                name: 'Derek R.',
                detail: 'Handicap 3 · Arizona',
                rating: 5,
              },
            ].map(t => (
              <div key={t.name} className="bg-white rounded-2xl border border-gray-100 p-7 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {[1,2,3,4,5].map(i => (
                    <svg key={i} className="w-4 h-4" style={{ fill: '#c9a84c' }} viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-5 italic">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <div className="font-bold text-gray-900 text-sm">{t.name}</div>
                  <div className="text-gray-400 text-xs">{t.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="bg-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-[#c9a84c] text-sm font-bold uppercase tracking-widest mb-3">Why Switch</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Green Reserve vs. the rest</h2>
            <p className="text-gray-500 max-w-lg mx-auto text-sm">Traditional booking platforms take cuts from courses, inflate prices, and hide access rules. We don&apos;t.</p>
          </div>

          <div className="rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-100">
              <div className="p-4 text-sm font-semibold text-gray-500">Feature</div>
              <div className="p-4 text-sm font-bold text-center" style={{ color: '#1b4332' }}>Green Reserve</div>
              <div className="p-4 text-sm font-semibold text-gray-400 text-center">Traditional Platform</div>
            </div>
            {[
              ['Booking model', 'Direct with the course', 'Third-party middleman'],
              ['Course pricing', "Course's own rates", 'Platform markup often added'],
              ['Access rules', 'Clearly explained', 'Rarely disclosed'],
              ['Course revenue', '100% to the course', 'Platform takes a commission'],
              ['Your fee', '$1 flat access fee', 'Varies, often hidden'],
              ['New course listings', 'Added weekly', 'Only major chains'],
            ].map(([feature, gr, other], i) => (
              <div key={feature} className={`grid grid-cols-3 border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                <div className="p-4 text-sm text-gray-600 font-medium">{feature}</div>
                <div className="p-4 text-sm text-center font-semibold flex items-center justify-center gap-1.5" style={{ color: '#1b4332' }}>
                  <span className="text-emerald-500">✓</span> {gr}
                </div>
                <div className="p-4 text-sm text-center text-gray-400">{other}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section
        className="py-24 text-center"
        style={{ background: 'linear-gradient(150deg,#050f09 0%,#0f2218 50%,#1b4332 100%)' }}
      >
        <div className="max-w-2xl mx-auto px-4">
          <div className="text-5xl mb-6">⛳</div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Ready to find your next round?
          </h2>
          <p className="text-white/55 mb-10 text-lg">
            Browse 200+ courses. Book direct. Pay the course — not a platform.
            <br />
            <span className="text-white/35 text-sm">A $1 access fee applies per booking — that&apos;s all we ever charge.</span>
          </p>
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl font-bold text-base text-white transition-all hover:shadow-2xl hover:-translate-y-1"
            style={{ background: '#c9a84c' }}
          >
            Find a Course Near You →
          </Link>
        </div>
      </section>
    </>
  );
}
