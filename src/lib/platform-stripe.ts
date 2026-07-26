import { stripe } from '@/lib/stripe';

// EXPENSE TRACKER (RUN_QUEUE) — the AUTOMATIC half of the P&L: what Stripe
// charges GreenReserve to collect its own application fees. GR's $1.50/player
// is taken as an application_fee_amount on the course's connected-account
// charge (see stripe.ts), so on GR's PLATFORM balance each collected fee is
// an `application_fee` balance transaction whose `fee` field is Stripe's cut
// of it. Summing that `fee` across the window is the honest processing cost —
// if Stripe reports 0 (the connected account already bore processing on the
// full charge), the automatic cost is genuinely $0, not a guess.
//
// Shared so the A2b platform card and the P&L statement can never disagree
// about the same number.
export async function fetchStripeProcessingCostCents(startUnix: number, endUnix: number): Promise<number> {
  let total = 0;
  let startingAfter: string | undefined;
  let guard = 0;
  // Bounded pagination — the same safety net the A2b application-fee fetch uses.
  while (guard < 20) {
    const page = await stripe.balanceTransactions.list({
      type: 'application_fee',
      created: { gte: startUnix, lt: endUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const txn of page.data) total += txn.fee ?? 0;
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
    guard++;
  }
  return total;
}
