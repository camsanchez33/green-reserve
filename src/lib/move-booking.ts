// ACT-1 (PLATFORM_ROADMAP_SPEC §2, Cam 2026-10-07): move a group to another
// tee time. ONE function for every move — staff on the tee sheet, the golfer's
// own "change my time" (/api/manage/[id]/swap-time), and later Birdie (ACT-2) —
// so they all claim, release, price and log the same way.
//
// Price:
//   'keep'      the booked price stays (a course-initiated move shouldn't change
//               what the golfer agreed to). The staff default.
//   'new_slot'  priced as if booked at the new time: a member keeps their tier
//               rate (re-applied through lib/tier-rates for the new day), a
//               standard booking takes the new slot's rate. The golfer's own
//               swap, and staff when they tick "charge the new time's rate".
// The booking fee keeps its per-player amount either way — a counter booking
// that carries none (0) never gains one. (The old swap route reset it to
// $1.50 × players and repriced members at the public rate.)
//
// The cancellation policy copied onto the booking stays; its cutoff moves with
// the tee time. A hold already charged stays charged (refunded at check-in, as
// always). `cutoffPassed` tells the caller the new time's free-cancellation
// window is already closed, so the hourly cron will take the hold.
//
// A group that has already checked in (online, at the counter, or "paid at
// counter") can be moved by STAFF only (`allowCheckedIn`, Cam 2026-10-08:
// "people are going to check in online"). The round is paid by then, so its
// price always stays, and no hold can fall due (the crons only touch
// confirmed bookings). The golfer's own swap and the frost delay still refuse.
//
// The golfer's own swap (actor 'golfer', launch security review 2026-10-18)
// stays on the same day, and is refused once the booking's own cutoff has
// passed at a course with a late/hold fee: otherwise a golfer inside the window
// could move weeks out and cancel free (lateness is judged on the tee time the
// booking holds at cancel), or step past the advance-booking window.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { applyTierRates } from './tier-rates';
import { memberPlayers, splitTotal, memberSpot, membershipLive } from './member-rates';
import { groupGreenFee } from './residents';
import { bookingWindowHours, holdsAtCutoff } from './cancel-policy';
import { todayIn } from './course-time';
import { promoFits, seatAfter } from './promo-codes';
import { dealPct, dealSeat, dealRateSeat } from './last-minute';
import { recordBookingEvent, teeTimeInstant, type EventActor } from './booking-events';

export type MovePricing = 'keep' | 'new_slot';

export type MoveOk = {
  ok: true;
  bookingId: string;
  from: { teeTimeId: string; date: string; time: string };
  to: { teeTimeId: string; date: string; time: string; holes: number };
  players: number;
  /** Totals after the move (cents). */
  totals: { greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number };
  /** What the round would cost at the new slot's own rate, for the "charge the new rate" choice. */
  newSlotTotals: { greenFeeTotal: number; cartFeeTotal: number; totalAmount: number };
  priceChanged: boolean;
  /** The group had already checked in — paid, so the price stayed. */
  checkedIn: boolean;
  /** The new time's free-cancellation window has already closed. */
  cutoffPassed: boolean;
  /** …and the booking's policy holds a fee at the cutoff that hasn't been taken:
   *  the hourly cron will charge this many cents. 0 = nothing will be charged. */
  holdDueCents: number;
};
export type MoveCode = 'CUTOFF' | 'OTHER_DAY' | 'PLAYED' | 'NO_SHOW' | 'MOVED' | 'NOT_FOUND' | 'WRONG_COURSE' | 'NOT_CONFIRMED' | 'CHECKED_IN' | 'SAME' | 'SLOT_GONE' | 'BLOCKED' | 'PAST' | 'FULL' | 'CONFLICT';
export type MoveFail = { ok: false; code: MoveCode; message: string; spotsLeft?: number };

const MESSAGES: Record<MoveCode, string> = {
  CUTOFF: 'The free-change window for this booking has closed. Call the course to change it.',
  OTHER_DAY: 'You can change to another time on the same day. To play a different day, cancel and book again.',
  PLAYED: 'That round was on an earlier day — it has already been played.',
  NO_SHOW: 'This group is marked as a no-show. Mark them “Still coming” first, then move them.',
  MOVED: 'This group was already moved.',
  NOT_FOUND: 'That booking no longer exists.',
  WRONG_COURSE: 'That tee time belongs to a different course.',
  NOT_CONFIRMED: 'Only a confirmed or checked-in booking can be moved.',
  CHECKED_IN: 'This group has already checked in.',
  SAME: 'That is the group’s current tee time.',
  SLOT_GONE: 'That tee time is no longer available.',
  BLOCKED: 'That tee time is blocked.',
  PAST: 'That tee time has already gone off.',
  FULL: 'That tee time doesn’t have room for the whole group.',
  CONFLICT: 'That tee time was just taken — pick another.',
};

class MoveError extends Error {
  constructor(public code: MoveCode, public spotsLeft?: number) { super(code); }
}
/** Thrown at the end of a dry run so the transaction rolls back. */
class DryRun extends Error {
  constructor(public result: MoveOk) { super('dry run'); }
}

export async function moveBooking(opts: {
  bookingId: string;
  newTeeTimeId: string;
  /** The caller's course: a booking or slot outside it is NOT_FOUND / WRONG_COURSE. */
  courseId?: string;
  pricing: MovePricing;
  actor: EventActor;
  /** Re-stamp terms consent (the golfer's own swap: a new price is a new agreement). */
  terms?: { version: string };
  /** The slot the caller saw the booking on — a booking that has moved since
   *  is MOVED, so two overlapping batches can't double-count a slot. */
  expectFromTeeTimeId?: string;
  /** Staff only: a checked-in (completed) group may be moved too. */
  allowCheckedIn?: boolean;
  /** Validate and price, change nothing. */
  dryRun?: boolean;
  /** RES-1: residents to price at the new slot (default: the booking's own).
   *  The golfer's swap re-checks the card for the new slot's date. */
  residentPlayers?: number;
  now?: Date;
}): Promise<MoveOk | MoveFail> {
  const now = opts.now ?? new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id: opts.bookingId },
        select: {
          id: true, courseId: true, teeTimeId: true, players: true, status: true, source: true, checkedInAt: true, noShowAt: true, golferAccountId: true, golferEmail: true,
          paymentStatus: true, roundPaymentIntentId: true, readerStartedAt: true,
          cartSelected: true, appliedRate: true, residentPlayers: true, residentRateCents: true, promoCodeId: true, promoDiscountCents: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, accessFeeTotal: true,
          cancellationHoursAtBooking: true, lateFeeTimingAtBooking: true, cancellationFeeTotal: true, cancellationFeeChargeId: true,
          teeTime: { select: { id: true, date: true, time: true, status: true, playersBooked: true, playersAvailable: true } },
          course: { select: { timezone: true, cancellationHours: true, memberGraceDays: true, lastMinuteOn: true, lastMinuteHours: true, lastMinutePct: true, lastMinuteCounter: true, lastMinuteStack: true } },
        },
      });
      if (!b || (opts.courseId && b.courseId !== opts.courseId)) throw new MoveError('NOT_FOUND');
      const checkedIn = !!b.checkedInAt;
      if (checkedIn && !opts.allowCheckedIn) throw new MoveError('CHECKED_IN');
      if (b.status !== (checkedIn ? 'completed' : 'confirmed')) throw new MoveError('NOT_CONFIRMED');
      // Day-level, so a group that checked in online and turns up late can still
      // go to a later time today — but a round from an earlier day was played,
      // and moving it would carry its revenue into another day (Analytics, BI-1).
      if (checkedIn && b.teeTime.date < todayIn(b.course.timezone, now)) throw new MoveError('PLAYED');
      // A no-show may already carry its charges (taken at the course's midnight);
      // "Still coming" is the path that refunds them. Moving would leave them.
      if (b.noShowAt) throw new MoveError('NO_SHOW');
      if (opts.expectFromTeeTimeId && b.teeTimeId !== opts.expectFromTeeTimeId) throw new MoveError('MOVED');
      if (b.teeTimeId === opts.newTeeTimeId) throw new MoveError('SAME');
      const golferMove = opts.actor.type === 'golfer';
      if (golferMove && b.cancellationFeeTotal > 0) {
        const fromAt = teeTimeInstant(b.course.timezone, b.teeTime.date, b.teeTime.time);
        if (!fromAt || fromAt.getTime() - bookingWindowHours(b, b.course) * 3600_000 <= now.getTime()) throw new MoveError('CUTOFF');
      }

      const slot = await tx.teeTime.findUnique({
        where: { id: opts.newTeeTimeId },
        select: { id: true, courseId: true, date: true, time: true, holes: true, status: true, playersBooked: true, playersAvailable: true, greenFeeCents: true, cartFeeCents: true, memberRateCents: true, residentRateCents: true, walkingAllowed: true },
      });
      if (!slot) throw new MoveError('SLOT_GONE');
      if (slot.courseId !== b.courseId) throw new MoveError('WRONG_COURSE');
      if (golferMove && slot.date !== b.teeTime.date) throw new MoveError('OTHER_DAY');
      if (slot.status === 'blocked') throw new MoveError('BLOCKED');
      const teeAt = teeTimeInstant(b.course.timezone, slot.date, slot.time);
      if (!teeAt || teeAt.getTime() <= now.getTime()) throw new MoveError('PAST');
      const spotsLeft = slot.playersAvailable - slot.playersBooked;
      if (spotsLeft < b.players) throw new MoveError('FULL', spotsLeft);

      // ── price ──
      let rate = { greenFeeCents: slot.greenFeeCents, cartFeeCents: slot.cartFeeCents };
      // Cam 2026-10-29: how many of the group pay the member rate (the member alone unless the tier includes guests).
      let memberN = 0;
      let spot = memberSpot(null, rate);
      // A member rate whose tier is gone keeps what they paid a player — already after any code.
      let rateIsOwn = false;
      if (b.appliedRate !== 'standard' && b.appliedRate !== 'resident') {
        // Tier names aren't unique in the schema: take the oldest ACTIVE tier of
        // that name so the answer is deterministic (a tierId on Booking is the
        // proper fix; the tiers route now refuses duplicate names).
        const named = await tx.membershipTier.findFirst({ where: { courseId: b.courseId, name: b.appliedRate, active: true }, orderBy: { createdAt: 'asc' } });
        // A repriced move re-applies the tier only while the golfer's membership is live (lib/member-rates);
        // a lapsed member moves at the new time's public price.
        // A membership we can't tie to the booking keeps the old behaviour (the tier applies).
        const theirs = named && opts.pricing !== 'keep' && (b.golferAccountId || b.golferEmail)
          ? await tx.courseMembership.findMany({ where: { courseId: b.courseId, tierId: named.id, OR: [
              ...(b.golferAccountId ? [{ golferId: b.golferAccountId }] : []),
              ...(b.golferEmail ? [{ inviteEmail: { equals: b.golferEmail, mode: 'insensitive' as const } }] : []),
            ] }, select: { status: true, expiresAt: true } })
          : [];
        const lapsed = theirs.length > 0 && !theirs.some(m => membershipLive(m, b.course));
        const tier = lapsed ? null : named;
        rate = lapsed ? rate : tier
          ? applyTierRates(slot, tier)
          // A member rate whose tier is gone: keep what they paid per player.
          : { greenFeeCents: Math.round(b.greenFeeTotal / b.players), cartFeeCents: b.cartSelected ? Math.round(b.cartFeeTotal / b.players) : slot.cartFeeCents };
        memberN = lapsed ? 0 : tier ? memberPlayers(b.players, tier) : b.players;
        rateIsOwn = !lapsed && !tier;
        spot = memberSpot(tier, rate);
      }
      // PRICE-1: a promo code on the booking carries to the new time when it still fits there
      // (its dates, days and hours; a use is already counted); otherwise it comes off. Seat by
      // seat, as when it was booked (lib/promo-codes).
      const residentN = opts.residentPlayers ?? b.residentPlayers;
      const code = b.promoCodeId ? await tx.promoCode.findUnique({ where: { id: b.promoCodeId } }) : null;
      const promo = code && !promoFits({ ...code, maxUses: null, active: true }, slot, { rateApplied: memberN > 0 || (residentN > 0 && slot.residentRateCents != null) }) ? code : null;
      const seat = (c: number) => (promo && !rateIsOwn ? seatAfter(promo, c) : c);
      // RES-1: the group's residents pay the new slot's resident rate (none there → the standard rate).
      // PRICE-2: a repriced move into the new time's last-minute window gets its deal (before any code).
      // A counter booking gets the deal only when the course gives it at the counter.
      const lmPct = rateIsOwn ? 0 : dealPct(b.course, slot, golferMove || b.source === 'online' ? 'online' : 'counter', now);
      const stack = b.course.lastMinuteStack;
      const pubSeat = dealSeat(lmPct, slot.greenFeeCents);
      const ownSeat = rateIsOwn ? rate.greenFeeCents : memberN ? dealRateSeat(lmPct, rate.greenFeeCents, slot.greenFeeCents, stack) : dealSeat(lmPct, rate.greenFeeCents);
      const resSeat = slot.residentRateCents == null ? null : dealRateSeat(lmPct, slot.residentRateCents, slot.greenFeeCents, stack);
      const ratedResidents = groupGreenFee(b.players, ownSeat, residentN, resSeat);
      const ratedGreen = memberN ? splitTotal(b.players, memberN, ownSeat, pubSeat) : ratedResidents.greenFeeTotal;
      const residents = groupGreenFee(b.players, seat(ownSeat), residentN, resSeat == null ? null : seat(resSeat));
      const newGreen = memberN ? splitTotal(b.players, memberN, seat(ownSeat), seat(pubSeat)) : residents.greenFeeTotal;
      spot = spot.memberRateCents != null ? { ...spot, memberRateCents: seat(ownSeat) } : spot;
      // CART-1: a group moved onto a cart-only time takes a cart there.
      const cartOn = b.cartSelected || slot.walkingAllowed === false;
      const newCart = cartOn ? (memberN ? splitTotal(b.players, memberN, rate.cartFeeCents, slot.cartFeeCents) : rate.cartFeeCents * b.players) : 0;
      const range = Math.round(b.rangeBallsTotal);
      const access = Math.round(b.accessFeeTotal); // per-player amount unchanged: same players
      // A round already paid (admin "collect payment" before check-in) keeps its
      // price: the charge is done, and repricing would leave the ledger and the
      // golfer's "due at check-in" disagreeing with what was taken.
      // POS-3 R3b: a group on the card reader is being charged the price the reader shows — keep it too.
      const paid = checkedIn || b.paymentStatus === 'paid' || !!b.roundPaymentIntentId || !!b.readerStartedAt;
      const keep = opts.pricing === 'keep' || paid;
      const greenFeeTotal = keep ? Math.round(b.greenFeeTotal) : newGreen;
      const cartFeeTotal = keep ? Math.round(b.cartFeeTotal) : newCart;
      const totals = { greenFeeTotal, cartFeeTotal, rangeBallsTotal: range, accessFeeTotal: access, totalAmount: greenFeeTotal + cartFeeTotal + range + access };
      const priceChanged = greenFeeTotal !== Math.round(b.greenFeeTotal) || cartFeeTotal !== Math.round(b.cartFeeTotal);
      const windowHours = bookingWindowHours(b, b.course);
      const cutoffPassed = teeAt.getTime() - windowHours * 3600_000 <= now.getTime();
      const holdDueCents = !checkedIn && cutoffPassed && holdsAtCutoff(b) && !b.cancellationFeeChargeId ? Math.round(b.cancellationFeeTotal) : 0;

      const result: MoveOk = {
        ok: true, bookingId: b.id, players: b.players,
        from: { teeTimeId: b.teeTime.id, date: b.teeTime.date, time: b.teeTime.time },
        to: { teeTimeId: slot.id, date: slot.date, time: slot.time, holes: slot.holes },
        totals, newSlotTotals: paid ? { greenFeeTotal, cartFeeTotal, totalAmount: totals.totalAmount } : { greenFeeTotal: newGreen, cartFeeTotal: newCart, totalAmount: newGreen + newCart + range + access },
        priceChanged, checkedIn, cutoffPassed, holdDueCents,
      };
      if (opts.dryRun) throw new DryRun(result);

      // ── claim, release, record ──
      const data: Prisma.BookingUpdateInput = { teeTime: { connect: { id: slot.id } }, ...totals };
      if (!keep) {
        data.residentPlayers = residents.residentPlayers; data.residentRateCents = residents.residentRateCents;
        data.cartSelected = cartOn;
        data.memberRateCents = spot.memberRateCents; data.memberCartCents = spot.memberCartCents;
        data.lastMinutePct = lmPct;
        if (b.promoCodeId && !rateIsOwn) { data.promoCodeId = promo ? promo.id : null; data.promoDiscountCents = promo ? ratedGreen - newGreen : 0; }
        if (b.appliedRate === 'resident' && residents.residentPlayers === 0) data.appliedRate = 'standard';
        if (memberN === 0 && b.appliedRate !== 'resident' && b.appliedRate !== 'standard') data.appliedRate = residents.residentPlayers > 0 ? 'resident' : 'standard';
      }
      if (opts.terms) { data.termsAcceptedAt = now; data.termsVersion = opts.terms.version; }
      await tx.booking.update({ where: { id: b.id }, data });

      const left = Math.max(0, b.teeTime.playersBooked - b.players);
      // A blocked slot stays blocked; a full one has room again.
      await tx.teeTime.update({ where: { id: b.teeTime.id }, data: { playersBooked: left, ...(b.teeTime.status !== 'blocked' ? { status: 'available' } : {}) } });
      const booked = slot.playersBooked + b.players;
      await tx.teeTime.update({ where: { id: slot.id }, data: { playersBooked: booked, status: booked >= slot.playersAvailable ? 'full' : 'available' } });

      await recordBookingEvent(tx, {
        bookingId: b.id, courseId: b.courseId, type: 'booking_moved', actor: opts.actor,
        playerCount: b.players, teeTimeAt: teeAt,
        metadata: { from: `${b.teeTime.date} ${b.teeTime.time}`, to: `${slot.date} ${slot.time}`, pricing: opts.pricing, priceChanged, ...(checkedIn ? { checkedIn: true } : {}) },
      });
      return result;
    }, { isolationLevel: 'Serializable' });
  } catch (err) {
    if (err instanceof DryRun) return err.result;
    if (err instanceof MoveError) return { ok: false, code: err.code, message: MESSAGES[err.code], ...(err.spotsLeft != null ? { spotsLeft: err.spotsLeft } : {}) };
    // Postgres serialization failure: someone else took the slot meanwhile.
    if ((err as { code?: string }).code === 'P2034') return { ok: false, code: 'CONFLICT', message: MESSAGES.CONFLICT };
    throw err;
  }
}
