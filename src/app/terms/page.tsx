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
        <p className="text-ink-muted text-sm mb-12">Last updated July 2026</p>

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
            <h2 className="font-semibold text-base text-ink mb-2">Cancellation policies</h2>
            <p>
              Each course sets its own cancellation window and late-cancellation fee, shown to you before you
              book. If you cancel after a course&apos;s free-cancellation window has closed, the posted
              late-cancellation fee will be charged automatically to your saved card, and that fee is
              non-refundable. GreenReserve enforces these policies on the course&apos;s behalf but does not set
              them.
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
            <h2 className="font-semibold text-base text-ink mb-2">Limitation of liability</h2>
            <p>
              GreenReserve is provided on an &ldquo;as-is&rdquo; basis. We are not responsible for course
              conditions, weather, the conduct of course staff, or disputes between golfers and courses.
              GreenReserve&apos;s liability for any claim arising from use of the platform is limited to the
              service fees you&apos;ve paid us in the twelve months preceding the claim.
            </p>
          </section>

          {/* ── FOR COURSE OPERATORS ── */}
          <section className="pt-6 border-t border-line">
            <h2 className="font-semibold text-base text-ink mb-4">For Course Operators</h2>

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-sm text-ink mb-1">What we collect at onboarding</h3>
                <p>
                  We collect the name, email, and phone number of your primary contact, your course name and
                  location, and the Stripe Connect account details required to route green-fee payments to you.
                  We do not store or transmit your banking credentials — Stripe handles onboarding directly
                  through their PCI-compliant flow.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-ink mb-1">Your data is yours</h3>
                <p>
                  Your booking history, golfer contact information, and revenue data belong to you. You may
                  request a full export at any time by emailing{' '}
                  <a href="mailto:hello@greenreserve.app" className="text-pine font-medium hover:underline">hello@greenreserve.app</a>.
                  We will respond within 5 business days.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-ink mb-1">What happens if you leave</h3>
                <p>
                  You can stop using GreenReserve at any time. There are no contracts, no cancellation fees,
                  and no notice periods. Once you close your account: your booking page is taken down within
                  24 hours, a full data export is provided on request, and your data is deleted from our
                  systems within 30 days of your request — except where we are required to retain records
                  for accounting or legal compliance.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-ink mb-1">Stripe Connect and fund flow</h3>
                <p>
                  Green fees and cart fees are processed directly to your Stripe Connect account.
                  GreenReserve never holds, pools, or delays green-fee funds — they flow from the
                  golfer&apos;s payment method to your Stripe account, net of standard Stripe processing
                  fees. GreenReserve collects the $1.50 per-player service fee directly from the golfer
                  as a separate charge.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-ink mb-1">Liability</h3>
                <p>
                  GreenReserve&apos;s liability to any course operator for any claim arising from use of
                  the platform is limited to the fees GreenReserve has collected (not passed through to
                  you) in the twelve months preceding the claim. GreenReserve is not responsible for
                  golfer no-shows, chargebacks initiated by golfers, or disputes between golfers and
                  your course.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-ink mb-1">Legal entity</h3>
                <p>
                  GreenReserve is operated by{' '}
                  <span className="font-medium text-ink">{'{{COMPANY_LEGAL_NAME}}'} {/* TODO: replace with LLC name once formed */}</span>,
                  a limited liability company formed in the state of{' '}
                  <span className="font-medium text-ink">[STATE — TODO]</span>.
                </p>
              </div>
            </div>
          </section>
          {/* <!-- NOTE: The operator section above was drafted with AI assistance and requires attorney review before GreenReserve reaches material scale. --> */}

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
