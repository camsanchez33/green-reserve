import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { cronRoute } from '@/lib/cron-log';
import { prisma } from '@/lib/prisma';
import { chargeCutoffHold } from '@/lib/cutoff-hold';
import { sendCheckInLinkOnce } from '@/lib/check-in-email';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { holdsAtCutoff, bookingWindowHours } from '@/lib/cancel-policy';
import { markNoShow, dueAutoNoShows, chargeNoShow, dueNoShowCharges } from '@/lib/no-show-fee';
import { cutoffWarningDue, checkInEmailDue } from '@/lib/cron-windows';
import { sendCancellationWarningEmail } from '@/lib/email';
import { retryMissingAgreementPdfs } from '@/lib/agreement-sign';
import { sendAgreementBumpNotices } from '@/lib/agreement-required';
import { sendCallReminders } from '@/lib/call-invite';
import { recordPendingShopTax } from '@/lib/sales-tax';
import { reversePendingShopRefundTax } from '@/lib/shop-sales';
import { recordPendingRoundShopTax } from '@/lib/round-shop-tax';
import { runAdminChecks } from '@/lib/admin-checks';

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
 * 8. ADMIN CHECKS   — AW-5: urgent problems emailed to the admin inbox once each
 *    (lib/admin-checks.ts), and the morning digest on the first run after 7am ET.
 */
// AW-5: step 8 may make one model call (bounded at 60s) and two Stripe reads, once a day.
export const maxDuration = 300;

export const GET = cronRoute('hourly', async (req: NextRequest) => {
  // cronRoute authorises before logging; the check stays here too so every
  // cron route is visibly guarded on its own.
  const denied = cronAuthFailure(req);
  if (denied) return denied;

  const now = new Date();
  const results = { warnings: 0, charged: 0, checkIns: 0, autoNoShows: 0, noShowCharges: 0, failed: 0 };

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
          lateFeeTiming: booking.lateFeeTimingAtBooking,
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
      // lib/cutoff-hold re-reads the booking and records only a charge on a
      // booking that is still confirmed with a card on file.
      if (!holdsAtCutoff(booking)) continue;
      try {
        const r = await chargeCutoffHold(booking.id, now);
        if (r === 'charged') results.charged++;
        else if (r === 'refund_failed' || r === 'declined') results.failed++;
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

    // R-CRON-007: claimed, sent, and put back for the next run if the send fails.
    try {
      const r = await sendCheckInLinkOnce(booking);
      if (r === 'sent') results.checkIns++;
      else if (r === 'failed') results.failed++;
    } catch (err) {
      console.error(`Check-in email failed for booking ${booking.id}:`, err);
      results.failed++;
    }
  }

  // ─── 3b: Automatic no-show (SP-B) ────────────────────────────────────────────
  // Cam 2026-10-05: "if the player never checked in then it could be a no show".
  // A booking made under a policy with automatic no-show, still confirmed and
  // nobody checked in N minutes after its tee time, is marked a no-show through
  // the same helper the counter uses (lib/no-show-fee): flagged only, charged
  // at the course's midnight by 3c, same "still coming" undo. Runs hourly, so a mark can land up to an hour after N.
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

  // ─── 3c: No-show charges at the course's midnight (NS-EOD, Cam 2026-10-06) ───
  // A mark only flags the booking. Once the course's local date has passed the
  // tee date, every booking still flagged and never checked in is charged —
  // so a late group checked in before midnight is never charged at all.
  for (const id of await dueNoShowCharges(now)) {
    try {
      await chargeNoShow(id);
      results.noShowCharges++;
    } catch (err) {
      console.error(`No-show charge failed for booking ${id}:`, err);
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

  // ─── 7: W2-7 part B — record sales tax for paid pro-shop sales still missing it ──
  let shopTaxRecorded = 0;
  try { shopTaxRecorded = await recordPendingShopTax(); } catch (err) { console.error('Shop sales tax recording failed:', err); }
  // POS-3: and take refunded walk-up sales off it (after the recording above, which a reversal needs).
  let shopTaxReversed = 0;
  try { shopTaxReversed = await reversePendingShopRefundTax(); } catch (err) { console.error('Shop refund tax reversal failed:', err); }
  // W2-7 B2: and for paid rounds whose shop items carried sales tax.
  let roundShopTaxRecorded = 0;
  try { roundShopTaxRecorded = await recordPendingRoundShopTax(); } catch (err) { console.error('Round shop-item sales tax recording failed:', err); }

  // ─── 8: AW-5 — the admin's urgent alerts and the morning digest (last: it only reads, and never blocks the steps above) ──
  const adminChecks = await runAdminChecks(now);

  return NextResponse.json({ success: true, ...results, agreementPdfs, agreementNotices, callReminders, shopTaxRecorded, shopTaxReversed, roundShopTaxRecorded, adminChecks });
});
