import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { prisma } from '@/lib/prisma';
import { chargeOnConnectedAccount } from '@/lib/stripe';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import {
  sendCancellationWarningEmail,
  sendCancellationFeeChargedEmail,
  sendCheckInAvailableEmail,
} from '@/lib/email';
import { retryMissingAgreementPdfs } from '@/lib/agreement-sign';
import { sendAgreementBumpNotices } from '@/lib/agreement-required';

/**
 * Runs every hour (Vercel Pro). Handles all time-sensitive booking actions:
 *
 * 1. WARNING EMAIL  — fee courses: fires ~1 hour before the cancellation cutoff
 *    so the golfer can still cancel for free. Window: cutoff is 45–75 min out.
 *
 * 2. CHARGE         — fee courses: charges the late-cancellation fee the moment
 *    the window closes. paymentStatus update acts as dedup so the daily
 *    cancellation-cutoff cron (safety net) won't double-charge.
 *
 * 3. CHECK-IN EMAIL — no-fee courses: fires ~3 hours before the tee time with
 *    the golfer's check-in link. Window: tee time is 165–195 min out.
 *    Sets paymentStatus = 'awaiting_checkin' as dedup.
 *
 * 4. AGREEMENT PDFS — AG-2: signed agreements whose courtesy PDF failed to
 *    render or store get another go (the row is the record either way).
 */
export async function GET(req: NextRequest) {
  const denied = cronAuthFailure(req);
  if (denied) return denied;

  const now = new Date();
  const results = { warnings: 0, charged: 0, checkIns: 0, failed: 0 };

  // ─── 1 & 2: Fee-policy bookings (card on file, fee > 0) ─────────────────────
  const feeBookings = await prisma.booking.findMany({
    where: { status: 'confirmed', paymentStatus: 'card_on_file' },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: {
        select: {
          name: true, slug: true, cancellationHours: true, timezone: true,
          stripeAccountId: true, stripeAccountActive: true,
        },
      },
    },
  });

  for (const booking of feeBookings) {
    if (booking.cancellationFeeTotal <= 0) continue;

    const teeMs = teeToUtcMs(booking.teeTime.date, booking.teeTime.time, booking.course.timezone);
    const cutoffMs = teeMs - booking.course.cancellationHours * 3600 * 1000;
    const minsToCutoff = (cutoffMs - now.getTime()) / 60000;

    if (minsToCutoff >= 45 && minsToCutoff < 75) {
      // ── Warning email (~1 hour before cutoff) ──
      try {
        await sendCancellationWarningEmail({
          golferName: booking.golferName,
          golferEmail: booking.golferEmail,
          courseName: booking.course.name,
          courseSlug: booking.course.slug,
          date: booking.teeTime.date,
          time: booking.teeTime.time,
          feeAmount: booking.cancellationFeeTotal,
          bookingId: booking.id,
          cancellationHours: booking.course.cancellationHours,
          checkInToken: booking.checkInToken,
        });
        results.warnings++;
      } catch (err) {
        console.error(`Warning email failed for booking ${booking.id}:`, err);
        results.failed++;
      }
    } else if (cutoffMs <= now.getTime()) {
      // ── Charge (cutoff passed) ──
      if (!booking.stripeCustomerId || !booking.stripePaymentMethodId) continue;
      if (!booking.course.stripeAccountActive || !booking.course.stripeAccountId) continue;

      try {
        const pi = await chargeOnConnectedAccount({
          customerId: booking.stripeCustomerId,
          paymentMethodId: booking.stripePaymentMethodId,
          connectedAccountId: booking.course.stripeAccountId,
          amountCents: Math.round(booking.cancellationFeeTotal),
          applicationFeeCents: 0,
          description: `Late-cancellation fee - ${booking.course.name} - booking ${booking.id}`,
          idempotencyKey: `cancelfee-${booking.id}-${booking.stripePaymentMethodId}`,
        });

        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus: 'cancellation_fee_charged',
            cancellationFeeChargeId: pi.id,
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

        results.charged++;
      } catch (err) {
        console.error(`Charge failed for booking ${booking.id}:`, err);
        results.failed++;
      }
    }
  }

  // ─── 3: No-fee check-in reminder (~3 hours before tee time) ─────────────────
  const noCardBookings = await prisma.booking.findMany({
    where: { status: 'confirmed', paymentStatus: 'no_payment_method' },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, timezone: true, checkInWindowHours: true } },
    },
  });

  for (const booking of noCardBookings) {
    const minsToTee = (teeToUtcMs(booking.teeTime.date, booking.teeTime.time, booking.course.timezone) - now.getTime()) / 60000;
    const windowMins = booking.course.checkInWindowHours * 60;
    if (minsToTee < windowMins - 15 || minsToTee >= windowMins + 15) continue; // ±15 min around the window

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
      });
      results.checkIns++;
    } catch (err) {
      console.error(`Check-in email failed for booking ${booking.id}:`, err);
      results.failed++;
    }
  }

  // ─── 4: Agreement PDFs that never made it to storage ─────────────────────────
  let agreementPdfs = { tried: 0, stored: 0 };
  try { agreementPdfs = await retryMissingAgreementPdfs(); } catch (err) { console.error('Agreement PDF retry failed:', err); }

  // ─── 5: Day-0 notice of an agreement bump (AG-3) — idempotent via noticeSentAt ───
  let agreementNotices = { versions: 0, notified: 0, failed: 0 };
  try { agreementNotices = await sendAgreementBumpNotices(now); } catch (err) { console.error('Agreement bump notices failed:', err); }

  return NextResponse.json({ success: true, ...results, agreementPdfs, agreementNotices });
}
