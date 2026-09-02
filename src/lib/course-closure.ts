// MP-5b. Taking a course offline or archiving it used to ignore the golfers
// entirely: no cancel, no refund, no notification, not even a count in the
// confirm. A golfer kept a confirmed tee time at a course whose public page now
// 404s, and would have found out on the morning by driving there. The operator
// was never told either.
//
// Everything here routes through the SHARED performCancellation — the same
// service the golfer's own cancel, the operator dashboard and the admin tee
// sheet use — so there is no second cancellation implementation to drift, and
// refunds, phantom-fee clearing and slot release stay in one place.
import { prisma } from './prisma';
import { performCancellation } from './cancel-booking';
import { sendCourseClosedNotice } from './email';

/** Today in the same YYYY-MM-DD shape TeeTime.date is stored in. */
function todayKey(now: Date = new Date()): string {
  return now.toISOString().split('T')[0];
}

export type ClosureImpact = {
  bookings: number;
  players: number;
  golfers: number;
  nextDate: string | null;
  /** Bookings that already took money — a cancellation fee, or a paid round. */
  withMoney: number;
};

/**
 * What closing this course would cost, so the confirm can say it out loud.
 * Only bookings that still STAND (confirmed) on a date that has not passed —
 * a cancelled booking costs nothing, and a completed one has already been
 * played and paid for.
 */
export async function closureImpact(courseId: string, now: Date = new Date()): Promise<ClosureImpact> {
  const bookings = await prisma.booking.findMany({
    where: { courseId, status: 'confirmed', teeTime: { date: { gte: todayKey(now) } } },
    select: {
      golferEmail: true, players: true, paymentStatus: true,
      cancellationFeeTotal: true, roundPaymentIntentId: true,
      teeTime: { select: { date: true } },
    },
    orderBy: { teeTime: { date: 'asc' } },
  });
  return {
    bookings: bookings.length,
    players: bookings.reduce((n, b) => n + b.players, 0),
    golfers: new Set(bookings.map(b => b.golferEmail.toLowerCase())).size,
    nextDate: bookings[0]?.teeTime.date ?? null,
    withMoney: bookings.filter(
      b => b.paymentStatus === 'cancellation_fee_charged' || !!b.roundPaymentIntentId,
    ).length,
  };
}

export type ClosureResult = {
  cancelled: number;
  failed: { bookingId: string; golferEmail: string; error: string }[];
};

/**
 * Cancel every standing future booking because the course is closing.
 *
 * Slot alerts are suppressed: freeing a slot normally emails everyone watching
 * for that time, and "a tee time opened up" at a course that is about to stop
 * taking bookings is the worst possible message to send.
 *
 * Failures are collected, never swallowed — a booking whose refund did not go
 * through must be visible to the admin, because that golfer is still owed money.
 */
export async function cancelFutureBookingsForClosure(
  courseId: string,
  now: Date = new Date(),
): Promise<ClosureResult> {
  const bookings = await prisma.booking.findMany({
    where: { courseId, status: 'confirmed', teeTime: { date: { gte: todayKey(now) } } },
    select: { id: true, golferEmail: true, course: { select: { name: true } } },
    orderBy: { teeTime: { date: 'asc' } },
  });

  const failed: ClosureResult['failed'] = [];
  let cancelled = 0;
  for (const b of bookings) {
    const result = await performCancellation(b.id, {
      notifySlotAlerts: false,
      reason: `${b.course.name} is no longer taking bookings through GreenReserve, so we have cancelled this round for you. You have not been charged for it.`,
    }).catch(err => ({ error: err instanceof Error ? err.message : String(err), status: 500 } as const));

    if ('error' in result && result.error) failed.push({ bookingId: b.id, golferEmail: b.golferEmail, error: result.error });
    else cancelled++;
  }
  return { cancelled, failed };
}

/**
 * Tell the operator their course stopped taking bookings, and what happened to
 * their golfers. Never throws — the closure itself has already succeeded by the
 * time this runs, so a bounced email must not undo it. The caller reports
 * whether it went so a silent failure is still visible in the admin.
 */
export async function notifyOperatorOfClosure(
  courseId: string,
  action: 'offline' | 'archived',
  cancelledCount: number,
): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { name: true, operator: { select: { name: true, email: true } } },
  });
  if (!course?.operator?.email) return false;
  try {
    await sendCourseClosedNotice({
      operatorName: course.operator.name || 'there',
      operatorEmail: course.operator.email,
      courseName: course.name,
      action,
      cancelledCount,
    });
    return true;
  } catch (err) {
    console.error('Course closure notice failed:', err);
    return false;
  }
}
