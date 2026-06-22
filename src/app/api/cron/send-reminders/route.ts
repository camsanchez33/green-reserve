import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendReminderEmail, sendCheckInAvailableEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // 1. Day-before reminders for tomorrow's confirmed bookings (all payment types)
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

  // 2. Day-of check-in emails for today's no-card bookings (no-fee-policy courses).
  //    These golfers never had a cancellation cutoff, so they haven't been emailed yet
  //    about checking in. Send once in the morning so they know to show up and pay.
  const todayNoCardBookings = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
      paymentStatus: 'no_payment_method',
      teeTime: { date: todayStr },
    },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true } },
    },
  });

  let noCardSent = 0;
  for (const booking of todayNoCardBookings) {
    try {
      await sendCheckInAvailableEmail({
        golferName: booking.golferName,
        golferEmail: booking.golferEmail,
        courseName: booking.course.name,
        date: booking.teeTime.date,
        time: booking.teeTime.time,
        bookingId: booking.id,
        checkInToken: booking.checkInToken,
      });
      noCardSent++;
    } catch (err) { console.error(`Day-of check-in email failed for ${booking.golferEmail}:`, err); }
  }

  return NextResponse.json({ success: true, sent, total: tomorrowBookings.length, noCardSent, noCardTotal: todayNoCardBookings.length });
}
