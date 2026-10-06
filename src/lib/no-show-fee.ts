// SP-B (STAFF_POLICY_SPEC Part B4). One way to mark a no-show, used by the
// counter ("Mark no-show") and by the hourly cron's automatic no-show.
//
// NS-EOD (Cam 2026-10-06: "if the course charges no shows they all get charged
// at 12 midnight eod"): marking only FLAGS the booking (noShowAt + a
// no_show_marked event). The charges wait until the course's local midnight:
// the hourly cron runs chargeNoShow() for every booking dueNoShowCharges()
// returns — still flagged, still confirmed, never checked in, its tee date now
// past on the course's clock. A late group checked in before then (or cleared
// with "still coming") is never charged, so there is nothing to refund.
//
// At midnight chargeNoShow() takes, on the course's connected account:
//   - GreenReserve's booking fee, charged on its own (FB-3);
//   - the COURSE's no-show charge — Booking.noShowFeeTotal, copied from the
//     policy at booking (a separate no-show fee, or the late fee under "cancel
//     late or don't show").
// Charges are best effort and never undo the mark; failures are recorded on
// the PaymentEvent ledger. refundNoShowFee() still returns a charge taken in
// error after midnight.
import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe, chargeOnConnectedAccount } from './stripe';
import { recordPaymentEvent } from './refund-booking';
import { recordBookingEvent, recordBookingEventSafe, teeTimeInstant, type EventActor } from './booking-events';
import { chargeAccessFeeSeparately, type FeeChargeResult } from './access-fee';
import { teeToUtcMs } from './tee-time-utils';
import { todayIn } from './course-time';

export type NoShowResult = {
  /** GreenReserve's booking fee. */
  fee: FeeChargeResult;
  /** The course's no-show charge: charged, nothing to charge, or why it failed. */
  courseFee: { charged: true; amountCents: number } | { charged: false; reason: string };
};

/** The live (charged, not refunded) course no-show charge, from the ledger. */
export async function liveNoShowCharge(bookingId: string): Promise<{ stripeId: string; amountCents: number } | null> {
  const events = await prisma.paymentEvent.findMany({ where: { bookingId, kind: { in: ['no_show_fee', 'no_show_fee_refunded'] } }, orderBy: { createdAt: 'desc' } });
  const last = events[0];
  return last && last.kind === 'no_show_fee' ? { stripeId: last.stripeId, amountCents: last.amountCents } : null;
}

/** Flag a booking as a no-show. Charges nothing — see chargeNoShow(), run at the course's midnight. */
export async function markNoShow(bookingId: string, actor: EventActor, opts: { actorName?: string; auto?: boolean } = {}): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, courseId: true, players: true, teeTime: { select: { date: true, time: true } }, course: { select: { timezone: true } } },
  });
  if (!booking) throw new Error('Booking not found');
  const teeTimeAt = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { noShowAt: new Date() } });
    await recordBookingEvent(tx, { bookingId, courseId: booking.courseId, actor, teeTimeAt, type: 'no_show_marked', playerCount: booking.players, ...(opts.auto ? { metadata: { auto: true } } : {}) });
  });
}

/** The end-of-day charges for a booking still flagged a no-show (hourly cron, after the course's midnight). */
export async function chargeNoShow(bookingId: string): Promise<NoShowResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, courseId: true, players: true, noShowFeeTotal: true, stripeCustomerId: true, stripePaymentMethodId: true,
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, timezone: true, stripeAccountId: true, stripeAccountActive: true } },
    },
  });
  if (!booking) throw new Error('Booking not found');
  const teeTimeAt = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
  const actor: EventActor = { type: 'cron' };

  const fee = await chargeAccessFeeSeparately(bookingId, { why: 'no_show', actor: 'system' });

  let courseFee: NoShowResult['courseFee'] = { charged: false, reason: 'no no-show fee on this booking' };
  const amountCents = Math.round(booking.noShowFeeTotal);
  if (amountCents > 0 && !(await liveNoShowCharge(bookingId))) {
    if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) courseFee = { charged: false, reason: 'no card on file' };
    else if (!booking.course.stripeAccountId || !booking.course.stripeAccountActive) courseFee = { charged: false, reason: 'the course’s Stripe account is not connected' };
    else {
      // A new charge is only possible after a refund, so refunds number the
      // attempts and Stripe can't replay the refunded PaymentIntent.
      const attempt = await prisma.paymentEvent.count({ where: { bookingId, kind: 'no_show_fee_refunded' } });
      try {
        const pi = await chargeOnConnectedAccount({
          customerId: booking.stripeCustomerId,
          paymentMethodId: booking.stripePaymentMethodId,
          connectedAccountId: booking.course.stripeAccountId,
          amountCents,
          applicationFeeCents: 0,
          description: `No-show fee - ${booking.course.name} - booking ${booking.id}`,
          idempotencyKey: `noshowfee-${booking.id}-${attempt}-${booking.stripePaymentMethodId}`,
        });
        await recordPaymentEvent({ bookingId, kind: 'no_show_fee', amountCents, stripeId: pi.id, actor: 'cron', detail: 'No-show fee (end of day — not checked in)' });
        await recordBookingEventSafe({ bookingId, courseId: booking.courseId, type: 'fee_charged', actor, amountCents, playerCount: booking.players, teeTimeAt, stripeId: pi.id, metadata: { reason: 'no_show_fee' } });
        courseFee = { charged: true, amountCents };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await recordPaymentEvent({ bookingId, kind: 'charge_failed', amountCents, actor: 'cron', detail: `No-show fee: ${reason}` }).catch(() => {});
        courseFee = { charged: false, reason };
      }
    }
  }
  return { fee, courseFee };
}

/**
 * Bookings whose no-show charges are due now: flagged a no-show, still
 * confirmed, never checked in, and the course's local date is past the tee
 * date (its midnight has gone by). Each is tried once — a booking with any
 * charge or failed attempt recorded since it was flagged is not tried again
 * (staff can retry from the money tools). Scans the last three days.
 */
export async function dueNoShowCharges(now: Date): Promise<string[]> {
  const scanFrom = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const candidates = await prisma.booking.findMany({
    where: { status: 'confirmed', noShowAt: { not: null }, checkedInAt: null, teeTime: { date: { gte: scanFrom } } },
    select: { id: true, noShowAt: true, teeTime: { select: { date: true } }, course: { select: { timezone: true } } },
  });
  const pastMidnight = candidates.filter(b => todayIn(b.course.timezone, now) > b.teeTime.date);
  if (!pastMidnight.length) return [];
  const attempted = await prisma.paymentEvent.findMany({
    where: {
      bookingId: { in: pastMidnight.map(b => b.id) },
      OR: [
        { kind: 'no_show_fee' },
        { kind: 'fee_charged' },
        { kind: 'charge_failed', detail: { startsWith: 'No-show fee' } },
        { kind: 'charge_failed', detail: { startsWith: 'GreenReserve fee' } },
      ],
    },
    select: { bookingId: true, createdAt: true },
  });
  return pastMidnight.filter(b => !attempted.some(e => e.bookingId === b.id && b.noShowAt && e.createdAt >= b.noShowAt)).map(b => b.id);
}

/**
 * Bookings the hourly cron should mark a no-show now: made under a policy with
 * automatic no-show, still confirmed, nobody checked in, N minutes past the
 * tee time. Only the last two days are scanned; anything older was handled.
 *
 * R-CRON-001: "still coming" clears noShowAt and refunds both charges, which
 * used to put the booking straight back in this list with its due time still
 * past — the next run re-marked it and charged again. Staff have spoken for
 * that round: a booking with a no_show_cleared event is never auto-marked
 * again (staff can still mark it by hand).
 */
export async function dueAutoNoShows(now: Date): Promise<string[]> {
  const scanFrom = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  const scanTo = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const candidates = await prisma.booking.findMany({
    where: { status: 'confirmed', noShowAt: null, checkedInAt: null, autoNoShowMinutesAtBooking: { not: null }, teeTime: { date: { gte: scanFrom, lte: scanTo } } },
    select: { id: true, autoNoShowMinutesAtBooking: true, teeTime: { select: { date: true, time: true } }, course: { select: { timezone: true } } },
  });
  if (!candidates.length) return [];
  const cleared = new Set((await prisma.bookingEvent.findMany({
    where: { bookingId: { in: candidates.map(b => b.id) }, type: 'no_show_cleared' },
    select: { bookingId: true },
  })).map(e => e.bookingId));
  return candidates.filter(b => {
    if (cleared.has(b.id)) return false;
    const dueMs = teeToUtcMs(b.teeTime.date, b.teeTime.time, b.course.timezone) + (b.autoNoShowMinutesAtBooking ?? 0) * 60_000;
    return Number.isFinite(dueMs) && dueMs <= now.getTime();
  }).map(b => b.id);
}

/** "Still coming": refund the course's no-show charge, if one is live. Never throws. */
export async function refundNoShowFee(bookingId: string, actorName?: string): Promise<{ ok: boolean; refunded: boolean; error?: string }> {
  const live = await liveNoShowCharge(bookingId);
  if (!live) return { ok: true, refunded: false };
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { courseId: true, players: true, course: { select: { stripeAccountId: true } } } });
  if (!b?.course.stripeAccountId) return { ok: false, refunded: false, error: 'the course’s Stripe account is not connected' };
  try {
    const r = await stripe.refunds.create({ payment_intent: live.stripeId, metadata: { bookingId, kind: 'no_show_fee' } }, { stripeAccount: b.course.stripeAccountId, idempotencyKey: `noshowfee-refund-${bookingId}-${live.stripeId}` });
    await recordPaymentEvent({ bookingId, kind: 'no_show_fee_refunded', amountCents: live.amountCents, stripeId: r.id, actor: 'operator', actorName, detail: 'No-show fee refunded (still coming)' });
    await recordBookingEventSafe({ bookingId, courseId: b.courseId, type: 'fee_refunded', actor: { type: 'staff', id: actorName ?? null }, amountCents: live.amountCents, playerCount: b.players, teeTimeAt: null, stripeId: r.id, metadata: { reason: 'no_show_fee_refunded' } });
    return { ok: true, refunded: true };
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? err.message : 'Stripe unavailable';
    await recordPaymentEvent({ bookingId, kind: 'refund_failed', amountCents: live.amountCents, stripeId: live.stripeId, actor: 'operator', actorName, detail: `No-show fee refund failed: ${msg}` }).catch(() => {});
    return { ok: false, refunded: false, error: msg };
  }
}
