// The "time to check in" email with the golfer's pay link — for a course that
// takes no card, the golfer's only way to pay online. Sent once per booking, by
// the hourly cron (inside checkInWindowHours) or the daily safety net.
//
// R-CRON-007 (review ledger): both crons set paymentStatus = 'awaiting_checkin'
// (the dedup) BEFORE sending, so a failed send was never retried — and the daily
// one swallowed the failure. Now the flip is a conditional claim (only one cron
// sends), and a failed send puts the status back so the next run tries again.
import { prisma } from './prisma';
import { sendCheckInAvailableEmail } from './email';

export type CheckInEmailBooking = {
  id: string; paymentStatus: string; golferName: string; golferEmail: string; checkInToken: string | null;
  teeTime: { date: string; time: string }; course: { name: string };
};

export async function sendCheckInLinkOnce(b: CheckInEmailBooking): Promise<'sent' | 'taken' | 'failed'> {
  const claimed = await prisma.booking.updateMany({
    where: { id: b.id, status: 'confirmed', paymentStatus: b.paymentStatus },
    data: { paymentStatus: 'awaiting_checkin' },
  });
  if (!claimed.count) return 'taken';
  try {
    await sendCheckInAvailableEmail({
      golferName: b.golferName,
      golferEmail: b.golferEmail,
      courseName: b.course.name,
      date: b.teeTime.date,
      time: b.teeTime.time,
      bookingId: b.id,
      checkInToken: b.checkInToken,
    });
    return 'sent';
  } catch (err) {
    console.error(JSON.stringify({ ev: 'checkin_email.fail', bookingId: b.id, error: err instanceof Error ? err.message : String(err) }));
    await prisma.booking.updateMany({ where: { id: b.id, paymentStatus: 'awaiting_checkin' }, data: { paymentStatus: b.paymentStatus } });
    return 'failed';
  }
}
