import { prisma } from './prisma';
import { sendCancellationEmail, sendWaitlistNotification } from './email';

/**
 * Shared cancellation logic used by both the golfer-initiated cancel route and
 * the operator-initiated cancel (dashboard "Cancellations" tab). Authorization
 * (does this golfer own the booking / does this operator own the course) is the
 * caller's responsibility — this just does the slot restore + waitlist
 * promotion + emails once a cancellation has been authorized.
 *
 * Under the deferred-payment flow nothing is charged at booking time, so
 * there's no refund to issue for an early cancellation — the card is simply
 * never charged. The only money question is whether the cancellation-fee cron
 * already fired (paymentStatus === 'cancellation_fee_charged'): if so, that
 * fee is non-refundable per the course's late-cancellation policy.
 */
export async function performCancellation(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: true,
      course: { select: { name: true, cancellationHours: true } },
    },
  });

  if (!booking) return { error: 'Booking not found', status: 404 } as const;
  if (booking.status === 'cancelled') return { error: 'Already cancelled', status: 409 } as const;
  if (booking.status === 'completed') return { error: 'This round was already checked in and paid for — nothing to cancel', status: 409 } as const;

  const feeAlreadyCharged = booking.paymentStatus === 'cancellation_fee_charged';

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'cancelled', cancelledAt: new Date() },
    }),
    prisma.teeTime.update({
      where: { id: booking.teeTimeId },
      data: { playersBooked: { decrement: booking.players }, status: 'available' },
    }),
  ]);

  const waitlisted = await prisma.waitlist.findFirst({
    where: { teeTimeId: booking.teeTimeId, notified: false },
    orderBy: { createdAt: 'asc' },
  });
  if (waitlisted) {
    await prisma.waitlist.update({ where: { id: waitlisted.id }, data: { notified: true } });
    await sendWaitlistNotification({
      name: waitlisted.name,
      email: waitlisted.email,
      courseName: booking.course.name,
      date: booking.teeTime.date,
      time: booking.teeTime.time,
    }).catch(console.error);
  }

  await sendCancellationEmail({
    golferName: booking.golferName,
    golferEmail: booking.golferEmail,
    courseName: booking.course.name,
    date: booking.teeTime.date,
    time: booking.teeTime.time,
    players: booking.players,
    feeCharged: feeAlreadyCharged,
    feeAmount: booking.cancellationFeeTotal,
    bookingId: booking.id,
  }).catch(console.error);

  return { success: true, feeCharged: feeAlreadyCharged } as const;
}
