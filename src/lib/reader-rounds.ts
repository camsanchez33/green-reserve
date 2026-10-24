// POS-3 R3b (Cam 2026-10-24, "Ok go"): a group's round paid on the course's
// card reader. It becomes a real card payment of the booking, exactly like a
// pay link: one card_present PaymentIntent on the course's account for
// roundChargeCents (round + items on the round + their tax), with GreenReserve's
// fee as the application fee (roundApplicationFeeCents — the $1.50/player of an
// online booking; a walk-in or phone booking carries none). When the card goes
// through, performCheckIn records it ({ cardPresent }): paid, checked in,
// receipt, the cutoff hold refunded, the shop tax recorded — the same code as
// every card check-in, so refunds work from the booking as for any round.
//
// One group per tap. While a group is on the reader the booking is CLAIMED
// (Booking.readerStartedAt): the pay link, card check-in and cash at the
// counter refuse it, and its shop items are frozen (shopLockedAt, the same lock
// a card charge takes) so the amount on the reader can't change. The claim
// ends paid, or — only when Stripe says the intent is unpaid — released with
// the intent cancelled, so a later tap can never pay it. A card that goes
// through on a booking that was meanwhile paid another way or cancelled is
// refunded in full: two payments for one round are never kept. A claim left 10
// minutes is settled from Stripe by the next thing that touches the round.
import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { courseStripe, ownReader, stripeMessage } from './card-reader';
import { performCheckIn, READER_STALE_MS as READER_STALE } from './checkin-booking';
import { ensureShopTax } from './round-shop-tax';
import { roundChargeCents, roundApplicationFeeCents } from './shop';
import { recordPaymentEvent } from './refund-booking';
import type { EventActor } from './booking-events';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
export type RoundReaderStatus = { status: 'waiting' | 'paid' | 'declined' | 'cancelled' | 'refunded' | 'open'; message?: string; dueCents?: number };

const MONEY = { totalAmount: true, accessFeeTotal: true, feePaidCents: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true } as const;
const done = (s: string) => s === 'paid' || s === 'paid_offline';

/** End this claim (only the claim with this stamp) and unfreeze the items it froze. */
async function release(bookingId: string, stamp: Date) {
  await prisma.booking.updateMany({ where: { id: bookingId, readerStartedAt: stamp }, data: { readerStartedAt: null, readerId: '', readerIntentId: '' } });
  await prisma.booking.updateMany({ where: { id: bookingId, shopLockedAt: stamp }, data: { shopLockedAt: null } });
}

/** Send a group's round to a reader. */
export async function startRoundOnReader(courseId: string, bookingId: string, readerId: string, actor: EventActor): Promise<Result<RoundReaderStatus>> {
  const c = await courseStripe(courseId);
  if (!c.ok) return c;
  let b = await prisma.booking.findFirst({ where: { id: bookingId, courseId }, select: { status: true, paymentStatus: true, readerStartedAt: true } });
  if (!b) return fail(404, 'That group isn’t on your tee sheet — refresh and try again.');
  if (b.readerStartedAt && Date.now() - b.readerStartedAt.getTime() > READER_STALE) {
    await settleRoundReader(courseId, bookingId, actor);
    b = await prisma.booking.findFirst({ where: { id: bookingId, courseId }, select: { status: true, paymentStatus: true, readerStartedAt: true } });
    if (!b) return fail(404, 'That group isn’t on your tee sheet — refresh and try again.');
  }
  if (b.readerStartedAt) return fail(409, 'This group is already on the card reader — wait for it, or cancel it.');
  if (b.status !== 'confirmed' || done(b.paymentStatus)) return fail(409, 'This group has already paid or checked in — refresh and try again.');
  const reader = await ownReader(c.value.account, c.value.terminalLocationId, readerId);
  if (!reader.ok) return reader;

  const stamp = new Date();
  const claimed = await prisma.booking.updateMany({
    where: { id: bookingId, courseId, status: 'confirmed', readerStartedAt: null, paymentStatus: { notIn: ['paid', 'paid_offline'] } },
    data: { readerStartedAt: stamp, readerId, readerIntentId: '' },
  });
  if (!claimed.count) return fail(409, 'This group changed at the same moment — refresh and try again.');
  // Freeze the items on the round (the lock a card charge takes) and price them now, under it.
  await prisma.booking.update({ where: { id: bookingId }, data: { shopLockedAt: stamp } });
  const taxed = await ensureShopTax(bookingId, { ownLock: stamp });
  if (!taxed.ok) { await release(bookingId, stamp); return fail(503, taxed.error); }
  const money = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: MONEY });
  const amount = roundChargeCents(money);
  const fee = roundApplicationFeeCents(money);
  if (amount < 50) { await release(bookingId, stamp); return fail(400, 'Card payments start at $0.50 — take this one as cash.'); }

  // Paid by card already (a pay link that went through, a lost confirmation)? Never a second charge.
  try {
    const found = await stripe.paymentIntents.search({ query: `metadata['bookingId']:'${bookingId}' AND status:'succeeded'`, limit: 1 }, { stripeAccount: c.value.account });
    if (found.data.length) { await release(bookingId, stamp); return fail(409, 'This round was already paid by card — check them in from the tee sheet.'); }
  } catch (err) {
    console.warn(JSON.stringify({ ev: 'reader_round.search_failed', bookingId, error: err instanceof Error ? err.message : String(err) }));
  }

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount, currency: 'usd', payment_method_types: ['card_present'],
      application_fee_amount: fee > 0 ? fee : undefined,
      description: `Round charge - ${c.value.name} - booking ${bookingId}`,
      metadata: { bookingId, source: 'card_reader' },
    }, { stripeAccount: c.value.account, idempotencyKey: `reader-round-${bookingId}-${stamp.getTime()}` });
  } catch (err) {
    await release(bookingId, stamp); // no intent → nothing can be charged
    return fail(502, stripeMessage(err, 'Card payments are not working right now — try again, or take cash.'));
  }
  await prisma.booking.updateMany({ where: { id: bookingId, readerStartedAt: stamp }, data: { readerIntentId: pi.id } });
  try {
    await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: pi.id }, { stripeAccount: c.value.account, idempotencyKey: `reader-process-${pi.id}` });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'reader_round.process.fail', bookingId, readerId, error: err instanceof Error ? err.message : String(err) }));
    if (err instanceof Stripe.errors.StripeInvalidRequestError || err instanceof Stripe.errors.StripeCardError) {
      // The reader refused the job: nothing was presented. Stop the intent so nothing can pay it later.
      await stripe.paymentIntents.cancel(pi.id, {}, { stripeAccount: c.value.account }).catch(() => {});
      await release(bookingId, stamp);
      return fail(409, stripeMessage(err, 'The card reader didn’t take the payment — try again.'));
    }
    // Unsure whether the reader got it: keep the claim; the status checks settle it.
    return { ok: true, value: { status: 'waiting', dueCents: amount, message: 'Checking whether the reader got the payment…' } };
  }
  return { ok: true, value: { status: 'waiting', dueCents: amount } };
}

/**
 * The card went through. Record it on the booking through performCheckIn —
 * unless the round was meanwhile paid another way or cancelled: then this
 * payment is refunded in full (GreenReserve's fee with it).
 */
async function finalize(courseId: string, bookingId: string, pi: Stripe.PaymentIntent, stamp: Date, account: string, actor: EventActor): Promise<RoundReaderStatus> {
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { status: true, paymentStatus: true, roundPaymentIntentId: true } });
  if (b.roundPaymentIntentId === pi.id && done(b.paymentStatus)) {
    await release(bookingId, stamp).catch(() => {});
    return { status: 'paid' };
  }
  const duplicate = b.status !== 'confirmed' || done(b.paymentStatus);
  if (!duplicate) {
    const r = await performCheckIn(bookingId, actor, { cardPresent: { paymentIntentId: pi.id, amountCents: pi.amount } });
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { roundPaymentIntentId: true, paymentStatus: true } });
    if (after.roundPaymentIntentId === pi.id && done(after.paymentStatus)) {
      // The items stay frozen (paid); only the claim ends.
      await prisma.booking.updateMany({ where: { id: bookingId, readerStartedAt: stamp }, data: { readerStartedAt: null } });
      return { status: 'paid' };
    }
    console.error(JSON.stringify({ ev: 'reader_round.record.fail', bookingId, paymentIntentId: pi.id, error: 'error' in r ? r.error : 'not recorded' }));
  }
  // Paid twice (or for a round no longer playing): give this one back.
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: pi.id, refund_application_fee: true, metadata: { bookingId, why: 'reader_duplicate' } },
      { stripeAccount: account, idempotencyKey: `reader-dup-refund-${pi.id}` },
    );
    await recordPaymentEvent({ bookingId, kind: 'refund', amountCents: refund.amount, stripeId: refund.id, actor: 'system', detail: 'Card reader payment refunded — the round was already paid or cancelled' }).catch(() => {});
    await release(bookingId, stamp);
    return { status: 'refunded', message: 'This round was already paid or cancelled, so the card payment was refunded in full.' };
  } catch (err) {
    // Leave the claim: the next look tries the refund again. Say so, never "paid".
    console.error(JSON.stringify({ ev: 'reader_round.dup_refund.fail', bookingId, paymentIntentId: pi.id, error: err instanceof Error ? err.message : String(err) }));
    return { status: 'waiting', message: 'The card went through but the round was already paid — refunding it failed; it will be tried again. Don’t take any more payment.' };
  }
}

/**
 * Where a round on the reader stands. stopFirst (cancel, a stale claim): stop
 * the reader before deciding. Released only when the intent is unpaid and has
 * been cancelled.
 */
async function evaluate(courseId: string, bookingId: string, actor: EventActor, stopFirst: boolean): Promise<Result<RoundReaderStatus>> {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, courseId }, select: { readerStartedAt: true, readerId: true, readerIntentId: true, paymentStatus: true, roundPaymentIntentId: true, course: { select: { stripeAccountId: true } } } });
  if (!b) return fail(404, 'That group isn’t on your tee sheet.');
  const stamp = b.readerStartedAt;
  if (!stamp) return { ok: true, value: { status: done(b.paymentStatus) ? 'paid' : 'open' } };
  const account = b.course.stripeAccountId;
  if (!account) return fail(409, 'Stripe isn’t connected.');
  if (!b.readerIntentId) {
    // Claimed but no intent was made: nothing can have been charged.
    if (Date.now() - stamp.getTime() > 60_000 || stopFirst) { await release(bookingId, stamp); return { ok: true, value: { status: 'cancelled' } }; }
    return { ok: true, value: { status: 'waiting' } };
  }
  try {
    let pi = await stripe.paymentIntents.retrieve(b.readerIntentId, {}, { stripeAccount: account });
    if (pi.status === 'requires_capture') pi = await stripe.paymentIntents.capture(pi.id, {}, { stripeAccount: account, idempotencyKey: `reader-capture-${pi.id}` });
    if (pi.status === 'succeeded') return { ok: true, value: await finalize(courseId, bookingId, pi, stamp, account, actor) };
    if (pi.status === 'processing') return { ok: true, value: { status: 'waiting' } };

    const r = await stripe.terminal.readers.retrieve(b.readerId, {}, { stripeAccount: account }).catch(() => null);
    const action = r && !('deleted' in r && r.deleted) ? (r as Stripe.Terminal.Reader).action : null;
    const mine = !!action && action.type === 'process_payment_intent' && action.process_payment_intent?.payment_intent === pi.id;
    if (mine && action!.status === 'in_progress') {
      if (!stopFirst) return { ok: true, value: { status: 'waiting' } };
      try {
        await stripe.terminal.readers.cancelAction(b.readerId, {}, { stripeAccount: account });
      } catch {
        return { ok: true, value: { status: 'waiting', message: 'The card is already going through — wait a moment.' } };
      }
      pi = await stripe.paymentIntents.retrieve(pi.id, {}, { stripeAccount: account });
      if (pi.status === 'succeeded') return { ok: true, value: await finalize(courseId, bookingId, pi, stamp, account, actor) };
      if (pi.status === 'processing') return { ok: true, value: { status: 'waiting' } };
    } else if (mine && action!.status === 'succeeded') {
      return { ok: true, value: { status: 'waiting' } }; // the intent catches up on the next look
    }
    // Unpaid: stop the intent for good, then end the claim.
    if (pi.status !== 'canceled') {
      try {
        await stripe.paymentIntents.cancel(pi.id, {}, { stripeAccount: account });
      } catch (err) {
        const again = await stripe.paymentIntents.retrieve(pi.id, {}, { stripeAccount: account });
        if (again.status === 'succeeded') return { ok: true, value: await finalize(courseId, bookingId, again, stamp, account, actor) };
        return fail(502, stripeMessage(err, 'Couldn’t stop the card payment — try again.'));
      }
    }
    await release(bookingId, stamp);
    if (mine && action!.status === 'failed') return { ok: true, value: { status: 'declined', message: action!.failure_message || 'The card was declined.' } };
    return { ok: true, value: { status: 'cancelled' } };
  } catch (err) {
    return fail(502, stripeMessage(err, 'Couldn’t check the card reader — try again.'));
  }
}

/** The register asks this every 2 seconds while a group is on the reader. */
export const roundReaderStatus = (courseId: string, bookingId: string, actor: EventActor) => evaluate(courseId, bookingId, actor, false);
/** Staff cancel: stop the reader, then decide from Stripe. */
export const cancelRoundOnReader = (courseId: string, bookingId: string, actor: EventActor) => evaluate(courseId, bookingId, actor, true);
/** A claim left 10 minutes: stop the reader and settle it (called before anything else charges the round). */
export async function settleRoundReader(courseId: string, bookingId: string, actor: EventActor): Promise<void> {
  const r = await evaluate(courseId, bookingId, actor, true);
  if (!r.ok) console.error(JSON.stringify({ ev: 'reader_round.settle.fail', bookingId, error: r.error }));
}
