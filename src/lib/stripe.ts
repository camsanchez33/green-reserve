// @brain money-movement
// Every charge, refund and SetupIntent GreenReserve makes goes through here.
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set — payments will not work');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
});

export const ACCESS_FEE_CENTS = 150; // $1.50 per player in cents
/**
 * GreenReserve's fee on a membership-dues payment (Cam 2026-10-08: "1 percent fee
 * on membership, paid by golfers whatever that price may be"): 1% of the dues,
 * rounded to the cent, ADDED to what the member pays — never taken from the
 * course's dues. Replaces the flat 50¢ that used to come out of the course's side.
 */
export const MEMBERSHIP_FEE_RATE = 0.01;
export function membershipFeeCents(duesCents: number): number {
  return duesCents > 0 ? Math.round(duesCents * MEMBERSHIP_FEE_RATE) : 0;
}

/**
 * Charges a card the platform saved (via SetupIntent on a platform Customer)
 * directly on a course's connected Stripe account — a "direct charge". The
 * course's connected account is the merchant of record and bears Stripe's
 * processing fee; GreenReserve's cut is taken via applicationFeeCents on the
 * same charge instead of a separate transfer.
 *
 * Connect doesn't let you charge a platform Customer's PaymentMethod directly
 * on a connected account, so this first clones the PaymentMethod onto the
 * connected account's books (detached, not owned by any Customer there), then
 * charges that clone off-session. This is Stripe's documented pattern for
 * "use a saved card across multiple connected accounts" — see
 * https://docs.stripe.com/connect/charges#single-customer-charges-different-connected-accounts
 */
export async function chargeOnConnectedAccount(opts: {
  customerId: string;
  paymentMethodId: string;
  connectedAccountId: string;
  amountCents: number;
  applicationFeeCents: number;
  description: string;
  /**
   * Dedup key so a double-click, race, or overlapping cron run can never
   * charge the same booking twice — Stripe returns the original request's
   * result for a repeated key instead of creating a second charge. Include
   * the PaymentMethod id in the key at the call site so a legitimate retry
   * with a NEW card (walk-up decline -> different card) gets a fresh key.
   */
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}) {
  // The clone must be idempotent too: on a retry, a fresh clone would change
  // the PaymentIntent params under the same key, which Stripe rejects.
  const clonedPaymentMethod = await stripe.paymentMethods.create(
    { customer: opts.customerId, payment_method: opts.paymentMethodId },
    { stripeAccount: opts.connectedAccountId, idempotencyKey: opts.idempotencyKey ? `${opts.idempotencyKey}-pm` : undefined }
  );

  return stripe.paymentIntents.create(
    {
      amount: opts.amountCents,
      currency: 'usd',
      payment_method: clonedPaymentMethod.id,
      confirm: true,
      off_session: true,
      application_fee_amount: opts.applicationFeeCents > 0 ? opts.applicationFeeCents : undefined,
      description: opts.description,
      // Review: lets a retry find a charge that succeeded but never reported back.
      metadata: opts.metadata,
    },
    { stripeAccount: opts.connectedAccountId, idempotencyKey: opts.idempotencyKey }
  );
}

/**
 * MEM-ACCT hardening (Cam 2026-10-31): ONE PaymentIntent per thing being paid (a statement), on the
 * course's account, created once (its own idempotency key) and stored by the caller — every attempt,
 * with any card, confirms that same intent. Stripe lets an intent succeed only once, so a retry after
 * a crash or a timeout, a second tab, or a new card can never be a second charge. A thrown error is
 * checked against the intent before it counts as a decline (a timeout may have charged).
 */
export async function chargeOneIntent(opts: {
  existingIntentId: string; intentKey: string; onCreated: (id: string) => Promise<unknown>;
  customerId: string; paymentMethodId: string; connectedAccountId: string;
  amountCents: number; applicationFeeCents: number; description: string; metadata?: Record<string, string>;
}): Promise<{ id: string; amount: number; status: string; application_fee_amount?: number | null }> {
  const acct = { stripeAccount: opts.connectedAccountId };
  let pi = opts.existingIntentId
    ? await stripe.paymentIntents.retrieve(opts.existingIntentId, {}, acct)
    : await stripe.paymentIntents.create({
        amount: opts.amountCents, currency: 'usd', payment_method_types: ['card'],
        application_fee_amount: opts.applicationFeeCents > 0 ? opts.applicationFeeCents : undefined,
        description: opts.description, metadata: opts.metadata,
      }, { ...acct, idempotencyKey: opts.intentKey });
  if (!opts.existingIntentId) await opts.onCreated(pi.id);
  // The amount changed since it was made (a course edited its dues): an unpaid intent is stopped and
  // replaced below, never confirmed at the old price.
  if (pi.status !== 'canceled' && pi.status !== 'succeeded' && pi.status !== 'processing' && pi.amount !== opts.amountCents) {
    pi = await stripe.paymentIntents.cancel(pi.id, {}, acct);
  }
  // Stopped (staff took cash, then the mark didn't happen; or the amount changed): a canceled intent
  // can't be paid, so a fresh one replaces it — still one live intent, and the old one can never charge.
  if (pi.status === 'canceled') {
    pi = await stripe.paymentIntents.create({
      amount: opts.amountCents, currency: 'usd', payment_method_types: ['card'],
      application_fee_amount: opts.applicationFeeCents > 0 ? opts.applicationFeeCents : undefined,
      description: opts.description, metadata: opts.metadata,
    }, { ...acct, idempotencyKey: `${opts.intentKey}-after-${pi.id}` });
    await opts.onCreated(pi.id);
  }
  if (pi.status === 'succeeded' || pi.status === 'processing') return pi;
  try {
    const cloned = await stripe.paymentMethods.create({ customer: opts.customerId, payment_method: opts.paymentMethodId }, { ...acct, idempotencyKey: `${pi.id}-${opts.paymentMethodId}-pm` });
    pi = await stripe.paymentIntents.confirm(pi.id, { payment_method: cloned.id, off_session: true }, { ...acct, idempotencyKey: `${pi.id}-${opts.paymentMethodId}-confirm` });
    return pi;
  } catch (err) {
    // A timeout or a lost reply may still have charged: the intent says.
    const now = await stripe.paymentIntents.retrieve(pi.id, {}, acct).catch(() => null);
    if (now && (now.status === 'succeeded' || now.status === 'processing')) return now;
    throw err;
  }
}

/** Refunds a charge that was created via chargeOnConnectedAccount — must be issued against the same connected account, not the platform account. */
export async function refundOnConnectedAccount(opts: {
  paymentIntentId: string;
  connectedAccountId: string;
  amountCents?: number; // omit to refund in full
}) {
  // Review (security, HIGH): every refund of a round charge must give back
  // GreenReserve's application fee pro rata — the refund primitive
  // (refund-booking.ts) already did, this path (cancellations) did not, so
  // the course was paying our $1.50/player on rounds it had refunded. The
  // cancellation-fee charge this also refunds carried no application fee, so
  // the flag is a no-op there.
  return stripe.refunds.create(
    { payment_intent: opts.paymentIntentId, amount: opts.amountCents, refund_application_fee: true },
    { stripeAccount: opts.connectedAccountId }
  );
}
