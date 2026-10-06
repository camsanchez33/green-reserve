import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { cronRoute } from '@/lib/cron-log';
import { prisma } from '@/lib/prisma';
import { chargeOnConnectedAccount } from '@/lib/stripe';
import { recordBookingEventSafe } from '@/lib/booking-events';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { holdsAtCutoff, bookingWindowHours } from '@/lib/cancel-policy';
import { markNoShow, dueAutoNoShows } from '@/lib/no-show-fee';
import { cutoffWarningDue, checkInEmailDue } from '@/lib/cron-windows';
import {
  sendCancellationWarningEmail,
  sendCancellationFeeChargedEmail,
  sendCheckInAvailableEmail,
} from '@/lib/email';
import { retryMissingAgreementPdfs } from '@/lib/agreement-sign';
import { sendAgreementBumpNotices } from '@/lib/agreement-required';
import { sendCallReminders } from '@/lib/call-invite';

/**
 * Runs every hour (Vercel Pro). Handles all time-sensitive booking actions:
 *
 * 1. WARNING EMAIL  — fee courses: fires ~1 hour before the cancellation cutoff
 *    so the golfer can still cancel for free. Window: cutoff is 15–75 min out
 *    (cutoffWarningDue — 60 wide so hourly runs never step over it).
 *
 * 2. CHARGE         — fee courses: charges the late-cancellation fee the moment
 *    the window closes. paymentStatus update acts as dedup so the daily
 *    cancellation-cutoff cron (safety net) won't double-charge.
 *
 * 3. CHECK-IN EMAIL — no-fee courses: fires once the tee time is within the
 *    course's checkInWindowHours, with the golfer's check-in link
 *    (checkInEmailDue). Sets paymentStatus = 'awaiting_checkin' as dedup.
 *
 * 4. AGREEMENT PDFS — AG-2: signed agreements whose courtesy PDF failed to
 *    render or store get another go (the row is the record either way).
 *
 * 6. CALL REMINDERS — SC-3: "Talking tomorrow" to the course 24 h before each
 *    scheduled discovery call, once per call (RateLimit key as the belt).
 */
export const GET = cronRoute('hourly', async (req: NextRequest) => {
  // cronRoute authorises before logging; the check stays here too so every
  // cron route is visibly guarded on its own.
  const denied = cronAuthFailure(req);
  if (denied) return denied;

  const now = new Date();
  const results = { warnings: 0, charged: 0, checkIns: 0, autoNoShows: 0, failed: 0 };

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
    const windowHours = bookingWindowHours(booking, booking.course);
    const cutoffMs = teeMs - windowHours * 3600 * 1000;
    const minsToCutoff = (cutoffMs - now.getTime()) / 60000;

    if (cutoffWarningDue(minsToCutoff)) {
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
          cancellationHours: windowHours,
          checkInToken: booking.checkInToken,
        });
        results.warnings++;
      } catch (err) {
        console.error(`Warning email failed for booking ${booking.id}:`, err);
        results.failed++;
      }
    } else if (cutoffMs <= now.getTime()) {
      // ── Charge (cutoff passed) ──
      // SP-B: only "hold at the cutoff" bookings are charged here. Under "only if
      // they cancel late" the fee is charged by the cancellation itself.
      if (!holdsAtCutoff(booking)) continue;
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

        // EV-1: the card was charged above, so the hold is recorded with ONE
        // plain update (no transaction that could time out after the money
        // moved) and the fee_charged event is written after, best-effort. Both
        // crons share an idempotency key, so the PaymentIntent id dedupes it.
        {
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: 'cancellation_fee_charged',
              cancellationFeeChargeId: pi.id,
              cancellationFeeChargedAt: new Date(),
            },
          });
          await recordBookingEventSafe({
            bookingId: booking.id, courseId: booking.courseId, type: 'fee_charged', actor: { type: 'cron' },
            amountCents: Math.round(booking.cancellationFeeTotal), playerCount: booking.players,
            teeTimeAt: new Date(teeMs), stripeId: pi.id, metadata: { reason: 'cutoff_hold' },
          });
        }

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
  // FB-3: no-fee courses collect a card now too, so their bookings are
  // 'card_on_file' with a $0 hold fee — section 2 skips those, and they need
  // this reminder exactly as the old no-card bookings did.
  const noCardBookings = await prisma.booking.findMany({
    // SP-B: plus card-on-file bookings whose late fee is charged on a late cancel
    // (no hold at the cutoff) — they need the check-in link exactly like these.
    where: { status: 'confirmed', OR: [{ paymentStatus: 'no_payment_method' }, { paymentStatus: 'card_on_file', cancellationFeeTotal: { lte: 0 } }, { paymentStatus: 'card_on_file', lateFeeTimingAtBooking: { in: ['late_cancel', 'late_cancel_or_no_show'] } }] },
    include: {
      teeTime: { select: { date: true, time: true } },
      course: { select: { name: true, timezone: true, checkInWindowHours: true } },
    },
  });

  for (const booking of noCardBookings) {
    const minsToTee = (teeToUtcMs(booking.teeTime.date, booking.teeTime.time, booking.course.timezone) - now.getTime()) / 60000;
    const windowMins = booking.course.checkInWindowHours * 60;
    if (!checkInEmailDue(minsToTee, windowMins)) continue;

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

  // ─── 3b: Automatic no-show (SP-B) ────────────────────────────────────────────
  // Cam 2026-10-05: "if the player never checked in then it could be a no show".
  // A booking made under a policy with automatic no-show, still confirmed and
  // nobody checked in N minutes after its tee time, is marked a no-show through
  // the same helper the counter uses (lib/no-show-fee) — same charges, same
  // "still coming" undo. Runs hourly, so a mark can land up to an hour after N.
  // Which bookings are due: dueAutoNoShows() in lib/no-show-fee.
  for (const id of await dueAutoNoShows(now)) {
    try {
      await markNoShow(id, { type: 'cron' }, { auto: true });
      results.autoNoShows++;
    } catch (err) {
      console.error(`Automatic no-show failed for booking ${id}:`, err);
      results.failed++;
    }
  }

  // ─── 4: Agreement PDFs that never made it to storage ─────────────────────────
  let agreementPdfs = { tried: 0, stored: 0 };
  try { agreementPdfs = await retryMissingAgreementPdfs(); } catch (err) { console.error('Agreement PDF retry failed:', err); }

  // ─── 5: Day-0 notice of an agreement bump (AG-3) — idempotent via noticeSentAt ───
  let agreementNotices = { versions: 0, notified: 0, failed: 0 };
  try { agreementNotices = await sendAgreementBumpNotices(now); } catch (err) { console.error('Agreement bump notices failed:', err); }

  // ─── 6: SC-3 §3 — call reminders, 24 h out, once per call ─────────────────────
  let callReminders = { due: 0, sent: 0, failed: 0, skipped: 0 };
  try { callReminders = await sendCallReminders(now); } catch (err) { console.error('Call reminders failed:', err); }

  return NextResponse.json({ success: true, ...results, agreementPdfs, agreementNotices, callReminders });
});
