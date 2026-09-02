import { prisma } from './prisma';
import { sendCancellationEmail, sendTeeTimeAlertEmail } from './email';
import { refundOnConnectedAccount } from './stripe';

export type CancellationOptions = {
  /**
   * MP-5b. Cancelling normally frees a slot, so anyone watching for that time
   * gets "a tee time opened up". When the cancellation is because the COURSE
   * is closing, that email invites golfers to book at a course that is about
   * to stop taking bookings — so the closure path turns it off, and leaves the
   * alerts unnotified for a genuine opening later.
   */
  notifySlotAlerts?: boolean;
  /** Shown to the golfer so a cancellation they did not ask for is explained. */
  reason?: string;
};

export async function performCancellation(bookingId: string, opts: CancellationOptions = {}) {
  const { notifySlotAlerts = true, reason } = opts;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      teeTime: true,
      course: { select: { name: true, slug: true, cancellationHours: true, stripeAccountId: true } },
    },
  });

  if (!booking) return { error: 'Booking not found', status: 404 } as const;
  if (booking.status === 'cancelled') return { error: 'Already cancelled', status: 409 } as const;
  if (booking.status === 'completed') return { error: 'This round was already checked in and paid for — nothing to cancel', status: 409 } as const;

  // MP-1b B1 — a round can now be PAID while still 'confirmed'.
  // collectPayment() (MP-1 fix-now #5) charges without checking anyone in, so a
  // booking can sit at confirmed + paid + roundPaymentIntentId with checkedInAt
  // null. Before this guard the two status checks above let such a booking
  // cancel straight through: the slot was freed for resale, the golfer was told
  // no fee was charged, and the full round charge was silently kept. Refund it
  // as part of the cancellation, and if the refund does not go through, refuse
  // to cancel rather than release the slot while holding their money.
  const roundPaid = booking.paymentStatus === 'paid' && !!booking.roundPaymentIntentId;
  let roundRefunded = false;
  if (roundPaid) {
    if (!booking.course.stripeAccountId) {
      return { error: 'This round was already paid but the course has no connected Stripe account — refund it manually before cancelling.', status: 409 } as const;
    }
    try {
      await refundOnConnectedAccount({
        paymentIntentId: booking.roundPaymentIntentId as string,
        connectedAccountId: booking.course.stripeAccountId,
      });
      roundRefunded = true;
      console.log(JSON.stringify({ ev: 'cancel.round_refund.ok', bookingId, paymentIntentId: booking.roundPaymentIntentId }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ ev: 'cancel.round_refund.fail', bookingId, error: message }));
      return { error: `This round was already paid and the refund failed (${message}). The booking was NOT cancelled — refund it in Stripe, then cancel.`, status: 502 } as const;
    }
  }

  const feeAlreadyCharged = booking.paymentStatus === 'cancellation_fee_charged';

  // MP-1 fix-now #6: a free cancel must not leave a stamped fee behind.
  // Every booking at a fee-policy course carries cancellationFeeTotal from
  // creation. The cutoff cron only charges bookings that are STILL
  // 'confirmed' (see api/cron/cancellation-cutoff — "Bookings the golfer
  // already cancelled are excluded by status:'confirmed'"), so once we
  // cancel here the fee can never be charged. Leaving the amount stamped is
  // what made Revenue's Money-in-Motion show the same $10 rows as "pending"
  // forever. If it was never charged, it never will be — clear it.
  // (MP-3's cancellationFeeApplies flag replaces this with a real state.)
  const clearPhantomFee = !feeAlreadyCharged && booking.cancellationFeeTotal > 0;

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        ...(clearPhantomFee ? { cancellationFeeTotal: 0 } : {}),
        ...(roundRefunded ? { paymentStatus: 'refunded', roundPaymentIntentId: '' } : {}),
      },
    }),
    prisma.teeTime.update({
      where: { id: booking.teeTimeId },
      data: { playersBooked: { decrement: booking.players }, status: 'available' },
    }),
  ]);

  // Find all unnotified alerts for this slot (specific-slot or criteria-based)
  const alerts = notifySlotAlerts ? await prisma.teeTimeAlert.findMany({
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
  }) : [];

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
    feeAmount: feeAlreadyCharged ? booking.cancellationFeeTotal : 0,
    bookingId: booking.id,
    reason,
  }).catch(console.error);

  return { success: true, feeCharged: feeAlreadyCharged, roundRefunded } as const;
}
