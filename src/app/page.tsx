import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden" style={{ background: 'linear-gradient(150deg,#050f09 0%,#0f2218 50%,#1b4332 100%)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.04) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-24 text-center">
          <div className="inline-flex items-center gap-2 mb-8 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/80 text-sm font-medium">Free for courses · No monthly fees · Ever</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6">
            Online tee sheet for<br />
            <span className="text-green-400">your golf course.</span>
          </h1>

          <p className="text-xl text-white/60 max-w-2xl mx-auto leading-relaxed mb-10">
            GreenReserve sets up and manages your online booking page —
            so golfers can book directly from your website.
            You keep 100% of green fees. We handle the rest.
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
      <section id="how-it-works" className="bg-[#f8faf9] py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-green-700 text-sm font-bold uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">We set it up. You run it.</h2>
            <p className="text-gray-500 max-w-xl mx-auto">We handle onboarding end-to-end. Once you&apos;re live, your dashboard is yours — you control your schedule, pricing, and availability.</p>
          </div>

          <div className="grid sm:grid-cols-4 gap-6 relative">
            <div className="hidden sm:block absolute top-8 left-[14%] right-[14%] h-px bg-gray-200" />
            {[
              { step: '01', icon: '📋', title: 'Submit interest', body: 'Fill out a short form with your course info. No commitment required.' },
              { step: '02', icon: '🤝', title: 'We reach out', body: 'Our team contacts you within 1 business day to get everything set up.' },
              { step: '03', icon: '⚙️', title: 'We build your page', body: 'We set up your booking page, connect payments, and get you ready to go live.' },
              { step: '04', icon: '🎛️', title: 'You control your tee sheet', body: 'Log in anytime to manage your schedule, pricing, blackouts, and availability.' },
            ].map(s => (
              <div key={s.step} className="text-center relative">
                <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-2xl mx-auto mb-4">
                  {s.icon}
                </div>
                <div className="text-green-700 text-xs font-black tracking-widest mb-2">{s.step}</div>
                <h3 className="text-gray-900 font-bold text-base mb-2">{s.title}</h3>
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
            <p className="text-green-700 text-sm font-bold uppercase tracking-widest mb-3">What you get</p>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Everything you need to take bookings online</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '💰', title: 'Free for your course', body: '$0/month. Always. Golfers pay a $1.50/player service fee — you keep every dollar of your green fees.' },
              { icon: '📅', title: 'Automated tee sheet', body: 'Set your hours and interval once. Tee times generate automatically every day based on your schedule.' },
              { icon: '💳', title: 'Payouts to your bank', body: 'Green fees go straight to your account via Stripe. No holding periods. No platform commission.' },
              { icon: '📊', title: 'Live dashboard', body: 'See bookings, revenue, and player counts in real time. Your data, always accessible.' },
              { icon: '👥', title: 'Member & resident rates', body: 'Set special pricing tiers for members or residents. We handle rate logic automatically at checkout.' },
              { icon: '🎛️', title: 'You stay in control', body: 'Block dates, adjust pricing, manage staff access, and update your schedule anytime from your dashboard.' },
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
      <section id="pricing" className="py-24" style={{ background: 'linear-gradient(150deg,#050f09 0%,#0f2218 50%,#1b4332 100%)' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-green-400 text-sm font-bold uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">Simple and honest</h2>
          <p className="text-white/50 mb-12">No setup fees. No monthly fees. No contracts.</p>

          <div className="grid sm:grid-cols-2 gap-6 text-left">
            <div className="bg-white/10 border border-white/20 rounded-2xl p-8 backdrop-blur">
              <div className="text-4xl font-black text-white mb-1">$0</div>
              <div className="text-green-400 font-bold text-sm mb-4">For your course · Forever</div>
              <div className="space-y-3 text-sm text-white/70">
                {['Your own booking page','Operator dashboard','Full schedule & pricing control','Real-time booking analytics','Staff logins','Automated email confirmations'].map(f => (
                  <div key={f} className="flex items-center gap-2"><span className="text-green-400">✓</span>{f}</div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <div className="text-4xl font-black text-white mb-1">$1.50</div>
              <div className="text-white/40 font-bold text-sm mb-4">Per player · Paid by the golfer</div>
              <p className="text-white/50 text-sm leading-relaxed mb-4">
                Golfers pay a small service fee at checkout. You never see this charge — it goes to GreenReserve.
              </p>
              <p className="text-white/30 text-xs">
                Example: 4-player round = $6 total service fee paid by golfers. Your green fee revenue is 100% yours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="bg-[#f8faf9] py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-gray-900">Common questions</h2>
          </div>
          <div className="space-y-4">
            {[
              { q: 'How long does onboarding take?', a: 'Typically 1–2 business days from your initial inquiry. Our team handles setup and reaches out to walk you through everything.' },
              { q: 'Do we need any technical knowledge?', a: 'None at all. We build your booking page. You just add a link on your website and log into your dashboard to manage your tee sheet.' },
              { q: 'Can we still take phone and walk-in bookings?', a: 'Yes. Your dashboard lets you manually add bookings for walk-ins or phone reservations anytime. The tee sheet updates instantly.' },
              { q: 'What happens when a golfer cancels?', a: 'The slot opens back up automatically. If inside your cancellation window, Stripe issues the refund — no action needed on your end.' },
              { q: 'How do payouts work?', a: 'We connect your bank account via Stripe during setup. Green fees transfer directly to your account after each booking.' },
              { q: 'Can we control who sees our tee times?', a: 'Your booking page is unlisted until you share the link. You decide when and where to promote it.' },
            ].map(({ q, a }) => (
              <div key={q} className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="font-bold text-gray-900 mb-2">{q}</div>
                <div className="text-gray-500 text-sm leading-relaxed">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 text-center bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-5xl mb-6">⛳</div>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">Ready to get started?</h2>
          <p className="text-gray-500 mb-10 text-lg">Submit your interest and we&apos;ll be in touch within 1 business day.</p>
          <Link href="/for-courses" className="inline-flex items-center gap-2 px-10 py-4 rounded-xl font-black text-base text-white bg-[#1b4332] hover:bg-[#2d6a4f] transition-all hover:shadow-xl hover:-translate-y-1">
            List Your Course for Free →
          </Link>
          <p className="text-gray-400 text-sm mt-4">Questions? <a href="mailto:hello@greenreserve.app" className="text-green-700 hover:underline">hello@greenreserve.app</a></p>
        </div>
      </section>

    </>
  );
}
