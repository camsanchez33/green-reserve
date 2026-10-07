import type { Metadata } from 'next';
import Link from 'next/link';
import { HOME_FAQ, faqJsonLd } from '@/lib/faq';

// HOME-2 (HOMEPAGE_SPEC.md, Cam 2026-10-07): the long version. The homepage's
// "Learn more about the tee sheet" cards land here — everything a course gets,
// how setup works, what it costs, the FAQ (its FAQPage JSON-LD moved here with
// it), about and contact. Same rules as the homepage: NO durations, NO contract
// terms, fee sentences only from legal/LQ-2_FEE_COPY.md, and only features that
// exist today. A server component — no client JS.

export const metadata: Metadata = {
  title: 'The Tee Sheet',
  description: 'Everything a golf course gets with GreenReserve: its own booking page, one tee sheet for online, phone and walk-in bookings, payments to its own Stripe account, members, staff permissions, an assistant and analytics.',
};

const FEATURES: { h: string; p: string; items: string[] }[] = [
  {
    h: 'Your booking page',
    p: 'Golfers book on a page that looks like your course, not like us.',
    items: [
      'Your course’s name, logo, colors and photos',
      'A “Book a tee time” button for your own website',
      'Golfers pick a day, a party size and a time, and see the full price before they book',
      'A confirmation email, with a note from your course if you add one',
      'Golfers can ask to be told when a full time opens up',
    ],
  },
  {
    h: 'The tee sheet',
    p: 'One sheet your counter runs the whole day from.',
    items: [
      'Online, phone and walk-in bookings side by side, so nothing is double-booked',
      'Tee times made for you from your own schedule',
      'Block times for leagues, events or maintenance',
      'Check groups in, see who is next up, and get a nudge when a group is late',
      'Call off a stormy afternoon in one step, with every golfer told',
      'A course alert banner on your booking page for closures and notices',
    ],
  },
  {
    h: 'Payments',
    p: 'Golfers pay with one card payment to your course’s own Stripe account.',
    items: [
      'Cards are charged when the group checks in, not when they book',
      'Text a golfer a pay link, and they pay on their own phone with Apple Pay, Google Pay or a card',
      'Cash at the counter is marked paid in one tap',
      'Staff can take a card at the counter when they need to',
    ],
  },
  {
    h: 'Cancellations and no-shows',
    p: 'Your policy, applied the same way every time.',
    items: [
      'Set a free-cancellation window, a late-cancellation fee and a no-show fee, or none of them',
      'Golfers see your policy before they book, in plain words',
      'Optionally count a group as a no-show a set number of minutes after its tee time',
      'No-show charges are taken at the end of the day, so a late group checked in before then isn’t charged',
    ],
  },
  {
    h: 'Members',
    p: 'Member pricing without a separate system.',
    items: [
      'Membership tiers with their own rates',
      'Booking windows by tier, so members can book further ahead',
    ],
  },
  {
    h: 'Staff',
    p: 'Every person gets their own login.',
    items: [
      'You choose what each person can do: check in, take payments, edit the sheet and more',
      'Stripe, staff management and your cancellation policy stay with the owner',
    ],
  },
  {
    h: 'Birdie, your assistant',
    p: 'Ask questions about your day in plain words.',
    items: [
      'Ask how today looks, find a golfer’s booking, or check a schedule',
      'Birdie can draft a change to the sheet, and nothing changes until you confirm it',
    ],
  },
  {
    h: 'Analytics',
    p: 'The numbers behind your tee sheet, for owners.',
    items: [
      'Revenue collected and still owed',
      'How full each day ran, and the tee times that went unsold',
      'No-shows, how far ahead golfers book, and where bookings come from',
    ],
  },
];

const STEPS = [
  { h: 'Tell us about your course', p: 'A short call about your tee sheet and how you take bookings today.' },
  { h: 'We build it', p: 'Your booking page and tee sheet, set up with your times, prices and policy.' },
  { h: 'Go live', p: 'Add the button to your website. Golfers start booking.' },
];

const H2 = 'font-serif text-[30px] sm:text-[36px] leading-[1.05] text-pine';
const BTN = 'inline-flex items-center gap-2 h-[48px] px-5 rounded-md bg-pine hover:bg-pine-hover text-white font-semibold text-[15.5px] transition-colors';
const QUIET = 'text-[15.5px] font-semibold text-ink underline decoration-fairway decoration-2 underline-offset-[5px] hover:text-pine';

export default function TeeSheetPage() {
  return (
    <div className="bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />

      <section className="w-[min(1180px,calc(100%-48px))] mx-auto pt-32 pb-16 border-b border-line">
        <h1 className="font-serif text-[40px] sm:text-[56px] leading-none text-pine">The GreenReserve tee sheet.</h1>
        <p className="mt-6 text-[19px] leading-relaxed max-w-[38em]">
          An online booking page for your golfers and one tee sheet for your staff, set up by us around how your
          course already runs. Here is everything your course gets.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <a href="/demo" className={BTN}>Book a demo <span aria-hidden="true">→</span></a>
          <Link href="/for-courses" className={QUIET}>Ask a question</Link>
        </div>
      </section>

      <section className="w-[min(1180px,calc(100%-48px))] mx-auto py-16">
        <h2 className={H2}>What your course gets.</h2>
        <div className="mt-6">
          {FEATURES.map(f => (
            <div key={f.h} className="grid md:grid-cols-[minmax(0,38fr)_minmax(0,62fr)] gap-4 md:gap-12 py-8 border-t border-line">
              <div>
                <h3 className="font-serif text-[26px] leading-tight">{f.h}</h3>
                <p className="mt-2 text-[16px]">{f.p}</p>
              </div>
              <ul className="list-none p-0 m-0">
                {f.items.map(i => (
                  <li key={i} className="relative pl-5 py-2 text-[16px] leading-snug border-b border-line last:border-b-0 before:content-[''] before:absolute before:left-0 before:top-[18px] before:w-2 before:h-0.5 before:bg-fairway">{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="w-[min(1180px,calc(100%-48px))] mx-auto py-16 grid md:grid-cols-[minmax(0,38fr)_minmax(0,62fr)] gap-8 md:gap-12">
          <div>
            <h2 className={H2}>How setting up works.</h2>
            <p className="mt-4 text-[17px]">We set it up with you, around how your course already runs.</p>
          </div>
          <ol className="list-none p-0 m-0">
            {STEPS.map((st, i) => (
              <li key={st.h} className="flex gap-5 py-5 border-t border-line first:border-t-0 first:pt-0">
                <span className="font-serif text-[26px] leading-none text-pine w-6 shrink-0">{i + 1}</span>
                <div><h3 className="font-semibold text-[17px]">{st.h}</h3><p className="mt-1 text-[16px]">{st.p}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="w-[min(1180px,calc(100%-48px))] mx-auto py-16 grid md:grid-cols-[minmax(0,38fr)_minmax(0,62fr)] gap-6 md:gap-12" id="pricing">
        <h2 className={H2}>What it costs.</h2>
        <div className="text-[17px] leading-relaxed space-y-3 max-w-[36em]">
          <p>No setup fee, no monthly fee, no commission on your green fees.</p>
          <p>Golfers pay $1.50 per player on each online booking, added to your price. They see it before they book.</p>
          <p>Stripe&apos;s standard card-processing fee applies to the payment, the same as any card you take today. GreenReserve charges you nothing on top of it.</p>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="w-[min(1180px,calc(100%-48px))] mx-auto py-16 grid md:grid-cols-[minmax(0,38fr)_minmax(0,62fr)] gap-8 md:gap-12" id="faq">
          <h2 className={H2}>What courses ask us.</h2>
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-7">
            {HOME_FAQ.map(f => <div key={f.q}><h3 className="font-semibold text-[17px]">{f.q}</h3><p className="mt-1.5 text-[15.5px]">{f.a}</p></div>)}
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="w-[min(1180px,calc(100%-48px))] mx-auto py-16 grid md:grid-cols-2 gap-10 md:gap-16">
          <div id="about">
            <h2 className={H2}>About GreenReserve.</h2>
            <p className="mt-4 text-[17px] leading-relaxed max-w-[32em]">
              GreenReserve is built for golf courses that want their own online booking without giving up their tee
              times or their brand. We set every course up ourselves, and when you have a question you talk to the
              people who build it.
            </p>
          </div>
          <div id="contact">
            <h2 className={H2}>Talk to us.</h2>
            <p className="mt-4 text-[17px] leading-relaxed">
              Book a demo and we&apos;ll show it with your own course&apos;s times and prices, or email{' '}
              <a href="mailto:thegreenreserve@outlook.com" className="font-semibold underline decoration-fairway decoration-2 underline-offset-4">thegreenreserve@outlook.com</a>.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-6">
              <a href="/demo" className={BTN}>Book a demo <span aria-hidden="true">→</span></a>
              <Link href="/for-courses" className={QUIET}>Ask a question</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
