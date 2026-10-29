// A group's party size changes: the golfer's own link (/manage) and, Revamp 3 dead
// end 19 (Cam 2026-10-29), staff at the counter. One place for the rules:
// capacity, the round's group size, prices at the booking's own rates (members,
// residents — lib/member-rates partyFees), the late and no-show fees rescaled,
// and the booking fee for players taken off before the cutoff refunded.
//
// Staff differ from the golfer: they may change a group inside the late-fee
// window and after its time has gone (they're at the counter), the change is on
// the course's Timeline, and it doesn't re-stamp the golfer's terms. Neither may
// change a paid round, a no-show or a group already checked in.
//
// Throws { code } errors the routes turn into words (PARTY_ERRORS).
import { prisma } from './prisma';
import { CURRENT_TERMS_VERSION } from './terms';
import { canManageBooking } from './manage-access';
import { bookingWindowHours, rescalePartyFees } from './cancel-policy';
import { recordBookingEvent, teeTimeInstant, type EventActor } from './booking-events';
import { isPastIn } from './course-time';
import { groupGreenFee, otherPerPlayerCents } from './residents';
import { partyFees } from './member-rates';
import { rulesFor, groupSizeError } from './booking-rules';
import { refundBookingFee } from './booking-fee';

export type PartyWho = { by: 'golfer'; golferId?: string | null; token?: string } | { by: 'staff'; courseId: string; actor: EventActor };

export async function changePartySize(bookingId: string, newPlayers: number, who: PartyWho) {
  const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, courseId: true, checkInToken: true, golferAccountId: true, teeTimeId: true, players: true,
          status: true, cartSelected: true, rangeBallsTotal: true,
          greenFeeTotal: true, cartFeeTotal: true, accessFeeTotal: true, residentPlayers: true, residentRateCents: true, memberRateCents: true, memberCartCents: true,
          cancellationFeeTotal: true, noShowFeeTotal: true, cancellationHoursAtBooking: true,
          paymentStatus: true, roundPaymentIntentId: true, shopLockedAt: true, readerStartedAt: true, feePaidCents: true, noShowAt: true,
          teeTime: { select: { date: true, time: true, greenFeeCents: true, cartFeeCents: true, product: { select: { minPlayers: true, maxPlayers: true } } } },
          course: { select: { timezone: true, cancellationHours: true, lateFeeBasis: true, noShowFeeBasis: true, noShowFeeCents: true, minPlayers: true, maxPlayers: true } },
        },
      });

      if (!booking) throw Object.assign(new Error(), { code: 'INVALID' });
      const authorized = who.by === 'staff' ? booking.courseId === who.courseId : canManageBooking(booking, who.golferId ?? undefined, who.token);
      if (!authorized) throw Object.assign(new Error(), { code: 'INVALID' });
      if (booking.status !== 'confirmed') throw Object.assign(new Error(), { code: 'NOT_CONFIRMED' });
      // G9 (review ledger): a group marked a no-show, or one whose time has
      // passed, keeps the party its no-show fee was set on — dropping players
      // before the midnight charge would cut the fee.
      // Staff at the counter may still change a group whose time has gone (they're standing there), never a no-show.
      if (booking.noShowAt || (who.by === 'golfer' && isPastIn(booking.course.timezone, booking.teeTime.date, booking.teeTime.time))) throw Object.assign(new Error(), { code: 'STARTED' });
      if (booking.players === newPlayers) throw Object.assign(new Error(), { code: 'SAME' });
      // W2-6 slice 3: the course's (or the round's) group size holds on a change too.
      const sizeError = groupSizeError(rulesFor(booking.course, booking.teeTime.product), newPlayers);
      if (sizeError) throw Object.assign(new Error(), { code: 'SIZE', msg: sizeError });
      // A payment taken or started (or a hold already charged) carries the old party's price.
      if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'cancellation_fee_charged' || booking.roundPaymentIntentId || booking.shopLockedAt || booking.readerStartedAt) throw Object.assign(new Error(), { code: 'PAID' }); // on the card reader: being charged at this size
      // Launch security review 2026-10-18: once the cutoff has passed at a course
      // with a late fee (a no-show-only course has no window), the party is what the fee was set on — dropping
      // players late would give seats back free, and a hold may already be taken.
      // Staff decide at the counter, inside the window too (dead end 19).
      if (who.by === 'golfer' && booking.cancellationFeeTotal > 0) {
        const teeAt = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
        if (!teeAt || teeAt.getTime() - bookingWindowHours(booking, booking.course) * 3600_000 <= Date.now()) throw Object.assign(new Error(), { code: 'CUTOFF' });
      }

      const slot = await tx.teeTime.findUnique({
        where: { id: booking.teeTimeId },
        select: { playersBooked: true, playersAvailable: true, status: true },
      });
      if (!slot) throw Object.assign(new Error(), { code: 'NOT_FOUND' });
      // R-BOOK-004: a blocked time sells no more seats, and stays blocked.
      if (slot.status === 'blocked' && newPlayers > booking.players) throw Object.assign(new Error(), { code: 'FULL', max: booking.players });

      // Effective capacity: total - already booked (excluding this booking's own seats)
      const otherBooked = slot.playersBooked - booking.players;
      const maxPlayers = slot.playersAvailable - otherBooked;
      if (newPlayers > maxPlayers) {
        throw Object.assign(new Error(), { code: 'FULL', max: maxPlayers });
      }

      // Recompute fees at the booking's own rates: the member's spot or the
      // residents first, everyone else at what the booking's other players pay.
      // The booking fee keeps its per-player amount: a counter booking that
      // carries none (0) never gains one (PAY-2).
      const perPlayerAccess = booking.players > 0 ? Math.round(booking.accessFeeTotal / booking.players) : 0;
      const { cancellationFeeTotal, noShowFeeTotal } = rescalePartyFees(booking, booking.course, booking.players, newPlayers);

      // RES-1: residents keep the resident rate (never more of them than players);
      // everyone else pays what the booking's non-residents pay.
      const res = booking.residentPlayers > 0
        ? groupGreenFee(newPlayers, otherPerPlayerCents(booking) ?? booking.teeTime.greenFeeCents, booking.residentPlayers, booking.residentRateCents)
        : null;
      const fees = partyFees({ ...booking, cartFeeTotal: booking.cartSelected ? booking.cartFeeTotal : 0 }, newPlayers, booking.teeTime);
      const greenFeeTotal = fees.greenFeeTotal;
      const cartFeeTotal = fees.cartFeeTotal;
      const accessFeeTotal = perPlayerAccess * newPlayers;
      const totalAmount = greenFeeTotal + cartFeeTotal + Math.round(booking.rangeBallsTotal) + accessFeeTotal;

      // A golfer's own change re-stamps terms consent — the price just changed, so it's a fresh agreement.
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          players: newPlayers, greenFeeTotal, cartFeeTotal,
          ...(res ? { residentPlayers: res.residentPlayers, residentRateCents: res.residentRateCents } : {}), accessFeeTotal, totalAmount, cancellationFeeTotal, noShowFeeTotal,
          ...(who.by === 'golfer' ? { termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION } : {}),
        },
      });
      if (who.by === 'staff') await recordBookingEvent(tx, {
        bookingId, courseId: booking.courseId, type: 'price_changed', actor: who.actor, amountCents: totalAmount, playerCount: newPlayers,
        teeTimeAt: teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time),
        metadata: { reason: 'party_size', playersBefore: booking.players, playersAfter: newPlayers, totalBefore: booking.greenFeeTotal + booking.cartFeeTotal + Math.round(booking.rangeBallsTotal) + booking.accessFeeTotal, totalAfter: totalAmount },
      });

      const playersDelta = newPlayers - booking.players;
      const newPlayersBooked = slot.playersBooked + playersDelta;
      await tx.teeTime.update({
        where: { id: booking.teeTimeId },
        data: {
          playersBooked: newPlayersBooked,
          ...(slot.status !== 'blocked' ? { status: newPlayersBooked >= slot.playersAvailable ? 'full' : 'available' } : {}),
        },
      });

      // FEE-AT-BOOKING (Cam 2026-10-24): players taken off before the cutoff get their part of the booking fee back.
      const teeAtNow = teeTimeInstant(booking.course.timezone, booking.teeTime.date, booking.teeTime.time);
      const beforeCutoff = !!teeAtNow && teeAtNow.getTime() - bookingWindowHours(booking, booking.course) * 3600_000 > Date.now();
      const feeBack = beforeCutoff ? Math.max(0, booking.feePaidCents - accessFeeTotal) : 0;
      return { players: newPlayers, greenFeeTotal, cartFeeTotal, accessFeeTotal, rangeBallsTotal: Math.round(booking.rangeBallsTotal), totalAmount, feeBack };
    }, { isolationLevel: 'Serializable' });
  const { feeBack, ...view } = result;
  let feeRefundError = '';
  if (feeBack > 0) {
    const r = await refundBookingFee(bookingId, feeBack, `party lowered to ${result.players} before the cutoff`, who.by === 'staff' ? 'operator' : 'golfer');
    if (!r.ok) feeRefundError = 'The party was changed, but the booking fee for the players taken off couldn’t be refunded yet — GreenReserve will follow up.';
  }
  return { ...view, feeRefundError };

}
