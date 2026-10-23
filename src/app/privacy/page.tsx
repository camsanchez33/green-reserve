import type { Metadata } from 'next';
import { previewFor } from '@/lib/seo';
import { SUPPORT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'GreenReserve privacy policy. How we collect, use, and protect your personal information.',
  // Link previews carry this page's own title, not the homepage's.
  ...previewFor('Privacy Policy | GreenReserve', 'GreenReserve privacy policy. How we collect, use, and protect your personal information.'),
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
              <nav className="flex flex-col">
                <a href="/terms" className={navIdle}>Terms of Service</a>
                <a href="/privacy" className={navActive}>Privacy Policy</a>
                <a href="/operator-agreement" className={navIdle}>Operator Agreement</a>
              </nav>
              <p className="mt-6 pl-3 text-xs text-ink-soft leading-relaxed">
                Version v2026-10-19<br />Last updated October 19, 2026
              </p>
            </div>
          </aside>

          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight text-ink mb-3">Privacy Policy</h1>
            <p className="text-ink-soft text-sm mb-10">Version v2026-10-19 — last updated October 19, 2026</p>

            {/* Plain-English summary */}
            <div className="bg-white rounded-lg shadow-card p-6 mb-12">
              <p className="text-[15px] font-semibold text-ink mb-4">The short version</p>
              <ul className="space-y-2.5 text-sm text-ink-soft leading-relaxed">
                {[
                  'GreenReserve LLC, a New York company, runs GreenReserve. We collect what we need to run your bookings (section 1).',
                  'A card is saved only when the course has a late-cancellation or no-show fee, and it is stored by Stripe. We never see your full card number (section 5).',
                  'Your booking goes to the course you booked, and to the service providers listed in section 4 that run the platform. We do not sell your data.',
                  'Booking and account messages are not marketing. Reply STOP to stop texts (section 3).',
                  'We use only sign-in cookies, and no advertising trackers (section 6).',
                  'You can ask for a copy of your data, or ask us to delete it, by email (section 8).',
                ].map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="text-ink-faint shrink-0" aria-hidden="true">—</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 pt-4 border-t border-line-soft text-xs text-ink-soft leading-relaxed">
                A plain-English summary, for orientation only. The numbered sections below are the policy that actually applies.
              </p>
            </div>

            <div className="space-y-10 text-ink-soft leading-relaxed">
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">1.</span>What we collect
                </h2>
                <p>
                  GreenReserve is run by <strong className="text-ink">GreenReserve LLC, a New York limited liability company</strong>. When you book a tee time or
                  create an account, we collect your name, email address and phone number, the booking itself (course, date, time,
                  players, prices) and its history (check-in, changes, cancellations, payments). If you sign in with a code sent by
                  text, we use your phone number for that. If the course has a late-cancellation or no-show fee, a card is saved to
                  hold your spot; it is stored by Stripe, our payment processor, and GreenReserve never sees or stores your full card
                  number. When you pay on the course&apos;s pay page, your card or Apple Pay / Google Pay details go straight to Stripe.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">2.</span>How we use it
                </h2>
                <p>
                  To run your bookings: confirmations and changes, pay links and check-in, reminders, receipts, cancellations, and
                  charging the payments described in our Terms of Service. If you create an account, to sign you in and show your
                  bookings at every GreenReserve course. To keep the service working and secure: preventing abuse, and diagnosing errors.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">3.</span>Emails and text messages
                </h2>
                <p>
                  We send emails and texts about your bookings: confirmations and changes, pay links and check-in, sign-in codes, and
                  notices the course sends about your booking day. These are not marketing. <strong className="text-ink">We never send marketing texts without your separate, explicit opt-in.</strong>
                  Reply STOP to any text to stop texts, or HELP for help. Message and data rates may apply.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">4.</span>Who we share it with
                </h2>
                <p>
                  We share your booking details (name, email, phone and tee time) with <strong className="text-ink">the course you booked</strong>, so its staff can run
                  your round and contact you. We don&apos;t share them with any other course. <strong className="text-ink">We don&apos;t sell your data, ever.</strong>
                </p>
                <p className="mt-3">
                  We also use service providers who process data only to run GreenReserve for us: Stripe (payments), Resend (email),
                  Twilio (text messages), Vercel (hosting and file storage), our database host, Sentry (error reports, which can
                  include a recording of the page when an error happens and, for a small sample of visits, a recording of the visit
                  itself, with all text masked), Cal.com (booking calls with courses) and
                  Anthropic (the AI assistant in the course dashboard and the monthly review, which can see the course&apos;s bookings,
                  including golfer names, to answer staff questions).
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">5.</span>Payment data
                </h2>
                <p>
                  Payments are processed by Stripe. A saved card lives with Stripe under its PCI-compliant systems; GreenReserve keeps
                  only a reference to it. Your round, any pro-shop items, GreenReserve&apos;s booking fee, and any late-cancellation or
                  no-show charge under the course&apos;s policy are charged through Stripe as our Terms of Service describe. GreenReserve&apos;s
                  booking fee can appear as a separate charge labelled &ldquo;BOOKING FEE&rdquo;.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">6.</span>Cookies
                </h2>
                <p>
                  We use only the cookies the service needs: a golfer sign-in (up to 90 days), a member sign-in for a course (90 days),
                  staff and admin sign-ins for the dashboards, and a cookie remembering which course a staff login is viewing. When a
                  payment form loads, Stripe sets its own fraud-prevention cookies. We use no advertising or tracking cookies.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">7.</span>Keeping your data
                </h2>
                <p>
                  We keep booking and payment records for as long as we need them to run the service and as accounting, tax and legal
                  rules require. Error reports are kept for a short time and then deleted by our provider.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">8.</span>Your rights
                </h2>
                <p>
                  You can ask for a copy of the data we hold on you, or ask us to delete your account and personal information, by
                  emailing <a href={`mailto:${SUPPORT_EMAIL}`} className="text-pine font-medium hover:underline">{SUPPORT_EMAIL}</a>.
                  We process requests within a reasonable time, except for records we must keep for accounting or legal purposes.
                </p>
              </section>
              {/* ── FOR COURSE OPERATORS ── */}
              <section className="pt-6 border-t border-line">
                <h2 className="font-semibold text-base text-ink mb-4">
                  <span className="text-ink-faint font-normal mr-2">9.</span>For course operators
                </h2>
                <p className="mb-6">
                  The broader business relationship — fees, liability, termination and data ownership — is covered by
                  our{' '}
                  <a href="/operator-agreement" className="text-pine font-medium hover:underline">Operator Agreement</a>.
                  This section covers privacy specifically.
                </p>
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">9.1</span>What we collect from a course
                    </h3>
                    <p>
                      The contact person&apos;s name, email and phone; the course&apos;s name, address, type, schedule, rates, photos and
                      logo; staff logins and their permissions; the documents the course uploads; and the Stripe Connect identifiers that
                      route its payments. When someone signs the Operator Agreement we record their name, title, the authority they
                      confirm, the time, their IP address and browser. Banking details are handled by Stripe directly.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">9.2</span>Course data and your branding
                    </h3>
                    <p>
                      Booking history, the contact details golfers give when booking at your course, and revenue data are held on behalf
                      of your course and belong to you. <strong className="text-ink">GreenReserve does not use your golfer data for its own
                      marketing, share it with other courses, or sell it.</strong> A golfer who creates a GreenReserve account can see
                      their own bookings at every course in that account, and GreenReserve uses totals across courses to run and bill the
                      platform. Your booking page carries your name, logo, colors and photos. You can ask for a full export at any time.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">9.3</span>Member data
                    </h3>
                    <p>
                      Member records (names, emails, tier, dues and booking history) belong to your course and are shared only with the
                      service providers in section 4 that process them for us.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">9.4</span>When a course leaves
                    </h3>
                    <p>
                      We take the course page down and, on request, provide an export of your booking and golfer data, then delete it
                      from our active systems, except for what accounting, tax or legal rules require us to keep.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-ink mb-1">
                      <span className="text-ink-faint font-normal mr-2">9.5</span>Stripe Connect and payment data
                    </h3>
                    <p>
                      Green fees and dues go to your own Stripe Connect account; GreenReserve never holds them. Card data is stored by
                      Stripe under PCI DSS; GreenReserve keeps only Stripe references and your Stripe account identifier.
                    </p>
                  </div>
                </div>
              </section>
              {/* <!-- NOTE: Drafted to match the product (2026-10-19) without a lawyer's review — Cam 2026-10-19 chose to launch on this draft. State privacy laws (CCPA/CPRA, NY SHIELD, NJ) and the AI-processing disclosure need counsel. --> */}

              <section className="pt-6 border-t border-line">
                <h3 className="font-semibold text-sm text-ink mb-2">Changes to this policy</h3>
                <p className="text-sm mb-2">
                  <strong className="text-ink">v2026-10-19 (current):</strong> names GreenReserve LLC (New York); lists the service providers
                  that process data, including the AI assistant; adds phone sign-in, pay pages, pro-shop items, cookies, keeping data and
                  the text-message STOP and HELP terms; says what signing the Operator Agreement records.
                </p>
                <p className="text-sm">
                  <strong className="text-ink">v2026-08:</strong> added a communications-consent section, the
                  white-label promise in writing, and a cross-reference to the Operator Agreement.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">Contact</h2>
                <p>
                  Questions about this policy? Reach us at{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-pine font-medium hover:underline">{SUPPORT_EMAIL}</a>.
                </p>
              </section>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
