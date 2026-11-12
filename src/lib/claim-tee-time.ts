import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';
import { recordBookingEvent, teeTimeInstant, type EventActor } from './booking-events';

// Cam 2026-10-27: nobody new joins a tee time more than LATE_ADD_MINUTES after it went
// off (late groups already booked can still be checked in; they just can't be added to).
import { LATE_ADD_MINUTES } from './late-add';
export { LATE_ADD_MINUTES, LATE_ADD_MESSAGE } from './late-add';

export class TeeTimeClaimError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'BLOCKED' | 'FULL' | 'SPOTS' | 'CONFLICT' | 'PAST' | 'PROMO_USED',
    public readonly spotsLeft?: number
  ) {
    super(code);
  }
}

/**
 * Atomically creates a booking and updates tee-time capacity.
 * Runs in a SERIALIZABLE transaction. A serialization failure (P2034) is retried
 * in a fresh transaction up to CLAIM_ATTEMPTS times; only then is it thrown as
 * TeeTimeClaimError('CONFLICT'). A claim that truly lost the time fails as
 * FULL / SPOTS / PROMO_USED on its retry.
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
  // Staff recording a walk-in who already played (Cam 2026-10-27: "let staff add forgotten
  // walk-ins after") — only the tee sheet's own "already played" button sets it.
  // ADDTIME-1: online bookings (the golfer booking route) can't take a time kept for staff.
  opts: { allowLate?: boolean; online?: boolean } = {},
): Promise<ClaimResult> {
  const teeTimeId = String(data.teeTimeId);
  const players = Number(data.players);

  // Serializable: two claims at once can conflict even on different tee times (Postgres
  // predicate locks), and the loser used to get "That time just filled up" on an empty time —
  // from 1–2% up to most of a burst, depending on table size and plan (measured 2026-11-12). The transaction rolls back whole, so
  // running it again is safe: a fresh transaction re-reads capacity and the promo rule, and a
  // claim that truly lost the time now fails as FULL / SPOTS / PROMO_USED, not CONFLICT.
  for (let attempt = 1; ; attempt++) {
    try {
      return await claimOnce(data, actor, opts, teeTimeId, players);
    } catch (err) {
      if (err instanceof TeeTimeClaimError) throw err;
      if ((err as { code?: string }).code === 'P2034') {
        if (attempt < CLAIM_ATTEMPTS) {
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 25 * attempt) + 5));
          continue;
        }
        throw new TeeTimeClaimError('CONFLICT');
      }
      throw err;
    }
  }
}

/**
 * Attempts at a claim that loses a serialization race before it answers CONFLICT. Measured
 * 2026-11-12 (scripts/claim-retry-db-test.ts, 8 claims at once on empty times): no retry lost up to
 * 105 of 120, 3 attempts still lost 21 of 120, 8 lost none of 360 — at 8 at once; it is not a guarantee
 * for much bigger bursts (final review: 5 of 320 lost at 32 at once). Waits add up to at most ~0.73s.
 */
export const CLAIM_ATTEMPTS = 8;

/**
 * `duplicate`: an ONLINE claim was an identical repeat of one just made (findDoubleTap) and returns
 * that booking instead of making a second (Cam via Build 2026-11-12: a double-tapped Book button).
 * Counter, staff and admin bookings never dedupe.
 */
export type ClaimResult = { id: string; checkInToken: string | null; duplicate?: true };

/** How recent a booking must be for an identical online submit to count as the same tap. */
export const DOUBLE_TAP_MS = 2 * 60_000;

/**
 * The booking an identical ONLINE submit already made — a double-tapped Book button — or null.
 * Deliberately narrow (final review 2026-11-12): the same tee time, the same golfer email (exact,
 * case-folded: lower() = lower(), never a LIKE pattern), the same name and party size, a confirmed
 * booking the golfer route made (termsAcceptedAt is stamped only there, so admin and counter
 * bookings never match), made in the last DOUBLE_TAP_MS. Anything else is a new booking. So the
 * answer can't be used to learn about someone else's booking, and a real second booking for the
 * same time days later is still made.
 */
export async function findDoubleTap(
  db: Pick<typeof prisma, '$queryRaw'>,
  d: { teeTimeId: unknown; golferEmail?: unknown; golferName?: unknown; players?: unknown },
  now: Date = new Date(),
): Promise<{ id: string; checkInToken: string | null } | null> {
  const email = String(d.golferEmail ?? '').trim();
  const name = String(d.golferName ?? '').trim();
  const players = Number(d.players);
  if (!email || !name || !Number.isInteger(players)) return null;
  const since = new Date(now.getTime() - DOUBLE_TAP_MS);
  // "createdAt" is a zone-less timestamp holding UTC; a bound Date is timestamptz. Compare in UTC
  // explicitly, or the session's TimeZone would shift the window by hours (final review).
  const rows = await db.$queryRaw<{ id: string; checkInToken: string | null }[]>`
    SELECT "id", "checkInToken" FROM "Booking"
    WHERE "teeTimeId" = ${String(d.teeTimeId)} AND "status" = 'confirmed' AND "source" = 'online'
      AND "termsAcceptedAt" IS NOT NULL AND "createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
      AND lower("golferEmail") = lower(${email}) AND lower(btrim("golferName")) = lower(${name}) AND "players" = ${players}
    ORDER BY "createdAt" ASC LIMIT 1`;
  return rows[0] ?? null;
}

async function claimOnce(
  data: Prisma.BookingUncheckedCreateInput,
  actor: EventActor,
  opts: { allowLate?: boolean; online?: boolean },
  teeTimeId: string,
  players: number,
): Promise<ClaimResult> {
    return await prisma.$transaction(
      async (tx) => {
        const teeTime = await tx.teeTime.findUnique({
          where: { id: teeTimeId },
          select: { id: true, playersBooked: true, playersAvailable: true, status: true, staffOnly: true, date: true, time: true, course: { select: { timezone: true } } },
        });

        if (!teeTime) throw new TeeTimeClaimError('NOT_FOUND');
        if (teeTime.status === 'blocked') throw new TeeTimeClaimError('BLOCKED');
        if (opts.online && teeTime.staffOnly) throw new TeeTimeClaimError('BLOCKED');
        const teeAt = teeTimeInstant(teeTime.course.timezone, teeTime.date, teeTime.time);
        if (!opts.allowLate && teeAt && teeAt.getTime() + LATE_ADD_MINUTES * 60_000 < Date.now()) throw new TeeTimeClaimError('PAST');

        // A double-tap (see findDoubleTap): inside this Serializable transaction, so two submits at the
        // same instant conflict, one retries, and the retry finds the other's booking here. Checked
        // before capacity, so a repeat of a booking that filled the time gets it back, not "full".
        if (opts.online) {
          const mine = await findDoubleTap(tx, data);
          if (mine) return { ...mine, duplicate: true as const };
        }

        const spotsLeft = teeTime.playersAvailable - teeTime.playersBooked;
        // Belt and braces (security review): a non-positive count must never
        // reach the capacity arithmetic below, whatever the caller validated.
        if (!Number.isInteger(players) || players < 1) throw new TeeTimeClaimError('SPOTS', spotsLeft);
        if (players > spotsLeft) {
          throw new TeeTimeClaimError(spotsLeft <= 0 ? 'FULL' : 'SPOTS', spotsLeft);
        }

        // Audit 2026-10-31: a "once per golfer" promo code is checked again here, inside the same
        // SERIALIZABLE transaction as the booking — two bookings at once by one golfer (same email, or
        // the same signed-in account) can't both use it; the second hits a serialization conflict, is retried, and then fails as PROMO_USED.
        if (data.promoCodeId) {
          const code = await tx.promoCode.findUnique({ where: { id: String(data.promoCodeId) }, select: { onePerGolfer: true } });
          const email = String(data.golferEmail ?? '').trim();
          const account = data.golferAccountId ? String(data.golferAccountId) : null;
          if (code?.onePerGolfer && (email || account)) {
            const used = await tx.booking.findFirst({
              where: { courseId: String(data.courseId), promoCodeId: String(data.promoCodeId), status: { not: 'cancelled' },
                OR: [...(email ? [{ golferEmail: { equals: email, mode: 'insensitive' as const } }] : []), ...(account ? [{ golferAccountId: account }] : [])] },
              select: { id: true },
            });
            if (used) throw new TeeTimeClaimError('PROMO_USED');
          }
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
}
