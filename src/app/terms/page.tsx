import type { Metadata } from 'next';
import { previewFor } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'GreenReserve terms of service. The rules governing use of our online tee sheet platform for golf courses and golfers.',
  // Link previews carry this page's own title, not the homepage's.
  ...previewFor('Terms of Service | GreenReserve', 'GreenReserve terms of service. The rules governing use of our online tee sheet platform for golf courses and golfers.'),
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
              <nav className="flex flex-col">
                <a href="/terms" className={navActive}>Terms of Service</a>
                <a href="/privacy" className={navIdle}>Privacy Policy</a>
                <a href="/operator-agreement" className={navIdle}>Operator Agreement</a>
              </nav>
              <p className="mt-6 pl-3 text-xs text-ink-soft leading-relaxed">
                Version v2026-10-19<br />Last updated October 19, 2026
              </p>
            </div>
          </aside>

          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight text-ink mb-3">Terms of Service</h1>
            <p className="text-ink-soft text-sm mb-10">Version v2026-10-19 — last updated October 19, 2026</p>

            {/* Plain-English summary */}
            <div className="bg-white rounded-lg shadow-card p-6 mb-12">
              <p className="text-[15px] font-semibold text-ink mb-4">The short version</p>
              <ul className="space-y-2.5 text-sm text-ink-soft leading-relaxed">
                {[
                  'GreenReserve is a booking platform run by GreenReserve LLC, not a golf course. Each course sets its own prices, policies and rules (section 1).',
                  'Online bookings carry a $1.50 per-player GreenReserve booking fee, charged when you pay for your round. Nothing is charged when you book (section 2).',
                  'A card is saved only when the course has a late-cancellation or no-show fee. Saving it authorizes the charges in section 3.',
                  'A no-show is charged after the end of the day unless you check in first, and refunded if marked in error (section 4).',
                  'You can reply STOP to any text from us (section 6).',
                  'Our liability is capped at the fees you have paid us in the twelve months before a claim (section 7).',
                  'New York law. Disputes go to individual arbitration, or to small-claims court instead (section 9).',
                ].map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="text-ink-faint shrink-0" aria-hidden="true">—</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 pt-4 border-t border-line-soft text-xs text-ink-soft leading-relaxed">
                A plain-English summary, for orientation only. The numbered sections below are the terms that actually apply.
              </p>
            </div>

            <div className="space-y-10 text-ink-soft leading-relaxed">
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">1.</span>The service
                </h2>
                <p>
                  GreenReserve is an online tee sheet and booking platform operated by <strong className="text-ink">GreenReserve LLC, a New York limited liability company</strong>
                  (&ldquo;GreenReserve&rdquo;, &ldquo;we&rdquo;). It lets golfers book tee times at participating golf courses.
                  <strong className="text-ink">GreenReserve is a platform, not a golf course operator</strong>: each course is run by its own staff, who set
                  its prices, policies and rules, which you agree to follow when you book. Your payments for green fees, carts and
                  anything else the course sells go to the course.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">2.</span>Fees
                </h2>
                <p>
                  GreenReserve charges a <strong className="text-ink">$1.50 per-player booking fee</strong> on every online booking, shown before you book and
                  added to the course&apos;s price. <strong className="text-ink">Nothing is charged when you book.</strong> The fee is charged when you pay for your
                  round (at check-in, at the counter by card, or with the pay link the course sends you), usually in the same card
                  payment as your round. It is also charged, on its own, if the course charges a late-cancellation or no-show fee
                  under its posted policy; that charge may show on your statement as a separate &ldquo;BOOKING FEE&rdquo;.
                  If you pay for your round in cash at the counter, no GreenReserve fee is charged. Bookings the course enters for
                  you by phone or at the counter carry no GreenReserve fee.
                </p>
                <p>
                  Items the course&apos;s staff add to your round from its pro shop are priced by the course and are added to the
                  same payment as your round. Where a course collects membership dues through GreenReserve, a <strong className="text-ink">GreenReserve fee of 1% of the dues and any initiation fee</strong>
                  is added to what the member pays. GreenReserve charges courses no listing, subscription or commission fees. Card
                  processing fees apply under the course&apos;s own Stripe account.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">3.</span>Card on file and what it authorizes
                </h2>
                <p>
                  A course asks for a card when you book <strong className="text-ink">only if its policy has a late-cancellation fee or a no-show fee</strong>. The
                  policy (the free-cancellation window, the fee amounts and when they are charged) is shown before you book and in
                  your confirmation email. By saving a card you <strong className="text-ink">authorize GreenReserve to charge that card, on the course&apos;s behalf, as the posted policy says</strong>:
                </p>
                <ul className="mt-3 space-y-2 list-disc pl-5">
                  <li>Where the policy holds the fee at the cutoff: the fee is charged when the free-cancellation window closes, and refunded when you check in; it is kept if you cancel after the window or don&apos;t show;</li>
                  <li>Where the policy charges only for late cancellations: the fee is charged when you cancel after the window;</li>
                  <li>A no-show fee, if the course has one, as set out in section 4;</li>
                  <li>GreenReserve&apos;s booking fee together with any of those charges (section 2);</li>
                  <li>Your round, and any pro-shop items added to it, when you check in and pay with that card.</li>
                </ul>
                <p className="mt-3">
                  These charges happen automatically, without further notice. GreenReserve applies each course&apos;s policy for it but does not set it.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">4.</span>No-shows
                </h2>
                <p>
                  A booking that is not cancelled and not checked in may be marked a no-show by the course&apos;s staff, or
                  automatically a set number of minutes after the tee time if the course uses that setting. If the course charges for
                  no-shows, the charge is made <strong className="text-ink">after the end of that day (midnight at the course)</strong>: if you arrive and check in
                  before then, you are not charged. If a no-show is marked in error, the course can reverse it and any no-show charge
                  and booking fee taken for it are refunded.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">5.</span>Cancellations, changes and refunds
                </h2>
                <p>
                  You can cancel or change your booking from your confirmation email, within the course&apos;s rules. Cancelling
                  inside the free-cancellation window is free; cancelling after it is charged as the policy says, and that fee is not
                  refundable. A hold taken at the cutoff is refunded when you check in. If the course cancels play (for example for
                  weather), no fee is charged and a hold already taken is refunded. Refunds for anything else you buy from a course are
                  the course&apos;s to decide.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">6.</span>Emails and text messages
                </h2>
                <p>
                  By booking a tee time or creating an account, you agree to receive emails and text messages about your bookings:
                  confirmations and changes, pay links and check-in, sign-in codes, and notices the course sends about your booking day
                  (such as weather or course conditions). These are not marketing; we never send marketing texts without your separate
                  opt-in. Message frequency varies. Message and data rates may apply. <strong className="text-ink">Reply STOP to any text to stop texts, or HELP for help.</strong>
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">7.</span>Limitation of liability
                </h2>
                <p>
                  GreenReserve is provided &ldquo;as is&rdquo;, with reasonable efforts toward uptime but no guarantee of
                  uninterrupted availability. We are not responsible for course conditions, weather, the conduct of course staff, or
                  disputes between golfers and courses. <strong className="text-ink">GreenReserve&apos;s liability for any claim arising from use of the platform is limited to the fees you have paid GreenReserve in the twelve months before the claim</strong>,
                  and neither party is liable for indirect or consequential damages.
                </p>
              </section>
              {/* ── FOR COURSE OPERATORS ── */}
              <section className="pt-6 border-t border-line">
                <h2 className="font-semibold text-base text-ink mb-3">
                  <span className="text-ink-faint font-normal mr-2">8.</span>For course operators
                </h2>
                <p>
                  If you operate a golf course on GreenReserve, your relationship with us — fees, payment routing,
                  liability, indemnification, data ownership and termination — is governed by our{' '}
                  <a href="/operator-agreement" className="text-pine font-medium hover:underline">Operator Agreement</a>,
                  which every operator accepts separately. These Terms still apply to your course&apos;s golfers.
                </p>
              </section>
              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">9.</span>Governing law and disputes
                </h2>
                <p>
                  These Terms are governed by the laws of the State of New York. Any dispute will be resolved through binding
                  arbitration on an individual basis, except that either party may bring a qualifying claim in small-claims court instead.
                </p>
              </section>
              {/* <!-- NOTE: Drafted to match the product (2026-10-19) without a lawyer's review — Cam 2026-10-19 chose to launch on this draft. Text-message consent and the card-on-file authorization most need counsel. --> */}

              <section className="pt-6 border-t border-line">
                <h3 className="font-semibold text-sm text-ink mb-2">Changes to these terms</h3>
                <p className="text-sm mb-2">
                  <strong className="text-ink">v2026-10-19 (current):</strong> names GreenReserve LLC and moves governing law to New York;
                  describes when fees are charged (nothing at booking; a card only when a course has a late or no-show fee); authorizes
                  the cutoff hold, late-cancellation and no-show charges and the separate booking fee; no fee on cash paid at the counter;
                  pro-shop items; the 1% membership fee covers initiation fees; text-message terms with STOP and HELP.
                </p>
                <p className="text-sm mb-2">
                  <strong className="text-ink">v2026-10-08:</strong> the fee on membership-dues payments became 1% of the dues, added to what the member pays.
                </p>
                <p className="text-sm mb-2">
                  <strong className="text-ink">v2026-09-29:</strong> the booking fee charged on its own on a no-show or a counter payment.
                </p>
                <p className="text-sm">
                  <strong className="text-ink">v2026-08:</strong> card-authorization language for late-cancellation fees, communications
                  consent, governing law and arbitration; course-operator terms moved to the Operator Agreement.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">Contact</h2>
                <p>
                  Questions about these terms? Reach us at{' '}
                  <a href="mailto:thegreenreserve@outlook.com" className="text-pine font-medium hover:underline">thegreenreserve@outlook.com</a>.
                </p>
              </section>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
