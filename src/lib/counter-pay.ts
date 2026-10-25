// A group pays for its round at the counter (cash, or the course's own card
// machine): checked in, no Stripe charge, no GreenReserve fee (PAY-2: "we are
// just going to have to eat it"). ONE place for it — the tee sheet's
// "Paid at the counter" and (POS-3 R2) the register both call settleAtCounter.
//
// CLAUDE.md: this completes the booking WITHOUT performCheckIn, so anything
// that must happen on every check-in is done here too: the checked_in event,
// the shop items' sales tax, refunding a hold fee taken after the cutoff, and
// refunding a booking fee already taken on its own.
import { prisma } from './prisma';
import { ensureShopTax, recordRoundShopTax } from './round-shop-tax';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';
import { refundSeparateAccessFee, liveSeparateFee } from './access-fee';
import { refundOnConnectedAccount } from './stripe';
import { claimTeeTime, TeeTimeClaimError } from './claim-tee-time';
import { todayIn } from './course-time';
import { randomUUID } from 'crypto';
import { READER_STALE_MS } from './checkin-booking';

export type CounterResult =
  | { ok: true; amountCents: number; note: string | null }
  | { ok: false; status: number; error: string };

/** What the group hands over at the counter: the round less GreenReserve's fee, plus shop items and their tax. */
export function counterDueCents(b: { totalAmount: number; accessFeeTotal: number; players: number; shopTotalCents?: number | null; shopTaxCents?: number | null }, showed?: number): number {
  const who = showed ?? b.players;
  return Math.round((b.totalAmount - (b.accessFeeTotal ?? 0)) * who / b.players) + (b.shopTotalCents ?? 0) + (b.shopTaxCents ?? 0);
}

export async function settleAtCounter(courseId: string, bookingId: string, opts: { actor: EventActor; actorName: string; checkedInPlayers?: number }): Promise<CounterResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, courseId },
    select: { readerStartedAt: true, courseId: true, status: true, paymentStatus: true, players: true, totalAmount: true, accessFeeTotal: true, shopTotalCents: true, shopTaxCents: true,
      cancellationFeeChargeId: true, teeTime: { select: { date: true, time: true } }, course: { select: { timezone: true, stripeAccountId: true } } },
  });
  if (!booking) return { ok: false, status: 404, error: 'Not found' };
  // POS-3 R3b: on the card reader right now — cash would be a second payment. A claim
  // left 10 minutes is settled from Stripe first; it may turn out paid.
  if (booking.readerStartedAt) {
    if (Date.now() - booking.readerStartedAt.getTime() <= READER_STALE_MS) return { ok: false, status: 409, error: 'This group is being paid on the card reader — finish or cancel it there first.' };
    const { settleRoundReader } = await import('./reader-rounds');
    await settleRoundReader(courseId, bookingId, opts.actor);
    const after = await prisma.booking.findUnique({ where: { id: bookingId }, select: { readerStartedAt: true, paymentStatus: true } });
    if (after?.readerStartedAt) return { ok: false, status: 409, error: 'This group is being paid on the card reader — finish or cancel it there first.' };
    if (after?.paymentStatus === 'paid') return { ok: false, status: 409, error: 'This round was just paid on the card reader.' };
  }
  const cip = opts.checkedInPlayers;
  if (cip !== undefined && (!Number.isInteger(cip) || cip < 1 || cip > booking.players)) return { ok: false, status: 400, error: 'Invalid headcount.' };
  if (booking.status === 'cancelled') return { ok: false, status: 409, error: 'This booking was cancelled.' };
  if (booking.status === 'completed') return { ok: false, status: 409, error: 'Already checked in.' };
  // Review (HIGH): a round already charged by card (an admin "collect
  // payment") is paid — marking it paid offline would hide that payment and
  // take the booking fee a second time.
  if (booking.paymentStatus === 'paid') return { ok: false, status: 409, error: 'This round was already paid by card — check them in instead.' };
  const hadHoldFee = booking.paymentStatus === 'cancellation_fee_charged' && !!booking.cancellationFeeChargeId;
  // W2-7 B2: bring the shop items' sales tax up to date before the counter
  // closes the round. Cash is never blocked (PAY-2): if Stripe can't be
  // reached, the round still closes and the tax stays as last quoted.
  await ensureShopTax(bookingId);
  const evBase = { bookingId, courseId, actor: opts.actor, teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time) };
  const settled = await prisma.$transaction(async tx => {
    // Only a booking still open to pay: two taps (sheet and register) settle it once.
    const done = await tx.booking.updateMany({
      // …and never while it is on the card reader (a claim taken since the check above).
      where: { id: bookingId, courseId, status: 'confirmed', paymentStatus: { not: 'paid' }, readerStartedAt: null },
      data: { status: 'completed', checkedInAt: new Date(), paidAt: new Date(), paidOffline: true, paymentStatus: 'paid_offline', noShowAt: null, checkInFailReason: '', ...(cip !== undefined ? { checkedInPlayers: cip } : {}),
        // POS-1a: shop items are paid at the counter too; GreenReserve's shop fee is never collected in cash.
        shopFeeCents: 0 },
    });
    if (!done.count) return false;
    await recordBookingEvent(tx, { ...evBase, type: 'checked_in', amountCents: booking.totalAmount, playerCount: cip ?? booking.players, metadata: { paidOffline: true } });
    return true;
  });
  if (!settled) return { ok: false, status: 409, error: 'This group was just checked in or changed — refresh and look again.' };
  // The tax on shop items paid at the counter goes on the course's tax record too (the hourly cron retries).
  await recordRoundShopTax(bookingId);
  // They paid the round at the counter, so the hold fee the cron took after
  // the cutoff goes back — exactly as a card check-in refunds it.
  let holdNote: string | null = null;
  if (hadHoldFee && booking.course.stripeAccountId) {
    try {
      const refund = await refundOnConnectedAccount({ paymentIntentId: booking.cancellationFeeChargeId as string, connectedAccountId: booking.course.stripeAccountId });
      await recordBookingEventSafe({ ...evBase, type: 'fee_refunded', amountCents: refund.amount, playerCount: booking.players, stripeId: refund.id, metadata: { reason: 'hold_refunded_at_checkin', paidOffline: true } });
    } catch (err) {
      holdNote = `The late-cancellation hold fee could not be refunded automatically (${err instanceof Error ? err.message : 'Stripe error'}) — GreenReserve will follow up.`;
    }
  }
  // Cash at the counter collects no GreenReserve fee, card on file or not
  // (Cam 2026-10-19, HOMEPAGE_SPEC §0a; PAY-2): it is counted on Admin →
  // Revenue instead. A booking fee already taken separately (a no-show
  // charge, then the group turned up and paid cash) goes back.
  let refundNote: string | null = null;
  if (await liveSeparateFee(bookingId)) {
    const r = await refundSeparateAccessFee(bookingId, 'paid at the counter — no GreenReserve fee on cash', 'operator', opts.actorName);
    if (!r.ok) refundNote = `GreenReserve's booking fee could not be refunded to the golfer's card (${r.error}) — GreenReserve will follow up.`;
  }
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { totalAmount: true, accessFeeTotal: true, players: true, shopTotalCents: true, shopTaxCents: true } });
  return { ok: true, amountCents: counterDueCents(after, cip), note: [holdNote, refundNote].filter(Boolean).join(' ') || null };
}

/**
 * SD-5: a walk-in or phone booking entered at the counter, at the tee time's
 * standard rates, paying at the counter (paymentStatus 'manual'). ONE place
 * for it — the tee sheet's walk-in form and (POS-3 R2) the register.
 * CART-1: a tee time that can't be walked charges a cart for everyone.
 * Always made unpaid (CASH-1): paying in cash is then a register sale of its
 * round (lib/register ringUpCash → settleAtCounter), so every cash payment has
 * a sale, a receipt and a place in the close-out.
 */
export type CounterBookingInput = {
  teeTimeId: string; golferName: string; golferEmail?: string; golferPhone?: string;
  players: number; cartSelected?: boolean; source?: 'walk_in' | 'phone';
};
export async function createCounterBooking(courseId: string, input: CounterBookingInput, actor: EventActor):
  Promise<{ ok: true; id: string; checkInToken: string | null; greenFeeTotal: number; cartFeeTotal: number; totalAmount: number; teeTime: { date: string; time: string; holes: number }; course: { name: string; address: string | null; city: string | null; state: string | null; slug: string; cancellationHours: number; confirmationNote: string | null } }
  | { ok: false; status: number; error: string }> {
  const golferName = String(input.golferName ?? '').trim().slice(0, 120);
  const golferEmail = String(input.golferEmail ?? '').trim().toLowerCase().slice(0, 200);
  const golferPhone = String(input.golferPhone ?? '').trim().slice(0, 40);
  const players = Number(input.players);
  const source = input.source === 'phone' ? 'phone' : 'walk_in';
  if (!input.teeTimeId || golferName.length < 2) return { ok: false, status: 400, error: 'Enter the golfer’s name.' };
  if (!Number.isInteger(players) || players < 1 || players > 8) return { ok: false, status: 400, error: 'Players must be between 1 and 8.' };
  if (golferEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(golferEmail)) return { ok: false, status: 400, error: 'That email doesn’t look right.' };
  const teeTime = await prisma.teeTime.findUnique({ where: { id: input.teeTimeId }, include: { course: true } });
  if (!teeTime || teeTime.courseId !== courseId) return { ok: false, status: 404, error: 'Tee time not found' };
  if (teeTime.date < todayIn(teeTime.course.timezone)) return { ok: false, status: 409, error: 'That date has passed.' };
  const cart = input.cartSelected === true || teeTime.walkingAllowed === false;
  const greenFeeTotal = teeTime.greenFeeCents * players;
  const cartFeeTotal = cart ? teeTime.cartFeeCents * players : 0;
  // No platform fee on a counter booking — nothing is collected online.
  const totalAmount = greenFeeTotal + cartFeeTotal;
  // CASH-1 (Cam 2026-10-25: "can't just be paid at counter"): a counter booking is
  // always made unpaid; paying in cash is a register sale (lib/register ringUpCash).
  try {
    const claimed = await claimTeeTime({
      teeTimeId: teeTime.id, courseId,
      golferName, golferEmail: golferEmail || `${source}+${Date.now()}@noemail.greenreserve.app`, golferPhone,
      players, appliedRate: 'standard',
      greenFeeTotal, cartFeeTotal, cartSelected: cart, accessFeeTotal: 0, totalAmount,
      checkInToken: golferEmail ? randomUUID() : null,
      paymentStatus: 'manual',
      status: 'confirmed',
      source,
      cancellationHoursAtBooking: teeTime.course.cancellationHours,
    }, actor);
    const c = teeTime.course;
    return { ok: true, id: claimed.id, checkInToken: claimed.checkInToken, greenFeeTotal, cartFeeTotal, totalAmount,
      teeTime: { date: teeTime.date, time: teeTime.time, holes: teeTime.holes },
      course: { name: c.name, address: c.address, city: c.city, state: c.state, slug: c.slug, cancellationHours: c.cancellationHours, confirmationNote: c.confirmationNote } };
  } catch (err) {
    if (err instanceof TeeTimeClaimError) {
      if (err.code === 'NOT_FOUND') return { ok: false, status: 404, error: 'Tee time not found' };
      if (err.code === 'BLOCKED') return { ok: false, status: 409, error: 'This tee time is blocked.' };
      if (err.code === 'FULL' || err.code === 'CONFLICT') return { ok: false, status: 409, error: 'That time just filled up.' };
      if (err.code === 'SPOTS') return { ok: false, status: 409, error: `Only ${err.spotsLeft} spot${err.spotsLeft === 1 ? '' : 's'} left.` };
    }
    throw err;
  }
}
