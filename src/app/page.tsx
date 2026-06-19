import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a1f0f]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-white font-black text-xl">Green<span className="text-green-400">Reserve</span></span>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/login" className="text-white/60 hover:text-white text-sm font-medium transition-colors">Operator Login</Link>
            <Link href="/for-courses" className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">List Your Course</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden" style={{ background: 'linear-gradient(150deg,#050f09 0%,#0f2218 50%,#1b4332 100%)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.04) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-24 text-center">
          <div className="inline-flex items-center gap-2 mb-8 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/80 text-sm font-medium">Free to list · No monthly fees · Ever</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6">
            Online booking for<br />
            <span className="text-green-400">your golf course.</span>
          </h1>

          <p className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed mb-10">
            GreenReserve gives your course a fully-managed online tee sheet.
            Golfers book through your website. You keep 100% of green fees.
            We charge golfers a small service fee — you pay nothing.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/for-courses" className="px-8 py-4 rounded-xl font-black text-base text-white bg-green-600 hover:bg-green-500 transition-all hover:shadow-lg hover:-translate-y-0.5">
              Get Your Course Listed →
            </Link>
            <Link href="/dashboard/login" className="px-8 py-4 rounded-xl font-bold text-base text-white/70 border border-white/20 hover:border-white/40 hover:text-white transition-all">
              Operator Login
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bg-[#f8faf9] py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-green-700 text-sm font-bold uppercase tracking-widest mb-3">Simple Setup</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Up and running in 5 minutes</h2>
            <p className="text-gray-500 max-w-xl mx-auto">No contracts. No tech team required. We handle the booking infrastructure — you just take tee times.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 relative">
            <div className="hidden sm:block absolute top-10 left-[22%] right-[22%] h-px bg-gray-200" />
            {[
              { step: '01', icon: '📋', title: 'Submit your course', body: 'Fill out a quick form about your course. Takes 3 minutes. We review and approve within 24 hours.' },
              { step: '02', icon: '⚙️', title: 'Set your tee sheet', body: 'Log in to your dashboard, set your schedule and pricing. Tee times generate automatically every day.' },
              { step: '03', icon: '🔗', title: 'Share your link', body: "Add a 'Book a Tee Time' button to your website that links to your GreenReserve booking page. Done." },
            ].map(s => (
              <div key={s.step} className="text-center relative">
                <div className="w-20 h-20 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-3xl mx-auto mb-5">
                  {s.icon}
                </div>
                <div className="text-green-700 text-xs font-black tracking-widest mb-2">{s.step}</div>
                <h3 className="text-gray-900 font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VALUE PROPS ── */}
      <section className="bg-white py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-green-700 text-sm font-bold uppercase tracking-widest mb-3">Built for courses</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Everything you need, nothing you don't</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '💰', title: 'Free for courses', body: '$0/month. Always. We charge golfers a $1.50/player service fee — you keep every dollar of your green fees.' },
              { icon: '📅', title: 'Auto tee sheet', body: 'Set your schedule once. Tee times generate automatically based on your hours, intervals, and pricing.' },
              { icon: '💳', title: 'Direct payouts', body: 'Green fees go straight to your bank account via Stripe. No holding periods, no platform take.' },
              { icon: '📊', title: 'Live analytics', body: 'See bookings, revenue, and player counts in real time from your operator dashboard.' },
              { icon: '👥', title: 'Member & resident rates', body: 'Set special pricing for members, residents, or guests. We handle the rate logic automatically.' },
              { icon: '🔗', title: 'Works with your site', body: 'Just a link on your website. No iframes, no plugins. Golfers book on greenreserve.app/courses/your-course.' },
            ].map(v => (
              <div key={v.title} className="bg-[#f8faf9] rounded-2xl border border-gray-100 p-7 hover:shadow-md transition-shadow">
                <div className="text-3xl mb-4">{v.icon}</div>
                <h3 className="text-gray-900 font-bold text-lg mb-2">{v.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="py-24" style={{ background: 'linear-gradient(150deg,#050f09 0%,#0f2218 50%,#1b4332 100%)' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-green-400 text-sm font-bold uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">Honest and simple</h2>
          <p className="text-white/50 mb-12">No hidden fees. No contracts. No surprises.</p>

          <div className="grid sm:grid-cols-2 gap-6 text-left">
            <div className="bg-white/10 border border-white/20 rounded-2xl p-8 backdrop-blur">
              <div className="text-4xl font-black text-white mb-1">$0</div>
              <div className="text-green-400 font-bold text-sm mb-4">For your course · Forever</div>
              <div className="space-y-3 text-sm text-white/70">
                {['Unlimited tee times','Operator dashboard','Schedule & pricing control','Booking analytics','Staff accounts','Email confirmations to golfers'].map(f => (
                  <div key={f} className="flex items-center gap-2"><span className="text-green-400">✓</span>{f}</div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <div className="text-4xl font-black text-white mb-1">$1.50</div>
              <div className="text-white/40 font-bold text-sm mb-4">Per player · Charged to golfer</div>
              <p className="text-white/50 text-sm leading-relaxed mb-4">
                Golfers pay a small service fee when they book. You never see this charge — it goes directly to GreenReserve.
              </p>
              <p className="text-white/30 text-xs">
                Example: 4-player round = $6 service fee paid by golfers. Your green fee revenue is untouched.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[#f8faf9] py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-gray-900">Common questions</h2>
          </div>
          <div className="space-y-4">
            {[
              { q: 'Do golfers have to create an account?', a: 'No. Golfers can book as a guest with just their name, email, and payment info. Account creation is optional.' },
              { q: 'Can I still take phone bookings?', a: 'Yes. Your dashboard lets you manually add bookings for walk-ins or phone reservations. The tee sheet updates automatically.' },
              { q: 'What happens when a golfer cancels?', a: 'The slot opens back up immediately. If inside your cancellation window, Stripe processes the refund automatically.' },
              { q: "Does GreenReserve replace my existing booking system?", a: "It can, or it can run alongside it. We generate your online tee sheet independently — you decide which slots to make available." },
              { q: 'How do I get paid?', a: 'You connect your bank account via Stripe during setup. Green fees are transferred directly to your account after each booking.' },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="font-bold text-gray-900 mb-2">{q}</div>
                <div className="text-gray-500 text-sm leading-relaxed">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="py-24 text-center bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-5xl mb-6">⛳</div>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
            Ready to go live?
          </h2>
          <p className="text-gray-500 mb-10 text-lg">
            It takes 5 minutes to set up. No commitment, no cost.
          </p>
          <Link
            href="/for-courses"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl font-black text-base text-white transition-all hover:shadow-xl hover:-translate-y-1 bg-[#1b4332] hover:bg-[#2d6a4f]"
          >
            List Your Course for Free →
          </Link>
          <p className="text-gray-400 text-sm mt-4">Questions? Email us at <a href="mailto:hello@greenreserve.app" className="text-green-700 hover:underline">hello@greenreserve.app</a></p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0a1f0f] py-8 text-center">
        <span className="text-white font-black">Green<span className="text-green-400">Reserve</span></span>
        <p className="text-white/30 text-xs mt-2">© {new Date().getFullYear()} GreenReserve. All rights reserved.</p>
      </footer>
    </>
  );
}
