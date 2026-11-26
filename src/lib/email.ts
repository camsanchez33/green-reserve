import { Resend } from 'resend';
import { logSent, type SendMeta } from '@/lib/sent-messages';
import { ADMIN_EMAIL, NOREPLY_EMAIL, OUTREACH_POSTAL_ADDRESS } from '@/lib/contact';
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
  dashboardAccessEmail, goLiveEmail, callRecapEmail,
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
// noreply@ (courseFrom); GreenReserve's own come from admin@, so a reply reaches Cam, except codes,
// sign-in links and security alerts, which come from noreply@ (lib/email-staff).
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
  await getResend().emails.send({ meta: { kind: 'operator_booking_notification', bookingId: data.bookingId, courseSlug: data.courseSlug }, from: FROM_ADMIN, to: data.operatorEmail, ...mail(operatorBookingEmail(data)) });
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

/**
 * Cam 2026-10-27: the ONE "your dashboard is ready" email a course owner gets —
 * from the build, a resend, early dashboard access or the preview. No password in
 * it: a single-use link (lib/operator-setup, SETUP_LINK_DAYS) to choose their own,
 * after which the Getting Started list walks them through reviewing and approving
 * their booking page, the operator agreement and Stripe.
 */
export async function sendDashboardSetupEmail(data: {
  operatorName: string; operatorEmail: string; courseName: string;
  /** null: an owner who already signs in — the email sends them to the dashboard and never touches their sign-in. */
  setupUrl: string | null;
  /** The booking page is built and ready for them to review. */
  pageReady: boolean; linkDays: number;
}) {
  // Emails redo: one email for dashboard access (merged with the old "page ready in your dashboard").
  await getResend().emails.send({ meta: { kind: data.setupUrl ? 'operator_setup_email' : 'operator_page_ready_email' }, from: FROM_ADMIN, to: data.operatorEmail, ...mail(dashboardAccessEmail(data)) });
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
  /** Members pricing on at the course (lib/pricing-switch). Off: no rate is promised; the invite says "to book. You can book <window>." */
  memberPricing: boolean;
  courseId?: string;
}) {
  // GOLFER-LOGIN-1 (Cam 2026-11-18): one invite for every member, "Log in", never "sign in as a member".
  // Sent once the membership is active (lib/member-welcome).
  const ctx = await emailCourse({ courseId: data.courseId }, data.courseName);
  await getResend().emails.send({ meta: { kind: 'member_invite_email', courseId: data.courseId }, from: courseFrom(ctx.course.name, NOREPLY_EMAIL), to: data.email, ...mail(memberInviteEmail(data, ctx.course)) });
}

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
  contactName: string; email: string; courseName: string; scheduledAt?: Date | null;
  /** IC-5 §3: what we captured on a logged call (values are their words). */
  items?: [string, string][];
  /** CG-1: the call ended with a setup sheet — the recap lines, their link and the live target. */
  recap?: string[]; detailsLink?: string | null; liveTarget?: string | null;
}) {
  // Emails redo: one after-the-call email (merged with the old sendCallFollowupEmail).
  const r = await getResend().emails.send({ meta: { kind: data.detailsLink ? 'call_followup_email' : 'call_recap_email' }, from: FROM_ADMIN, to: data.email, ...mail(callRecapEmail(data)) });
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
  /** false: the owner already had dashboard access, so no map of the dashboard (the old short "You're live"). */
  tour?: boolean;
}) {
  // Emails redo: one go-live email (merged with the old sendGoLiveSimpleEmail).
  const tour = data.tour !== false;
  await getResend().emails.send({ meta: { kind: tour ? 'course_live_orientation_email' : 'go_live_simple_email', courseSlug: data.courseSlug }, from: FROM_ADMIN, to: data.operatorEmail, ...mail(goLiveEmail({ ...data, tour })) });
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

export async function sendMessageNotificationEmail(data: {
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  courseName: string;
  messageBody: string;
  replyUrl: string;
}) {
  await getResend().emails.send({ meta: { kind: 'message_notification_email' }, from: FROM_ADMIN, to: data.recipientEmail, ...mail(messageNotificationEmail(data)) });
}

export async function sendAnnouncementEmail(data: {
  operatorName: string;
  operatorEmail: string;
  title: string;
  body: string;
}) {
  // MP-7a: the Resend SDK returns { error } rather than throwing — throw, so the broadcast route's tally is real.
  const r = await getResend().emails.send({ meta: { kind: 'announcement_email' }, from: FROM_ADMIN, to: data.operatorEmail, ...mail(announcementEmail(data)) });
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
  await getResend().emails.send({ meta: { kind: 'monthly_review_email' }, from: FROM_ADMIN, to: data.to, ...mail(monthlyReviewEmail(data)) });
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
  await getResend().emails.send({ meta: { kind: 'shop_low_stock', courseId: data.courseId }, from: FROM_ADMIN, to: data.ownerEmail, ...mail(lowStockEmail(data)) });
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
  const r = await getResend().emails.send({ meta: { kind: 'outreach_email', inquiryId: data.inquiryId ?? null }, from: courseFrom(data.senderName || 'Cam Sanchez', ADMIN_EMAIL), to: data.to, ...mail(e) });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}
