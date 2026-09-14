import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Operator Agreement',
  description: 'The agreement between GreenReserve and golf courses listing on the platform — fees, liability, data, and termination.',
};

const navLink = 'border-l-2 pl-3 py-1.5 text-sm transition-colors';
const navActive = `${navLink} border-pine text-pine font-medium`;
const navIdle = `${navLink} border-transparent text-ink-soft hover:text-ink hover:border-line-strong`;

export default function OperatorAgreementPage() {
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
                <a href="/privacy" className={navIdle}>Privacy Policy</a>
                <a href="/operator-agreement" className={navActive}>Operator Agreement</a>
              </nav>
              <p className="mt-6 pl-3 text-xs text-ink-faint leading-relaxed">
                Version v2026-08<br />Last updated August 2026
              </p>
            </div>
          </aside>

          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight text-ink mb-3">Operator Agreement</h1>
            <p className="text-ink-muted text-sm mb-10">Version v2026-08 — last updated August 2026</p>

            {/* Plain-English summary */}
            <div className="bg-white border border-line rounded-lg p-6 mb-12">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">The short version</p>
              <ul className="space-y-2.5 text-sm text-ink-soft leading-relaxed">
                {[
                  'Listing is free. GreenReserve charges a $1.50 per-player service fee (section 1).',
                  'Green fees and cart fees go straight to your Stripe account. We never hold or delay them (section 2).',
                  'Disputes about your green fees and your policies are yours to answer; disputes about our service fee are ours (section 2).',
                  'Our liability is capped at the fees GreenReserve itself collected in the twelve months before a claim (section 3).',
                  'Either side can end this with 30 days notice. Your page comes down within 24 hours and you can export everything (section 5).',
                  'Your bookings, golfer contacts and revenue data belong to you, and your page can carry your own branding (section 6).',
                  'New Jersey law; disputes go to individual arbitration, or small-claims court instead (section 8).',
                ].map((line, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="text-ink-faint shrink-0" aria-hidden="true">—</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 pt-4 border-t border-line-soft text-xs text-ink-faint leading-relaxed">
                A plain-English summary, for orientation only. The numbered sections below are the agreement that actually applies.
              </p>
            </div>

            <div className="space-y-10 text-ink-soft leading-relaxed">
              <section>
                <p>
                  This is the agreement between your golf course (&ldquo;you,&rdquo; &ldquo;the course&rdquo;) and
                  GreenReserve for listing and taking bookings on the platform. It works alongside our{' '}
                  <a href="/terms" className="text-pine font-medium hover:underline">Terms of Service</a> (which governs
                  golfers&apos; use of the site) and our{' '}
                  <a href="/privacy" className="text-pine font-medium hover:underline">Privacy Policy</a>. By connecting
                  your course to GreenReserve, you agree to the terms below.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">1.</span>What GreenReserve does
                </h2>
                <p>
                  GreenReserve is a booking platform, not a golf course operator. We give golfers a way to find and
                  reserve tee times at your course, and we give you a tee sheet, booking management tools, and payment
                  routing. You set your own pricing, tee time schedule, and policies (cancellation window, late-cancel
                  fee, dress code, and so on) — GreenReserve enforces what you configure, but doesn&apos;t set it for you.
                  Listing is free; GreenReserve&apos;s only fee is the $1.50 per-player service fee charged to the
                  golfer, never deducted from what you receive.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">2.</span>Payments and Stripe Connect
                </h2>
                <p>
                  Green fees and cart fees are routed directly to your Stripe Connect account. <strong className="text-ink">
                  GreenReserve never holds, pools, or delays green-fee funds</strong> — they move from the golfer&apos;s
                  payment method to your Stripe account, net of Stripe&apos;s standard processing fees. GreenReserve
                  collects its own $1.50 per-player service fee as a separate charge to the golfer; it is not part of
                  your payout and you are never responsible for it.
                </p>
                <p className="mt-3">
                  <strong className="text-ink">Chargebacks and disputes:</strong> disputes over green fees, cart fees, or
                  your course&apos;s policies (cancellation, no-show, refund) are between you and the golfer — you handle
                  the response and evidence for those through Stripe. Disputes over GreenReserve&apos;s own $1.50 service
                  fee are GreenReserve&apos;s to handle.
                </p>
                <p className="mt-3">
                  <strong className="text-ink">Refunds:</strong> you can issue a refund for a booking at your discretion
                  from your dashboard; GreenReserve&apos;s service fee is refunded automatically whenever the
                  underlying green-fee charge is refunded in full. Late-cancellation fees, once charged per your posted
                  policy, are non-refundable except at your discretion.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">3.</span>Liability
                </h2>
                <p>
                  GreenReserve is provided on an &ldquo;as-is&rdquo; basis. We work to keep the platform available and
                  reliable but don&apos;t guarantee uninterrupted uptime. <strong className="text-ink">
                  GreenReserve&apos;s total liability to you for any claim arising from your use of the platform —
                  however the claim is framed — is limited to the fees GreenReserve itself has collected (not the green
                  fees passed through to you) in the twelve months before the claim.</strong> Neither party is liable to
                  the other for indirect, incidental, or consequential damages (lost profits, lost data, and similar),
                  even if advised such damages were possible. GreenReserve is not responsible for golfer no-shows,
                  weather, course conditions, or the conduct of your staff or golfers.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">4.</span>Indemnification
                </h2>
                <p>
                  <strong className="text-ink">You agree to indemnify and hold GreenReserve harmless</strong> from any
                  claim, loss, or expense arising from your course, your premises, or the conduct of your staff or
                  agents — things GreenReserve has no control over and didn&apos;t cause.
                </p>
                <p className="mt-3">
                  <strong className="text-ink">GreenReserve agrees to indemnify and hold you harmless</strong> from any
                  claim, loss, or expense arising from the GreenReserve platform itself — a defect in how the booking
                  system, payment routing, or check-in flow works, where the fault is ours.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">5.</span>Term and termination
                </h2>
                <p>
                  Either party may end this agreement at any time with 30 days&apos; written notice (an email to{' '}
                  <a href="mailto:hello@greenreserve.app" className="text-pine font-medium hover:underline">hello@greenreserve.app</a>
                  {' '}is sufficient from your side). Either party may terminate immediately if the other materially
                  breaches this agreement and doesn&apos;t fix it within 10 days of being told about it.
                </p>
                <p className="mt-3">
                  When your account closes — for any reason — your booking page comes down within 24 hours. On request,
                  we&apos;ll provide a complete export of your booking, golfer, and revenue data. Your data is then
                  deleted from our active systems within 30 days, except records we&apos;re required to keep for
                  accounting, tax, or legal compliance.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">6.</span>Your data
                </h2>
                <p>
                  <strong className="text-ink">Your booking history, golfer contact data collected through your
                  bookings, and revenue data belong to you</strong> — not GreenReserve. Golfer personal data is handled
                  under our{' '}
                  <a href="/privacy" className="text-pine font-medium hover:underline">Privacy Policy</a>; we don&apos;t
                  sell golfer or course data to anyone, for any reason.
                </p>
                <p className="mt-3">
                  <strong className="text-ink">White-label promise:</strong> your booking page can carry your own name,
                  logo, colors, and photos. From a golfer&apos;s perspective, it&apos;s your course&apos;s booking
                  experience. We don&apos;t repurpose your branding, your golfer relationships, or your data to promote
                  any other course, and we never will.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">7.</span>Communications consent
                </h2>
                <p>
                  By using GreenReserve, you and your staff consent to receive transactional email and SMS related to
                  the service — account verification codes, two-factor login codes, booking notices, and similar
                  operational messages. We will never send marketing text messages to you or your golfers without
                  separate, explicit opt-in.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">8.</span>Governing law and disputes
                </h2>
                <p>
                  This agreement is governed by the laws of the State of New Jersey, without regard to conflict-of-law
                  rules. Any dispute arising from this agreement will be resolved through binding arbitration on an
                  individual basis, except that either party may bring a qualifying claim in small-claims court instead.
                  Venue for anything not subject to arbitration is New Jersey.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">
                  <span className="text-ink-faint font-normal mr-2">9.</span>Legal entity
                </h2>
                <p>
                  GreenReserve is operated by{' '}
                  <span className="font-medium text-ink">{'{{COMPANY_LEGAL_NAME}}'} {/* TODO: replace with LLC name once formed */}</span>,
                  a limited liability company formed in the state of{' '}
                  <span className="font-medium text-ink">New Jersey</span>.
                </p>
              </section>
              {/* <!-- NOTE: This Operator Agreement was drafted with AI assistance, without a lawyer, and requires attorney review before GreenReserve reaches material scale. Governing-state assumption (New Jersey) should be confirmed. --> */}

              <section className="pt-6 border-t border-line">
                <h3 className="font-semibold text-sm text-ink mb-2">Changes to this agreement</h3>
                <p className="text-sm">
                  <strong className="text-ink">v2026-08 (current):</strong> expanded liability cap, two-way
                  indemnification, termination and data-export mechanics, communications consent, and governing
                  law/arbitration provisions. Operators who already accepted an earlier version are not required to
                  re-accept — this version applies going forward and to any future disputes on the same terms as before.
                </p>
              </section>

              <section>
                <h2 className="font-semibold text-base text-ink mb-2">Contact</h2>
                <p>
                  Questions about this agreement? Reach us at{' '}
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
