// BIRDIE_AI_SPEC B1 — the operator knowledge pack. Curated, in code, so the
// assistant can never drift from what the dashboard actually does. Seeded from
// the V13 tab intros and the dashboard pages themselves. Every how-to ends
// with the deep link Birdie should offer.

export type DashboardPage = { key: string; label: string; href: string; does: string };

export const DASHBOARD_PAGES: DashboardPage[] = [
  { key: 'teesheet', label: 'Tee Sheet', href: '/dashboard', does: "today's and upcoming tee times, check-ins, walk-ins, blocking a time, closing a day" },
  { key: 'analytics', label: 'Analytics', href: '/dashboard?tab=analytics', does: 'rounds, revenue and booking trends' },
  { key: 'cancellations', label: 'Cancellations', href: '/dashboard/money?tab=cancellations', does: 'cancelled bookings, late-cancellation fees and the cancellation policy' },
  { key: 'schedule', label: 'Schedule', href: '/dashboard/schedules', does: 'the templates that generate tee times: days, hours, interval, green fees, member and resident rates, cart fee, blocked days, booking windows, and which round each schedule sells' },
  { key: 'members', label: 'Members', href: '/dashboard/members', does: 'membership tiers, member accounts, dues' },
  { key: 'payments', label: 'Money', href: '/dashboard/money', does: 'what was collected, cancellations, and the Stripe connection and payouts' },
  { key: 'messages', label: 'Messages', href: '/dashboard/messages', does: 'messages with GreenReserve' },
  { key: 'settings', label: 'Settings', href: '/dashboard/settings', does: 'course info, cancellation policy and fee, check-in window, walking policy, brand colour, photos, staff logins, course and layout (nines, products, tee sets)' },
];

/** Markdown the model reads. Keep it factual and short; it is sent on every message. */
export const OPERATOR_KNOWLEDGE = `
# How the dashboard works

## Tee Sheet (/dashboard)
- Shows the day's tee times. Tap a time to see bookings, check a party in (whole or partial), add a walk-in or phone booking, mark a no-show, or block the time so nobody can book it.
- "Close a day" (weather) blocks every open time that day and emails golfers who had bookings.
- Times marked "Next up" are the next tee-off. Blocked times show hatched.

## Schedule (/dashboard/schedules)
- A schedule is a recipe: days of the week, first and last tee, interval (minutes between tee times), green fee weekday/weekend, optional member and resident rates, cart fee, walking allowed. GreenReserve generates real tee times from it every night for the days ahead, and immediately when a schedule is saved.
- To change weekend rates: open Schedule, edit the schedule, change "Green Fee — Weekend", save. Future open times update at once; booked times never change.
- Twilight or early-bird pricing: add a second schedule with a different tier name and its own hours.
- Blocked days: the "Blocked days" box on Schedule stops generation for a date (holiday, outing).
- Booking windows (how far ahead the public and members can book) are on Schedule too.
- Courses with more than one bookable round (for example a 27-hole course selling "North + South" and "South + West"): every schedule belongs to one round; two rounds that share a nine cannot run at the same time and the save will say so. Rounds themselves are set up under Settings → Course & Layout.
- "Apply to Tee Sheet" rebuilds the next 8 days of open times from the schedules right now.

## Cancellation policy (/dashboard/settings)
- Settings holds the cancellation window (hours before the tee time) and the late-cancellation fee. Golfers who cancel inside the window are charged the fee automatically; it is refunded if they still check in.
- Courses with no fee do not collect a card at booking.

## Check-in and payment
- Nothing is charged at booking. Golfers save a card; the green fee is charged at check-in (staff check-in on the Tee Sheet, or the golfer's own check-in link from their confirmation email). Counter payments can be marked "paid at the counter".
- The check-in window (how early a golfer can self check in) is in Settings.

## Stripe (/dashboard/money?tab=payouts)
- Payments shows whether Stripe is connected and lets you connect or finish onboarding. Green fees go to the course's own Stripe account; GreenReserve's $1.50 per player service fee is paid by the golfer.
- Payouts follow Stripe's schedule; the Payments page lists what was collected.

## Members (/dashboard/members)
- Create membership tiers (dues, per-round rate, advance-booking days). Members sign in on the course's own page and see member pricing. Add a member by email; they get an invite.

## Settings (/dashboard/settings)
- Course info (name, address, holes, par), photos and brand colour (the golfer page wears it), cancellation policy, check-in window, walking policy, staff logins (tee-sheet access), and Course & Layout for nines and bookable rounds.
- The course goes live when GreenReserve flips it after the preview is approved and Stripe is connected.

## Messages (/dashboard/messages)
- Write to GreenReserve here; replies land here and by email.
`;
