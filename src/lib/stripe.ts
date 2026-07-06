import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set — payments will not work');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
});

export const ACCESS_FEE_CENTS = 150; // $1.50 per player in cents

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
    },
    { stripeAccount: opts.connectedAccountId, idempotencyKey: opts.idempotencyKey }
  );
}

/** Refunds a charge that was created via chargeOnConnectedAccount — must be issued against the same connected account, not the platform account. */
export async function refundOnConnectedAccount(opts: {
  paymentIntentId: string;
  connectedAccountId: string;
  amountCents?: number; // omit to refund in full
}) {
  return stripe.refunds.create(
    { payment_intent: opts.paymentIntentId, amount: opts.amountCents },
    { stripeAccount: opts.connectedAccountId }
  );
}
