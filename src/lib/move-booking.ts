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
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { applyTierRates } from './tier-rates';
import { bookingWindowHours, holdsAtCutoff } from './cancel-policy';
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
export type MoveCode = 'NO_SHOW' | 'MOVED' | 'NOT_FOUND' | 'WRONG_COURSE' | 'NOT_CONFIRMED' | 'CHECKED_IN' | 'SAME' | 'SLOT_GONE' | 'BLOCKED' | 'PAST' | 'FULL' | 'CONFLICT';
export type MoveFail = { ok: false; code: MoveCode; message: string; spotsLeft?: number };

const MESSAGES: Record<MoveCode, string> = {
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
  now?: Date;
}): Promise<MoveOk | MoveFail> {
  const now = opts.now ?? new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id: opts.bookingId },
        select: {
          id: true, courseId: true, teeTimeId: true, players: true, status: true, checkedInAt: true, noShowAt: true,
          paymentStatus: true, roundPaymentIntentId: true,
          cartSelected: true, appliedRate: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, accessFeeTotal: true,
          cancellationHoursAtBooking: true, lateFeeTimingAtBooking: true, cancellationFeeTotal: true, cancellationFeeChargeId: true,
          teeTime: { select: { id: true, date: true, time: true, status: true, playersBooked: true, playersAvailable: true } },
          course: { select: { timezone: true, cancellationHours: true } },
        },
      });
      if (!b || (opts.courseId && b.courseId !== opts.courseId)) throw new MoveError('NOT_FOUND');
      const checkedIn = !!b.checkedInAt;
      if (checkedIn && !opts.allowCheckedIn) throw new MoveError('CHECKED_IN');
      if (b.status !== (checkedIn ? 'completed' : 'confirmed')) throw new MoveError('NOT_CONFIRMED');
      // A no-show may already carry its charges (taken at the course's midnight);
      // "Still coming" is the path that refunds them. Moving would leave them.
      if (b.noShowAt) throw new MoveError('NO_SHOW');
      if (opts.expectFromTeeTimeId && b.teeTimeId !== opts.expectFromTeeTimeId) throw new MoveError('MOVED');
      if (b.teeTimeId === opts.newTeeTimeId) throw new MoveError('SAME');

      const slot = await tx.teeTime.findUnique({
        where: { id: opts.newTeeTimeId },
        select: { id: true, courseId: true, date: true, time: true, holes: true, status: true, playersBooked: true, playersAvailable: true, greenFeeCents: true, cartFeeCents: true, memberRateCents: true },
      });
      if (!slot) throw new MoveError('SLOT_GONE');
      if (slot.courseId !== b.courseId) throw new MoveError('WRONG_COURSE');
      if (slot.status === 'blocked') throw new MoveError('BLOCKED');
      const teeAt = teeTimeInstant(b.course.timezone, slot.date, slot.time);
      if (!teeAt || teeAt.getTime() <= now.getTime()) throw new MoveError('PAST');
      const spotsLeft = slot.playersAvailable - slot.playersBooked;
      if (spotsLeft < b.players) throw new MoveError('FULL', spotsLeft);

      // ── price ──
      let rate = { greenFeeCents: slot.greenFeeCents, cartFeeCents: slot.cartFeeCents };
      if (b.appliedRate !== 'standard') {
        // Tier names aren't unique in the schema: take the oldest ACTIVE tier of
        // that name so the answer is deterministic (a tierId on Booking is the
        // proper fix; the tiers route now refuses duplicate names).
        const tier = await tx.membershipTier.findFirst({ where: { courseId: b.courseId, name: b.appliedRate, active: true }, orderBy: { createdAt: 'asc' } });
        rate = tier
          ? applyTierRates(slot, tier)
          // A member rate whose tier is gone: keep what they paid per player.
          : { greenFeeCents: Math.round(b.greenFeeTotal / b.players), cartFeeCents: b.cartSelected ? Math.round(b.cartFeeTotal / b.players) : slot.cartFeeCents };
      }
      const newGreen = rate.greenFeeCents * b.players;
      const newCart = b.cartSelected ? rate.cartFeeCents * b.players : 0;
      const range = Math.round(b.rangeBallsTotal);
      const access = Math.round(b.accessFeeTotal); // per-player amount unchanged: same players
      // A round already paid (admin "collect payment" before check-in) keeps its
      // price: the charge is done, and repricing would leave the ledger and the
      // golfer's "due at check-in" disagreeing with what was taken.
      const paid = checkedIn || b.paymentStatus === 'paid' || !!b.roundPaymentIntentId;
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
