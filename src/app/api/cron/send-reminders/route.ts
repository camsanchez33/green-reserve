import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendReminderEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Day-before reminders for tomorrow's confirmed bookings (all payment types).
  // Same-day check-in emails (no-fee courses) are handled by the hourly cron
  // at /api/cron/hourly, which fires 3 hours before the tee time.
  const tomorrowBookings = await prisma.booking.findMany({
    where: { status: 'confirmed', teeTime: { date: tomorrowStr } },
    include: {
      teeTime: { select: { date: true, time: true, holes: true } },
      course: { select: { name: true, address: true, city: true, state: true } },
    },
  });

  let sent = 0;
  for (const booking of tomorrowBookings) {
    try {
      await sendReminderEmail({
        golferName: booking.golferName, golferEmail: booking.golferEmail,
        courseName: booking.course.name,
        courseAddress: `${booking.course.address}, ${booking.course.city}, ${booking.course.state}`,
        date: booking.teeTime.date, time: booking.teeTime.time,
        players: booking.players, holes: booking.teeTime.holes, bookingId: booking.id,
        checkInToken: booking.checkInToken,
      });
      sent++;
    } catch (err) { console.error(`Reminder failed for ${booking.golferEmail}:`, err); }
  }

  return NextResponse.json({ success: true, sent, total: tomorrowBookings.length });
}
