'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, X, Play, Monitor } from 'lucide-react';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';

const DEMO_SLUG = DEMO_COURSE_SLUGS[0] ?? null;

const SHOW_VIDEO = false;

function Screenshot({ src, caption }: { src: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="rounded-lg border border-line overflow-hidden">
        <div className="aspect-video bg-paper flex flex-col items-center justify-center gap-3">
          <Monitor className="w-8 h-8 text-ink-faint" />
          <p className="text-ink-faint text-xs">{caption}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={caption} className="w-full block" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}

export default function HomeContent() {
  return (
    <>
      {/* HERO */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=2000&q=80)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-24">
          <div className="max-w-2xl">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-serif font-medium text-white leading-[1.05] tracking-tight mb-5">
              The tee sheet<br />your course deserves.
            </h1>
            <p className="text-base sm:text-lg text-white/65 leading-relaxed mb-8">
              Free for golf courses. Set up your online booking page — golfers book direct, you keep every dollar of your green fees.
            </p>
            <div className="flex items-center gap-6 mb-6">
              <Link
                href="/for-courses"
                className="inline-flex items-center gap-2 px-7 py-3.5 font-medium text-sm text-white bg-pine hover:bg-pine-hover rounded-md transition-all"
              >
                List your course <ArrowRight size={15} />
              </Link>
              <Link href="/dashboard/login" className="text-sm text-white/45 hover:text-white/70 transition-colors">
                Operator login →
              </Link>
            </div>
            <p className="text-white/35 text-sm">
              Golfers pay a $1.50 booking fee. You keep 100% of your green fees. $0/month.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — 3-step editorial timeline */}
      <section id="how-it-works" className="bg-white border-t border-line py-32">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-16">
            <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight">We set it up. You run it.</h2>
          </div>
          <div className="space-y-10">
            {[
              { n: '01', title: 'We review your submission', body: "We'll reply within 1 business day. As long as you run a real golf course, you're in — we review to prevent spam, not to reject courses." },
              { n: '02', title: 'You fill out a details sheet', body: 'Pricing, policies, facilities — about 5 minutes. Saves as you go.' },
              { n: '03', title: 'We build your page', body: 'You review, approve, and go live. Golfers can book the same day.' },
            ].map((s) => (
              <div key={s.n} className="flex gap-10">
                <div className="w-8 shrink-0 pt-1">
                  <span className="text-[11px] uppercase tracking-[0.06em] text-ink-faint font-medium">{s.n}</span>
                </div>
                <div className="border-t border-line pt-5 flex-1 pb-2">
                  <h3 className="text-ink font-semibold text-base mb-1.5">{s.title}</h3>
                  <p className="text-ink-soft text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOUNDING COURSES */}
      <section className="bg-pine border-t border-white/10 py-24">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-[11px] uppercase tracking-[0.06em] text-paper/50 font-medium mb-3">Early access</p>
          <h2 className="text-2xl sm:text-3xl font-serif font-medium text-white tracking-tight mb-4">
            We&apos;re onboarding our founding group of courses.
          </h2>
          <p className="text-white/60 text-sm leading-relaxed max-w-xl mb-8">
            Early courses get white-glove setup — we handle everything and stay hands-on until you&apos;re live and comfortable. Founding courses also lock in free forever, no matter what we charge in the future.
          </p>
          <Link
            href="/for-courses"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-pine bg-white hover:bg-paper rounded-md transition-all"
          >
            Apply for a founding spot <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* PUBLIC / PRIVATE SPLIT */}
      <section className="bg-paper border-t border-line py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mb-12">
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-3">Who it&apos;s for</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight">Built for every type of course</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="bg-white border border-line rounded-lg p-8">
              <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-4">Public courses</p>
              <h3 className="text-xl font-serif font-medium text-ink mb-3 tracking-tight">Online tee times, zero commission</h3>
              <p className="text-ink-soft text-sm leading-relaxed mb-6">
                Your course page goes live within a day. Golfers book and pay online — weekday and weekend rates, cart fees, resident pricing if you offer it. You keep every dollar of your green fees.
              </p>
              <ul className="space-y-2.5 text-sm text-ink-soft mb-8">
                {['Weekday and weekend pricing', 'Resident or senior rate tiers', 'Walking and cart options', 'Cancellation policy you control'].map(f => (
                  <li key={f} className="flex items-center gap-2.5">
                    <Check size={13} className="text-pine shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/for-courses?type=public"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-all"
              >
                List as public course <ArrowRight size={14} />
              </Link>
            </div>

            <div className="bg-white border border-line rounded-lg p-8">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">Private clubs</p>
              <h3 className="text-xl font-serif font-medium text-ink mb-3 tracking-tight">Member booking, your rules</h3>
              <p className="text-ink-soft text-sm leading-relaxed mb-6">
                Members book online with their own login. You control which times are member-only and when outside play is allowed. Outings and guest rounds handled through your settings.
              </p>
              <ul className="space-y-2.5 text-sm text-ink-soft mb-8">
                {['Member-only booking portal', 'Outside-play windows you define', 'Member advance booking days', 'Outing and tournament support'].map(f => (
                  <li key={f} className="flex items-center gap-2.5">
                    <Check size={13} className="text-pine shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/for-courses?type=private"
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-ink/20 hover:border-pine text-ink hover:text-pine text-sm font-medium rounded-md transition-all"
              >
                List as private club <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE ROWS */}
      <section className="bg-white border-t border-line py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mb-16">
            <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">What you get</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight">A complete tee sheet operation</h2>
          </div>

          {SHOW_VIDEO && (
            <div className="mb-16 max-w-3xl">
              <div className="aspect-video bg-paper border border-line rounded-lg flex flex-col items-center justify-center gap-3">
                <Play className="w-10 h-10 text-ink-faint" />
                <p className="text-ink-muted text-sm">2-minute walkthrough</p>
              </div>
            </div>
          )}

          <div className="space-y-24">
            <div className="grid sm:grid-cols-2 gap-12 items-center">
              <Screenshot src="/screenshots/dashboard-1.png" caption="Tee sheet" />
              <div>
                <h3 className="text-2xl font-serif font-medium text-ink tracking-tight mb-3">Your tee sheet, live in hours</h3>
                <p className="text-ink-soft text-sm leading-relaxed mb-4">
                  Set your hours, interval, and pricing once. Tee times generate daily based on your schedule — no manual work, no spreadsheets. Slots open and close automatically.
                </p>
                <p className="text-ink-muted text-sm">10-minute default interval; adjust to 7 or 15 anytime.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-12 items-center">
              <div className="order-2 sm:order-1">
                <h3 className="text-2xl font-serif font-medium text-ink tracking-tight mb-3">Every booking, right here</h3>
                <p className="text-ink-soft text-sm leading-relaxed mb-4">
                  Golfer names, party sizes, and payment status in one view. Staff can check in players without touching pricing or settings. Your data, not ours.
                </p>
                <p className="text-ink-muted text-sm">$0 commission on any booking — ever.</p>
              </div>
              <div className="order-1 sm:order-2">
                <Screenshot src="/screenshots/dashboard-2.png" caption="Live bookings" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-12 items-center">
              <Screenshot src="/screenshots/dashboard-3.png" caption="Payouts" />
              <div>
                <h3 className="text-2xl font-serif font-medium text-ink tracking-tight mb-3">Payouts go straight to your bank</h3>
                <p className="text-ink-soft text-sm leading-relaxed mb-4">
                  Green fees hit your Stripe account directly — no holding period, no revenue share. Golfers pay the $1.50 service fee; your green fee is never touched.
                </p>
                <p className="text-ink-muted text-sm">Stripe payouts on your account&apos;s normal schedule.</p>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-8 border-t border-line">
            <p className="text-ink-muted text-sm">
              Also includes: tee time generator, cancellation policy engine, member &amp; resident rates, staff logins, email confirmations, and a public course listing page.
            </p>
          </div>
        </div>
      </section>

      {/* SEE IT FOR YOURSELF */}
      <section className="bg-paper border-t border-line py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">Live demo</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight mb-3">
              See it for yourself
            </h2>
            <p className="text-ink-soft text-sm leading-relaxed max-w-xl">
              Click through a real course page — date picker, pricing, cart options. Takes 30 seconds, no signup required.
            </p>
          </div>
          {DEMO_SLUG ? (
            <Link
              href={`/courses/${DEMO_SLUG}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-all"
            >
              Explore a live course page <ArrowRight size={14} />
            </Link>
          ) : (
            <div className="inline-block border border-line rounded-lg px-6 py-4 text-sm text-ink-faint">
              Demo course coming soon
            </div>
          )}
        </div>
      </section>

      {/* COMPARISON */}
      <section className="bg-paper border-t border-line py-32">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-12 text-center">
            <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">Why GreenReserve</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight">
              Built different from the start
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="border border-line rounded-lg p-8 bg-white">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-6">What we never do</div>
              <div className="space-y-4 text-sm">
                {[
                  'Charge commission on your green fees',
                  'Charge a monthly subscription fee',
                  'Resell your tee times to third parties',
                  'Lock you in with a contract',
                  'Keep your golfer data for our own use',
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
              <div className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-6">Our commitments</div>
              <div className="space-y-4 text-sm">
                {[
                  'Your tee times are never resold',
                  '0% commission — you keep 100% of green fees',
                  'No contract — leave anytime',
                  'Your golfer data is yours, always',
                  '$0/month, no setup fee, forever',
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
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="bg-pine border-t border-white/10 py-32">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-16">
            <p className="text-[11px] uppercase tracking-[0.06em] text-paper/60 font-medium mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-serif font-medium text-white tracking-tight mb-2">Simple and honest</h2>
            <p className="text-white/40 text-sm">No setup fees. No monthly fees. No contracts.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="border border-white/15 p-8 rounded-lg">
              <div className="text-4xl font-serif font-medium text-white mb-1">$0</div>
              <div className="text-paper/60 font-medium text-sm mb-6">For your course · Forever</div>
              <div className="space-y-3 text-sm text-white/50">
                {['Your own booking page', 'Operator dashboard', 'Full schedule & pricing control', 'Real-time booking analytics', 'Staff logins', 'Automated email confirmations'].map(f => (
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
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-white border-t border-line py-32">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-14">
            <h2 className="text-3xl font-serif font-medium text-ink tracking-tight">Common questions</h2>
          </div>
          <div className="divide-y divide-line">
            {[
              { q: 'How long does onboarding take?', a: 'Typically 1–2 business days from your initial inquiry. Our team handles setup and walks you through everything.' },
              { q: 'Do we need any technical knowledge?', a: 'None. We build your booking page. You add a link on your website and log in to manage your tee sheet.' },
              { q: 'Can we still take phone and walk-in bookings?', a: 'Yes. Your dashboard lets you manually add bookings for walk-ins or phone reservations anytime.' },
              { q: 'What happens when a golfer cancels?', a: "The slot opens back up automatically. If inside your cancellation window, Stripe handles the charge — no action needed." },
              { q: 'How do payouts work?', a: 'We connect your bank account via Stripe during setup. Green fees transfer directly to your account after each booking.' },
              { q: 'Can we control who sees our tee times?', a: 'Your booking page is unlisted until you share the link. You decide when and where to promote it.' },
            ].map(({ q, a }) => (
              <div key={q} className="py-6">
                <div className="font-medium text-ink text-sm mb-2">{q}</div>
                <div className="text-ink-soft text-sm leading-relaxed">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-paper border-t border-line py-32 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-serif font-medium text-ink tracking-tight mb-4">Ready to go live?</h2>
          <p className="text-ink-soft mb-8 text-sm">Submit your interest and we&apos;ll be in touch within 1 business day.</p>
          <div className="inline-block">
            <Link href="/for-courses" className="inline-flex items-center gap-2 px-8 py-3.5 font-medium text-sm text-white bg-pine hover:bg-pine-hover rounded-md transition-all hover:scale-[1.02]">
              List your course for free <ArrowRight size={15} />
            </Link>
          </div>
          <p className="text-ink-muted text-xs mt-5">
            Questions? <a href="mailto:hello@greenreserve.app" className="text-pine hover:underline">hello@greenreserve.app</a>
          </p>
        </div>
      </section>
    </>
  );
}
