// SD-7: the FAQ, in one place, so the rendered list and the FAQPage JSON-LD
// are the same answers by construction. HOME-2: both live on /teesheet now. UI-H-1 (HOMEPAGE_SPEC.md, Cam
// 2026-10-01): six general questions — the homepage says what we are and leaves
// the details for the demo, so NO durations and NO contract terms here.
export const HOME_FAQ: { q: string; a: string }[] = [
  { q: 'What is GreenReserve?', a: 'An online booking page and tee sheet for golf courses. Golfers book online; your staff run the day from one sheet.' },
  { q: 'Does it work with our website?', a: 'Yes. You add a “Book a tee time” button that opens your booking page.' },
  { q: 'Can we still take phone and walk-in bookings?', a: 'Yes. They go on the same tee sheet, so online golfers only see what’s really open.' },
  { q: 'How do we get paid?', a: 'Green fees go to your course’s own Stripe account.' },
  { q: 'Do members get their own rates?', a: 'Yes. Member rates and booking windows are set by tier.' },
  { q: 'What does it cost?', a: 'No setup fee, no monthly fee, no commission on your green fees. Golfers pay $1.50 per player on each online booking, added to your price.' },
];

/** schema.org FAQPage for /teesheet (HOME-2). */
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
