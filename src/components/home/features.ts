// Homepage redo (Cam 2026-11-18, lanes/homepage.md "Homepage redo — APPROVED"): the seven features,
// in the mockup's three groups. Home lists each with its one line and a Learn more link to its own page
// (/features/<slug>). Copy is the mockup's, word for word; no durations, no contract terms, and the
// assistant is "the AI assistant", never by name.

export type FeatureSlug = 'tee-sheet' | 'payments' | 'pro-shop' | 'memberships' | 'events' | 'analytics' | 'team';

export type Feature = { slug: FeatureSlug; title: string; line: string };

export const FEATURE_GROUPS: { label: string; items: Feature[] }[] = [
  {
    label: 'Run the day',
    items: [
      { slug: 'tee-sheet', title: 'Tee sheet and online booking', line: 'Online, phone and walk-in bookings on one sheet, and a booking page in your course’s own look. Golfers can ask to hear when a full time opens.' },
      { slug: 'payments', title: 'Payments', line: 'Text a pay link, take Apple Pay and Google Pay, and cover late-cancel and no-show fees with a saved card.' },
      { slug: 'pro-shop', title: 'Pro shop and range', line: 'A register with stock counts and a daily close-out, and range buckets golfers can add when they book.' },
    ],
  },
  {
    label: 'Your golfers',
    items: [
      { slug: 'memberships', title: 'Memberships and log-in', line: 'Members and residents log in on your booking page and get their own rates and booking window. Dues go by pay link or renew on their own.' },
      { slug: 'events', title: 'Events', line: 'Tournaments, leagues and outings, with online sign-up and entry fees.' },
    ],
  },
  {
    label: 'Run the business',
    items: [
      { slug: 'analytics', title: 'Analytics and the AI assistant', line: 'See how full the sheet was and what it brought in, get a written review each month, and ask questions about your day.' },
      { slug: 'team', title: 'Team and permissions', line: 'A login for each person on your staff, with permissions you set for each one.' },
    ],
  },
];

export const featureHref = (slug: FeatureSlug) => `/features/${slug}`;
