// Homepage redo (Cam 2026-11-18): the seven feature pages, one template (src/app/features/[slug]/page.tsx).
// Words are the approved mockup's (lanes/homepage/homepage-mockup.html), word for word. Every picture is a
// real screenshot of the seeded test course, taken by scripts/screenshots/capture.ts into
// public/home/shots/features/<slug>-<n>.png. The Payments page's cost list is the LQ-2 sentences only
// (legal/LQ-2_FEE_COPY.md); its shop line shows only once Agreement v2026-12 is in effect.
import type { FeatureSlug } from './features';

export type FeatureSection = {
  h: string;
  p: string[];
  /** A laptop or phone screenshot; 'costs' is the Payments page's fee list beside the scorecard. */
  media: { device: 'laptop' | 'phone'; shot: string; alt: string } | { device: 'costs' };
};

export type FeaturePage = { slug: FeatureSlug; title: string; line: string; sections: FeatureSection[]; tryIt?: boolean };

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: 'tee-sheet', title: "Tee sheet and online booking.", line: "Every booking on one sheet, and a booking page in your course’s own look.",
    tryIt: true,
    sections: [
      { h: "Every booking on one sheet.", p: ["Online, phone and walk-in bookings land on the same sheet. The top line shows players booked, groups on the course, who has checked in, what is paid and what isn’t yet. Each group’s color says whether it has paid."], media: { device: 'laptop', shot: 'tee-sheet-1', alt: "The tee sheet for Tuesday with the day’s numbers along the top and groups by tee time" } },
      { h: "A booking page in your colors.", p: ["Golfers pick a day, their players, holes and walking or riding, and see only the times that fit. You choose a light or dark page and an outline color, and link it from your own website."], media: { device: 'phone', shot: 'tee-sheet-2', alt: "The golfer booking page listing morning tee times with prices" } },
      { h: "Golfers hear when a time opens.", p: ["When a day is full, a golfer can ask to be emailed, or texted if they agree, the moment a time opens. The first golfer to book gets it, and nothing is held."], media: { device: 'phone', shot: 'tee-sheet-3', alt: "The tee time alert form over the booking page" } },
    ],
  },
  {
    slug: 'payments', title: "Payments.", line: "Golfers pay online, at the counter or on their own phone, into your own Stripe account.",
    sections: [
      { h: "Paid on their own phone.", p: ["Text a group a pay link and each golfer checks in and pays on their own phone. They see every line, including the booking fee, before they pay."], media: { device: 'phone', shot: 'payments-1', alt: "A golfer’s phone showing the check-in page with the itemized total and a card field" } },
      { h: "Your policy, shown before they book.", p: ["Golfers see your cancellation policy in plain words and tick a box to agree before they book. When your policy has late-cancel or no-show fees, golfers save a card when they book, so the fee is covered."], media: { device: 'phone', shot: 'payments-2', alt: "The booking page with range balls, the total, the course’s cancellation policy and the agree box" } },
      { h: "At the counter, too.", p: ["Staff open a group on the tee sheet to check it in. Payment at the counter can be cash, a Stripe card reader or a pay link texted to the golfer."], media: { device: 'laptop', shot: 'payments-3', alt: "A group opened on the tee sheet with its players, price and Check in button" } },
      { h: "Every payment in one place.", p: ["Revenue lists every payment by day, with your payouts, the ledger and cancellations beside it."], media: { device: 'laptop', shot: 'payments-4', alt: "The Revenue page listing today’s payments" } },
      { h: "What it costs.", p: ["No setup fee, no monthly fee, no commission on your green fees."], media: { device: 'costs' } },
    ],
  },
  {
    slug: 'pro-shop', title: "Pro shop and range.", line: "A register for walk-up sales, with stock counts and a daily close-out, on the same system as your tee sheet.",
    sections: [
      { h: "Ring it up at the register.", p: ["Tap items to build a sale, add a discount if you need one, and charge it. Take cash, use a Stripe card reader or text the customer a pay link."], media: { device: 'laptop', shot: 'pro-shop-1', alt: "The pro shop register with item tiles and a sale of a large range bucket and a hot dog" } },
      { h: "Know what’s on the shelf.", p: ["Count stock if you want to. Add new stock with what it cost you, and set a number to get an email when an item runs low."], media: { device: 'laptop', shot: 'pro-shop-2', alt: "The Stock tab listing items with how many are in stock, and one item open to add stock" } },
      { h: "Close out the drawer.", p: ["At the end of the day, count the drawer by bill and coin. You see what should be in it and the difference, and card sales are listed for reference."], media: { device: 'laptop', shot: 'pro-shop-3', alt: "The Close out tab with the drawer count and what should be in the drawer" } },
      { h: "Range balls with the round.", p: ["Golfers can add a range bucket when they book, at the prices you set. The same buckets sell at the register."], media: { device: 'phone', shot: 'pro-shop-4', alt: "The booking page with the golfer’s details, cart choice and range buckets" } },
    ],
  },
  {
    slug: 'memberships', title: "Memberships and log-in.", line: "Your memberships, members and residents, with a log-in on your booking page.",
    sections: [
      { h: "Every membership in one list.", p: ["Set up each membership with its price, its rates and how far ahead members can book. Residents get the resident rate once you add them."], media: { device: 'laptop', shot: 'memberships-1', alt: "The Memberships page with Full Member, Senior and Junior, the residents list and member pricing" } },
      { h: "Who has paid, and who hasn’t.", p: ["Each membership lists its members, whether their dues are paid and through when. Remind everyone who is overdue in one step."], media: { device: 'laptop', shot: 'memberships-2', alt: "The Full Member page listing members with their dues status" } },
      { h: "Members log in on your booking page.", p: ["Members and residents log in with their email and a 6-digit code. Everyone else books as a guest, with no account."], media: { device: 'phone', shot: 'memberships-3', alt: "The Log in page on the course’s booking page" } },
      { h: "They see their own rates.", p: ["Once logged in, every tee time shows their price beside the public one, and the days their longer booking window opens."], media: { device: 'phone', shot: 'memberships-4', alt: "Tee times showing member prices beside the public price" } },
    ],
  },
  {
    slug: 'events', title: "Events.", line: "Tournaments, leagues and outings, held on your tee sheet, with sign-up and entry fees.",
    sections: [
      { h: "Every event on one page.", p: ["See what’s coming up, how many players have signed up, what’s owed and what is still to do."], media: { device: 'laptop', shot: 'events-1', alt: "The Events page listing a league, a tournament and an outing with players and money owed" } },
      { h: "Set up step by step.", p: ["Each event holds its tee times, sets the price per player and what’s included, and walks you through a checklist until it’s ready."], media: { device: 'laptop', shot: 'events-2', alt: "A tournament page with registration, money collected and its checklist" } },
      { h: "Golfers sign up online.", p: ["Open sign-up and golfers enter themselves and their group from the event’s own page."], media: { device: 'phone', shot: 'events-3', alt: "The event sign-up page with the entry price, what’s included and the sign-up form" } },
    ],
  },
  {
    slug: 'analytics', title: "Analytics and the AI assistant.", line: "How your course is doing, in plain words, and an assistant that knows your day.",
    sections: [
      { h: "See where the empty times are.", p: ["Your busiest and quietest hours, the spots that went unsold and what they were worth, and where the next 30 days are heading."], media: { device: 'laptop', shot: 'analytics-1', alt: "Analytics showing unsold spots, busiest and quietest hours and projections for the next 30 days" } },
      { h: "A written review every month.", p: ["At the start of every month you get a written review of the month before, built only from your own numbers."], media: { device: 'laptop', shot: 'analytics-2', alt: "The monthly review for October" } },
      { h: "An assistant that knows your course.", p: ["Ask who’s still to check in or how last week went, and it answers from your own tee sheet. It can draft a change, like a pay link, and nothing happens until you confirm it."], media: { device: 'laptop', shot: 'analytics-3', alt: "The assistant answering who is still to check in and drafting a pay link to confirm" } },
    ],
  },
  {
    slug: 'team', title: "Team and permissions.", line: "A log-in for each person on your staff, and what each one can do.",
    sections: [
      { h: "Everyone in one place.", p: ["Invite your staff and put each person in a role. You see when each person was last active."], media: { device: 'laptop', shot: 'team-1', alt: "The Team page with the owner, a manager, front desk and a starter" } },
      { h: "Roles you set.", p: ["Each role says what it can do, area by area: the tee sheet, payments, the pro shop, members and events, reports and settings."], media: { device: 'laptop', shot: 'team-2', alt: "The Roles tab listing what each role can do" } },
      { h: "Change one person, not the role.", p: ["Open a person to change any area for just them. Areas that move money are marked."], media: { device: 'laptop', shot: 'team-3', alt: "A staff member’s permissions by area, with areas that move money marked" } },
    ],
  },
];

export const featurePage = (slug: string) => FEATURE_PAGES.find(p => p.slug === slug);

/**
 * The Payments page's cost list (legal/LQ-2_FEE_COPY.md sentences only), in one place: the page renders it and the
 * homepage bot answers fee questions with exactly these lines (ASSIST-5), so the two can never differ. The shop line
 * shows only once Agreement v2026-12 is in effect (lib/shop-fee shopFeeVersionLive).
 */
export function paymentsCostLines(shopFee: boolean): string[] {
  return [
    'Golfers pay $1.50 per player on each online booking, added to your price.',
    'Membership dues collected through GreenReserve carry 1% of the dues (and any initiation fee), added to what the member pays.',
    ...(shopFee ? ['Pro-shop items paid by card carry a GreenReserve service fee of 1% of the items; cash carries none.'] : []),
    'Your green fee and our fee are collected in one card payment to your own Stripe account; our $1.50 per player is then passed to GreenReserve.',
    "Stripe's standard card-processing fee applies to the payment, the same as any card you take today. GreenReserve charges you nothing on top of it.",
  ];
}
