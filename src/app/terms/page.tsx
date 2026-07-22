import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — GreenReserve',
  description: 'GreenReserve terms of service. The rules governing use of our online tee sheet platform for golf courses and golfers.',
};

export default function TermsOfServicePage() {
  return (
    <div className="bg-paper min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">Legal</div>
        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-3">Terms of Service</h1>
        <p className="text-ink-muted text-sm mb-12">Version v2026-08 — last updated August 2026</p>

        <div className="space-y-10 text-ink-soft leading-relaxed">
          <section>
            <h2 className="font-semibold text-base text-ink mb-2">The service</h2>
            <p>
              GreenReserve is an online booking platform that lets golfers reserve tee times at participating golf
              courses. <strong className="text-ink">GreenReserve is a platform, not a golf course operator</strong> —
              we connect golfers and courses but don&apos;t own, manage, or run any course listed on the site.
              Each course sets its own pricing, policies, and rules, which you agree to follow when you book.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base text-ink mb-2">Service fee</h2>
            <p>
              GreenReserve charges a <strong className="text-ink">$1.50 per-player service fee</strong> on every
              booking, charged to the golfer at the time of booking or check-in depending on the course&apos;s payment
              flow. Courses keep 100% of their green fees and cart fees — our fee is never deducted from what the
              course receives.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base text-ink mb-2">Cancellation policies and card authorization</h2>
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
            <h2 className="font-semibold text-base text-ink mb-2">No-shows</h2>
            <p>
              Bookings that are neither cancelled nor checked into by the course are treated as no-shows.
              <strong className="text-ink"> No refunds are issued for no-shows</strong>, and any applicable
              late-cancellation fee will still be charged per the course&apos;s policy.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base text-ink mb-2">Communications consent</h2>
            <p>
              By creating an account or booking a tee time, you consent to receive transactional email and SMS from
              GreenReserve — booking confirmations, cancellation notices, check-in reminders, and account
              verification codes. These are operational messages needed to use the service, not marketing. We will
              never send you marketing text messages without your separate, explicit opt-in.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base text-ink mb-2">Limitation of liability</h2>
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
            <h2 className="font-semibold text-base text-ink mb-3">For course operators</h2>
            <p>
              If you operate a golf course on GreenReserve, your relationship with us — fees, payment routing,
              liability, indemnification, data ownership, and termination — is governed by our dedicated{' '}
              <a href="/operator-agreement" className="text-pine font-medium hover:underline">Operator Agreement</a>,
              which every operator accepts separately. This page (the golfer-facing Terms of Service above) still
              applies to your course&apos;s golfers.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base text-ink mb-2">Governing law</h2>
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
  );
}
