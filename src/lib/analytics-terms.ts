// DENSE-1 (DENSE_UI_SPEC P2): what each Analytics number means, in one place.
// The page shows only a short label; this sentence sits behind it (tap or hover
// the dotted label). Client-safe — no imports — and kept in step with the
// definitions block at the top of lib/analytics.ts, which is the source of truth.
export const TERMS = {
  shopSold: 'Shop items paid for in these dates — walk-up sales, less returns, and items added to paid rounds. Before discounts and tax.',
  shopMargin: 'What sold, less what those items cost you at the cost entered today. Items with no cost are left out.',
  revenue: 'Green fees, carts and range balls paid to your course for these dates. GreenReserve’s booking fee is the golfer’s and isn’t counted.',
  fill: 'Spots booked out of every spot you offered on tee times that weren’t blocked.',
  rounds: 'Golfers who checked in and paid. One golfer, one round.',
  perRound: 'Revenue divided by rounds played: what each golfer spent with you.',
  bookings: 'Bookings for tee times in these dates that weren’t cancelled.',
  golfers: 'Different golfers who booked, matched on email, then phone. Walk-ins with neither can’t be counted.',
  cameBack: 'Golfers who have booked with you more than once, counting past visits.',
  keptFromBefore: 'Golfers from the period before who booked with you again in these dates.',
  noShows: 'Groups that hadn’t checked in by 30 minutes after their tee time, marked by staff or not, as a share of bookings whose tee time has passed.',
  cancellations: 'Bookings cancelled, not counting rounds you called off for weather or a closure.',
  bookedAhead: 'How many days before the tee time golfers booked, on average.',
  emptySpots: 'Spots nobody booked on tee times that have already gone out.',
  cartRounds: 'Paid bookings that included a cart.',
  revenueChart: 'What your course was paid for the rounds on each day. The light part of a bar is rounds that played (or no-showed) but weren’t paid yet.',
  whatFor: 'Your revenue split by what golfers paid for.',
  howPaid: 'By card is at check-in or with a pay link; at the counter is cash or your own card machine.',
  beyond: 'Carts and the pro shop. Shop sales aren’t counted in revenue. Before sales tax.',
  posted: 'Green fees on paid rounds against the price posted for each tee time. The gap is member and resident rates and prices staff set by hand.',
  comingUp: 'Bookings for tee times that haven’t happened yet, and what they’re worth when they play.',
  // DENSE-5 Members strip.
  notRenewed: 'Active members whose membership ran out and who haven’t paid to renew.',
  notLinked: 'Members who haven’t signed in to GreenReserve yet. Signing in with the email on their membership gives them member rates online.',
  memberRounds: 'Checked-in rounds by your members since January 1.',
  memberSpend: 'Green fees, carts and range balls on their checked-in rounds since January 1 — the same as Analytics. Pro-shop items aren’t counted.',
  pace: 'Players booked so far for each coming day, against the same weekday the same number of days out over the last four weeks.',
  heatFull: 'Each square is one hour on one day of the week: the share of spots booked.',
  heatEarned: 'Each square is one hour on one day of the week: what it earned for every spot offered, sold or not, on tee times already played.',
  byDow: 'The share of spots booked on each day of the week.',
  byHour: 'The share of spots booked in each hour of the day.',
  turnedAway: 'Tee times that sold out, and golfers who asked to be told when a full time opened.',
  openSpots: 'Tee times that went out with room left, most open spots first.',
  noShowRule: 'A group counts as a no-show when it hasn’t checked in 30 minutes after its tee time.',
  feePolicy: 'No-shows on bookings that had a card and a fee, against bookings with no fee.',
  cancelLead: 'How long before the tee time each cancellation came in.',
  regulars: 'The golfers who booked most often in these dates, and what they spent.',
  goneQuiet: 'Golfers with three or more rounds whose last round was more than twice their usual gap ago, and at least two weeks.',
  residents: 'Rounds paid for in these dates, from when resident rates started being recorded. Download it for your city or county.',
  channel: 'Online is your booking page; phone and walk-in are the ones your staff added on the tee sheet.',
  lead: 'How long before the tee time each booking was made.',
} as const;

export type TermKey = keyof typeof TERMS;
