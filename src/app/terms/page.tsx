import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — GreenReserve',
  description: 'GreenReserve terms of service. The rules governing use of our online tee sheet platform for golf courses and golfers.',
};

export default function TermsOfServicePage() {
  return (
    <div className="bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-3">Legal</div>
        <h1 className="font-black tracking-tight text-4xl text-gray-900 mb-3">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated June 2026</p>

        <div className="space-y-10 text-gray-600 leading-relaxed">
          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">The service</h2>
            <p>
              GreenReserve is an online booking platform that lets golfers reserve tee times at participating golf
              courses. <strong className="text-gray-900">GreenReserve is a platform, not a golf course operator</strong> —
              we connect golfers and courses but don&apos;t own, manage, or run any course listed on the site.
              Each course sets its own pricing, policies, and rules, which you agree to follow when you book.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Service fee</h2>
            <p>
              GreenReserve charges a <strong className="text-gray-900">$1.50 per-player service fee</strong> on every
              booking, charged to the golfer at the time of booking or check-in depending on the course&apos;s payment
              flow. Courses keep 100% of their green fees and cart fees — our fee is never deducted from what the
              course receives.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Cancellation policies</h2>
            <p>
              Each course sets its own cancellation window and late-cancellation fee, shown to you before you
              book. If you cancel after a course&apos;s free-cancellation window has closed, the posted
              late-cancellation fee will be charged automatically to your saved card, and that fee is
              non-refundable. GreenReserve enforces these policies on the course&apos;s behalf but does not set
              them.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">No-shows</h2>
            <p>
              Bookings that are neither cancelled nor checked into by the course are treated as no-shows.
              <strong className="text-gray-900"> No refunds are issued for no-shows</strong>, and any applicable
              late-cancellation fee will still be charged per the course&apos;s policy.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Limitation of liability</h2>
            <p>
              GreenReserve is provided on an &ldquo;as-is&rdquo; basis. We are not responsible for course
              conditions, weather, the conduct of course staff, or disputes between golfers and courses.
              GreenReserve&apos;s liability for any claim arising from use of the platform is limited to the
              service fees you&apos;ve paid us in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Contact</h2>
            <p>
              Questions about these terms? Reach us at{' '}
              <a href="mailto:hello@greenreserve.app" className="text-emerald-600 font-medium hover:underline">hello@greenreserve.app</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
