// Revenue page (Cam 2026-11-15, lanes/dashboard.md): one Stripe payout taken apart — the card
// payments in it, the refunds, Stripe's fees, GreenReserve's fees, refunds made in Stripe
// directly (no ledger row), anything else (disputes, adjustments), and the bank it went to
// (name and last four only). Read-only, on the course's own connected account: a payout id
// from another account simply isn't found there.
import { prisma } from './prisma';
import { stripe } from './stripe';

export type PayoutLine = { type: string; cents: number; stripeFeeCents: number; greenReserveFeeCents: number; refundId: string | null };

export type PayoutBreakdown = {
  cardCents: number;
  /** Refunds GreenReserve made (they have a ledger row). Negative. */
  refundsCents: number;
  /** Refunds made in the Stripe dashboard that GreenReserve has no record of. Negative. */
  stripeDirectRefundsCents: number;
  /** Stripe's own processing fees. Negative. */
  stripeFeesCents: number;
  /** GreenReserve's fees taken from the course's charges (application fees). Negative. */
  greenReserveFeesCents: number;
  /** Disputes, adjustments and anything else. */
  otherCents: number;
  /** What the payout paid (Stripe's figure). */
  payoutCents: number;
  /** The lines above add up to the payout. False = Stripe listed something we couldn't read; show the payout, not the split. */
  addsUp: boolean;
};

/**
 * Pure: the breakdown from the payout's balance transactions. `known` holds the refund ids
 * GreenReserve recorded. Each transaction's amount is gross; its fees come off separately.
 */
export function breakdownOf(lines: PayoutLine[], known: Set<string>, payoutCents: number): PayoutBreakdown {
  const b = { cardCents: 0, refundsCents: 0, stripeDirectRefundsCents: 0, stripeFeesCents: 0, greenReserveFeesCents: 0, otherCents: 0 };
  for (const l of lines) {
    if (l.type === 'charge' || l.type === 'payment') b.cardCents += l.cents;
    else if (l.type === 'refund' || l.type === 'payment_refund') {
      if (l.refundId && known.has(l.refundId)) b.refundsCents += l.cents; else b.stripeDirectRefundsCents += l.cents;
    } else b.otherCents += l.cents;
    b.stripeFeesCents -= l.stripeFeeCents;
    b.greenReserveFeesCents -= l.greenReserveFeeCents;
  }
  const sum = Object.values(b).reduce((s, x) => s + x, 0);
  return { ...b, payoutCents, addsUp: sum === payoutCents };
}

export type PayoutDetail = {
  id: string; status: string; amountCents: number; arrivalDate: string; createdAt: string;
  bank: { name: string; last4: string } | null;
  breakdown: PayoutBreakdown | null;
};

const PAYOUT_ID = /^po_[A-Za-z0-9]{6,64}$/;
const MAX_LINES = 5_000;

/** null = not found on this course's account (or no account). Throws when Stripe can't be read. */
export async function payoutDetail(courseId: string, payoutId: string): Promise<PayoutDetail | null> {
  if (!PAYOUT_ID.test(payoutId)) return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true, stripeAccountActive: true } });
  if (!course?.stripeAccountId || !course.stripeAccountActive) return null;
  const opts = { stripeAccount: course.stripeAccountId, timeout: 10_000 };
  let p;
  try { p = await stripe.payouts.retrieve(payoutId, { expand: ['destination'] }, opts); } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
  const dest = p.destination && typeof p.destination === 'object' ? p.destination as unknown as Record<string, unknown> : null;
  const bank = dest && typeof dest.last4 === 'string' ? { name: typeof dest.bank_name === 'string' ? dest.bank_name : typeof dest.brand === 'string' ? dest.brand : '', last4: dest.last4 } : null;

  // Only an automatic payout lists its transactions; a manual one has no breakdown.
  let breakdown: PayoutBreakdown | null = null;
  if (p.automatic) {
    const lines: PayoutLine[] = [];
    let n = 0, tooMany = false;
    for await (const t of stripe.balanceTransactions.list({ payout: p.id, limit: 100 }, opts)) {
      if (++n > MAX_LINES) { tooMany = true; break; }
      if (t.type === 'payout' || t.currency !== 'usd') continue;
      let sf = 0, gf = 0;
      for (const f of t.fee_details ?? []) { if (f.type === 'application_fee') gf += f.amount; else sf += f.amount; }
      const src = typeof t.source === 'string' ? t.source : (t.source as { id?: string } | null)?.id ?? null;
      lines.push({ type: t.type, cents: t.amount, stripeFeeCents: sf, greenReserveFeeCents: gf, refundId: t.type === 'refund' || t.type === 'payment_refund' ? src : null });
    }
    if (!tooMany) {
      const refundIds = lines.map(l => l.refundId).filter((x): x is string => !!x);
      // Our own refunds, this course only. A refund the webhook mirrored (actor 'stripe') was made in Stripe directly.
      const ours = refundIds.length ? await prisma.moneyMove.findMany({ where: { courseId, stripeId: { in: refundIds }, actor: { not: 'stripe' } }, select: { stripeId: true } }) : [];
      breakdown = breakdownOf(lines, new Set(ours.map(o => o.stripeId!)), p.amount);
    }
  }
  return {
    id: p.id, status: p.status, amountCents: p.amount,
    arrivalDate: new Date(p.arrival_date * 1000).toISOString(), createdAt: new Date(p.created * 1000).toISOString(),
    bank, breakdown,
  };
}
