// LEDGER-1 (Cam 2026-10-30, "one new money table"): every dollar that moves for a
// course is one MoneyMove row, written here at the moment it moves — a card charge
// or refund on the course's Stripe account or GreenReserve's, cash taken or given
// back at the counter, dues, shop and event payments.
//
//  • Append-only. A refund is its own row ('out'), never an edit of the charge.
//  • stripeId (the PaymentIntent for a charge, the Refund for a refund) is unique,
//    so a retry, a reconcile or the webhook recording the same movement is a no-op.
//  • recordMove never throws: the money has already moved, and a ledger hiccup must
//    not turn a charge the golfer paid into an error. A miss is logged loudly
//    (ev 'money_ledger.write_failed') and reported to Sentry.
//  • scripts/money-ledger-test.ts fails on any file that moves money through Stripe
//    without calling recordMove.
import * as Sentry from '@sentry/nextjs';
import { prisma } from './prisma';

export type MoveWhat = 'round' | 'hold' | 'late_fee' | 'no_show_fee' | 'booking_fee' | 'shop' | 'dues' | 'event' | 'account';
export type MoveMethod = 'card' | 'card_present' | 'cash' | 'other';

export type Move = {
  courseId: string;
  what: MoveWhat;
  direction: 'in' | 'out';
  method: MoveMethod;
  /** 'course' = the course's Stripe account or till; 'platform' = GreenReserve's account. */
  account: 'course' | 'platform';
  amountCents: number;
  /** GreenReserve's part: the application fee taken or given back, or the whole of a platform row. */
  platformFeeCents?: number;
  stripeId?: string | null;
  bookingId?: string | null;
  saleId?: string | null;
  membershipId?: string | null;
  eventPaymentId?: string | null;
  actor?: string;
  note?: string;
  at?: Date;
};

type Db = Pick<typeof prisma, 'moneyMove'>;

/** Record one movement. Zero and negative amounts are not money moving and are skipped. */
export async function recordMove(m: Move, db: Db = prisma): Promise<void> {
  if (!Number.isFinite(m.amountCents) || m.amountCents <= 0) return;
  try {
    const made = await db.moneyMove.createMany({
      data: [{
        courseId: m.courseId, what: m.what, direction: m.direction, method: m.method, account: m.account,
        amountCents: Math.round(m.amountCents),
        platformFeeCents: Math.max(0, Math.round(m.account === 'platform' ? m.amountCents : (m.platformFeeCents ?? 0))),
        stripeId: m.stripeId || null,
        bookingId: m.bookingId ?? null, saleId: m.saleId ?? null, membershipId: m.membershipId ?? null, eventPaymentId: m.eventPaymentId ?? null,
        actor: m.actor ?? 'system', note: (m.note ?? '').slice(0, 300),
        ...(m.at ? { at: m.at } : {}),
      }],
      // The same Stripe object recorded twice (a retry, the webhook) is one row.
      skipDuplicates: true,
    });
    // The webhook can record our own refund first (mirrorMove, actor 'stripe'), without
    // GreenReserve's share — that placeholder takes this call's figures.
    if (!made.count && m.stripeId && m.actor !== 'stripe') {
      await db.moneyMove.updateMany({ where: { stripeId: m.stripeId, actor: 'stripe' }, data: { platformFeeCents: Math.max(0, Math.round(m.account === 'platform' ? m.amountCents : (m.platformFeeCents ?? 0))), actor: m.actor ?? 'system', note: (m.note ?? '').slice(0, 300) } });
    }
  } catch (err) {
    console.error(JSON.stringify({ ev: 'money_ledger.write_failed', courseId: m.courseId, what: m.what, direction: m.direction, amountCents: m.amountCents, stripeId: m.stripeId ?? null, bookingId: m.bookingId ?? null, error: err instanceof Error ? err.message : String(err) }));
    Sentry.captureException(err, { tags: { area: 'money_ledger', what: m.what } });
  }
}

/** GreenReserve's share of a part refund when the application fee is given back pro rata (Stripe's refund_application_fee). */
export function feeBackCents(refundCents: number, chargedCents: number, appFeeCents: number): number {
  if (chargedCents <= 0 || appFeeCents <= 0) return 0;
  return Math.min(appFeeCents, Math.round(appFeeCents * Math.min(refundCents, chargedCents) / chargedCents));
}

/** What a charge was recorded as (a refund of it is the same kind), or the fallback for one from before the ledger. */
export async function chargeWhat(stripeId: string | null | undefined, fallback: MoveWhat): Promise<MoveWhat> {
  if (!stripeId) return fallback;
  const row = await prisma.moneyMove.findUnique({ where: { stripeId }, select: { what: true } }).catch(() => null);
  return (row?.what as MoveWhat | undefined) ?? fallback;
}

/**
 * Money Stripe moved on a charge we recorded — a refund made in the Stripe dashboard,
 * or a dispute taking the money back (and returning it if the course wins). Recorded
 * as the original charge's kind, against the same booking, sale, member or event.
 * Our own refunds record themselves first; the refund id makes this a no-op then.
 * A charge from before the ledger (no row) is skipped.
 */
export async function mirrorMove(chargeStripeId: string, m: { direction: 'in' | 'out'; amountCents: number; stripeId: string; note: string }): Promise<boolean> {
  if (!chargeStripeId) return false;
  const orig = await prisma.moneyMove.findUnique({ where: { stripeId: chargeStripeId } }).catch(() => null);
  if (!orig) return false;
  await recordMove({
    courseId: orig.courseId, what: orig.what as MoveWhat, direction: m.direction, method: orig.method as MoveMethod, account: orig.account as 'course' | 'platform',
    amountCents: m.amountCents, stripeId: m.stripeId, bookingId: orig.bookingId, saleId: orig.saleId, membershipId: orig.membershipId, eventPaymentId: orig.eventPaymentId,
    actor: 'stripe', note: m.note,
  });
  return true;
}
