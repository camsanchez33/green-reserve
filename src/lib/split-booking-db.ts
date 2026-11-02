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
import { recordBookingEvent, type EventActor } from './booking-events';

export type SplitResult = { ok: true; newBookingId: string; keepCents: number; leaveCents: number } | { ok: false; status: number; error: string };

export async function splitBooking(courseId: string, bookingId: string, leave: number, opts: { name?: string; phone?: string; actor: EventActor }): Promise<SplitResult> {
  if (!Number.isInteger(leave) || leave < 1) return { ok: false, status: 400, error: 'Pick how many are paying on their own.' };
  const name = String(opts.name ?? '').trim().slice(0, 120);
  const phone = String(opts.phone ?? '').trim().slice(0, 40);
  try {
    return await prisma.$transaction(async tx => {
      const b = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, courseId: true, teeTimeId: true, golferName: true, players: true, status: true, paymentStatus: true, noShowAt: true,
          roundPaymentIntentId: true, shopLockedAt: true, readerStartedAt: true, feePaidCents: true, appliedRate: true,
          greenFeeTotal: true, cartFeeTotal: true, cartSelected: true, rangeBallsTotal: true, accessFeeTotal: true, totalAmount: true,
          residentPlayers: true, residentRateCents: true, memberRateCents: true, memberCartCents: true,
          cancellationFeeTotal: true, noShowFeeTotal: true, cancellationHoursAtBooking: true,
          teeTime: { select: { greenFeeCents: true, cartFeeCents: true, eventId: true } },
          course: { select: { lateFeeBasis: true, noShowFeeBasis: true, noShowFeeCents: true } },
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

      const changed = await tx.booking.updateMany({
        where: { id: b.id, courseId, status: 'confirmed', players: b.players, paymentStatus: b.paymentStatus, roundPaymentIntentId: '', shopLockedAt: null, readerStartedAt: null, noShowAt: null, totalAmount: b.totalAmount },
        data: {
          players: keep.players, greenFeeTotal: keep.greenFeeTotal, cartFeeTotal: keep.cartFeeTotal, accessFeeTotal: keep.accessFeeTotal, totalAmount: keep.totalAmount,
          residentPlayers: keep.residentPlayers, residentRateCents: keep.residentRateCents,
          cancellationFeeTotal: fees.cancellationFeeTotal, noShowFeeTotal: fees.noShowFeeTotal,
        },
      });
      if (!changed.count) return { ok: false, status: 409, error: 'This group just changed — refresh and look again.' } as const;

      const created = await tx.booking.create({
        data: {
          teeTimeId: b.teeTimeId, courseId,
          golferName: name.length >= 2 ? name : `${b.golferName} · guest${leave > 1 ? 's' : ''}`,
          golferEmail: `split+${Date.now()}@noemail.greenreserve.app`, golferPhone: phone,
          players: off.players, appliedRate: off.residentPlayers > 0 ? 'resident' : 'standard',
          greenFeeTotal: off.greenFeeTotal, cartFeeTotal: off.cartFeeTotal, cartSelected: b.cartSelected && off.cartFeeTotal > 0,
          accessFeeTotal: off.accessFeeTotal, totalAmount: off.totalAmount,
          residentPlayers: off.residentPlayers, residentRateCents: off.residentRateCents,
          paymentStatus: 'manual', status: 'confirmed', source: 'walk_in',
          cancellationHoursAtBooking: b.cancellationHoursAtBooking,
        },
        select: { id: true },
      });
      const meta = { split: true, from: b.id, to: created.id, playersLeft: off.players, before: b.totalAmount, keep: keep.totalAmount, leave: off.totalAmount };
      await recordBookingEvent(tx, { bookingId: b.id, courseId, type: 'price_changed', actor: opts.actor, amountCents: keep.totalAmount, playerCount: keep.players, metadata: meta });
      await recordBookingEvent(tx, { bookingId: created.id, courseId, type: 'booking_created', actor: opts.actor, amountCents: off.totalAmount, playerCount: off.players, metadata: meta });
      return { ok: true, newBookingId: created.id, keepCents: keep.totalAmount, leaveCents: off.totalAmount } as const;
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'split_booking.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
    return { ok: false, status: 500, error: 'The split didn’t go through — nothing changed. Try again.' };
  }
}
