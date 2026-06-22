import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { chargeOnConnectedAccount } from '@/lib/stripe';
import { sendCancellationFeeChargedEmail, sendCheckInAvailableEmail } from '@/lib/email';

/**
 * Runs once daily (Vercel Hobby plan caps frequency at once/day). Processes
 * all confirmed bookings whose cancellation cutoff has now passed:
 *
 * - Course HAS a late-cancellation fee policy (booking.cancellationFeeTotal > 0):
 *     Charge the flat fee directly on the course's connected Stripe account.
 *     This holds the golfer's spot and can be refunded when they check in.
 *
 * - Course has NO late-cancellation fee policy (cancellationFeeTotal === 0):
 *     No charge — just fire a "Check In & Pay" reminder email so the golfer
 *     knows the free-cancel window is closed and they should head to the course.
 *     Sets paymentStatus = 'awaiting_checkin' to avoid resending daily.
 *
 * Bookings the golfer already cancelled are excluded by status:'confirmed'.
 * A late-running cron can never double-charge someone who cancelled in the
 * meantime, because status='cancelled' falls out of the candidate filter.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Fetch ALL confirmed, pre-cutoff card-on-file bookings in one query.
  // Branching (charge vs. email-only) is decided per-booking inside the loop.
  const candidates = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
      paymentStatus: 'card_on_file',
    },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, cancellationHours: true, stripeAccountId: true, stripeAccountActive: true } },
    },
  });

  let charged = 0;
  let emailedNoPolicy = 0;
  let skippedNoCard = 0;
  let skippedNoConnectedAccount = 0;
  let failed = 0;

  for (const booking of candidates) {
    const teeDateTime = new Date(`${booking.teeTime.date}T${booking.teeTime.time}:00`);
    const cutoff = new Date(teeDateTime.getTime() - booking.course.cancellationHours * 60 * 60 * 1000);
    if (cutoff > now) continue; // cancellation window still open — nothing to do yet

    if (booking.cancellationFeeTotal > 0) {
      // ── Fee policy: charge the card ─────────────────────────────────────────
      if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) { skippedNoCard++; continue; }
      if (!booking.course.stripeAccountActive || !booking.course.stripeAccountId) { skippedNoConnectedAccount++; continue; }

      try {
        const paymentIntent = await chargeOnConnectedAccount({
          customerId: booking.stripeCustomerId,
          paymentMethodId: booking.stripePaymentMethodId,
          connectedAccountId: booking.course.stripeAccountId,
          amountCents: Math.round(booking.cancellationFeeTotal),
          applicationFeeCents: 0,
          description: `Late-cancellation fee — ${booking.course.name} — booking ${booking.id}`,
        });

        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'cancellation_fee_charged',
            cancellationFeeChargeId: paymentIntent.id,
            cancellationFeeChargedAt: new Date(),
          },
        });

        await sendCancellationFeeChargedEmail({
          golferName: booking.golferName,
          golferEmail: booking.golferEmail,
          courseName: booking.course.name,
          date: booking.teeTime.date,
          time: booking.teeTime.time,
          feeAmount: booking.cancellationFeeTotal,
          bookingId: booking.id,
          checkInToken: booking.checkInToken,
        }).catch(console.error);

        charged++;
      } catch (err) {
        console.error(`Cancellation-fee charge failed for booking ${booking.id}:`, err);
        failed++;
      }
    } else {
      // ── No fee policy: email only ────────────────────────────────────────────
      try {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: 'awaiting_checkin' },
        });

        await sendCheckInAvailableEmail({
          golferName: booking.golferName,
          golferEmail: booking.golferEmail,
          courseName: booking.course.name,
          date: booking.teeTime.date,
          time: booking.teeTime.time,
          bookingId: booking.id,
          checkInToken: booking.checkInToken,
        }).catch(console.error);

        emailedNoPolicy++;
      } catch (err) {
        console.error(`No-policy cutoff email failed for booking ${booking.id}:`, err);
        failed++;
      }
    }
  }

  return NextResponse.json({ success: true, charged, emailedNoPolicy, skippedNoCard, skippedNoConnectedAccount, failed, totalCandidates: candidates.length });
}
