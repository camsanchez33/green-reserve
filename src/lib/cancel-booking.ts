import { prisma } from './prisma';
import { sendCancellationEmail, sendTeeTimeAlertEmail } from './email';

export async function performCancellation(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: true,
      course: { select: { name: true, slug: true, cancellationHours: true } },
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

  // Find all unnotified alerts for this slot (specific-slot or criteria-based)
  const alerts = await prisma.teeTimeAlert.findMany({
    where: {
      notifiedAt: null,
      OR: [
        { teeTimeId: booking.teeTimeId },
        {
          courseId: booking.courseId,
          date: booking.teeTime.date,
          players: { lte: booking.players },
        },
      ],
    },
  });

  // For criteria alerts, filter by time window in-memory
  const matching = alerts.filter((a) => {
    if (a.teeTimeId) return true;
    if (a.windowStart && booking.teeTime.time < a.windowStart) return false;
    if (a.windowEnd && booking.teeTime.time > a.windowEnd) return false;
    return true;
  });

  if (matching.length > 0) {
    await prisma.teeTimeAlert.updateMany({
      where: { id: { in: matching.map((a) => a.id) } },
      data: { notifiedAt: new Date() },
    });
    for (const alert of matching) {
      await sendTeeTimeAlertEmail({
        name: alert.name,
        email: alert.email,
        courseName: booking.course.name,
        courseSlug: booking.course.slug,
        date: booking.teeTime.date,
        time: booking.teeTime.time,
        players: alert.players,
        unsubscribeToken: alert.token,
      }).catch(console.error);
    }
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
