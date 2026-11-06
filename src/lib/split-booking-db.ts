// SPLIT-1 (Cam 2026-11-02, "they all want to pay separately … has to be seamless"): the
// server half of lib/split-booking — split `leave` players off a confirmed, unpaid group
// into their own booking on the same tee time. Server-only.
//
// One transaction: the group is re-read, re-checked and changed with a guard on what it
// was (players, payment state, no charge started), so a split racing a check-in, a card
// reader payment or another split changes nothing. Seats are already held, so the tee
// time's count is untouched. The new booking pays at the counter (paymentStatus
// 'manual', no card): cash, the card reader or a pay link — exactly like a walk-in.
import { prisma } from './prisma';
import { splitShares, splitRefusal } from './split-booking';
import { rescalePartyFees } from './cancel-policy';
import { recordBookingEvent, recordBookingEventSafe, type EventActor } from './booking-events';
import { refundOnConnectedAccount } from './stripe';
import { recordMove } from './money-ledger';
import { splitRiders } from './cart-pricing';

export type SplitResult = { ok: true; newBookingId: string; keepCents: number; leaveCents: number; note: string | null } | { ok: false; status: number; error: string };

/** A hold already taken (cutoff) covers the whole party; the players who split off get their share back (final review 2026-11-02). */
type HoldBack = { chargeId: string; account: string; cents: number; bookingId: string; courseId: string; actor: EventActor };

/**
 * PARTIAL-1 (Cam 2026-11-04: "if only one person's checked in the other should still be open"): the
 * same split, for the players of a group still on their way when the rest check in. Unlike paying
 * separately, the new booking keeps what the group had — the golfer's contact, the saved card and the
 * booking's own cancellation / no-show rules — so it is charged, texted or marked a no-show like any
 * booking; with no card it pays in store. A hold already taken is shared, not refunded: each booking
 * carries its share and gives it back when it checks in (holdRefundCents below). Linked by splitFromId,
 * so the sheet shows it inside the group.
 */
export async function splitOffLateArrivals(courseId: string, bookingId: string, stillComing: number, actor: EventActor): Promise<SplitResult> {
  return splitBooking(courseId, bookingId, stillComing, { actor, arrival: true });
}

/**
 * How much of a hold to give back for this booking. A hold one booking owns comes back whole (undefined =
 * Stripe's full refund, as before); a hold shared with a booking split off it (PARTIAL-1) comes back only
 * as this booking's share, so the other's share stays charged until it checks in.
 */
export async function holdRefundCents(booking: { id: string; cancellationFeeChargeId: string; cancellationFeeTotal: number }): Promise<number | undefined> {
  if (!booking.cancellationFeeChargeId) return undefined;
  const others = await prisma.booking.count({ where: { cancellationFeeChargeId: booking.cancellationFeeChargeId, id: { not: booking.id } } });
  return others > 0 ? Math.max(0, booking.cancellationFeeTotal) : undefined;
}

/** For the three hold refunds: a share of 0 means there is nothing of this booking's to give back. */
export function hasShareToRefund(cents: number | undefined): boolean {
  return cents === undefined || cents > 0;
}

export async function splitBooking(courseId: string, bookingId: string, leave: number, opts: { name?: string; phone?: string; actor: EventActor; arrival?: boolean }): Promise<SplitResult> {
  if (!Number.isInteger(leave) || leave < 1) return { ok: false, status: 400, error: 'Pick how many are paying on their own.' };
  const name = String(opts.name ?? '').trim().slice(0, 120);
  const phone = String(opts.phone ?? '').trim().slice(0, 40);
  let hold: HoldBack | null = null;
  let result: SplitResult;
  try {
    result = await prisma.$transaction(async tx => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, courseId: true, teeTimeId: true, golferName: true, players: true, status: true, paymentStatus: true, noShowAt: true,
          roundPaymentIntentId: true, shopLockedAt: true, readerStartedAt: true, feePaidCents: true, appliedRate: true,
          greenFeeTotal: true, cartFeeTotal: true, cartSelected: true, cartUnitCents: true, cartRiders: true, rangeBallsTotal: true, accessFeeTotal: true, totalAmount: true,
          residentPlayers: true, residentRateCents: true, memberRateCents: true, memberCartCents: true,
          cancellationFeeTotal: true, noShowFeeTotal: true, cancellationHoursAtBooking: true, cancellationFeeChargeId: true,
          golferEmail: true, golferPhone: true, golferAccountId: true, source: true, stripeCustomerId: true, stripePaymentMethodId: true,
          cancellationFeeChargedAt: true, cancellationFeeApplies: true, lateFeeTimingAtBooking: true, autoNoShowMinutesAtBooking: true,
          termsAcceptedAt: true, termsVersion: true,
          teeTime: { select: { greenFeeCents: true, cartFeeCents: true, eventId: true } },
          course: { select: { lateFeeBasis: true, noShowFeeBasis: true, noShowFeeCents: true, stripeAccountId: true } },
        },
      });
      if (!b || b.courseId !== courseId) return { ok: false, status: 404, error: 'Not found' } as const;
      if (b.teeTime.eventId) return { ok: false, status: 409, error: 'This time is held for an event — players pay on the event.' } as const;
      const refused = splitRefusal(b);
      if (refused) return { ok: false, status: 409, error: refused } as const;
      if (leave >= b.players) return { ok: false, status: 400, error: `Leave at least one player with ${b.golferName}.` } as const;
      const shares = splitShares(b, leave, b.teeTime);
      if (!shares) return { ok: false, status: 409, error: 'This group’s price can’t be divided — take payment for the whole group.' } as const;
      const { keep, leave: off } = shares;
      // A per-player late or no-show fee follows the players who stay; the ones who leave pay at the counter and carry none.
      const fees = rescalePartyFees(b, b.course, b.players, keep.players);
      // CART-2: a per-cart booking's riders go with the players who leave; both parts keep the cart price as booked.
      const riders = splitRiders(b, off.players);

      const changed = await tx.booking.updateMany({
        where: { id: b.id, courseId, status: 'confirmed', players: b.players, paymentStatus: b.paymentStatus, roundPaymentIntentId: '', shopLockedAt: null, readerStartedAt: null, noShowAt: null, totalAmount: b.totalAmount },
        data: {
          players: keep.players, greenFeeTotal: keep.greenFeeTotal, cartFeeTotal: keep.cartFeeTotal, accessFeeTotal: keep.accessFeeTotal, totalAmount: keep.totalAmount,
          ...(b.cartUnitCents != null ? { cartRiders: riders.keep } : {}),
          residentPlayers: keep.residentPlayers, residentRateCents: keep.residentRateCents,
          cancellationFeeTotal: fees.cancellationFeeTotal, noShowFeeTotal: fees.noShowFeeTotal,
        },
      });
      if (!changed.count) return { ok: false, status: 409, error: 'This group just changed — refresh and look again.' } as const;
      // The hold the cron took at the cutoff is exactly cancellationFeeTotal (lib/cutoff-hold). The booker's row now
      // carries the smaller fee, so the leavers' share goes back once this commits — what Stripe keeps always equals the row.
      const holdShare = b.cancellationFeeTotal - fees.cancellationFeeTotal;
      // PARTIAL-1: a late arrival keeps its share of the hold (it comes back when they check in).
      if (!opts.arrival && b.paymentStatus === 'cancellation_fee_charged' && b.cancellationFeeChargeId && holdShare > 0 && b.course.stripeAccountId) {
        hold = { chargeId: b.cancellationFeeChargeId, account: b.course.stripeAccountId, cents: holdShare, bookingId: b.id, courseId, actor: opts.actor };
      }

      const priced = {
        teeTimeId: b.teeTimeId, courseId, splitFromId: b.id,
        golferName: name.length >= 2 ? name : `${b.golferName} · guest${leave > 1 ? 's' : ''}`,
        players: off.players, appliedRate: off.residentPlayers > 0 ? 'resident' : 'standard',
        greenFeeTotal: off.greenFeeTotal, cartFeeTotal: off.cartFeeTotal, cartSelected: b.cartSelected && off.cartFeeTotal > 0,
        ...(b.cartUnitCents != null && off.cartFeeTotal > 0 ? { cartUnitCents: b.cartUnitCents, cartRiders: riders.leave } : {}),
        accessFeeTotal: off.accessFeeTotal, totalAmount: off.totalAmount,
        residentPlayers: off.residentPlayers, residentRateCents: off.residentRateCents,
        status: 'confirmed', cancellationHoursAtBooking: b.cancellationHoursAtBooking,
      };
      const created = await tx.booking.create({
        data: opts.arrival
          // PARTIAL-1: the same golfer's group, still on its way — same contact, card and rules; the fees are
          // the leavers' share (the booker's row carries the rest), so the two always add up to the one before.
          ? { ...priced, golferEmail: b.golferEmail, golferPhone: b.golferPhone, golferAccountId: b.golferAccountId, source: b.source,
              stripeCustomerId: b.stripeCustomerId, stripePaymentMethodId: b.stripePaymentMethodId,
              cancellationFeeTotal: holdShare, noShowFeeTotal: b.noShowFeeTotal - fees.noShowFeeTotal,
              // A per-booking hold stays whole on the booker's row; a part that carries none of it has no hold to give back.
              ...(b.paymentStatus === 'cancellation_fee_charged' && holdShare <= 0
                ? { paymentStatus: 'card_on_file', cancellationFeeChargeId: '', cancellationFeeChargedAt: null }
                : { paymentStatus: b.paymentStatus, cancellationFeeChargeId: b.cancellationFeeChargeId, cancellationFeeChargedAt: b.cancellationFeeChargedAt }),
              cancellationFeeApplies: b.cancellationFeeApplies, lateFeeTimingAtBooking: b.lateFeeTimingAtBooking,
              autoNoShowMinutesAtBooking: b.autoNoShowMinutesAtBooking, termsAcceptedAt: b.termsAcceptedAt, termsVersion: b.termsVersion }
          : { ...priced, golferEmail: `split+${Date.now()}@noemail.greenreserve.app`, golferPhone: phone, paymentStatus: 'manual', source: 'walk_in' },
        select: { id: true },
      });
      const meta = { split: true, arrival: !!opts.arrival, from: b.id, to: created.id, playersLeft: off.players, before: b.totalAmount, keep: keep.totalAmount, leave: off.totalAmount };
      await recordBookingEvent(tx, { bookingId: b.id, courseId, type: 'price_changed', actor: opts.actor, amountCents: keep.totalAmount, playerCount: keep.players, metadata: meta });
      await recordBookingEvent(tx, { bookingId: created.id, courseId, type: 'booking_created', actor: opts.actor, amountCents: off.totalAmount, playerCount: off.players, metadata: meta });
      return { ok: true, newBookingId: created.id, keepCents: keep.totalAmount, leaveCents: off.totalAmount, note: null } as const;
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'split_booking.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
    return { ok: false, status: 500, error: 'The split didn’t go through — nothing changed. Try again.' };
  }
  const h = hold as HoldBack | null;
  if (result.ok && h) {
    // Outside the transaction (a Stripe call), ledger first-class: the refund is a money move.
    try {
      const refund = await refundOnConnectedAccount({ paymentIntentId: h.chargeId, connectedAccountId: h.account, amountCents: h.cents, idempotencyKey: `hold-split-${h.bookingId}-${result.newBookingId}-${h.chargeId}` });
      await recordMove({ courseId: h.courseId, what: 'hold', direction: 'out', method: 'card', account: 'course', amountCents: refund.amount, stripeId: refund.id, bookingId: h.bookingId, actor: h.actor.type, note: 'hold share given back — players split off to pay on their own' });
      await recordBookingEventSafe({ bookingId: h.bookingId, courseId: h.courseId, type: 'fee_refunded', actor: h.actor, amountCents: refund.amount, stripeId: refund.id, metadata: { reason: 'hold_share_split' } });
    } catch (err) {
      console.error(JSON.stringify({ ev: 'split_booking.hold_refund.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
      result = { ...result, note: `Split done, but $${(h.cents / 100).toFixed(2)} of the late-cancellation hold couldn’t be refunded automatically — refund it in Stripe.` };
    }
  }
  return result;
}
