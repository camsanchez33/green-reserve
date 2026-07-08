'use client';
import { useState } from 'react';
import Link from 'next/link';
import { DollarSign, Calendar, CreditCard, BarChart3, Users, Settings, ArrowRight, Check, X, Play } from 'lucide-react';
import { motion } from 'framer-motion';

const SHOW_VIDEO = false;

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: 'easeOut' },
  viewport: { once: true },
};

function ScreenshotFrame({ src, caption }: { src: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="rounded-lg overflow-hidden border border-white/10">
      <div className="bg-black/30 px-3 py-2 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-white/20" />
        <span className="w-2 h-2 rounded-full bg-white/20" />
        <span className="w-2 h-2 rounded-full bg-white/20" />
      </div>
      {failed ? (
        <div className="aspect-video bg-black/40 flex items-center justify-center">
          <p className="text-white/20 text-xs">Screenshot coming soon</p>
        </div>
      ) : (
        <img src={src} alt={caption} className="w-full block" onError={() => setFailed(true)} />
      )}
      <div className="bg-black/30 px-3 py-2 text-center">
        <span className="text-white/40 text-xs">{caption}</span>
      </div>
    </div>
  );
}

export default function HomeContent() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=2000&q=80)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-black/65" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-20 text-center">
          <motion.div {...fadeUp}>
            <div className="inline-flex items-center gap-2 mb-8 border border-white/20 px-3.5 py-1 text-xs text-white/60 font-medium tracking-wide">
              <span className="w-1.5 h-1.5 bg-paper/60 rounded-full" />
              Free for courses · No monthly fees
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.05] tracking-tight mb-6">
              The tee sheet your<br />
              <span className="text-paper/80">course deserves.</span>
            </h1>

            <p className="text-lg text-white/60 max-w-xl mx-auto leading-relaxed mb-10">
              GreenReserve gives your course a professional online booking page. Golfers book direct — you keep every dollar of your green fees.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
              <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
                <Link href="/for-courses" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 font-medium text-sm text-white bg-pine hover:bg-pine-hover rounded-md transition-all">
                  Get Listed Free <ArrowRight size={15} />
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
                <Link href="/dashboard/login" className="inline-flex items-center justify-center px-7 py-3.5 font-medium text-sm text-white/60 border border-white/20 hover:border-white/40 hover:text-white rounded-md transition-all">
                  Operator Login
                </Link>
              </motion.div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0 text-xs text-white/40 font-medium">
              <span>Free for courses</span>
              <span className="hidden sm:block w-px h-3 bg-white/20 mx-5" />
              <span>No commission</span>
              <span className="hidden sm:block w-px h-3 bg-white/20 mx-5" />
              <span>$1.50 / player only</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="bg-white border-t border-line py-32">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div {...fadeUp} className="mb-16">
            <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight mb-4">We set it up. You run it.</h2>
            <p className="text-ink-soft max-w-lg">We handle onboarding end-to-end. Once you&apos;re live, your dashboard is yours.</p>
          </motion.div>

          <div className="grid sm:grid-cols-4 gap-8 relative">
            <div className="hidden sm:block absolute top-3 left-[14%] right-[14%] h-px bg-line" />
            {[
              { n: '01', title: 'Submit interest', body: 'Fill out a short form. No commitment, no credit card.' },
              { n: '02', title: 'We reach out', body: 'Our team contacts you within 1 business day to get everything configured.' },
              { n: '03', title: 'We build your page', body: 'We set up your booking page, connect Stripe, and run a full test.' },
              { n: '04', title: 'You control the tee sheet', body: 'Log in anytime to manage schedule, pricing, blackouts, and staff.' },
            ].map((s, i) => (
              <motion.div key={s.n} className="relative"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.08 }}
                viewport={{ once: true }}>
                <div className="w-7 h-7 border border-line flex items-center justify-center mb-5">
                  <span className="text-ink-muted text-xs font-medium">{s.n}</span>
                </div>
                <h3 className="text-ink font-semibold text-sm mb-2">{s.title}</h3>
                <p className="text-ink-soft text-sm leading-relaxed">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DASHBOARD SCREENSHOTS ── */}
      <section className="bg-pine border-t border-white/10 py-32 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div {...fadeUp} className="mb-12 text-center">
            <p className="text-[11px] uppercase tracking-[0.06em] text-paper/60 font-medium mb-3">The dashboard</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-white tracking-tight mb-4">
              Everything you need, nothing you don&apos;t.
            </h2>
            <p className="text-white/40 text-sm max-w-md mx-auto">
              A clean, fast dashboard built for golf operations — not enterprise software.
            </p>
          </motion.div>

          {SHOW_VIDEO ? (
            <motion.div {...fadeUp} className="mb-12 max-w-3xl mx-auto">
              {/* <iframe
                src="https://www.youtube.com/embed/YOUTUBE_ID"
                title="GreenReserve walkthrough"
                className="w-full aspect-video rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              /> */}
            </motion.div>
          ) : (
            <motion.div {...fadeUp} className="mb-12 max-w-3xl mx-auto">
              <div className="aspect-video bg-black/40 border border-white/10 rounded-lg flex flex-col items-center justify-center gap-3">
                <Play className="w-10 h-10 text-white/20" />
                <p className="text-white/30 text-sm">2-minute walkthrough — coming soon</p>
              </div>
            </motion.div>
          )}

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { src: '/screenshots/dashboard-1.png', caption: 'Tee sheet' },
              { src: '/screenshots/dashboard-2.png', caption: 'Live bookings' },
              { src: '/screenshots/dashboard-3.png', caption: 'Pricing & schedule' },
            ].map((s, i) => (
              <motion.div key={s.src}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.08 }}
                viewport={{ once: true }}>
                <ScreenshotFrame src={s.src} caption={s.caption} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VALUE PROPS ── */}
      <section className="bg-paper border-t border-line py-32">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div {...fadeUp} className="mb-16">
            <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">What you get</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight">Everything you need to take bookings online</h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: DollarSign, title: 'Free for your course', body: '$0/month. Always. Golfers pay a $1.50/player service fee — you keep 100% of your green fees.' },
              { icon: Calendar, title: 'Automated tee sheet', body: 'Set your hours and interval once. Tee times generate daily based on your schedule.' },
              { icon: CreditCard, title: 'Payouts to your bank', body: 'Green fees go directly to your Stripe account. No holding periods. No commission.' },
              { icon: BarChart3, title: 'Live dashboard', body: 'See bookings, revenue, and player counts in real time. Your data, always yours.' },
              { icon: Users, title: 'Member & resident rates', body: 'Set special pricing tiers for members or residents. Rate logic is handled automatically at checkout.' },
              { icon: Settings, title: 'You stay in control', body: 'Block dates, adjust pricing, manage staff access, and update your schedule from your dashboard.' },
            ].map((v, i) => (
              <motion.div key={v.title}
                className="bg-white border border-line p-7 rounded-lg"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.06 }}
                viewport={{ once: true }}
                whileHover={{ y: -4 }}>
                <v.icon className="w-5 h-5 text-pine mb-5" />
                <h3 className="text-ink font-semibold text-sm mb-2">{v.title}</h3>
                <p className="text-ink-soft text-sm leading-relaxed">{v.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section className="bg-white border-t border-line py-32">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div {...fadeUp} className="mb-12 text-center">
            <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">Why GreenReserve</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight">
              Built different from the start
            </h2>
          </motion.div>

          <motion.div {...fadeUp} className="grid sm:grid-cols-2 gap-6">
            <div className="border border-line rounded-lg p-8">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-6">Typical booking platforms</div>
              <div className="space-y-4 text-sm">
                {[
                  'Commission on every green fee',
                  'Monthly software subscription',
                  'Platform resells your tee times',
                  'Revenue split with the vendor',
                  'Your golfer data lives on their servers',
                ].map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="w-4 h-4 rounded-full bg-bad/10 flex items-center justify-center shrink-0 mt-0.5">
                      <X size={9} className="text-bad" />
                    </span>
                    <span className="text-ink-soft">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-pine/20 bg-pine/5 rounded-lg p-8">
              <div className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-6">GreenReserve</div>
              <div className="space-y-4 text-sm">
                {[
                  '$0 commission — ever',
                  'No monthly fee — ever',
                  'Your booking page, your golfers',
                  'You keep 100% of green fees',
                  'Your golfer data stays with you',
                ].map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="w-4 h-4 rounded-full bg-pine/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={9} className="text-pine" />
                    </span>
                    <span className="text-ink font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="bg-pine border-t border-white/10 py-32">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div {...fadeUp} className="mb-16">
            <p className="text-[11px] uppercase tracking-[0.06em] text-paper/60 font-medium mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-white tracking-tight mb-2">Simple and honest</h2>
            <p className="text-white/40 text-sm">No setup fees. No monthly fees. No contracts.</p>
          </motion.div>

          <motion.div {...fadeUp} className="grid sm:grid-cols-2 gap-6">
            <div className="border border-white/15 p-8 rounded-lg">
              <div className="text-4xl font-serif font-medium text-white mb-1">$0</div>
              <div className="text-paper/60 font-medium text-sm mb-6">For your course · Forever</div>
              <div className="space-y-3 text-sm text-white/50">
                {[
                  'Your own booking page',
                  'Operator dashboard',
                  'Full schedule & pricing control',
                  'Real-time booking analytics',
                  'Staff logins',
                  'Automated email confirmations',
                ].map(f => (
                  <div key={f} className="flex items-center gap-2.5">
                    <Check size={13} className="text-paper/60 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-white/10 bg-white/5 p-8 rounded-lg">
              <div className="text-4xl font-serif font-medium text-white mb-1">$1.50</div>
              <div className="text-white/30 font-medium text-sm mb-6">Per player · Paid by the golfer</div>
              <p className="text-white/40 text-sm leading-relaxed mb-4">
                Golfers pay a small service fee at checkout. You never see this charge — it goes to GreenReserve.
              </p>
              <p className="text-white/20 text-xs">
                Example: 4-player round = $6 total service fee charged to golfers. Your green fee revenue is untouched.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="bg-white border-t border-line py-32">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div {...fadeUp} className="mb-14">
            <h2 className="text-3xl font-serif font-medium text-ink tracking-tight">Common questions</h2>
          </motion.div>
          <motion.div {...fadeUp} className="divide-y divide-line">
            {[
              { q: 'How long does onboarding take?', a: 'Typically 1–2 business days from your initial inquiry. Our team handles setup and walks you through everything.' },
              { q: 'Do we need any technical knowledge?', a: 'None. We build your booking page. You add a link on your website and log in to manage your tee sheet.' },
              { q: 'Can we still take phone and walk-in bookings?', a: 'Yes. Your dashboard lets you manually add bookings for walk-ins or phone reservations anytime.' },
              { q: 'What happens when a golfer cancels?', a: 'The slot opens back up automatically. If inside your cancellation window, Stripe handles the charge — no action needed.' },
              { q: 'How do payouts work?', a: 'We connect your bank account via Stripe during setup. Green fees transfer directly to your account after each booking.' },
              { q: 'Can we control who sees our tee times?', a: 'Your booking page is unlisted until you share the link. You decide when and where to promote it.' },
            ].map(({ q, a }) => (
              <div key={q} className="py-6">
                <div className="font-medium text-ink text-sm mb-2">{q}</div>
                <div className="text-ink-soft text-sm leading-relaxed">{a}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ── */}
      <motion.section {...fadeUp} className="bg-paper border-t border-line py-32 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight mb-4">Ready to go live?</h2>
          <p className="text-ink-soft mb-8 text-sm">Submit your interest and we&apos;ll be in touch within 1 business day.</p>
          <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }} className="inline-block">
            <Link href="/for-courses" className="inline-flex items-center gap-2 px-8 py-3.5 font-medium text-sm text-white bg-pine hover:bg-pine-hover rounded-md transition-all">
              List Your Course for Free <ArrowRight size={15} />
            </Link>
          </motion.div>
          <p className="text-ink-muted text-xs mt-5">Questions? <a href="mailto:hello@greenreserve.app" className="text-pine hover:underline">hello@greenreserve.app</a></p>
        </div>
      </motion.section>
    </>
  );
}
