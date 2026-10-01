import type { Prisma, BookingEventType, EventActorType } from '@prisma/client';
import { prisma } from './prisma';
import { DEFAULT_TZ, isValidTimezone } from './course-time';
import { teeToUtcMs } from './tee-time-utils';

// EV-1 (RUN_QUEUE): the BookingEvent analytics log. One row per real-world
// occurrence; APPEND-ONLY — nothing here (or anywhere) updates or deletes a
// row. A correction is a new row. Historical bookings (before this shipped)
// have no events; that gap is expected.
//
// "Is this booking a no-show?" = its last no-show event is no_show_marked AND it
// has no checked_in AND no booking_cancelled. (no_show_cleared exists because
// SD-5's "still coming" reverses a mark — as a second row, never a delete.)
//
// A fee_charged row with metadata.reason 'cutoff_hold' is the cancellation-window
// HOLD the cron takes, refunded at check-in — reporting must net it against the
// matching fee_refunded (reason 'hold_refunded_at_checkin'), not count it as a
// penalty.

export type EventActor = { type: EventActorType; id?: string | null };

type Db = Prisma.TransactionClient | typeof prisma;

export type BookingEventInput = {
  bookingId: string;
  courseId: string;
  type: BookingEventType;
  actor: EventActor;
  amountCents?: number | null;
  playerCount?: number | null;
  teeTimeAt?: Date | null;
  /** PaymentIntent / Refund id — @unique, so a retry or double submit is a no-op. */
  stripeId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * The tee time as an instant (`date` + `time` are wall-clock in the course's
 * timezone). Copied onto every event so history never depends on a join.
 */
export function teeTimeInstant(tz: string | null | undefined, date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = teeToUtcMs(date, time, tz && isValidTimezone(tz) ? tz : DEFAULT_TZ);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * Append one event. Uses INSERT … ON CONFLICT DO NOTHING (createMany +
 * skipDuplicates), so a repeated stripeId is a silent no-op even INSIDE a
 * transaction — a caught P2002 would still abort a Postgres transaction.
 *
 * Inside a $transaction (pass `tx`) an error propagates: the state change and
 * its event exist together or not at all.
 */
export async function recordBookingEvent(db: Db, e: BookingEventInput): Promise<void> {
  await db.bookingEvent.createMany({
    data: [{
      bookingId: e.bookingId,
      courseId: e.courseId,
      type: e.type,
      actorType: e.actor.type,
      actorId: e.actor.id ?? null,
      amountCents: e.amountCents ?? null,
      playerCount: e.playerCount ?? null,
      teeTimeAt: e.teeTimeAt ?? null,
      stripeId: e.stripeId || null,
      ...(e.metadata !== undefined ? { metadata: e.metadata } : {}),
    }],
    skipDuplicates: true,
  });
}

/**
 * For Stripe-backed events written after Stripe has already confirmed: the
 * money moved, so a failed log write must never fail the request. Logged so
 * the gap is visible; never retried from inside the request (EV-1 rule b).
 */
export async function recordBookingEventSafe(e: BookingEventInput): Promise<void> {
  try {
    await recordBookingEvent(prisma, e);
  } catch (err) {
    console.error(JSON.stringify({ ev: 'booking_event.write_failed', type: e.type, bookingId: e.bookingId, stripeId: e.stripeId ?? null, error: err instanceof Error ? err.message : String(err) }));
  }
}
