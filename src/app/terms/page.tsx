import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'GreenReserve terms of service. The rules governing use of our online tee sheet platform for golf courses and golfers.',
};

const navLink = 'border-l-2 pl-3 py-1.5 text-sm transition-colors';
const navActive = `${navLink} border-pine text-pine font-medium`;
const navIdle = `${navLink} border-transparent text-ink-soft hover:text-ink hover:border-line-strong`;

export default function TermsOfServicePage() {
  return (
    <div className="bg-paper min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-14">

          {/* Legal sub-nav */}
          <aside className="mb-12 lg:mb-0">
            <div className="lg:sticky lg:top-8">
              <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">Legal</p>
              <nav className="flex flex-col">
                <a href="/terms" className={navActive}>Terms of Service</a>
                <a href="/privacy" className={navIdle}>Privacy Policy</a>
                <a href="/operator-agreement" className={navIdle}>Operator Agreement</a>
              </nav>
              <p className="mt-6 pl-3 text-xs text-ink-faint leading-relaxed">
                Version v2026-08<br />Last updated August 2026
              </p>
            </div>
          </aside>

          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight text-ink mb-3">Terms of Service</h1>
            <p className="text-ink-muted text-sm mb-10">Version v2026-08 — last updated August 2026</p>

            {/* Plain-English summary */}
            <div className="bg-white border border-line rounded-lg p-6 mb-12">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">The short version</p>
              <ul className="space-y-2.5 text-sm text-ink-soft leading-relaxed">
                {[
                  'GreenReserve is a booking platform, not a golf course — each course sets its own prices, policies and rules (section 1).',
                  'GreenReserve charges a $1.50 per-player service fee on every booking (section 2).',
                  'If your course has a late-cancellation fee, saving a card authorizes that charge when you cancel late (section 3).',
                  'No-shows are not refunded (section 4).',
                  'Our liability is capped at the service fees you have paid us in the twelve months before a claim (section 6).',
                  'New Jersey law; disputes go to individual arbitration, or small-claims court instead (section 8).',
                ].map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="text-ink-faint shrink-0" aria-hidden="true">—</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 pt-4 border-t border-line-soft text-xs text-ink-faint leading-relaxed">
                A plain-English summary, for orientation only. The numbered sections below are the terms that actually apply.
              </p>
            </div>

            <div className="space-y-10 text-ink-soft leading-relaxed">
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">1.</span>The service
                </h2>
                <p>
                  GreenReserve is an online booking platform that lets golfers reserve tee times at participating golf
                  courses. <strong className="text-ink">GreenReserve is a platform, not a golf course operator</strong> —
                  we connect golfers and courses but don&apos;t own, manage, or run any course listed on the site.
                  Each course sets its own pricing, policies, and rules, which you agree to follow when you book.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">2.</span>Service fee
                </h2>
                <p>
                  GreenReserve charges a <strong className="text-ink">$1.50 per-player service fee</strong> on every
                  booking, charged to the golfer at the time of booking or check-in depending on the course&apos;s payment
                  flow. Courses keep 100% of their green fees and cart fees — our fee is never deducted from what the
                  course receives.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">3.</span>Cancellation policies and card authorization
                </h2>
                <p>
                  Each course sets its own cancellation window and late-cancellation fee, shown to you before you book.
                  If a course has a late-cancellation fee, saving a payment method at booking means{' '}
                  <strong className="text-ink">you authorize GreenReserve to charge that card, on the course&apos;s
                  behalf, the posted late-cancellation fee if you cancel after the course&apos;s free-cancellation
                  window</strong> — this charge happens automatically, without further notice, and is non-refundable.
                  GreenReserve enforces these policies on the course&apos;s behalf but does not set them.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">4.</span>No-shows
                </h2>
                <p>
                  Bookings that are neither cancelled nor checked into by the course are treated as no-shows.
                  <strong className="text-ink"> No refunds are issued for no-shows</strong>, and any applicable
                  late-cancellation fee will still be charged per the course&apos;s policy.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">5.</span>Communications consent
                </h2>
                <p>
                  By creating an account or booking a tee time, you consent to receive transactional email and SMS from
                  GreenReserve — booking confirmations, cancellation notices, check-in reminders, and account
                  verification codes. These are operational messages needed to use the service, not marketing. We will
                  never send you marketing text messages without your separate, explicit opt-in.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">6.</span>Limitation of liability
                </h2>
                <p>
                  GreenReserve is provided on an &ldquo;as-is&rdquo; basis, with reasonable best efforts toward uptime
                  but no guarantee of uninterrupted availability. We are not responsible for course conditions, weather,
                  the conduct of course staff, or disputes between golfers and courses.{' '}
                  <strong className="text-ink">GreenReserve&apos;s liability for any claim arising from use of the
                  platform is limited to the service fees you&apos;ve paid us in the twelve months preceding the
                  claim</strong>, and neither party is liable for indirect or consequential damages.
                </p>
              </section>

              {/* ── FOR COURSE OPERATORS ── */}
              <section className="pt-6 border-t border-line">
                <h2 className="font-semibold text-base text-ink mb-3">
                  <span className="text-ink-faint font-normal mr-2">7.</span>For course operators
                </h2>
                <p>
                  If you operate a golf course on GreenReserve, your relationship with us — fees, payment routing,
                  liability, indemnification, data ownership, and termination — is governed by our dedicated{' '}
                  <a href="/operator-agreement" className="text-pine font-medium hover:underline">Operator Agreement</a>,
                  which every operator accepts separately. This page (the golfer-facing Terms of Service above) still
                  applies to your course&apos;s golfers.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">8.</span>Governing law
                </h2>
                <p>
                  These Terms are governed by the laws of the State of New Jersey. Any dispute will be resolved through
                  binding arbitration on an individual basis, except that either party may bring a qualifying claim in
                  small-claims court instead.
                </p>
              </section>
              {/* <!-- NOTE: This page was drafted with AI assistance, without a lawyer, and requires attorney review before GreenReserve reaches material scale. --> */}

              <section className="pt-6 border-t border-line">
                <h3 className="font-semibold text-sm text-ink mb-2">Changes to these terms</h3>
                <p className="text-sm">
                  <strong className="text-ink">v2026-08 (current):</strong> added explicit card-authorization language
                  for late-cancellation fees, a communications-consent section, a governing-law/arbitration clause, and
                  moved course-operator terms to the dedicated Operator Agreement.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">Contact</h2>
                <p>
                  Questions about these terms? Reach us at{' '}
                  <a href="mailto:hello@greenreserve.app" className="text-pine font-medium hover:underline">hello@greenreserve.app</a>.
                </p>
              </section>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
