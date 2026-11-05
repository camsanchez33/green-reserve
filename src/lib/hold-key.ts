import { prisma } from './prisma';

/**
 * AUDIT-1 (security audit 2026-11-05): the Stripe idempotency key for a booking's cutoff hold,
 * shared by the hourly cron, the daily safety net and a late cancel racing them (one charge).
 * It used to be fixed per booking + card. When a hold is charged and then handed back because the
 * round was claimed by a check-in mid-charge, the booking is chargeable again — and a fixed key
 * would make Stripe replay the REFUNDED charge (for 24h), recording a hold that holds nothing.
 * So the key counts the holds this booking was given back: it changes only after a refund.
 * Both the ledger and the payment timeline count, so one lost write can't hide a refund.
 */
export async function holdChargeKey(bookingId: string, paymentMethodId: string): Promise<string> {
  const [moves, events] = await Promise.all([
    prisma.moneyMove.count({ where: { bookingId, what: 'hold', direction: 'out' } }),
    prisma.paymentEvent.count({ where: { bookingId, kind: 'refund', detail: { startsWith: 'Cutoff hold refunded' } } }),
  ]);
  const back = moves + events;
  return `cancelfee-${bookingId}-${paymentMethodId}${back ? `-r${back}` : ''}`;
}
