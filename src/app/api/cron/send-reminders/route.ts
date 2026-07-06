import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendReminderEmail, sendMembershipPaymentLinkEmail } from '@/lib/email';

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

  // ── Membership renewal reminders ──
  // Paid memberships expiring within 30 days get one renewal email with their
  // payment link. renewalRemindedAt is the dedup — cleared when they pay.
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + 30);
  const expiring = await prisma.courseMembership.findMany({
    where: {
      status: 'active',
      paymentStatus: { in: ['paid', 'paid_offline'] },
      renewalRemindedAt: null,
      expiresAt: { not: null, lte: cutoff, gte: now },
      payToken: { not: '' },
    },
    include: { tier: true, course: { select: { name: true, stripeAccountActive: true } } },
  });

  let renewalsSent = 0;
  for (const m of expiring) {
    if (!m.tier || m.tier.annualFee <= 0 || !m.course.stripeAccountActive) continue;
    try {
      await sendMembershipPaymentLinkEmail({
        name: m.inviteName,
        email: m.inviteEmail,
        courseName: m.course.name,
        tierName: m.tier.name,
        annualFee: m.tier.annualFee,
        initiationFee: 0,
        payLink: `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`,
        isRenewal: true,
      });
      await prisma.courseMembership.update({ where: { id: m.id }, data: { renewalRemindedAt: new Date() } });
      renewalsSent++;
    } catch (err) {
      console.error(`Renewal reminder failed for membership ${m.id}:`, err);
    }
  }

  return NextResponse.json({ success: true, sent, total: tomorrowBookings.length, renewalsSent });
}
