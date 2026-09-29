// SD-7: the homepage FAQ, in one place, so the rendered accordion and the
// FAQPage JSON-LD are the same answers by construction. FB-2 (Cam approved
// 2026-09-29, FB2_COPY_SPEC.md §8): eight questions, each checked against what
// the product does — green fees are charged at CHECK-IN (not "after each
// booking") and walk-ins CAN be added on the sheet today.
export const HOME_FAQ: { q: string; a: string }[] = [
  { q: 'What does it cost?', a: 'Nothing to your course: no setup fee, no monthly fee. Golfers pay a $1.50 per player booking fee on online bookings.' },
  { q: 'How does it connect to our website?', a: 'Your page has its own link. Add a “Book a tee time” button that opens it — we send you the link when you go live.' },
  { q: 'When do we get paid?', a: 'Green fees are charged when the golfer checks in and paid out to your Stripe account on Stripe’s normal schedule.' },
  { q: 'Can we still take phone and walk-in bookings?', a: 'Yes. Add them on the same tee sheet so online golfers only see what’s really open.' },
  { q: 'What happens when a golfer cancels or doesn’t show?', a: 'Before your cancellation window, the time just opens back up. After it, your cancellation fee (if you set one) is charged automatically.' },
  { q: 'Do members get their own rates?', a: 'Yes — rates, booking windows and guest pricing by membership tier.' },
  { q: 'How long does setup take?', a: 'About a week from your first call. We build everything; you approve it.' },
  { q: 'Can we leave?', a: 'Yes, with 30 days’ notice and no cancellation fee. Your data is yours.' },
];

/** schema.org FAQPage for the homepage <head>. */
export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: HOME_FAQ.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
