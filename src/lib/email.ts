import { Resend } from 'resend';
import { logSent, type SendMeta } from '@/lib/sent-messages';
import { SUPPORT_EMAIL, ADMIN_EMAIL, NOREPLY_EMAIL, OUTREACH_POSTAL_ADDRESS } from '@/lib/contact';
import { type ConfirmationParts } from './confirmation-parts';
import { type WelcomeInput } from './team-welcome';
import { prisma } from './prisma';
import { roundChargeCents } from './booking-fees';
import { courseFrom, type EmailCourse } from './email-layout';
import { BOOKING_ACCENT_COLOURS, bookingLookOf } from './booking-look';
import {
  bookingConfirmationEmail, bookingModifiedEmail, reminderEmail, cancellationWarningEmail, cancellationEmail,
  cancellationFeeChargedEmail, payLinkEmail, frostDelayEmail, courseNoticeEmail, roundReceiptLinkEmail, checkInReceiptEmail,
  refundEmail, teeTimeAlertEmail, alertConfirmEmail, memberInviteEmail, memberMagicLinkEmail, memberLoginCodeEmail,
  duesPayLinkEmail, duesReceiptEmail, autoRenewOnEmail, autoRenewReminderEmail, autoRenewDeclinedEmail, autoRenewOffEmail,
  statementEmail, statementDeclinedEmail, statementPaidEmail, eventSignupEmail, eventPayLinkEmail, eventPairingsEmail,
  shopPayLinkEmail, shopReceiptEmail, type BuiltEmail,
} from './email-golfer';
import {
  operatorBookingEmail, courseClosedEmail, staffWelcomeEmail, staffResetLinkEmail, operatorPasswordResetEmail, operatorVerifyEmail,
  twoFactorCodeEmail, passwordChangedEmail, messageNotificationEmail, announcementEmail, monthlyReviewEmail, lowStockEmail,
  signedAgreementsEmail, agreementBumpEmail, inquiryConfirmationEmail, inquiryAlreadyBuiltEmail, inquirySigninCodeEmail,
  detailsSheetConfirmationEmail, detailsRequestEmail, callReminderEmail, callScheduledEmail, onboardingChaseEmail,
  inquiryReplyEmail, inquiryDeclinedEmail, callInviteEmail, inquiryNotificationEmail, lockedOutAlertEmail, detailsSubmittedEmail,
  courseApprovedEmail, agreementBumpSummaryEmail, adminUrgentEmail, adminDigestEmail, adminTwoFactorEmail, adminPasswordResetEmail,
  ownerDeviceApprovalEmail, ownerSignInEmail, ownerPasswordChangedEmail, ownerPasskeyChangedEmail, outreachEmail, type DigestFacts,
} from './email-staff';
export { courseNoticeEmail };

let _resend: Resend | null = null;
/** Resend's options plus our own `meta` (BRAIN-1b), which never reaches Resend. */
type SendOptions = Parameters<Resend['emails']['send']>[0] & { meta?: SendMeta };
type Sender = { emails: { send: (opts: SendOptions) => ReturnType<Resend['emails']['send']> } };

function getResend(): Sender {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
    // The Resend SDK (6.x) RETURNS { data: null, error } on a rejected send —
    // bad key, unverified domain, refused address — it does not throw. 56 of
    // the senders below never looked, so every failure read as success: every
    // .catch() and try/catch around them was dead code. Make the one choke
    // point throw, so each caller's existing handling finally sees it.
    const send = _resend.emails.send.bind(_resend.emails);
    _resend.emails.send = (async (...args: Parameters<typeof send>) => {
      // MAIL-1: every From (support@, admin@, billing@) is a real Workspace
      // alias, so a reply goes back to it with no replyTo override.
      const [opts, ...rest] = args;
      // Cam 2026-10-19 ("verification emails are not sending as quick"): one
      // line per send — Resend's message id and how long Resend took to accept
      // it — so a slow email can be traced in the Vercel logs and matched in
      // Resend's dashboard. Only the recipient's domain is logged: subjects
      // carry 2FA codes and addresses are personal data.
      const started = Date.now();
      const to = (opts as { to?: string | string[] } | undefined)?.to;
      const domain = String(Array.isArray(to) ? to[0] : to ?? '').split('@')[1] ?? '?';
      // BRAIN-1b: `meta` (what this email is, which course/booking it is about)
      // is ours, not Resend's — taken off before sending, written to the send log.
      const meta: SendMeta = (opts as { meta?: SendMeta }).meta ?? { kind: 'email' };
      delete (opts as { meta?: SendMeta }).meta;
      // Cam 2026-10-28: an @noemail.greenreserve.app address has no inbox (walk-ins
      // with no email, sample data) — never hand one to Resend. Skipped and logged.
      const rcpts = (Array.isArray(to) ? to : [to]).filter(Boolean).map(String);
      if (rcpts.length > 0 && rcpts.every(a => a.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN))) {
        await logSent({ ...meta, channel: 'email', to, status: 'skipped', error: 'no inbox (placeholder address)' });
        return { data: { id: '' }, error: null, headers: null } as Awaited<ReturnType<typeof send>>;
      }
      let r: Awaited<ReturnType<typeof send>>;
      try {
        r = await send(opts, ...rest);
      } catch (err) {
        await logSent({ ...meta, channel: 'email', to, status: 'failed', error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
      if (r.error) {
        console.error(`[email] rejected after ${Date.now() - started}ms to @${domain}: ${r.error.message || r.error.name}`);
        await logSent({ ...meta, channel: 'email', to, status: 'failed', error: r.error.message || r.error.name });
        throw new Error(`Resend rejected the email: ${r.error.message || r.error.name || 'unknown error'}`);
      }
      console.log(`[email] accepted by Resend in ${Date.now() - started}ms, id ${r.data?.id ?? '?'}, to @${domain}`);
      await logSent({ ...meta, channel: 'email', to, status: 'sent', providerId: r.data?.id });
      return r;
    }) as typeof send;
  }
  return _resend as unknown as Sender;
}
// MAIL-1 (Cam 2026-10-22), emails redo (Cam 2026-11-19): golfer emails come from the course at
// noreply@ (courseFrom); GreenReserve's own come from admin@ where a reply should reach Cam
// (onboarding, agreements, Cam's own replies) and noreply@ for codes, security alerts and routine
// staff notices, which point to Course support instead (lib/email-staff).
const FROM_ADMIN = `GreenReserve <${ADMIN_EMAIL}>`;
// No inbox exists, so a reply bounces (Cam 2026-10-22): these emails never ask for one.
const FROM_NOREPLY = `GreenReserve <${NOREPLY_EMAIL}>`;

/** subject, html and the plain-text version, for a Resend send. */
const mail = (e: BuiltEmail) => ({ subject: e.subject, html: e.html, text: e.text });

/**
 * Emails and texts redo (Cam 2026-11-19): golfer emails come from the course — the From name is the
 * course's full name at noreply@ — with the course's name, address and phone in the footer and its
 * colour on the bar and button. Looked up here from the booking (or the course) the email is about,
 * so no caller changes what it passes. Never throws: on any miss the email still goes, with the name only.
 */
export async function emailCourse(ref: { bookingId?: string | null; courseId?: string | null; courseSlug?: string | null }, courseName: string): Promise<{ course: EmailCourse; booking: { totalCents: number; players: number } | null }> {
  const select = { name: true, address: true, city: true, state: true, zipCode: true, phone: true, proShopPhone: true, brandColor: true, bookingLook: true, bookingAccent: true } as const;
  try {
    let c: { name: string; address: string; city: string; state: string; zipCode: string; phone: string; proShopPhone: string; brandColor: string; bookingLook: string; bookingAccent: string | null } | null = null;
    let booking: { totalCents: number; players: number } | null = null;
    if (ref.bookingId) {
      const b = await prisma.booking.findUnique({ where: { id: ref.bookingId }, select: { totalAmount: true, shopTotalCents: true, shopFeeCents: true, shopTaxCents: true, accessFeeTotal: true, feePaidCents: true, roundChargedCents: true, players: true, course: { select } } });
      // What the pay page charges (api/checkin roundChargedTotal): the round plus its shop items, their fee and tax, less any fee paid at booking.
      if (b) { c = b.course; booking = { totalCents: b.roundChargedCents ?? roundChargeCents(b), players: b.players }; }
    }
    if (!c && ref.courseId) c = await prisma.course.findUnique({ where: { id: ref.courseId }, select });
    if (!c && ref.courseSlug) c = await prisma.course.findUnique({ where: { slug: ref.courseSlug }, select });
    if (!c) return { course: { name: courseName }, booking };
    const look = bookingLookOf(c);
    const preset = look.accent ? BOOKING_ACCENT_COLOURS[look.accent].light : null;
    const stateZip = [c.state, c.zipCode].filter(Boolean).join(' ');
    return {
      course: {
        name: c.name || courseName,
        address: [c.address, c.city, stateZip].map(x => (x ?? '').trim()).filter(Boolean).join(', '),
        phone: (c.proShopPhone || c.phone || '').trim(),
        accent: preset ? preset.acc : c.brandColor,
        onAccent: preset ? preset.onAcc : undefined,
      },
      booking,
    };
  } catch (err) {
    console.error('[email] course lookup failed:', err instanceof Error ? err.message : String(err));
    return { course: { name: courseName }, booking: null };
  }
}

// EMAIL-2 (Cam 2026-10-20: "I don't think this looks professional or clean").
// One look for every email: a cream page, the GreenReserve lockup above one white
// sheet (LOGO-1: top-left, a 3x PNG because email clients don't show SVG), and the
// green golfer alone in the footer (LOGO-2) with the name and the inbox. Headlines
// are Georgia — the closest face every client has to the site's EB Garamond —
// and every colour is a brand token (ink #141814, body #3F453E, muted #6B706A,
// line #E3E4DE, pine #173B2A, cream #F6F4EC); the per-email bodies were moved
// onto the same tokens in the same pass.
/** `contact` is the footer's "Questions?" address — the audience's own inbox. */
function baseTemplate(content: string, contact: string = SUPPORT_EMAIL) {
  const site = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F6F4EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4EC;">
    <tr><td align="center" style="padding:40px 20px 32px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 4px 28px;">
          <img src="${site}/brand/email-logo-3x.png" width="168" height="32" alt="GreenReserve" style="display:block;border:0;outline:none;text-decoration:none;width:168px;height:32px;" />
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:8px;padding:36px 36px 32px;color:#3F453E;font-size:15px;line-height:1.6;">${content}</td></tr>
        <tr><td align="center" style="padding:28px 4px 0;">
          <img src="${site}/brand/email-golfer-3x.png" width="22" height="27" alt="" style="display:block;border:0;outline:none;width:22px;height:27px;margin:0 auto 10px;" />
          <div style="font-size:12px;line-height:1.6;color:#6B706A;">
            GreenReserve &middot; <a href="https://greenreserve.app" style="color:#6B706A;text-decoration:none;">greenreserve.app</a><br>
            Questions? <a href="mailto:${contact}" style="color:#6B706A;text-decoration:none;">${contact}</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** "Jane Smith" → "Jane". Greetings use the first name only (EMAIL-2). */
export function firstName(full: string | null | undefined): string {
  return (full ?? '').trim().split(/\s+/)[0] || 'there';
}

export interface BookingEmailData {
  golferName: string; golferEmail: string; courseName: string; courseAddress: string; courseSlug?: string;
  date: string; time: string; players: number; holes: number; productLabel?: string | null;
  greenFeeTotal: number; cartFeeTotal: number; accessFeeTotal: number; totalAmount: number;
  /** FEE-AT-BOOKING: GreenReserve's fee was charged when they booked (not at check-in). */
  feePaidAtBooking?: boolean;
  bookingId: string; appliedRate: string;
  rangeBallsTotal?: number; cancellationFeeTotal?: number; cancellationHours?: number;
  checkInToken?: string;
  noCard?: boolean; // true for no-fee-policy courses where no card was collected
  /** SP-B: describePolicy(policy).lines — the exact terms the golfer booked under. */
  policyLines?: string[];
  /** PERS-1: the course's optional note to golfers (Settings → Your course). */
  confirmationNote?: string | null;
  /** Settings data (Cam 2026-11-17): the course's own parts (arrival, dress code, parking, note, contact). When given, they replace confirmationNote. */
  parts?: ConfirmationParts;
  /** "Send me a test" from Settings: sample booking, subject marked Test, no booking reference. */
  testSend?: boolean;
}

// SD-5: a walk-in entered without an email gets a placeholder address so the
// Booking row (email required) can exist; nothing is ever sent to it.
export const PLACEHOLDER_EMAIL_DOMAIN = '@noemail.greenreserve.app';
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  const ctx = await emailCourse({ bookingId: data.testSend ? null : data.bookingId, courseSlug: data.courseSlug }, data.courseName);
  const e = bookingConfirmationEmail(data, ctx.course);
  if (data.testSend) {
    await getResend().emails.send({ meta: { kind: 'booking_confirmation_test', courseSlug: data.courseSlug }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(e) });
    return;
  }
  await getResend().emails.send({ meta: { kind: 'booking_confirmation', bookingId: data.bookingId, courseSlug: data.courseSlug }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(e) });
}

export async function sendOperatorBookingNotification(data: BookingEmailData & { operatorEmail: string }) {
  // "Expected" = green + cart fee — matches the Payments page and dashboard tee sheet. Nothing is charged yet.
  await getResend().emails.send({ meta: { kind: 'operator_booking_notification', bookingId: data.bookingId, courseSlug: data.courseSlug }, from: FROM_NOREPLY, to: data.operatorEmail, ...mail(operatorBookingEmail(data)) });
}

export async function sendCancellationEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; players: number; bookingId: string;
  feeCharged: boolean; feeAmount: number; // feeCharged = cancelled after the window closed, fee already taken & non-refundable
  refunded?: boolean; // the round or a waived fee was refunded on this cancel
  // MP-5b: set when the golfer did not ask for this — the course closed. A
  // cancellation with no explanation reads as a mistake or a bait-and-switch.
  reason?: string;
}) {
  if (isPlaceholderEmail(data.golferEmail)) return; // SD-5: walk-in without an email
  const ctx = await emailCourse({ bookingId: data.bookingId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'cancellation_email', bookingId: data.bookingId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(cancellationEmail(data, ctx.course)) });
}

// MP-5b. Taking a course offline or archiving it used to happen entirely
// behind the operator's back: their page stopped accepting bookings, any
// future tee times were left dangling, and nobody told them. If we cancelled
// their golfers' rounds, they need to know before a golfer phones them about it.
export async function sendCourseClosedNotice(data: {
  operatorName: string; operatorEmail: string; courseName: string;
  action: 'offline' | 'archived';
  cancelledCount: number;
}) {
  await getResend().emails.send({ meta: { kind: 'course_closed_notice' }, from: FROM_ADMIN, to: data.operatorEmail, ...mail(courseClosedEmail(data)) });
}

export async function sendCancellationFeeChargedEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; feeAmount: number; bookingId: string; checkInToken?: string | null;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'cancellation_fee_charged_email', bookingId: data.bookingId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(cancellationFeeChargedEmail(data, ctx.course)) });
}

// Sent ~1 hour before the free-cancellation window closes for bookings that
// have a card on file and a cancellation fee. Gives the golfer a heads-up so
// they can cancel for free before the cutoff charges their card automatically.
export async function sendCancellationWarningEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseSlug?: string;
  date: string; time: string; feeAmount: number; bookingId: string; cancellationHours: number;
  checkInToken?: string | null;
  /** The booking's lateFeeTimingAtBooking — the consequence line depends on it (R-CRON-004). */
  lateFeeTiming?: string | null;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId, courseSlug: data.courseSlug }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'cancellation_warning_email', bookingId: data.bookingId, courseSlug: data.courseSlug }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(cancellationWarningEmail(data, ctx.course)) });
}

// Fired by the cutoff cron for courses with NO cancellation fee policy — no
// charge is made, but the free-cancel window is closed, so we let the golfer
// know they're locked in and give them a direct check-in link.
export async function sendCheckInAvailableEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; bookingId: string; checkInToken?: string | null;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId }, data.courseName);
  const e = payLinkEmail({ ...data, players: ctx.booking?.players, totalCents: ctx.booking?.totalCents }, ctx.course);
  await getResend().emails.send({ meta: { kind: 'check_in_available_email', bookingId: data.bookingId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(e) });
}

/** RECEIPT-1 (Cam 2026-11-08: a paper, text or email receipt when they pay at the counter): the round's receipt page. */
export async function sendRoundReceiptLinkEmail(data: {
  golferName: string; to: string; courseName: string; date: string; time: string; bookingId: string; checkInToken: string;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'round_receipt_link_email', bookingId: data.bookingId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.to, ...mail(roundReceiptLinkEmail(data, ctx.course)) });
}

export async function sendBookingModifiedEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseSlug?: string;
  date: string; time: string; players: number; holes: number; productLabel?: string | null;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number;
  accessFeeTotal: number; totalAmount: number; bookingId: string; checkInToken: string | null;
  /** Already checked in (and paid): no change link, the total reads as paid. */
  checkedIn?: boolean;
  /** POS-1a: pro-shop items on the booking and GreenReserve's fee on them — added to the total. */
  shopTotalCents?: number; shopFeeCents?: number;
  /** W2-7 B2: sales tax on those items — added to the total. */
  shopTaxCents?: number;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId, courseSlug: data.courseSlug }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'booking_modified_email', bookingId: data.bookingId, courseSlug: data.courseSlug }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(bookingModifiedEmail(data, ctx.course)) });
}

// B-9 frost delay: the course pushed the start back and this group moved to a
// later tee time. Says why, the old and new time, and that the price stands.
export async function sendFrostDelayEmail(data: {
  golferName: string; golferEmail: string; courseName: string; date: string;
  oldTime: string; newTime: string; players: number; bookingId: string; checkInToken: string | null;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'frost_delay_email', bookingId: data.bookingId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(frostDelayEmail(data, ctx.course)) });
}

// Fired the moment performCheckIn() successfully charges a golfer for their
// round at check-in (lib/email-golfer checkInReceiptEmail).
export async function sendCheckInReceiptEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseSlug?: string;
  date: string; time: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number;
  /** The whole charge: the round plus any pro-shop items and their fee (POS-1a roundChargeCents). */
  totalAmount: number;
  shopLines?: { name: string; unitPriceCents: number; quantity: number }[];
  shopFeeCents?: number;
  /** W2-7 B2: sales tax on the shop items (already inside totalAmount). */
  shopTaxCents?: number;
  /** FEE-AT-BOOKING: the part of the booking fee charged when they booked (not inside totalAmount). */
  feePaidAtBookingCents?: number;
  feeRefunded: boolean; feeRefundAmount: number;
  /** SD review: a fee was owed back and the automatic refund failed — say so, do not go quiet. */
  feeRefundFailed?: boolean;
  bookingId: string; checkInToken?: string | null;
}) {
  if (isPlaceholderEmail(data.golferEmail)) return; // SD-5: walk-in without an email
  const ctx = await emailCourse({ bookingId: data.bookingId, courseSlug: data.courseSlug }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'check_in_receipt_email', bookingId: data.bookingId, courseSlug: data.courseSlug }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(checkInReceiptEmail(data, ctx.course)) });
}

/** ALERTS-2: the stop link (a page with a Stop button) and the RFC 8058 one-click header. */
function alertStopUrls(token: string) {
  const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const url = `${base}/api/alerts/stop/${encodeURIComponent(token)}`;
  return {
    url,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** ALERTS-2: a tee time opened for an alert. First come, first served; nothing is held. */
export async function sendTeeTimeAlertEmail(data: {
  name: string; email: string; courseName: string; courseSlug: string; courseId?: string;
  date: string; time?: string; players: number; stopToken: string; lastDate?: string;
}) {
  const stop = alertStopUrls(data.stopToken);
  const ctx = await emailCourse({ courseId: data.courseId, courseSlug: data.courseSlug }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'tee_time_alert_email', courseSlug: data.courseSlug, courseId: data.courseId ?? null }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(teeTimeAlertEmail(data, ctx.course, stop.url)), headers: stop.headers });
}

/** ALERTS-2: a guest's alert turns on only from this link (a page with a button; GET changes nothing). */
export async function sendAlertConfirmEmail(data: {
  email: string; courseName: string; courseSlug: string; courseId: string; token: string;
  dates: string[]; players: number; phone?: string | null;
}) {
  const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const confirmUrl = `${base}/api/alerts/confirm/${encodeURIComponent(data.token)}`;
  const stop = alertStopUrls(data.token);
  const ctx = await emailCourse({ courseId: data.courseId, courseSlug: data.courseSlug }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'tee_time_alert_confirm', courseSlug: data.courseSlug, courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(alertConfirmEmail(data, ctx.course, confirmUrl, stop.url)), headers: stop.headers });
}

export async function sendReminderEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseAddress: string; courseSlug?: string;
  date: string; time: string; players: number; holes: number; productLabel?: string | null; bookingId: string; checkInToken?: string | null;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId, courseSlug: data.courseSlug }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'reminder_email', bookingId: data.bookingId, courseSlug: data.courseSlug }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(reminderEmail({ ...data, totalCents: ctx.booking?.totalCents }, ctx.course)) });
}


export async function sendOperatorPasswordResetEmail(data: {
  operatorName: string;
  operatorEmail: string;
  resetLink: string;
}) {
  await getResend().emails.send({ meta: { kind: 'operator_password_reset_email' }, from: FROM_NOREPLY, to: data.operatorEmail, ...mail(operatorPasswordResetEmail(data)) });
}

// Team (Cam 2026-11-17): the welcome email a course owner's invite sends. Its
// words come from lib/team-welcome.ts; the Invite popup previews this exact HTML.
// From admin@ (a real inbox): the footer invites them to answer it.
export function staffWelcomeHtml(data: WelcomeInput, setupLink: string): string {
  return staffWelcomeEmail(data, setupLink).html;
}

export async function sendStaffWelcomeEmail(data: WelcomeInput & { to: string; setupLink: string; courseId: string }) {
  const e = staffWelcomeEmail(data, data.setupLink);
  await getResend().emails.send({ meta: { kind: 'staff_welcome_email', courseId: data.courseId }, from: FROM_ADMIN, to: data.to, ...mail(e) });
}

// Team (Cam 2026-11-17): "Reset password emails a link (no temporary password)".
// The owner sent it, so it says so; the link is the staff reset link (1 hour, one use).
export async function sendStaffResetLinkEmail(data: { to: string; personName: string; ownerName: string; courseName: string; resetLink: string; courseId: string }) {
  await getResend().emails.send({ meta: { kind: 'staff_reset_link_email', courseId: data.courseId }, from: FROM_NOREPLY, to: data.to, ...mail(staffResetLinkEmail(data)) });
}

export async function sendAdminPasswordResetEmail(data: {
  adminName: string;
  adminEmail: string;
  resetLink: string;
}) {
  await getResend().emails.send({ meta: { kind: 'admin_password_reset_email' }, from: FROM_NOREPLY, to: data.adminEmail, ...mail(adminPasswordResetEmail(data)) });
}

export async function sendAdminPasswordChangedNotification(data: {
  adminName: string;
  adminEmail: string;
}) {
  await getResend().emails.send({ meta: { kind: 'admin_password_changed_notification' }, from: FROM_NOREPLY, to: data.adminEmail, ...mail(passwordChangedEmail({ email: data.adminEmail, admin: true })) });
}

// Verification-by-possession: arriving at the link in this email IS the proof
// of inbox ownership — there is no in-app "verify instantly" button.
export async function sendOperatorVerifyEmail(data: {
  operatorName: string;
  operatorEmail: string;
  verifyLink: string;
}) {
  await getResend().emails.send({ meta: { kind: 'operator_verify_email' }, from: FROM_NOREPLY, to: data.operatorEmail, ...mail(operatorVerifyEmail(data)) });
}

export async function sendGolferPasswordResetEmail(data: {
  golferName: string;
  golferEmail: string;
  resetLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">Reset your password</h1>
    <p style="margin:0 0 24px;color:#3F453E;font-size:15px;">
      Hi ${escHtml(firstName(data.golferName))} — we got a request to reset the password on your GreenReserve account (${escHtml(data.golferEmail)}).
      If this wasn't you, you can safely ignore this email.
    </p>
    <a href="${data.resetLink}" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set a New Password &rarr;
    </a>
    <p style="margin:0;color:#6B706A;font-size:12px;text-align:center;">
      This link expires in 1 hour. Questions? Reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#3F453E;">${SUPPORT_EMAIL}</a>
    </p>
  `);
  await getResend().emails.send({ meta: { kind: 'golfer_password_reset_email' },
    from: FROM_NOREPLY,
    to: data.golferEmail,
    subject: `Reset your GreenReserve password`,
    html,
  });
}

// Fired right after a correct password when the operator has 2FA enabled —
// gates issuing the real session cookie until this code is verified.
/**
 * Cam 2026-10-27: the ONE "your dashboard is ready" email a course owner gets —
 * from the build, a resend, early dashboard access or the preview. No password in
 * it: a single-use link (lib/operator-setup, SETUP_LINK_DAYS) to choose their own,
 * after which the Getting Started list walks them through reviewing and approving
 * their booking page, the operator agreement and Stripe.
 */
export async function sendDashboardSetupEmail(data: {
  operatorName: string; operatorEmail: string; courseName: string; setupUrl: string;
  /** The booking page is built and ready for them to review. */
  pageReady: boolean; linkDays: number;
}) {
  const steps = [
    data.pageReady ? 'Review your booking page, and approve it or tell us what to change.' : 'Look over your booking page as we finish it.',
    'Sign the operator agreement.',
    'Connect Stripe so payments reach your bank.',
  ];
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">${data.pageReady ? 'Your booking page is ready for a look' : 'Your dashboard is ready'}, ${escHtml(firstName(data.operatorName))}.</h1>
    <p style="margin:0 0 24px;color:#3F453E;font-size:15px;">Set your password to get into the GreenReserve dashboard for <strong>${escHtml(data.courseName)}</strong>.</p>
    <a href="${data.setupUrl}" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:15px;border-radius:6px;font-weight:600;font-size:16px;margin-bottom:24px;">Set your password</a>
    <p style="margin:0 0 8px;color:#141814;font-size:15px;font-weight:700;">Then your dashboard walks you through</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">${steps.map((t, i) => `
      <tr>
        <td style="padding:6px 12px 6px 0;width:26px;vertical-align:top;"><div style="width:22px;height:22px;border-radius:11px;background:#173B2A;color:#fff;font-size:12px;font-weight:600;line-height:22px;text-align:center;">${i + 1}</div></td>
        <td style="padding:7px 0;color:#141814;font-size:14px;line-height:1.5;">${escHtml(t)}</td>
      </tr>`).join('')}
    </table>
    <p style="margin:0;color:#6B706A;font-size:13px;">The link works once and expires in ${data.linkDays} days. If it has expired, use &ldquo;Forgot password&rdquo; on the sign-in page with ${escHtml(data.operatorEmail)}.</p>
  `, ADMIN_EMAIL);
  await getResend().emails.send({ meta: { kind: 'operator_setup_email' },
    from: FROM_ADMIN,
    to: data.operatorEmail,
    subject: subj(data.pageReady ? `Your ${data.courseName} booking page is ready for a look` : `Set up your ${data.courseName} dashboard`),
    html,
  });
}

/** An owner who already signs in: the (updated) page is waiting in their dashboard. Their sign-in is never touched. */
export async function sendPageReadyInDashboardEmail(data: { operatorName: string; operatorEmail: string; courseName: string }) {
  const site = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">Your booking page is ready for a look, ${escHtml(firstName(data.operatorName))}.</h1>
    <p style="margin:0 0 24px;color:#3F453E;font-size:15px;">We&rsquo;ve updated the booking page for <strong>${escHtml(data.courseName)}</strong>. Sign in to review it, then approve it or tell us what to change.</p>
    <a href="${site}/dashboard" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:15px;border-radius:6px;font-weight:600;font-size:16px;">Review it in your dashboard</a>
  `, ADMIN_EMAIL);
  await getResend().emails.send({ meta: { kind: 'operator_page_ready_email' },
    from: FROM_ADMIN,
    to: data.operatorEmail,
    subject: subj(`Your ${data.courseName} booking page is ready for a look`),
    html,
  });
}

export async function sendPreviewEmail(data: {
  contactName: string;
  contactEmail: string;
  courseName: string;
  previewUrl: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">Your page is ready for a look</h1>
    <p style="margin:0 0 24px;color:#3F453E;font-size:15px;">
      Hi ${firstName(data.contactName)} &mdash; we've finished building your GreenReserve page for <strong>${data.courseName}</strong>.
      Take a look and let us know if anything needs adjusting before we go live.
    </p>
    <a href="${data.previewUrl}" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:600;font-size:16px;margin-bottom:20px;">
      Preview Your Page &rarr;
    </a>
    <div style="background:#F6F4EC;border:1px solid #E3E4DE;border-radius:6px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;color:#6B706A;font-size:13px;">Booking is disabled on this preview link &mdash; it's only for you to review the layout and information. Reply to this email with any changes and we'll get them in quickly.</p>
    </div>
    <p style="margin:0 0 12px;color:#6B706A;font-size:13px;">Want to see your dashboard too? We can send you access &mdash; just reply.</p>
    <p style="margin:0 0 20px;color:#6B706A;font-size:13px;">When you log in, your Getting Started checklist will walk you through everything, including payments setup.</p>
    <p style="margin:0;color:#6B706A;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:${ADMIN_EMAIL}" style="color:#3F453E;">${ADMIN_EMAIL}</a>
    </p>
  `, ADMIN_EMAIL);
  await getResend().emails.send({ meta: { kind: 'preview_email' },
    from: FROM_ADMIN,
    to: data.contactEmail,
    replyTo: ADMIN_EMAIL,
    subject: `Preview: Your GreenReserve page for ${data.courseName}`,
    html,
  });
}

// Combined send (RUN_QUEUE "Send Preview = one combined send") — pressing
// Send Preview now delivers the page preview AND dashboard login access in
// one email, so a course never has to wait on a second message to start
// exploring their dashboard. Admin-initiated only, never automatic.

// Sent during Building stage when admin clicks "Send dashboard access" —
// gives early dashboard access before the course goes live.

// Sent when going live and the operator already has dashboard access —
// shorter "you're live" framing instead of the full orientation email.
export async function sendGoLiveSimpleEmail(data: {
  operatorName: string;
  operatorEmail: string;
  courseName: string;
  courseSlug: string;
}) {
  const bookingUrl = `${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}`;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_URL}/dashboard`;
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#EEF3EC;color:#2F6B45;font-size:13px;font-weight:600;padding:4px 14px;border-radius:6px;">&#10003; You&rsquo;re live</span></div>
    <h1 style="margin:16px 0 4px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">${data.courseName} is live on GreenReserve.</h1>
    <p style="margin:0 0 24px;color:#3F453E;font-size:15px;">
      Golfers can find and book your tee sheet at
      <a href="${bookingUrl}" style="color:#173B2A;font-weight:600;">${bookingUrl.replace('https://', '')}</a>.
      New bookings will appear in your dashboard as they come in.
    </p>
    <a href="${dashboardUrl}" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:600;font-size:16px;margin-bottom:16px;">
      View My Dashboard &rarr;
    </a>
    <p style="margin:0;color:#6B706A;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:${ADMIN_EMAIL}" style="color:#3F453E;">${ADMIN_EMAIL}</a>
    </p>
  `, ADMIN_EMAIL);
  await getResend().emails.send({ meta: { kind: 'go_live_simple_email', courseSlug: data.courseSlug },
    from: FROM_ADMIN,
    to: data.operatorEmail,
    subject: `You're live! ${data.courseName} is now bookable on GreenReserve`,
    html,
  });
}

export async function sendTwoFactorCodeEmail(data: {
  operatorName: string;
  operatorEmail: string;
  code: string;
}) {
  await getResend().emails.send({ meta: { kind: 'two_factor_code_email' }, from: FROM_NOREPLY, to: data.operatorEmail, ...mail(twoFactorCodeEmail(data)) });
}

export async function sendAdminTwoFactorCode(data: { email: string; name: string; code: string }) {
  await getResend().emails.send({ meta: { kind: 'admin_two_factor_code' }, from: FROM_NOREPLY, to: data.email, ...mail(adminTwoFactorEmail(data)) });
}

// Fired after ANY successful password change (in-dashboard change-password,
// or the emailed reset-link flow) — pure notification, doesn't gate anything.
// Lets the real owner know if a change wasn't them.
export async function sendPasswordChangedNotification(data: {
  operatorName: string;
  operatorEmail: string;
}) {
  await getResend().emails.send({ meta: { kind: 'password_changed_notification' }, from: FROM_NOREPLY, to: data.operatorEmail, ...mail(passwordChangedEmail({ email: data.operatorEmail })) });
}

export async function sendMemberInviteEmail(data: {
  name: string; email: string; courseName: string; groupName: string; coursePageUrl: string; benefits: string;
  /** Members pricing on at the course (lib/pricing-switch). Off: no rate is promised; the invite says "to book. You can book <window> · <passes>." */
  memberPricing: boolean;
  courseId?: string;
}) {
  // GOLFER-LOGIN-1 (Cam 2026-11-18): one invite for every member, "Log in", never "sign in as a member".
  // Sent once the membership is active (lib/member-welcome).
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'member_invite_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(memberInviteEmail(data, ctx.course)) });
}

// The lead form is public: every field below is attacker-controlled text that
// is interpolated into HTML delivered to the admin inbox. Escape it.
const escHtml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Subject lines are plain text but still user text: one line, bounded.
const subj = (s: string) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);

export async function sendInquiryNotification(data: {
  /** Opens that inquiry (and its reply box) straight from the email. */
  inquiryId?: string | null;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  courseName: string;
  city: string;
  state: string;
  courseType: string;
  currentBookingMethod: string;
  greenFeeRange: string;
  additionalNotes: string;
  /** SC-2 §1: "invite not sent — <why>" when the call invite email failed; absent when it went. */
  inviteNote?: string | null;
}) {
  // Cam 2026-10-26: the question first, who asked under it, and two ways in — Reply or the inquiry.
  await getResend().emails.send({ meta: { kind: 'inquiry_notification', inquiryId: data.inquiryId ?? null }, from: FROM_ADMIN, to: ADMIN_EMAIL, ...mail(inquiryNotificationEmail(data)) });
}

/**
 * A reply to a course's question, written in the admin (Pipeline → the inquiry →
 * Reply). Sent from admin@, so their answer lands in that inbox; the route logs a
 * "Replied by email" event, which is what moves the inquiry to waiting on them.
 */
export async function sendInquiryReply(data: {
  inquiryId: string; email: string; contactName: string; courseName: string;
  body: string; question?: string | null; adminName: string;
}) {
  await getResend().emails.send({ meta: { kind: 'inquiry_reply', inquiryId: data.inquiryId }, from: FROM_ADMIN, to: data.email, ...mail(inquiryReplyEmail(data)) });
}

// IF-1 §3 / SC-2 §1: the confirmation points at picking a call — the
// per-inquiry invite link when it was issued, else the Calendly fallback.

export async function sendInquiryConfirmation(data: {
  firstName: string; contactName: string; email: string; courseName: string; callUrl?: string | null;
}) {
  // IF-1 §3 / SC-2 §1: points at picking a call — the per-inquiry invite link when issued, else the fallback.
  await getResend().emails.send({ meta: { kind: 'inquiry_confirmation' }, from: FROM_ADMIN, to: data.email, ...mail(inquiryConfirmationEmail(data)) });
}

// Cam 2026-09-16: a course that already has a page cannot be created again, so
// the intake form stops being the right door and this email says where the
// right one is. It replaces the ordinary "we got it, pick a call time"
// confirmation for built courses only — sending that one would have promised a
// discovery call for a course that is already built.
export async function sendInquiryAlreadyBuilt(data: {
  firstName: string; email: string; courseName: string;
}) {
  await getResend().emails.send({ meta: { kind: 'inquiry_already_built' }, from: FROM_ADMIN, to: data.email, ...mail(inquiryAlreadyBuiltEmail(data)) });
}

// SD-11: the code that proves someone reads the address on file, sent when a
// built course answers "yes, I am trying to sign in" on the public form. It is
// NOT a way in — see lib/inquiry-signin.ts. The copy says so, because a code
// email that implies it logs you in trains people to expect that.
export async function sendInquirySigninCode(data: {
  email: string; firstName: string; courseName: string; code: string;
}) {
  await getResend().emails.send({ meta: { kind: 'inquiry_signin_code' }, from: FROM_NOREPLY, to: data.email, ...mail(inquirySigninCodeEmail(data)) });
}

// SD-11 review (HIGH): the "your login isn't ready" screen promises that the
// team has been told and will be in touch. A ledger row nobody reads is not
// being told. This is what makes that sentence true.
export async function sendLockedOutOperatorAlert(data: {
  courseName: string; inquiryId: string; operatorEmail: string; reason: 'no-account' | 'unverified';
}) {
  const r = await getResend().emails.send({ meta: { kind: 'locked_out_operator_alert', inquiryId: data.inquiryId },
    from: FROM_ADMIN,
    to: ADMIN_EMAIL,
    replyTo: data.operatorEmail,
    ...mail(lockedOutAlertEmail(data)),
  });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

export async function sendDetailsSheetConfirmationEmail(data: {
  firstName: string; contactName: string; email: string; courseName: string;
  details: Record<string, unknown>;
}) {
  // Cam 2026-10-26: the same plain-words recap and next steps as the done screen (lib/setup-sheet-recap).
  await getResend().emails.send({ meta: { kind: 'details_sheet_confirmation_email' }, from: FROM_ADMIN, to: data.email, ...mail(detailsSheetConfirmationEmail(data)) });
}

// CG-1 (Cam 2026-09-29): sent with one click when the discovery call ends —
// the recap of what we agreed, THEIR setup link (sections chosen by the call),
// what happens next, and the fee model in writing (LQ-2 approved sentence,
// verbatim from the go-live email below — do not reword it here).
export async function sendCallFollowupEmail(data: {
  contactName: string; email: string; courseName: string; detailsLink: string;
  recap: string[]; liveTarget: string | null;
}) {
  const recapRows = data.recap.map(l => `<li style="margin:0 0 6px;">${escHtml(l)}</li>`).join('');
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">Thanks for the call — here&apos;s your setup link</h1>
    <p style="margin:0 0 16px;color:#3F453E;font-size:15px;line-height:1.6;">
      Hi ${escHtml(firstName(data.contactName))} — great talking about <strong>${escHtml(data.courseName)}</strong>. Here&apos;s what we covered, and your next step.
    </p>
    ${recapRows ? `<p style="margin:0 0 6px;color:#141814;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">What we discussed</p>
    <ul style="margin:0 0 20px;padding-left:18px;color:#141814;font-size:14px;line-height:1.5;">${recapRows}</ul>
    <p style="margin:-12px 0 20px;color:#6B706A;font-size:12px;">Anything off? Just reply and we&apos;ll fix it.</p>` : ''}
    <a href="${data.detailsLink}" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:600;font-size:15px;margin-bottom:8px;">
      Open your setup sheet &rarr;
    </a>
    <p style="margin:0 0 20px;color:#6B706A;font-size:13px;text-align:center;">Built from our call. The first four steps take about 5 minutes; the rest is optional.</p>
    <p style="margin:0 0 6px;color:#141814;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">What happens next${data.liveTarget ? ` — aiming for ${escHtml(data.liveTarget)}` : ''}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:9px 0;border-bottom:1px solid #E3E4DE;color:#141814;font-size:14px;font-weight:600;">1. Your setup sheet</td><td style="padding:9px 0;border-bottom:1px solid #E3E4DE;color:#6B706A;font-size:14px;">Tee times, prices, cancellation — you type them, so they&apos;re exactly right</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #E3E4DE;color:#141814;font-size:14px;font-weight:600;">2. We build your page</td><td style="padding:9px 0;border-bottom:1px solid #E3E4DE;color:#6B706A;font-size:14px;">Your booking page and tee sheet, then a private preview for you to approve</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #E3E4DE;color:#141814;font-size:14px;font-weight:600;">3. Agreement + Stripe</td><td style="padding:9px 0;border-bottom:1px solid #E3E4DE;color:#6B706A;font-size:14px;">Sign the operator agreement and connect Stripe in your course&apos;s name (~10 min)</td></tr>
      <tr><td style="padding:9px 0;color:#141814;font-size:14px;font-weight:600;">4. Go live</td><td style="padding:9px 0;color:#6B706A;font-size:14px;">Add the link to your website; golfers start booking</td></tr>
    </table>
    <p style="margin:0 0 6px;color:#141814;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">How the fee works</p>
    <p style="margin:0 0 20px;color:#6B706A;font-size:13px;line-height:1.6;">Golfers pay GreenReserve&apos;s $1.50 per player on top of your price, in the same card payment as your green fee; Stripe&apos;s normal processing fee applies to the payment, and GreenReserve charges you nothing on top of it.</p>
    <p style="margin:0;color:#6B706A;font-size:12px;">Questions? Reply to this email — ${ADMIN_EMAIL}.</p>
  `, ADMIN_EMAIL);
  await getResend().emails.send({ meta: { kind: 'call_followup_email' },
    from: FROM_ADMIN,
    to: data.email,
    subject: `${data.courseName} — recap of our call + your setup sheet`,
    html,
  });
}

export async function sendDetailsRequestEmail(data: {
  contactName: string; email: string; courseName: string; detailsLink: string;
}) {
  await getResend().emails.send({ meta: { kind: 'details_request_email' }, from: FROM_ADMIN, to: data.email, ...mail(detailsRequestEmail(data)) });
}

// Sent when an inquiry is declined. Deliberately does NOT name the internal
// close reason: "Price" or "Not a fit" is a note to ourselves, and a course
// that reads it back in an email learns something we did not choose to tell
// them. It also leaves the door open, because at this stage most declines are
// about our capacity and sequencing, not about the course.
// SC-2 §1: the invite — pick a 30-minute time. Signed by name.
export async function sendCallInviteEmail(data: {
  firstName: string; email: string; courseName: string; url: string; agendaLines: string[];
}) {
  const r = await getResend().emails.send({ meta: { kind: 'call_invite_email' }, from: FROM_ADMIN, to: data.email, ...mail(callInviteEmail(data)) });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// SC-3 §3: 24 hours before a scheduled call — "Talking tomorrow at 2:00".
export async function sendCallReminderEmail(data: {
  contactName: string; email: string; courseName: string; scheduledAt: Date; durationMin?: number; direction: string; phone: string; manageUrl: string | null;
}) {
  const r = await getResend().emails.send({ meta: { kind: 'call_reminder_email' }, from: FROM_ADMIN, to: data.email, ...mail(callReminderEmail(data)) });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// IC-5 §3: after a logged call — what we captured, so the course can correct
// us before it lands on their setup sheet. Values are user text: escaped.
export async function sendCallRecapEmail(data: {
  contactName: string; email: string; courseName: string; scheduledAt: Date; items: [string, string][];
}) {
  const when = data.scheduledAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
  const rows = data.items.map(([label, val]) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #E3E4DE;color:#6B706A;font-size:13px;width:38%;vertical-align:top;">${escHtml(label)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #E3E4DE;color:#141814;font-size:13px;">${escHtml(val)}</td>
        </tr>`).join('');
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">Thanks for the call, ${escHtml(data.contactName.split(' ')[0] || data.contactName)}.</h1>
    <p style="margin:0 0 20px;color:#3F453E;font-size:15px;line-height:1.6;">
      Here is what we wrote down about <strong>${escHtml(data.courseName)}</strong> on ${when}. It will show up
      pre-filled on your setup sheet, where you can change any of it — and if something below is off, just reply to this email.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">${rows}
    </table>
    <p style="margin:0;color:#6B706A;font-size:12px;">
      Questions? Reply to this email — ${ADMIN_EMAIL}.
    </p>
  `, ADMIN_EMAIL);
  const r = await getResend().emails.send({ meta: { kind: 'call_recap_email' },
    from: FROM_ADMIN,
    to: data.email,
    subject: `What we captured on our call — ${subj(data.courseName)}`,
    html,
  });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// IC-1 §5: the contact's confirmation when a discovery call is put on the books.
export async function sendCallScheduledEmail(data: {
  contactName: string; email: string; courseName: string;
  scheduledAt: Date; durationMin: number; direction: string; phone: string; agendaLabels: string[];
}) {
  const r = await getResend().emails.send({ meta: { kind: 'call_scheduled_email' }, from: FROM_ADMIN, to: data.email, ...mail(callScheduledEmail(data)) });
  if (r.error) throw new Error(r.error.message);
}

export async function sendInquiryDeclinedEmail(data: {
  contactName: string; email: string; courseName: string;
}) {
  await getResend().emails.send({ meta: { kind: 'inquiry_declined_email' }, from: FROM_ADMIN, to: data.email, ...mail(inquiryDeclinedEmail(data)) });
}

export async function sendDetailsSubmittedNotification(data: { courseName: string; contactName: string }) {
  await getResend().emails.send({ meta: { kind: 'details_submitted_notification' }, from: FROM_ADMIN, to: ADMIN_EMAIL, ...mail(detailsSubmittedEmail(data)) });
}

export async function sendCourseApprovedNotification(data: { courseName: string; contactName: string }) {
  await getResend().emails.send({ meta: { kind: 'course_approved_notification' }, from: FROM_ADMIN, to: ADMIN_EMAIL, ...mail(courseApprovedEmail(data)) });
}

// Sent the moment a course actually goes live (mark_live), not at account
// creation — this is the "now that golfers can book, here's how to run the
// place" orientation, distinct from sendDashboardSetupEmail's set-your-password link.
export async function sendCourseLiveOrientationEmail(data: {
  operatorName: string;
  operatorEmail: string;
  courseName: string;
  courseSlug: string;
}) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_URL}/dashboard`;
  const bookingUrl = `${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}`;

  const sections = [
    ['Settings', 'Course info, pricing structure, policies (walking/cancellation/dress code), and all your facilities — driving range, pro shop, restaurant, caddies.'],
    ['Payments', 'Check your Stripe connection status and payout details. Found inside Settings.'],
    ['Schedule', 'Your tee time templates — hours, interval, green fees, cart fee, member/resident rates. Change this anytime; it regenerates future tee times automatically.'],
    ['Bookings', 'Every reservation on your tee sheet, with golfer contact info and payment status.'],
    ['Members', 'If you offer member pricing, manage member accounts and tiers here.'],
    ['Staff', 'Add staff logins for your pro shop team — they get their own access to bookings and the tee sheet, without your owner credentials.'],
  ];

  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#EEF3EC;color:#2F6B45;font-size:13px;font-weight:600;padding:4px 14px;border-radius:6px;">✓ You're live</span></div>
    <h1 style="margin:16px 0 4px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">${data.courseName} is bookable right now.</h1>
    <p style="margin:0 0 24px;color:#3F453E;font-size:15px;">
      Golfers can find and book your tee sheet at <a href="${bookingUrl}" style="color:#173B2A;font-weight:600;">${bookingUrl.replace('https://', '')}</a>.
      Here's a quick map of your dashboard so you know where everything lives.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${sections.map(([title, desc]) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #E3E4DE;">
          <p style="margin:0 0 2px;color:#141814;font-size:14px;font-weight:700;">${title}</p>
          <p style="margin:0;color:#6B706A;font-size:13px;">${desc}</p>
        </td>
      </tr>`).join('')}
    </table>

    <a href="${dashboardUrl}" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:800;font-size:16px;margin-bottom:20px;">
      Go to My Dashboard &rarr;
    </a>

    <div style="background:#F6F4EC;border:1px solid #E3E4DE;border-radius:6px;padding:18px 20px;margin-bottom:8px;">
      <p style="margin:0 0 6px;color:#141814;font-size:13px;font-weight:700;">A few things worth knowing:</p>
      <p style="margin:0 0 4px;color:#6B706A;font-size:13px;">• Golfers pay GreenReserve's $1.50 per player on top of your price, in the same card payment as your green fee; Stripe's normal processing fee applies to the payment, and GreenReserve charges you nothing on top of it.</p>
      <p style="margin:0 0 4px;color:#6B706A;font-size:13px;">• Need to close for a day (weather, maintenance, outing)? Block it from Schedule.</p>
      <p style="margin:0;color:#6B706A;font-size:13px;">• Payouts come from Stripe on its normal payout schedule for your account — check Settings → Payments for your payout status.</p>
    </div>

    <p style="margin:16px 0 0;color:#6B706A;font-size:12px;text-align:center;">
      Questions or something looks wrong? Reply to this email or reach us at <a href="mailto:${ADMIN_EMAIL}" style="color:#3F453E;">${ADMIN_EMAIL}</a> — a real person reads it.
    </p>
  `, ADMIN_EMAIL);

  await getResend().emails.send({ meta: { kind: 'course_live_orientation_email', courseSlug: data.courseSlug },
    from: FROM_ADMIN,
    to: data.operatorEmail,
    subject: `You're live! Here's how to run ${data.courseName} on GreenReserve`,
    html,
  });
}

// A-05 item 4b — auto-chase reminder for a course that hasn't finished
// onboarding (3d/7d/14d, then weekly). One shared template, per-step copy.
export async function sendOnboardingChaseEmail(data: {
  operatorName: string; operatorEmail: string; courseName: string; remainingSteps: string[];
}) {
  await getResend().emails.send({ meta: { kind: 'onboarding_chase_email' }, from: FROM_ADMIN, to: data.operatorEmail, ...mail(onboardingChaseEmail(data)) });
}

export async function sendMembershipPaymentLinkEmail(data: {
  name: string; email: string; courseName: string; tierName: string;
  annualFee: number; initiationFee: number; payLink: string; isRenewal?: boolean; courseId?: string;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'membership_payment_link_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(duesPayLinkEmail(data, ctx.course)) });
}

export async function sendAdminSetPasswordEmail(data: {
  name: string; email: string; setPasswordLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;color:#141814;font-size:26px;line-height:1.2;font-weight:600;">Set your admin password</h1>
    <p style="margin:0 0 24px;color:#3F453E;font-size:15px;">
      Hi ${firstName(data.name)} — you've been added as a GreenReserve admin. Click the button below to set your password and activate your account. This link expires in 24 hours.
    </p>
    <a href="${data.setPasswordLink}" style="display:block;background:#173B2A;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:6px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set My Password &rarr;
    </a>
    <p style="margin:0;color:#6B706A;font-size:12px;text-align:center;">
      If you weren't expecting this, you can safely ignore it.
    </p>
  `, ADMIN_EMAIL);
  await getResend().emails.send({ meta: { kind: 'admin_set_password_email' },
    from: FROM_NOREPLY,
    to: data.email,
    subject: 'Set your GreenReserve admin password',
    html,
  });
}

export async function sendMemberMagicLink(data: {
  name: string; email: string; courseName: string; magicLink: string; courseId?: string;
}) {
  // GOLFER-LOGIN-1 (Cam 2026-11-18): "Log in", never "sign in as a member" — residents and other groups get this too.
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'member_magic_link', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(memberMagicLinkEmail(data, ctx.course)) });
}

// Log in with a code (Cam 2026-11-18, approved mockup "The log-in code"): the per-course log-in code email.
export async function sendMemberLoginCode(data: { email: string; courseName: string; code: string; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'member_login_code', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(memberLoginCodeEmail(data, ctx.course)) });
}

// MEM-RENEW (lib/membership-autorenew): the four auto-renew emails — on (the terms they agreed to),
// the reminder before each renewal, a declined renewal (pay link), and off. Built in lib/email-golfer.

export async function sendAutoRenewOnEmail(data: { name: string; email: string; courseName: string; tierName: string; terms: string; renewsOn: Date | null; totalCents: number; manageLink: string; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'membership_autorenew_on', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(autoRenewOnEmail(data, ctx.course)) });
}

export async function sendAutoRenewReminderEmail(data: { name: string; email: string; courseName: string; tierName: string; renewsOn: Date; totalCents: number; manageLink: string; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'membership_autorenew_reminder', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(autoRenewReminderEmail(data, ctx.course)) });
}

export async function sendAutoRenewDeclinedEmail(data: { name: string; email: string; courseName: string; tierName: string; totalCents: number; payLink: string; retryOn: Date | null; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'membership_autorenew_declined', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(autoRenewDeclinedEmail(data, ctx.course)) });
}

export async function sendAutoRenewOffEmail(data: { name: string; email: string; courseName: string; tierName: string; endsOn: Date | null; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'membership_autorenew_off', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(autoRenewOffEmail(data, ctx.course)) });
}

export async function sendMembershipReceiptEmail(data: {
  name: string; email: string; courseName: string; tierName: string;
  amountPaid: number; serviceFee: number; expiresAt: Date | null; courseId?: string;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'membership_receipt_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(duesReceiptEmail(data, ctx.course)) });
}

/**
 * SD-8 review (MEDIUM): everything interpolated below is written by a course
 * and then sent as HTML from GreenReserve's own verified domain, so an
 * unescaped anchor would arrive as a convincing link from a trusted sender.
 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendMessageNotificationEmail(data: {
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  courseName: string;
  messageBody: string;
  replyUrl: string;
}) {
  await getResend().emails.send({ meta: { kind: 'message_notification_email' }, from: FROM_NOREPLY, to: data.recipientEmail, ...mail(messageNotificationEmail(data)) });
}

export async function sendAnnouncementEmail(data: {
  operatorName: string;
  operatorEmail: string;
  title: string;
  body: string;
}) {
  // MP-7a: the Resend SDK returns { error } rather than throwing — throw, so the broadcast route's tally is real.
  const r = await getResend().emails.send({ meta: { kind: 'announcement_email' }, from: FROM_NOREPLY, to: data.operatorEmail, ...mail(announcementEmail(data)) });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// MP-6b. A refund the golfer did not see coming reads as a mistake; one they
// asked for and never hear about reads as ignored. Either way, tell them.
export async function sendRefundEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; amountCents: number; full: boolean; reason: string; bookingId: string;
}) {
  const ctx = await emailCourse({ bookingId: data.bookingId }, data.courseName);
  const r = await getResend().emails.send({ meta: { kind: 'refund_email', bookingId: data.bookingId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.golferEmail, ...mail(refundEmail(data, ctx.course)) });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// AG-2 §2: "Your signed GreenReserve agreements" — the PDFs attached, a copy
// to the admin inbox. `pending` names any document whose PDF did not render; the
// signing itself is on record regardless and the copy follows by email.
export async function sendSignedAgreementsEmail(data: {
  operatorName: string; operatorEmail: string; courseName: string; legalName: string;
  signerName: string; signerEmail: string; acceptedAt: Date;
  documents: { title: string; version: string }[];
  pending: string[];
  attachments: { filename: string; content: Buffer }[];
}) {
  const r = await getResend().emails.send({ meta: { kind: 'signed_agreements_email' },
    from: FROM_ADMIN,
    to: data.operatorEmail,
    cc: ADMIN_EMAIL,
    replyTo: ADMIN_EMAIL,
    ...mail(signedAgreementsEmail({ ...data, attached: data.attachments.length > 0 })),
    attachments: data.attachments.map(a => ({ filename: a.filename, content: a.content })),
  });
  if (r.error) throw new Error(r.error.message);
}

// AG-3 §2: the day-0 notice of a version bump that requires re-acceptance.
export async function sendAgreementBumpNoticeEmail(data: {
  operatorName: string; operatorEmail: string; courseName: string;
  title: string; version: string; effectiveAt: Date; reacceptBy: Date; changeSummary: string;
}) {
  const r = await getResend().emails.send({ meta: { kind: 'agreement_bump_notice_email' },
    from: FROM_ADMIN, to: data.operatorEmail, replyTo: ADMIN_EMAIL,
    ...mail(agreementBumpEmail(data)),
  });
  if (r.error) throw new Error(r.error.message);
}

export async function sendAgreementBumpAdminSummaryEmail(data: { title: string; version: string; reacceptBy: Date; notified: number; failures: string[] }) {
  const r = await getResend().emails.send({ meta: { kind: 'agreement_bump_admin_summary_email' }, from: FROM_ADMIN, to: ADMIN_EMAIL, ...mail(agreementBumpSummaryEmail(data)) });
  if (r.error) throw new Error(r.error.message);
}

/** BI-1: the monthly AI review, to the course owner. The text is the model's,
 *  so every string is escaped; the numbers in it were checked against the
 *  computed facts before it was stored (lib/monthly-review.ts). */
export async function sendMonthlyReviewEmail(data: {
  to: string; courseName: string; monthLabel: string; isBaseline: boolean;
  review: { verdict: string; wentWell: string[]; fellShort: string[]; recommendations: string[] };
}) {
  // Emails redo (Cam 2026-11-19): no metrics in the email — one line and a button to the review in the dashboard.
  await getResend().emails.send({ meta: { kind: 'monthly_review_email' }, from: FROM_NOREPLY, to: data.to, ...mail(monthlyReviewEmail(data)) });
}

/** MSG-1: a course's notice to the golfers booked on a day ("frost delay,
 *  first tee 9:00"). The text is the course's own, escaped, line breaks kept.
 *  Replies go to the course, not GreenReserve. */
/** MSG-2: the course notice exactly as it is sent — Message golfers previews this, the send uses it. */

export async function sendCourseNoticeEmail(data: {
  to: string; golferName: string; courseName: string; replyTo?: string | null;
  dateLabel: string; teeTime: string; body: string; courseId?: string;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  const { subject, html, text } = courseNoticeEmail({ ...data, course: ctx.course });
  // The course's own reply-to (when staff gave one) is kept: a reply reaches the course, never noreply@.
  await getResend().emails.send({ meta: { kind: 'course_notice_email', courseId: data.courseId },
    from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.to, subject, html, text,
    ...(data.replyTo ? { replyTo: data.replyTo } : {}),
  });
}

/** POS-2: a walk-up pro-shop sale's pay link (Apple Pay, Google Pay or card on the customer's phone). */
export async function sendShopSalePayLinkEmail(data: {
  email: string; name: string; courseName: string; totalCents: number; taxCents?: number; courseId?: string;
  lines: { name: string; unitPriceCents: number; quantity: number }[]; payUrl: string;
  discountCents?: number; discountNote?: string;
  /** SHOP-FEE-1: GreenReserve's service fee, already in totalCents (what the card pays); its own line. */
  serviceFeeCents?: number;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'shop_sale_pay_link_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(shopPayLinkEmail(data, ctx.course)) });
}

// POS-3 (Cam 2026-10-24, "like Square"): the receipt for a paid walk-up sale,
// sent when the customer asks for one. Sent as the course (lib/email-golfer).
export async function sendShopReceiptEmail(data: {
  email: string; name: string; courseName: string; courseId?: string; saleId: string;
  /** PRO-SHOP: the course's sale number (#18), or null for a sale from before numbers. */
  saleNumber?: number | null;
  lines: { name: string; unitPriceCents: number; quantity: number }[];
  discountCents: number; discountNote: string; taxCents: number; totalCents: number;
  paidWith: string; paidAt: string; cashTenderedCents: number | null; refundedCents: number;
  /** SHOP-FEE-1: GreenReserve's service fee, already in totalCents (what was paid); its own line. */
  serviceFeeCents?: number;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'shop_receipt_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(shopReceiptEmail(data, ctx.course)) });
}


// AW-1: the owner signed in at /cam from a device that hasn't been approved.
// The link opens a confirm page (a click there approves) — mail scanners that
// follow links can't approve a device. Sent only after a correct password.
export async function sendOwnerDeviceApproval(data: { email: string; name: string; approvalUrl: string; device: string; place: string; when: string }) {
  await getResend().emails.send({ meta: { kind: 'owner_device_approval' }, from: FROM_NOREPLY, to: data.email, ...mail(ownerDeviceApprovalEmail(data)) });
}

// AW-1: every owner sign-in, so a break-in is seen at once.
export async function sendOwnerSignInAlert(data: { email: string; name: string; device: string; place: string; when: string; method: string }) {
  await getResend().emails.send({ meta: { kind: 'owner_sign_in_alert' }, from: FROM_NOREPLY, to: data.email, ...mail(ownerSignInEmail(data)) });
}

// Cam 2026-11-16: the owner's password was changed or set, on any path. Sent at once, awaited by
// passwordChanged() (lib/admin-password.ts); no link in it, like the other owner alerts.
export async function sendOwnerPasswordChanged(data: { email: string; name: string; how: string; device: string; place: string; when: string }) {
  await getResend().emails.send({ meta: { kind: 'owner_password_changed' }, from: FROM_NOREPLY, to: data.email, ...mail(ownerPasswordChangedEmail(data)) });
}

// AW-1c: a passkey was added to or removed from the owner account — the one
// change that alters how the account signs in, so it is always announced.
export async function sendOwnerPasskeyChanged(data: { email: string; name: string; change: 'added' | 'removed'; passkey: string; device: string; when: string }) {
  await getResend().emails.send({ meta: { kind: 'owner_passkey_changed' }, from: FROM_NOREPLY, to: data.email, ...mail(ownerPasskeyChangedEmail(data)) });
}

// AW-5: the admin's own alerts, to the admin inbox (admin@, MAIL-1). Urgent: the
// problems that just started (lib/admin-checks.ts emails each once). Digest: every morning.

export async function sendAdminUrgentAlert(data: { findings: { title: string; detail: string; href: string }[] }) {
  await getResend().emails.send({ meta: { kind: 'admin_urgent_alert' }, from: FROM_ADMIN, to: ADMIN_EMAIL, ...mail(adminUrgentEmail(data)) });
}

export async function sendAdminDigest(data: { summary: string; facts: DigestFacts }) {
  await getResend().emails.send({ meta: { kind: 'admin_digest' }, from: FROM_ADMIN, to: ADMIN_EMAIL, ...mail(adminDigestEmail(data)) });
}

/** W2-9: a player's group in an event — sent from the event's player list. Replies go to the course (the staff who sent it). */
export async function sendEventPairingsEmail(data: {
  name: string; email: string; courseName: string; coursePhone: string; replyTo: string;
  eventName: string; dateLabel: string; startLabel: string; groupNo: number; startHole: string | null; groupmates: string[]; courseId?: string;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'event_pairings_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, replyTo: data.replyTo, ...mail(eventPairingsEmail(data, ctx.course)) });
}

/** W2-9b: a pay link for an event (deposit, balance or any payment the course asks for). Replies go to the staff who sent it. */
export async function sendEventPayLinkEmail(data: {
  email: string; name: string; courseName: string; replyTo: string;
  eventName: string; dateLabel: string; label: string; amountCents: number; feeCents: number; payUrl: string; terms: string; courseId?: string;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'event_pay_link_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, replyTo: data.replyTo, ...mail(eventPayLinkEmail(data, ctx.course)) });
}

/** W2-9d: an event sign-up, emailed to whoever signed the group up. */
export type SignupEmailVariant = 'in' | 'paid' | 'waitlist' | 'moved_in';
export async function sendEventSignupEmail(data: {
  variant: SignupEmailVariant; email: string; name: string; players: string[];
  courseName: string; coursePhone: string; replyTo: string | null;
  eventName: string; dateLabel: string; startLabel: string; paidCents: number; terms: string; courseId?: string;
}) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'event_signup_email', courseId: data.courseId },
    from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(eventSignupEmail(data, ctx.course)),
    ...(data.replyTo ? { replyTo: data.replyTo } : {}),
  });
}

// Low-stock email (Cam 2026-11-15): the course's owner, from admin@ (course-facing mail, lib/contact.ts). Sent by
// lib/low-stock.ts once per drop to an item's "Remind me when it's down to" number.
export async function sendLowStockEmail(data: { courseId: string; courseName: string; ownerName: string | null; ownerEmail: string; items: { name: string; stockCount: number; reorderAt: number }[] }) {
  await getResend().emails.send({ meta: { kind: 'shop_low_stock', courseId: data.courseId }, from: FROM_NOREPLY, to: data.ownerEmail, ...mail(lowStockEmail(data)) });
}

// MEM-ACCT part 2: member account statements. Built in lib/email-golfer; sent as the course.

export async function sendStatementEmail(data: { name: string; email: string; courseName: string; period: string; totalCents: number; lineCount: number; dueAt: Date; chargeOn: Date | null; payLink: string; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'member_statement', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(statementEmail(data, ctx.course)) });
}

export async function sendStatementDeclinedEmail(data: { name: string; email: string; courseName: string; period: string; totalCents: number; dueAt: Date; retryOn: Date | null; payLink: string; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'member_statement_declined', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(statementDeclinedEmail(data, ctx.course)) });
}

export async function sendStatementPaidEmail(data: { name: string; email: string; courseName: string; period: string; amountCents: number; cardSaved: boolean; link: string; courseId?: string }) {
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'member_statement_paid', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(statementPaidEmail(data, ctx.course)) });
}

/**
 * Outreach to a new course (emails redo, Cam 2026-11-19; the Outreach lane sends from here once it is built).
 * From Cam at admin@, so a reply (or "no thanks") reaches him. Refuses to send while OUTREACH_POSTAL_ADDRESS
 * (lib/contact.ts) is empty: outreachEmail() throws before anything reaches Resend.
 */
export async function sendOutreachEmail(data: { to: string; subject: string; paragraphs: string[]; inquiryId?: string | null; senderName?: string }) {
  const e = outreachEmail(data, OUTREACH_POSTAL_ADDRESS);
  const r = await getResend().emails.send({ meta: { kind: 'outreach_email', inquiryId: data.inquiryId ?? null }, from: `${(data.senderName || 'Cam Sanchez').replace(/[\r\n"<>]/g, ' ')} <${ADMIN_EMAIL}>`, to: data.to, ...mail(e) });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}
