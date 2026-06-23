export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-3">Legal</div>
        <h1 className="font-black tracking-tight text-4xl text-gray-900 mb-3">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated June 2026</p>

        <div className="space-y-10 text-gray-600 leading-relaxed">
          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">What we collect</h2>
            <p>
              When you book a tee time or create an account on GreenReserve, we collect your name, email address,
              and phone number. If the course you&apos;re booking has a cancellation fee policy, we also collect a
              payment method to hold your spot — this is handled entirely by Stripe, our payment processor.
              GreenReserve never sees or stores your full card number.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">How we use it</h2>
            <p>
              We use your information to manage your bookings, send confirmation and cancellation emails, remind
              you about upcoming tee times, and let you check in at the course. If you create an account, we use
              your email to let you sign in and view your booking history.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Who we share it with</h2>
            <p>
              We share your booking details — name, email, phone, and tee time — with the golf course you&apos;re
              booking, so they can prepare for your round and contact you if needed. We don&apos;t share your
              information with any other course, and we don&apos;t sell your data to third parties, ever.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Payment data</h2>
            <p>
              All payment processing is handled by Stripe. When you save a card to book a tee time, that card is
              stored directly with Stripe under their PCI-compliant infrastructure — GreenReserve only ever
              receives a reference token, never your actual card number. Charges (green fees, cart fees, and our
              $1.50 per-player service fee) are processed through Stripe at check-in or, for late cancellations,
              automatically per the course&apos;s posted policy.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Your rights</h2>
            <p>
              You can request a copy of the data we hold on you, or ask us to delete your account and associated
              personal information, by emailing{' '}
              <a href="mailto:hello@greenreserve.app" className="text-emerald-600 font-medium hover:underline">hello@greenreserve.app</a>.
              We&apos;ll process deletion requests within a reasonable time, except where we&apos;re required to
              retain booking and payment records for accounting or legal purposes.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg text-gray-900 mb-2">Contact</h2>
            <p>
              Questions about this policy? Reach us at{' '}
              <a href="mailto:hello@greenreserve.app" className="text-emerald-600 font-medium hover:underline">hello@greenreserve.app</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
