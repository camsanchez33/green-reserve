import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'GreenReserve privacy policy. How we collect, use, and protect your personal information.',
};

const navLink = 'border-l-2 pl-3 py-1.5 text-sm transition-colors';
const navActive = `${navLink} border-pine text-pine font-medium`;
const navIdle = `${navLink} border-transparent text-ink-soft hover:text-ink hover:border-line-strong`;

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-paper min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-14">

          {/* Legal sub-nav */}
          <aside className="mb-12 lg:mb-0">
            <div className="lg:sticky lg:top-8">
              <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium mb-3">Legal</p>
              <nav className="flex flex-col">
                <a href="/terms" className={navIdle}>Terms of Service</a>
                <a href="/privacy" className={navActive}>Privacy Policy</a>
                <a href="/operator-agreement" className={navIdle}>Operator Agreement</a>
              </nav>
              <p className="mt-6 pl-3 text-xs text-ink-faint leading-relaxed">
                Version v2026-08<br />Last updated August 2026
              </p>
            </div>
          </aside>

          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight text-ink mb-3">Privacy Policy</h1>
            <p className="text-ink-muted text-sm mb-10">Version v2026-08 — last updated August 2026</p>

            {/* Plain-English summary */}
            <div className="bg-white border border-line rounded-lg p-6 mb-12">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">The short version</p>
              <ul className="space-y-2.5 text-sm text-ink-soft leading-relaxed">
                {[
                  'We collect your name, email and phone to run your bookings — and a card only when the course has a cancellation fee (section 1).',
                  'Your card is stored by Stripe, not by GreenReserve. We never see your full card number (section 5).',
                  'We share your booking details with the course you booked and with nobody else. We do not sell your data (section 4).',
                  'Booking and account messages are operational, not marketing. No marketing texts without your separate opt-in (section 3).',
                  'You can ask for a copy of your data, or ask us to delete it, by email (section 6).',
                  'Courses: your booking, golfer and revenue data belong to you, and are never aggregated across courses (section 7).',
                ].map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="text-ink-faint shrink-0" aria-hidden="true">—</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 pt-4 border-t border-line-soft text-xs text-ink-faint leading-relaxed">
                A plain-English summary, for orientation only. The numbered sections below are the policy that actually applies.
              </p>
            </div>

            <div className="space-y-10 text-ink-soft leading-relaxed">
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">1.</span>What we collect
                </h2>
                <p>
                  When you book a tee time or create an account on GreenReserve, we collect your name, email address,
                  and phone number. If the course you&apos;re booking has a cancellation fee policy, we also collect a
                  payment method to hold your spot — this is handled entirely by Stripe, our payment processor.
                  GreenReserve never sees or stores your full card number.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">2.</span>How we use it
                </h2>
                <p>
                  We use your information to manage your bookings, send confirmation and cancellation emails, remind
                  you about upcoming tee times, and let you check in at the course. If you create an account, we use
                  your email to let you sign in and view your booking history.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">3.</span>Communications consent
                </h2>
                <p>
                  Using GreenReserve means consenting to transactional email and SMS — booking notices, cancellation
                  confirmations, check-in reminders, and account verification (two-factor) codes. These are operational
                  messages required to run the service, not marketing. <strong className="text-ink">We will never send
                  marketing text messages to you without separate, explicit opt-in</strong>, and you can unsubscribe
                  from non-essential email at any time.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">4.</span>Who we share it with
                </h2>
                <p>
                  We share your booking details — name, email, phone, and tee time — with the golf course you&apos;re
                  booking, so they can prepare for your round and contact you if needed. We don&apos;t share your
                  information with any other course, and{' '}
                  <strong className="text-ink">we don&apos;t sell your data to third parties, ever.</strong>
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">5.</span>Payment data
                </h2>
                <p>
                  All payment processing is handled by Stripe. When you save a card to book a tee time, that card is
                  stored directly with Stripe under their PCI-compliant infrastructure — GreenReserve only ever
                  receives a reference token, never your actual card number. Charges (green fees, cart fees, and our
                  $1.50 per-player service fee) are processed through Stripe at check-in or, for late cancellations,
                  automatically per the course&apos;s posted policy.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">6.</span>Your rights
                </h2>
                <p>
                  You can request a copy of the data we hold on you, or ask us to delete your account and associated
                  personal information, by emailing{' '}
                  <a href="mailto:hello@greenreserve.app" className="text-pine font-medium hover:underline">hello@greenreserve.app</a>.
                  We&apos;ll process deletion requests within a reasonable time, except where we&apos;re required to
                  retain booking and payment records for accounting or legal purposes.
                </p>
              </section>

              {/* ── FOR COURSE OPERATORS ── */}
              <section className="pt-6 border-t border-line">
                <h2 className="font-semibold text-base text-ink mb-4">
                  <span className="text-ink-faint font-normal mr-2">7.</span>For course operators
                </h2>
                <p className="mb-6">
                  The broader business relationship — fees, liability, termination, and data ownership — is covered by
                  our{' '}
                  <a href="/operator-agreement" className="text-pine font-medium hover:underline">Operator Agreement</a>.
                  This section covers privacy specifically.
                </p>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">7.1</span>What we collect at onboarding
                    </h3>
                    <p>
                      When a course is onboarded, we collect the primary contact&apos;s name, email, and phone
                      number; the course name, address, and type; and the Stripe Connect identifiers required
                      to route green-fee payments. We do not store raw banking credentials — those are handled
                      directly by Stripe during their onboarding flow.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">7.2</span>Course data ownership and white-label promise
                    </h3>
                    <p>
                      Booking history, golfer contact details collected during booking, and revenue data are
                      held on behalf of your course and belong to you. Your booking page can carry your own name,
                      logo, colors, and photos — from a golfer&apos;s perspective, it&apos;s your course&apos;s
                      experience, not GreenReserve&apos;s. <strong className="text-ink">GreenReserve does not use your
                      golfer data for its own marketing, aggregate it across courses, repurpose your branding, or sell
                      it to any third party.</strong> You may request a full data export at any time by emailing{' '}
                      <a href="mailto:hello@greenreserve.app" className="text-pine font-medium hover:underline">hello@greenreserve.app</a>.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">7.3</span>Member data
                    </h3>
                    <p>
                      For courses using the member portal, member records (names, emails, membership tier,
                      and booking history) are scoped to your course only. Member data is never shared with
                      other courses, used for cross-course targeting, or disclosed to third parties outside
                      of payment processing (Stripe) and email delivery (Resend).
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">7.4</span>What happens on termination
                    </h3>
                    <p>
                      If you close your account, your course page comes down within 24 hours. On request,
                      we will provide a complete export of your booking and golfer data. Your data will be
                      deleted from our active systems within 30 days of your deletion request, except where
                      retention is required for accounting, tax, or legal compliance.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">7.5</span>Stripe Connect and payment data
                    </h3>
                    <p>
                      Green fees are routed directly to your Stripe Connect account. GreenReserve never holds
                      green-fee funds. All payment method data is stored by Stripe under PCI DSS — GreenReserve
                      only holds a Stripe-issued token and your Stripe account identifier. Golfer card numbers
                      are never stored on GreenReserve servers.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">7.6</span>Legal entity
                    </h3>
                    <p>
                      GreenReserve is operated by{' '}
                      <span className="font-medium text-ink">{'{{COMPANY_LEGAL_NAME}}'} {/* TODO: replace with LLC name once formed */}</span>,
                      a limited liability company formed in the state of{' '}
                      <span className="font-medium text-ink">New Jersey</span>.
                    </p>
                  </div>
                </div>
              </section>
              {/* <!-- NOTE: The operator section above was drafted with AI assistance, without a lawyer, and requires attorney review before GreenReserve reaches material scale. Governing-state assumption (New Jersey) should be confirmed. --> */}

              <section className="pt-6 border-t border-line">
                <h3 className="font-semibold text-sm text-ink mb-2">Changes to this policy</h3>
                <p className="text-sm">
                  <strong className="text-ink">v2026-08 (current):</strong> added a communications-consent section, the
                  white-label promise in writing, and a cross-reference to the new Operator Agreement for the
                  broader business relationship.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">Contact</h2>
                <p>
                  Questions about this policy? Reach us at{' '}
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
