import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';
import { recordBookingEvent, teeTimeInstant, type EventActor } from './booking-events';

export class TeeTimeClaimError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'BLOCKED' | 'FULL' | 'SPOTS' | 'CONFLICT',
    public readonly spotsLeft?: number
  ) {
    super(code);
  }
}

/**
 * Atomically creates a booking and updates tee-time capacity.
 * Runs in a SERIALIZABLE transaction — concurrent requests that would exceed
 * capacity trigger a PostgreSQL serialization failure (P2034), which is caught
 * and re-thrown as TeeTimeClaimError('CONFLICT').
 *
 * All booking fields must be pre-computed by the caller. The teeTimeId and
 * players fields in `data` drive the capacity check.
 *
 * EV-1: the one place every booking is born (golfer, counter, admin), so the
 * booking_created event is written here, in the same transaction.
 */
export async function claimTeeTime(
  data: Prisma.BookingUncheckedCreateInput,
  actor: EventActor,
): Promise<{ id: string; checkInToken: string | null }> {
  const teeTimeId = String(data.teeTimeId);
  const players = Number(data.players);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const teeTime = await tx.teeTime.findUnique({
          where: { id: teeTimeId },
          select: { id: true, playersBooked: true, playersAvailable: true, status: true, date: true, time: true, course: { select: { timezone: true } } },
        });

        if (!teeTime) throw new TeeTimeClaimError('NOT_FOUND');
        if (teeTime.status === 'blocked') throw new TeeTimeClaimError('BLOCKED');

        const spotsLeft = teeTime.playersAvailable - teeTime.playersBooked;
        // Belt and braces (security review): a non-positive count must never
        // reach the capacity arithmetic below, whatever the caller validated.
        if (!Number.isInteger(players) || players < 1) throw new TeeTimeClaimError('SPOTS', spotsLeft);
        if (players > spotsLeft) {
          throw new TeeTimeClaimError(spotsLeft <= 0 ? 'FULL' : 'SPOTS', spotsLeft);
        }

        const booking = await tx.booking.create({ data });
        await recordBookingEvent(tx, {
          bookingId: booking.id, courseId: booking.courseId, type: 'booking_created', actor,
          amountCents: booking.totalAmount, playerCount: booking.players,
          teeTimeAt: teeTimeInstant(teeTime.course.timezone, teeTime.date, teeTime.time),
          metadata: { source: booking.source ?? null },
        });
        // Review (spec, EV-1 "one row per occurrence"): a counter walk-in created
        // already checked in and paid is ALSO a check-in — without this row every
        // "Add + check in" walk-in vanished from the log.
        if (booking.status === 'completed') {
          await recordBookingEvent(tx, {
            bookingId: booking.id, courseId: booking.courseId, type: 'checked_in', actor,
            amountCents: booking.totalAmount, playerCount: booking.players,
            teeTimeAt: teeTimeInstant(teeTime.course.timezone, teeTime.date, teeTime.time),
            metadata: { paidOffline: booking.paidOffline, atBooking: true },
          });
        }

        const newBooked = teeTime.playersBooked + players;
        await tx.teeTime.update({
          where: { id: teeTimeId },
          data: {
            playersBooked: newBooked,
            status: newBooked >= teeTime.playersAvailable ? 'full' : 'available',
          },
        });

        return { id: booking.id, checkInToken: booking.checkInToken };
      },
      { isolationLevel: 'Serializable' }
    );
  } catch (err) {
    if (err instanceof TeeTimeClaimError) throw err;
    // PostgreSQL serialization failure: two concurrent transactions conflicted
    if ((err as { code?: string }).code === 'P2034') {
      throw new TeeTimeClaimError('CONFLICT');
    }
    throw err;
  }
}
