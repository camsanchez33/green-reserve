// SD-7: the homepage FAQ, in one place, so the rendered accordion and the
// FAQPage JSON-LD are the same six answers by construction. SD-6 will change
// the wording of some of these (the walk-in answer promises a feature the
// dashboard does not have yet); when it does, both surfaces move together.
export const HOME_FAQ: { q: string; a: string }[] = [
  { q: 'How long does onboarding take?', a: 'Typically 1–2 business days from your initial inquiry. Our team handles setup and walks you through everything.' },
  { q: 'Do we need any technical knowledge?', a: 'None. We build your booking page. You add a link on your website and log in to manage your tee sheet.' },
  { q: 'Can we still take phone and walk-in bookings?', a: 'Yes. Your dashboard lets you manually add bookings for walk-ins or phone reservations anytime.' },
  { q: 'What happens when a golfer cancels?', a: "The slot opens back up automatically. If inside your cancellation window, Stripe handles the charge — no action needed." },
  { q: 'How do payouts work?', a: 'We connect your bank account via Stripe during setup. Green fees transfer directly to your account after each booking.' },
  { q: 'Can we control who sees our tee times?', a: 'Your booking page is unlisted until you share the link. You decide when and where to promote it.' },
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
