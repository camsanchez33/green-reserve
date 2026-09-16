import { Resend } from 'resend';
import { serviceFeeLabel, hoursLabel } from '@/lib/booking-fees';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const FROM = 'GreenReserve <hello@greenreserve.app>';

function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#ffffff;padding:36px;border-top:1px solid #e4e4e7;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;border-radius:4px 4px 0 0;">${content}</td></tr>
        <tr>
          <td style="background:#ffffff;padding:0 36px 20px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;border-radius:0 0 4px 4px;">
            <div style="border-top:1px solid #f4f4f5;padding-top:20px;text-align:center;color:#a1a1aa;font-size:11px;">
              <img src="${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/brand/golfer.png" width="46" height="56" alt="" style="display:block;margin:0 auto 8px;" />
              Green Reserve &middot; <a href="https://greenreserve.app" style="color:#71717a;text-decoration:none;">greenreserve.app</a>
            </div>
          </td>
        </tr>
        <tr><td style="height:32px;"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface BookingEmailData {
  golferName: string; golferEmail: string; courseName: string; courseAddress: string; courseSlug?: string;
  date: string; time: string; players: number; holes: number;
  greenFeeTotal: number; cartFeeTotal: number; accessFeeTotal: number; totalAmount: number;
  bookingId: string; appliedRate: string;
  rangeBallsTotal?: number; cancellationFeeTotal?: number; cancellationHours?: number;
  checkInToken?: string;
  noCard?: boolean; // true for no-fee-policy courses where no card was collected
}

// SD-5: a walk-in entered without an email gets a placeholder address so the
// Booking row (email required) can exist; nothing is ever sent to it.
export const PLACEHOLDER_EMAIL_DOMAIN = '@noemail.greenreserve.app';
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  const cancellationHours = data.cancellationHours ?? 24;
  const cancellationFee = data.cancellationFeeTotal ?? 0;
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
  // Portal (GOLFER_SPEC G5) — course-scoped, never a generic cross-course page.
  const portalUrl = data.courseSlug
    ? `${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}/account?email=${encodeURIComponent(data.golferEmail)}`
    : process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const manageUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/manage/${data.bookingId}?token=${data.checkInToken}` : portalUrl;
  const noCard = data.noCard ?? false;

  // Breakdown rows shared by all variants
  const breakdownRows = `
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Course</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.courseName}</span></td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Date &amp; Time</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.date} at ${data.time}</span></td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Players</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.players} player${data.players > 1 ? 's' : ''} &middot; ${data.holes} holes</span></td></tr>
    ${data.appliedRate !== 'standard' ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Rate</span><br><span style="color:#166534;font-size:15px;font-weight:600;text-transform:capitalize;">${data.appliedRate}</span></td></tr>` : ''}
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Green Fee</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</span></td></tr>
    ${data.cartFeeTotal > 0 ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Cart Fee</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</span></td></tr>` : ''}
    ${(data.rangeBallsTotal ?? 0) > 0 ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Range Balls</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${((data.rangeBallsTotal ?? 0) / 100).toFixed(2)}</span></td></tr>` : ''}
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">${serviceFeeLabel(data.players)}</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.accessFeeTotal / 100).toFixed(2)}</span></td></tr>
  `;

  let intro: string;
  let totalRow: string;
  let policyBox: string;
  let ctaButtons: string;

  if (noCard) {
    // No-fee-policy course — no card collected, golfer pays at check-in
    intro = `<h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">You're on the tee sheet.</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Your spot at ${data.courseName} is confirmed. <strong>No card required</strong> — pay at the course when you check in, or use the link below to pay online.</p>`;
    totalRow = `<tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">Total due at the course</span><br><span style="color:#111827;font-size:20px;font-weight:700;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>`;
    policyBox = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:13px;font-weight:600;">&#10003; Free cancellation any time — no fees, no card on file.</p>
    </div>`;
    ctaButtons = `
      ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay Online &rarr;</a>` : ''}
      <a href="${manageUrl}" style="display:block;color:#1b4332;text-decoration:none;text-align:center;padding:8px;font-weight:700;font-size:13px;margin-bottom:16px;">Manage My Booking &rarr;</a>
      ${data.checkInToken ? `<a href="${portalUrl}" style="display:block;color:#6b7280;text-decoration:none;text-align:center;padding:4px;font-weight:600;font-size:12px;">View your tee times at ${data.courseName} &rarr;</a>` : ''}`;
  } else if (cancellationFee > 0) {
    // Card on file, course has a cancellation fee
    intro = `<h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">You're on the tee sheet.</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Here are your booking details for ${data.courseName}. <strong>Nothing has been charged yet</strong> — your card is saved to hold your spot.</p>`;
    totalRow = `<tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">Estimated total at check-in</span><br><span style="color:#111827;font-size:20px;font-weight:700;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>`;
    policyBox = `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 4px;color:#1e3a8a;font-size:13px;font-weight:700;">Cancellation policy</p>
      <p style="margin:0;color:#1e40af;font-size:13px;">Cancel any time up to ${hoursLabel(cancellationHours)} before your tee time at no charge. After that, a $${(cancellationFee / 100).toFixed(2)} late-cancellation fee will be charged to your card — it&rsquo;s refunded in full when you check in and pay for your round.</p>
    </div>`;
    ctaButtons = `
      ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay &rarr;</a>` : ''}
      <a href="${manageUrl}" style="display:block;${checkInUrl ? 'color:#1b4332;' : 'background:#1b4332;color:#fff;'}text-decoration:none;text-align:center;padding:${checkInUrl ? '8px' : '14px'};border-radius:4px;font-weight:700;font-size:${checkInUrl ? '13px' : '15px'};margin-bottom:16px;">Manage My Booking &rarr;</a>
      ${data.checkInToken ? `<a href="${portalUrl}" style="display:block;color:#6b7280;text-decoration:none;text-align:center;padding:4px;font-weight:600;font-size:12px;">View your tee times at ${data.courseName} &rarr;</a>` : ''}`;
  } else {
    // Card on file, no cancellation fee policy
    intro = `<h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">You're on the tee sheet.</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Here are your booking details for ${data.courseName}. <strong>Nothing has been charged yet</strong> — your card is saved to hold your spot.</p>`;
    totalRow = `<tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">Estimated total at check-in</span><br><span style="color:#111827;font-size:20px;font-weight:700;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>`;
    policyBox = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:13px;font-weight:600;">&#10003; Free cancellation any time — this course has no late-cancellation fee.</p>
    </div>`;
    ctaButtons = `
      ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay &rarr;</a>` : ''}
      <a href="${manageUrl}" style="display:block;${checkInUrl ? 'color:#1b4332;' : 'background:#1b4332;color:#fff;'}text-decoration:none;text-align:center;padding:${checkInUrl ? '8px' : '14px'};border-radius:4px;font-weight:700;font-size:${checkInUrl ? '13px' : '15px'};margin-bottom:16px;">Manage My Booking &rarr;</a>
      ${data.checkInToken ? `<a href="${portalUrl}" style="display:block;color:#6b7280;text-decoration:none;text-align:center;padding:4px;font-weight:600;font-size:12px;">View your tee times at ${data.courseName} &rarr;</a>` : ''}`;
  }

  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">&#10003; Booking Confirmed</span></div>
    ${intro}
    <div style="background:#f9fafb;border-radius:4px;padding:24px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${breakdownRows}
        ${totalRow}
      </table>
    </div>
    ${policyBox}
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">&#128205; ${data.courseAddress}</p>
      <p style="margin:8px 0 0;color:#92400e;font-size:12px;">Arrive 15 minutes early and check in at the pro shop.</p>
    </div>
    ${ctaButtons}
    ${data.checkInToken ? `<p style="margin:0 0 8px;text-align:center;"><a href="${process.env.NEXT_PUBLIC_URL}/receipt/${data.bookingId}?token=${data.checkInToken}" style="color:#71717a;font-size:12px;text-decoration:underline;">View booking confirmation</a></p>` : ''}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Confirmed: ${data.courseName} — ${data.date} at ${data.time}`, html });
}

export async function sendOperatorBookingNotification(data: BookingEmailData & { operatorEmail: string }) {
  // "Your Revenue" = green + cart fee — matches the Payments page and dashboard
  // tee sheet exactly. Nothing's actually charged yet, so this is what's EXPECTED once
  // the golfer checks in and pays, not a paid amount.
  const yourRevenue = (data.greenFeeTotal + data.cartFeeTotal) / 100;
  const noCard = data.noCard ?? false;
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:700;">New Booking</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">A tee time has been booked at ${data.courseName.trim()}. ${noCard ? 'No card was collected — golfer pays at the course or via check-in link.' : "Their card is on file — nothing's charged until they check in (or the cancellation window closes)."}</p>
    <div style="background:#f9fafb;border-radius:4px;padding:20px;">
      <p style="margin:0 0 8px;"><strong>Golfer:</strong> ${data.golferName} (${data.golferEmail})</p>
      <p style="margin:0 0 8px;"><strong>Date:</strong> ${data.date} at ${data.time}</p>
      <p style="margin:0 0 12px;"><strong>Players:</strong> ${data.players} &middot; ${data.holes} holes</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:10px;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Green Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</td></tr>
        ${data.cartFeeTotal > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Cart Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</td></tr>` : ''}
        ${(data.rangeBallsTotal ?? 0) > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Range Balls</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.rangeBallsTotal! / 100).toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:8px 0 4px;color:#166534;font-size:14px;font-weight:800;">Expected Revenue</td><td style="padding:8px 0 4px;text-align:right;color:#166534;font-size:16px;font-weight:700;">$${yourRevenue.toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:6px 0 0;color:#9ca3af;font-size:11px;">Once they check in and pay. + $${(data.accessFeeTotal / 100).toFixed(2)} GreenReserve fee, paid by the golfer on top of your price.</td></tr>
      </table>
    </div>
    <a href="https://greenreserve.app/dashboard" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-top:20px;">View Tee Sheet &rarr;</a>
    <a href="https://greenreserve.app/dashboard/payments" style="display:block;color:#1b4332;text-decoration:none;text-align:center;padding:8px;font-weight:600;font-size:13px;">See it in Payments &rarr;</a>
  `);
  await getResend().emails.send({ from: FROM, to: data.operatorEmail, subject: `New booking: ${data.players} player${data.players > 1 ? 's' : ''} — ${data.date} at ${data.time}`, html });
}

export async function sendCancellationEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; players: number; bookingId: string;
  feeCharged: boolean; feeAmount: number; // feeCharged = cancelled after the window closed, fee already taken & non-refundable
  // MP-5b: set when the golfer did not ask for this — the course closed. A
  // cancellation with no explanation reads as a mistake or a bait-and-switch.
  reason?: string;
}) {
  if (isPlaceholderEmail(data.golferEmail)) return; // SD-5: walk-in without an email
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Booking Cancelled</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">Your booking has been cancelled.</h1>
    <p style="margin:0 0 ${data.reason ? '16px' : '24px'};color:#6b7280;font-size:15px;">${data.courseName} &middot; ${data.date} at ${data.time} &middot; ${data.players} player${data.players > 1 ? 's' : ''}</p>
    ${data.reason
      ? `<p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">${data.reason}</p>`
      : ''
    }
    ${!data.feeCharged
      ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#166534;font-size:15px;font-weight:600;">&#10003; You weren't charged anything &mdash; your card has been released.</p></div>`
      : `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:4px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">The $${(data.feeAmount / 100).toFixed(2)} cancellation fee you were charged is non-refundable &mdash; this cancellation came after the course&rsquo;s free-cancellation window closed.</p></div>`
    }
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Cancelled: ${data.courseName} — ${data.date} at ${data.time}`, html });
}

// Fired by the cancellation-fee cron the moment it successfully auto-charges
// someone for not cancelling in time. Refundable later at check-in, so this
// is explicitly NOT framed as a final charge.
// MP-5b. Taking a course offline or archiving it used to happen entirely
// behind the operator's back: their page stopped accepting bookings, any
// future tee times were left dangling, and nobody told them. If we cancelled
// their golfers' rounds, they need to know before a golfer phones them about it.
export async function sendCourseClosedNotice(data: {
  operatorName: string; operatorEmail: string; courseName: string;
  action: 'offline' | 'archived';
  cancelledCount: number;
}) {
  const what = data.action === 'archived' ? 'archived' : 'taken offline';
  const bookingLine = data.cancelledCount === 0
    ? 'There were no upcoming bookings, so no golfers were affected.'
    : `${data.cancelledCount} upcoming booking${data.cancelledCount === 1 ? ' was' : 's were'} cancelled, and ${data.cancelledCount === 1 ? 'that golfer has' : 'those golfers have'} been emailed. Nobody was charged for a round they will not play.`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">${data.courseName} has been ${what}.</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${data.operatorName} — your GreenReserve booking page is no longer accepting tee times.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">${bookingLine}</p>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
      Nothing has been deleted — your tee sheet, bookings and history are all still here, and we can put you back
      online whenever you are ready. If this is not what you expected, reply to this email and we will sort it out.
    </p>
    <p style="margin:0;color:#98968B;font-size:12px;">
      Questions? Reply to this email — hello@greenreserve.app.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `${data.courseName} is no longer taking bookings on GreenReserve`,
    html,
  });
}

export async function sendCancellationFeeChargedEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; feeAmount: number; bookingId: string; checkInToken?: string | null;
}) {
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Cancellation window closed</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:700;">You've been charged $${(data.feeAmount / 100).toFixed(2)}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      You didn't cancel your ${data.date} at ${data.time} tee time at ${data.courseName} before the free-cancellation window closed, so we charged your card $${(data.feeAmount / 100).toFixed(2)} to hold your spot.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:14px;font-weight:600;">This fee is refunded automatically when you check in and pay for your round — tap the button below to check in now.</p>
    </div>
    ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:16px;">Check In &amp; Pay &rarr;</a>` : ''}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Charged $${(data.feeAmount / 100).toFixed(2)} — ${data.courseName} cancellation window closed`, html });
}

// Sent ~1 hour before the free-cancellation window closes for bookings that
// have a card on file and a cancellation fee. Gives the golfer a heads-up so
// they can cancel for free before the cutoff charges their card automatically.
export async function sendCancellationWarningEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseSlug?: string;
  date: string; time: string; feeAmount: number; bookingId: string; cancellationHours: number;
  checkInToken?: string | null;
}) {
  const portalUrl = data.courseSlug
    ? `${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}/account?email=${encodeURIComponent(data.golferEmail)}`
    : process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const manageUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/manage/${data.bookingId}?token=${data.checkInToken}` : portalUrl;
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Action required</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:700;">Your cancellation window closes soon.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.golferName} — your tee time at <strong style="color:#111827;">${data.courseName}</strong> on ${data.date} at ${data.time} is coming up.
      The free-cancellation window (${hoursLabel(data.cancellationHours)} before your tee time) closes within the next hour.
    </p>
    <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 6px;color:#92400e;font-size:14px;font-weight:700;">If you need to cancel, do it now.</p>
      <p style="margin:0;color:#92400e;font-size:14px;">After the window closes, a $${(data.feeAmount / 100).toFixed(2)} late-cancellation fee will be charged to your card automatically.</p>
    </div>
    <a href="${manageUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:16px;">Cancel for Free &rarr;</a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">If you're keeping your tee time, no action needed — we'll see you on the course.</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Heads up — your free cancellation window closes soon (${data.courseName})`, html });
}

// Fired by the cutoff cron for courses with NO cancellation fee policy — no
// charge is made, but the free-cancel window is closed, so we let the golfer
// know they're locked in and give them a direct check-in link.
export async function sendCheckInAvailableEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; bookingId: string; checkInToken?: string | null;
}) {
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">&#9971; Ready to check in</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">You're all set — time to check in.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Your tee time at ${data.courseName} on ${data.date} at ${data.time} is coming up.
      Check in online now, or do it at the clubhouse when you arrive.
    </p>
    ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:16px;">Check In Online Now &rarr;</a>` : ''}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Ready to check in — ${data.courseName} ${data.date} at ${data.time}`, html });
}

export async function sendBookingModifiedEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseSlug?: string;
  date: string; time: string; players: number; holes: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number;
  accessFeeTotal: number; totalAmount: number; bookingId: string; checkInToken: string | null;
}) {
  const portalUrl = data.courseSlug
    ? `${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}/account?email=${encodeURIComponent(data.golferEmail)}`
    : process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const manageUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/manage/${data.bookingId}?token=${data.checkInToken}` : portalUrl;
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dbeafe;color:#1e3a8a;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Booking Updated</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">Your booking has been updated.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Here are your updated booking details for ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:4px;padding:24px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Date &amp; Time</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.date} at ${data.time}</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Players</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.players} player${data.players > 1 ? 's' : ''} &middot; ${data.holes} holes</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Green Fee</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</span></td></tr>
        ${data.cartFeeTotal > 0 ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Cart Fee</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</span></td></tr>` : ''}
        ${data.rangeBallsTotal > 0 ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Range Balls</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.rangeBallsTotal / 100).toFixed(2)}</span></td></tr>` : ''}
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">${serviceFeeLabel(data.players)}</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.accessFeeTotal / 100).toFixed(2)}</span></td></tr>
        <tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">New total at check-in</span><br><span style="color:#111827;font-size:20px;font-weight:700;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>
      </table>
    </div>
    ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay &rarr;</a>` : ''}
    <a href="${manageUrl}" style="display:block;color:#1b4332;text-decoration:none;text-align:center;padding:8px;font-weight:700;font-size:13px;margin-bottom:16px;">Manage My Booking &rarr;</a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Updated: ${data.courseName} — ${data.date} at ${data.time}`, html });
}

// Fired the moment performCheckIn() successfully charges a golfer for their
// round at check-in. Itemizes the same numbers as the original booking
// confirmation, plus the late-cancellation fee refund if one applied.
export async function sendCheckInReceiptEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseSlug?: string;
  date: string; time: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  feeRefunded: boolean; feeRefundAmount: number;
  /** SD review: a fee was owed back and the automatic refund failed — say so, do not go quiet. */
  feeRefundFailed?: boolean;
  bookingId: string; checkInToken?: string | null;
}) {
  if (isPlaceholderEmail(data.golferEmail)) return; // SD-5: walk-in without an email
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">&#10003; Checked in</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:700;">You're checked in — enjoy your round!</h1>
    <p style="margin:0 0 4px;color:#374151;font-size:18px;font-weight:600;">$${(data.totalAmount / 100).toFixed(2)} charged</p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">${data.courseName} &middot; ${data.date} at ${data.time}</p>
    <div style="background:#f9fafb;border-radius:4px;padding:24px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Green Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</td></tr>
        ${data.cartFeeTotal > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Cart Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</td></tr>` : ''}
        ${data.rangeBallsTotal > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Range Balls</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.rangeBallsTotal / 100).toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">${serviceFeeLabel(data.players)}</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.accessFeeTotal / 100).toFixed(2)}</td></tr>
        <tr><td style="padding:10px 0 0;color:#111827;font-size:14px;font-weight:700;border-top:1px solid #e5e7eb;">Total Charged</td><td style="padding:10px 0 0;text-align:right;color:#111827;font-size:18px;font-weight:700;border-top:1px solid #e5e7eb;">$${(data.totalAmount / 100).toFixed(2)}</td></tr>
      </table>
    </div>
    ${data.feeRefunded ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#166534;font-size:14px;font-weight:600;">&#10003; The $${(data.feeRefundAmount / 100).toFixed(2)} late-cancellation fee you were charged earlier has been refunded.</p></div>` : ''}
    ${data.feeRefundFailed ? `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:4px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">Your earlier $${(data.feeRefundAmount / 100).toFixed(2)} late-cancellation fee is owed back to you, but the automatic refund did not go through. The course has been notified — if it has not appeared within a few days, contact them or hello@greenreserve.app.</p></div>` : ''}
    ${data.checkInToken ? `<a href="${process.env.NEXT_PUBLIC_URL}/receipt/${data.bookingId}?token=${data.checkInToken}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:600;font-size:15px;margin-bottom:16px;">View Receipt &rarr;</a>` : ''}
    ${data.courseSlug ? `<a href="${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}/account?email=${encodeURIComponent(data.golferEmail)}" style="display:block;color:#6b7280;text-decoration:none;text-align:center;padding:4px;font-weight:600;font-size:12px;margin-bottom:16px;">View your tee times at ${data.courseName} &rarr;</a>` : ''}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Receipt: ${data.courseName} — $${(data.totalAmount / 100).toFixed(2)}`, html });
}

export async function sendTeeTimeAlertEmail(data: {
  name: string; email: string; courseName: string; courseSlug: string;
  date: string; time?: string; players: number; unsubscribeToken: string;
}) {
  const base = process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const bookUrl = `${base}/courses/${data.courseSlug}?date=${data.date}&players=${data.players}`;
  const unsubUrl = `${base}/api/alerts/unsubscribe/${data.unsubscribeToken}`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">A spot just opened up</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Good news &mdash; a tee time you set an alert for at <strong>${data.courseName}</strong> is now available.</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:20px;margin-bottom:24px;">
      ${data.time ? `<p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:18px;">${data.time}</p>` : ''}
      <p style="margin:0;color:#6b7280;">${data.date} &middot; ${data.courseName}</p>
    </div>
    <a href="${bookUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:600;font-size:15px;margin-bottom:24px;">Book Now &rarr;</a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;"><a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe from tee time alerts</a></p>
  `);
  await getResend().emails.send({ from: FROM, to: data.email, subject: `Alert: spot available at ${data.courseName}`, html });
}

export async function sendReminderEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseAddress: string; courseSlug?: string;
  date: string; time: string; players: number; holes: number; bookingId: string; checkInToken?: string | null;
}) {
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
  const portalUrl = data.courseSlug
    ? `${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}/account?email=${encodeURIComponent(data.golferEmail)}`
    : process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const manageUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/manage/${data.bookingId}?token=${data.checkInToken}` : portalUrl;
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:26px;font-weight:700;">&#9971; Tee time tomorrow!</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">You&rsquo;re on the tee sheet at ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:4px;padding:24px;margin-bottom:20px;">
      <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">${data.time}</p>
      <p style="margin:0 0 4px;color:#374151;font-weight:600;">${data.courseName}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">&#128205; ${data.courseAddress}</p>
      <p style="margin:0;color:#6b7280;font-size:14px;">${data.players} player${data.players > 1 ? 's' : ''} &middot; ${data.holes} holes</p>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:4px;padding:14px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:13px;">&#128336; ${checkInUrl ? 'Check in and pay below before you head out, or do it at the pro shop when you arrive.' : 'Arrive 15 minutes early and check in at the pro shop.'}</p>
    </div>
    ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay &rarr;</a>` : ''}
    <a href="${manageUrl}" style="display:block;${checkInUrl ? 'color:#1b4332;' : 'background:#1b4332;color:#fff;'}text-decoration:none;text-align:center;padding:${checkInUrl ? '8px' : '14px'};font-weight:600;font-size:${checkInUrl ? '13px' : '15px'};">View or Cancel Booking &rarr;</a>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Tomorrow: ${data.time} at ${data.courseName}`, html });
}

export async function sendOperatorWelcomeEmail(data: {
  operatorName: string;
  operatorEmail: string;
  courseName: string;
  tempPassword: string;
  setupLink: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">✓ You're approved</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">Welcome to GreenReserve, ${data.operatorName}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      <strong>${data.courseName}</strong> has been approved and your dashboard is ready to set up.
      It takes about 5 minutes to go live.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Login Email</p>
      <p style="margin:0 0 16px;color:#111827;font-size:15px;font-weight:600;">${data.operatorEmail}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
      <p style="margin:0;color:#111827;font-size:18px;font-weight:700;font-family:monospace;letter-spacing:0.1em;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;display:inline-block;">${data.tempPassword}</p>
    </div>

    <p style="margin:0 0 16px;color:#374151;font-size:14px;">When you log in for the first time you'll be walked through:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${['Set your permanent password','Connect your bank via Stripe (for payouts)','Set your tee time schedule and pricing','Go live — golfers can start booking'].map((step, i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#1b4332;color:#fff;border-radius:50%;font-size:11px;font-weight:700;margin-right:10px;">${i + 1}</span>
          <span style="color:#374151;font-size:14px;">${step}</span>
        </td>
      </tr>`).join('')}
    </table>

    <a href="${data.setupLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set Up My Dashboard &rarr;
    </a>

    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);

  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `You're approved — set up ${data.courseName} on GreenReserve`,
    html,
  });
}

export async function sendOperatorPasswordResetEmail(data: {
  operatorName: string;
  operatorEmail: string;
  resetLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Reset your password</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.operatorName} — we got a request to reset the password on your GreenReserve dashboard (${data.operatorEmail}).
      If this wasn't you, you can safely ignore this email.
    </p>
    <a href="${data.resetLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set a New Password &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      This link expires in 1 hour. Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `Reset your GreenReserve password`,
    html,
  });
}

export async function sendAdminPasswordResetEmail(data: {
  adminName: string;
  adminEmail: string;
  resetLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Reset your password</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.adminName} — we got a request to reset the password on your GreenReserve admin account (${data.adminEmail}).
      If this wasn't you, you can safely ignore this email.
    </p>
    <a href="${data.resetLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set a New Password &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      This link expires in 24 hours. Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.adminEmail,
    subject: `Reset your GreenReserve admin password`,
    html,
  });
}

export async function sendAdminPasswordChangedNotification(data: {
  adminName: string;
  adminEmail: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Your password was changed</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Hi ${data.adminName} — this confirms the password on your GreenReserve admin account (${data.adminEmail}) was just changed.
    </p>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:13px;"><strong>Wasn't you?</strong> Reply to this email or reach <a href="mailto:hello@greenreserve.app" style="color:#92400e;text-decoration:underline;">hello@greenreserve.app</a> right away.</p>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Green Reserve &middot; <a href="https://greenreserve.app" style="color:#6b7280;">greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.adminEmail,
    subject: `Your GreenReserve admin password was changed`,
    html,
  });
}

// Verification-by-possession: arriving at the link in this email IS the proof
// of inbox ownership — there is no in-app "verify instantly" button.
export async function sendOperatorVerifyEmail(data: {
  operatorName: string;
  operatorEmail: string;
  verifyLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Confirm it's you</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.operatorName} — click below to confirm ${data.operatorEmail} and finish setting up your GreenReserve dashboard.
    </p>
    <a href="${data.verifyLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Confirm My Email &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Didn't request this? You can ignore this email. Questions? Reply here or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `Confirm your GreenReserve account`,
    html,
  });
}

export async function sendGolferPasswordResetEmail(data: {
  golferName: string;
  golferEmail: string;
  resetLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Reset your password</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.golferName} — we got a request to reset the password on your GreenReserve account (${data.golferEmail}).
      If this wasn't you, you can safely ignore this email.
    </p>
    <a href="${data.resetLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set a New Password &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      This link expires in 1 hour. Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.golferEmail,
    subject: `Reset your GreenReserve password`,
    html,
  });
}

// Fired right after a correct password when the operator has 2FA enabled —
// gates issuing the real session cookie until this code is verified.
export async function sendPreviewEmail(data: {
  contactName: string;
  contactEmail: string;
  courseName: string;
  previewUrl: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">Your page is ready for a look</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.contactName} &mdash; we've finished building your GreenReserve page for <strong>${data.courseName}</strong>.
      Take a look and let us know if anything needs adjusting before we go live.
    </p>
    <a href="${data.previewUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:700;font-size:16px;margin-bottom:20px;">
      Preview Your Page &rarr;
    </a>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;color:#374151;font-size:13px;">Booking is disabled on this preview link &mdash; it's only for you to review the layout and information. Reply to this email with any changes and we'll get them in quickly.</p>
    </div>
    <p style="margin:0 0 12px;color:#9ca3af;font-size:13px;">Want to see your dashboard too? We can send you access &mdash; just reply.</p>
    <p style="margin:0 0 20px;color:#9ca3af;font-size:13px;">When you log in, your Getting Started checklist will walk you through everything, including payments setup.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.contactEmail,
    replyTo: 'hello@greenreserve.app',
    subject: `Preview: Your GreenReserve page for ${data.courseName}`,
    html,
  });
}

// Combined send (RUN_QUEUE "Send Preview = one combined send") — pressing
// Send Preview now delivers the page preview AND dashboard login access in
// one email, so a course never has to wait on a second message to start
// exploring their dashboard. Admin-initiated only, never automatic.
export async function sendPreviewWithDashboardAccessEmail(data: {
  contactName: string;
  contactEmail: string;
  courseName: string;
  previewUrl: string;
  tempPassword: string;
  setupLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">Your page is ready for a look</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.contactName} &mdash; we've finished building your GreenReserve page for <strong>${data.courseName}</strong>.
      Take a look and let us know if anything needs adjusting before we go live. We've also set you up with early
      access to your dashboard below.
    </p>
    <a href="${data.previewUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:700;font-size:16px;margin-bottom:20px;">
      Preview Your Page &rarr;
    </a>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#374151;font-size:13px;">Booking is disabled on this preview link &mdash; it's only for you to review the layout and information. Reply to this email with any changes and we'll get them in quickly.</p>
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:15px;font-weight:600;">Your dashboard is ready too</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Login Email</p>
      <p style="margin:0 0 16px;color:#111827;font-size:15px;font-weight:600;">${data.contactEmail}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
      <p style="margin:0;color:#111827;font-size:18px;font-weight:700;font-family:monospace;letter-spacing:0.1em;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;display:inline-block;">${data.tempPassword}</p>
    </div>
    <a href="${data.setupLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:700;font-size:16px;margin-bottom:16px;">
      Log In To My Dashboard &rarr;
    </a>
    <p style="margin:0 0 20px;color:#9ca3af;font-size:13px;">Log in and your Getting Started checklist will walk you through everything, including payments setup. Nothing is live yet — golfers can't book until you approve the page.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.contactEmail,
    replyTo: 'hello@greenreserve.app',
    subject: `Preview + dashboard access: Your GreenReserve page for ${data.courseName}`,
    html,
  });
}

// Sent during Building stage when admin clicks "Send dashboard access" —
// gives early dashboard access before the course goes live.
export async function sendDashboardAccessEmail(data: {
  operatorName: string;
  operatorEmail: string;
  courseName: string;
  tempPassword: string;
  setupLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">Your dashboard is ready to explore</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.operatorName} &mdash; while we put the finishing touches on your GreenReserve page for <strong>${data.courseName}</strong>,
      here&rsquo;s early access to your dashboard. Take a look around &mdash; this is where you&rsquo;ll manage tee times,
      bookings, and check-ins. <strong>Nothing is live yet.</strong>
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Login Email</p>
      <p style="margin:0 0 16px;color:#111827;font-size:15px;font-weight:600;">${data.operatorEmail}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
      <p style="margin:0;color:#111827;font-size:18px;font-weight:700;font-family:monospace;letter-spacing:0.1em;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;display:inline-block;">${data.tempPassword}</p>
    </div>
    <a href="${data.setupLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:700;font-size:16px;margin-bottom:16px;">
      Set Up My Dashboard &rarr;
    </a>
    <p style="margin:0 0 20px;color:#9ca3af;font-size:13px;">When you log in, your Getting Started checklist will walk you through everything, including payments setup.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `Early dashboard access — ${data.courseName} on GreenReserve`,
    html,
  });
}

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
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">&#10003; You&rsquo;re live</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">${data.courseName} is live on GreenReserve.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Golfers can find and book your tee sheet at
      <a href="${bookingUrl}" style="color:#1b4332;font-weight:600;">${bookingUrl.replace('https://', '')}</a>.
      New bookings will appear in your dashboard as they come in.
    </p>
    <a href="${dashboardUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:700;font-size:16px;margin-bottom:16px;">
      View My Dashboard &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
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
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Your verification code</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.operatorName} — enter this code to finish signing in to your GreenReserve dashboard.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:20px;text-align:center;">
      <p style="margin:0;color:#111827;font-size:32px;font-weight:700;font-family:monospace;letter-spacing:0.2em;">${data.code}</p>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      This code expires in 10 minutes. Didn't try to sign in? Reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `Your GreenReserve verification code: ${data.code}`,
    html,
  });
}

// Passwordless sign-in for the per-course golfer portal (GOLFER_SPEC G5) —
// generic copy since one code works to sign into any course's portal (same
// underlying GolferAccount).
export async function sendGolferOtpEmail(data: { email: string; code: string; courseName: string }) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Your sign-in code</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Enter this code to sign in to your ${data.courseName} tee times.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:20px;text-align:center;">
      <p style="margin:0;color:#111827;font-size:32px;font-weight:700;font-family:monospace;letter-spacing:0.2em;">${data.code}</p>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      This code expires in 10 minutes. Didn't request this? You can safely ignore this email.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Your sign-in code: ${data.code}`,
    html,
  });
}

export async function sendAdminTwoFactorCode(data: { email: string; name: string; code: string }) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Admin verification code</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.name} — enter this code to complete your secure admin login.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:20px;text-align:center;">
      <p style="margin:0;color:#111827;font-size:36px;font-weight:700;font-family:monospace;letter-spacing:0.25em;">${data.code}</p>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Expires in 10 minutes. Not you? Reply to this email immediately — <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `GreenReserve admin code: ${data.code}`,
    html,
  });
}

// Fired after ANY successful password change (in-dashboard change-password,
// or the emailed reset-link flow) — pure notification, doesn't gate anything.
// Lets the real owner know if a change wasn't them.
export async function sendPasswordChangedNotification(data: {
  operatorName: string;
  operatorEmail: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:700;">Your password was changed</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Hi ${data.operatorName} — this confirms the password on your GreenReserve dashboard (${data.operatorEmail}) was just changed.
    </p>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:13px;"><strong>Wasn't you?</strong> Reply to this email or reach <a href="mailto:hello@greenreserve.app" style="color:#92400e;text-decoration:underline;">hello@greenreserve.app</a> right away.</p>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Green Reserve &middot; <a href="https://greenreserve.app" style="color:#6b7280;">greenreserve.app</a>
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `Your GreenReserve password was changed`,
    html,
  });
}

export async function sendMemberInviteEmail(data: {
  name: string; email: string; courseName: string; tierName: string; setupLink: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">⛳ You've been added as a member</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">Welcome, ${data.name}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      <strong>${data.courseName}</strong> has added you as a <strong>${data.tierName}</strong> member on GreenReserve.
      Set up your account to start booking your member rate online.
    </p>
    <a href="${data.setupLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set Up My Account &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      This link expires in 14 days. Questions? Reach out to ${data.courseName} directly.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `You're a member at ${data.courseName} — set up your account`,
    html,
  });
}

export async function sendMemberLinkedNotification(data: {
  name: string; email: string; courseName: string; courseSlug?: string; tierName: string;
}) {
  const portalUrl = data.courseSlug
    ? `${process.env.NEXT_PUBLIC_URL}/courses/${data.courseSlug}/account?email=${encodeURIComponent(data.email)}`
    : process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">⛳ Membership added</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:700;">You're now a member at ${data.courseName}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      You've been added as a <strong>${data.tierName}</strong> member. Your member rate will automatically apply
      next time you book a tee time there — just sign in with this email.
    </p>
    <a href="${portalUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">
      View My Account &rarr;
    </a>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `You're a member at ${data.courseName}`,
    html,
  });
}

// The lead form is public: every field below is attacker-controlled text that
// is interpolated into HTML delivered to hello@. Escape it.
const escHtml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Subject lines are plain text but still user text: one line, bounded.
const subj = (s: string) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);

export async function sendInquiryNotification(data: {
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
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:700;">New Course Inquiry ⛳</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">A new course has submitted interest on GreenReserve.</p>
    <div style="background:#f9fafb;border-radius:4px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${escHtml(data.courseName)}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:14px;">${escHtml(data.city)}, ${escHtml(data.state)} · ${escHtml(data.courseType)}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Current booking: ${escHtml(data.currentBookingMethod)}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Contact:</strong> ${escHtml(data.contactName)} — ${escHtml(data.contactTitle)}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Email:</strong> ${escHtml(data.email)}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Phone:</strong> ${escHtml(data.phone)}</p>
      ${data.greenFeeRange ? `<p style="margin:8px 0 0;color:#374151;font-size:14px;"><strong>Fee range:</strong> ${escHtml(data.greenFeeRange)}</p>` : ''}
      ${data.additionalNotes ? `<p style="margin:8px 0 0;color:#374151;font-size:14px;"><strong>Notes:</strong> ${escHtml(data.additionalNotes)}</p>` : ''}
      ${data.inviteNote ? `<p style="margin:12px 0 0;color:#A3452F;font-size:13px;"><strong>Call invite not sent:</strong> ${escHtml(data.inviteNote)} — send it from the inquiry page.</p>` : ''}
    </div>
    <a href="${process.env.NEXT_PUBLIC_URL}/admin" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">
      Review in Admin →
    </a>
  `);

  await getResend().emails.send({
    from: FROM,
    to: 'hello@greenreserve.app',
    subject: `New inquiry: ${data.courseName} — ${data.city}, ${data.state}`,
    html,
  });
}

// IF-1 §3 / SC-2 §1: the confirmation points at picking a call — the
// per-inquiry invite link when it was issued, else the Calendly fallback.
const INQUIRY_CALL_FALLBACK_URL = 'https://calendly.com/greenreserve';

export async function sendInquiryConfirmation(data: {
  firstName: string; contactName: string; email: string; courseName: string; callUrl?: string | null;
}) {
  const INQUIRY_CALL_URL = data.callUrl || INQUIRY_CALL_FALLBACK_URL;
  // IF-1: the "What you told us" table went with the branch questions — the
  // form no longer collects anything worth echoing back.
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">Got it, ${escHtml(data.firstName)}.</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Thanks for reaching out about <strong>${escHtml(data.courseName)}</strong>. The next step is a 20-minute call:
      we'll go through your green fees, your tee sheet, and what going live looks like. Most courses are live
      within a week of that call.
    </p>
    <a href="${INQUIRY_CALL_URL}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:12px;">
      Pick a call time
    </a>
    <p style="margin:0 0 24px;color:#9ca3af;font-size:12px;text-align:center;">20 minutes, at a time that works for you.</p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `We received your GreenReserve inquiry — ${data.courseName}`,
    html,
  });
}

export async function sendDetailsSheetConfirmationEmail(data: {
  firstName: string; contactName: string; email: string; courseName: string;
  details: Record<string, unknown>;
}) {
  const DETAIL_LABELS: Record<string, string> = {
    holes: 'Holes', par: 'Par', seasonOpen: 'Season opens', seasonClose: 'Season closes',
    firstTeeTime: 'First tee', lastTeeTime: 'Last tee', intervalMinutes: 'Interval (min)',
    greenFeeWeekday: 'Weekday green fee', greenFeeWeekend: 'Weekend green fee', cartFee: 'Cart fee',
    twilightFee: 'Twilight fee', walkingAllowed: 'Walking allowed',
    residentWeekday: 'Resident WD fee', residentWeekend: 'Resident WE fee', residentVerification: 'Residency verification',
    starterTierName: 'Membership tier', starterTierFee: 'Tier fee',
    memberAdvanceDays: 'Member advance booking', protectedTimes: 'Protected tee times',
    publicGreenFee: 'Public green fee', publicWindow: 'Public booking window',
    memberRate: 'Member rate', outingsVolume: 'Outings frequency',
    cancellationHours: 'Cancellation window (hrs)', lateFee: 'Late cancel fee',
    facilities: 'Facilities', restaurantType: 'Restaurant type',
    website: 'Website', description: 'Description', additionalNotes: 'Notes',
  };
  const skipKeys = new Set(['schedule','daysOpen','daysOfWeek','photos','facilitiesNotes','teeSets','memberships',
    'greenFeeWeekday','greenFeeWeekend','firstTeeTime','lastTeeTime','intervalMinutes','cartFee',
    'starterTierName','starterTierFee']);
  const d = data.details;
  const sch = d.schedule as Record<string, unknown> | undefined;
  const wdFee = (d.greenFeeWeekday ?? sch?.greenFeeWeekday) as string | undefined;
  const weFee = (d.greenFeeWeekend ?? sch?.greenFeeWeekend) as string | undefined;
  const firstTee = (d.firstTeeTime ?? sch?.startTime) as string | undefined;
  const lastTee = (d.lastTeeTime ?? sch?.endTime) as string | undefined;
  const intervalMin = (d.intervalMinutes ?? sch?.intervalMinutes) as string | undefined;
  const cartFee = (d.cartFee ?? sch?.cartFee) as string | undefined;

  const teeRow = (firstTee || wdFee) ? `
    <tr>
      <td style="padding:5px 0;color:#6b7280;font-size:13px;width:48%;vertical-align:top;">Tee times</td>
      <td style="padding:5px 0;color:#111827;font-size:13px;">${firstTee || ''}–${lastTee || ''} every ${intervalMin || '?'} min</td>
    </tr>
    <tr>
      <td style="padding:5px 0;color:#6b7280;font-size:13px;">Green fees</td>
      <td style="padding:5px 0;color:#111827;font-size:13px;">WD $${wdFee || '—'} / WE $${weFee || '—'}${cartFee ? ` · Cart $${cartFee}` : ''}</td>
    </tr>
  ` : '';

  type TeeSetRow = { name?: string; yardage?: string; par?: string; rating?: string; slope?: string; };
  type TierRow = { name?: string; fee?: string; includes?: string; perRound?: string; perRoundFee?: string; };
  const teeSetsRow = Array.isArray(d.teeSets) && (d.teeSets as TeeSetRow[]).some(t => t.name) ? `
    <tr>
      <td style="padding:5px 0;color:#6b7280;font-size:13px;vertical-align:top;">Tee sets</td>
      <td style="padding:5px 0;color:#111827;font-size:13px;">${(d.teeSets as TeeSetRow[]).filter(t => t.name).map(t => `${t.name}${t.yardage ? ' · ' + t.yardage + ' yds' : ''}${t.par ? ' · par ' + t.par : ''}`).join('<br>')}</td>
    </tr>
  ` : '';

  const membershipsRow = Array.isArray(d.memberships) && (d.memberships as TierRow[]).some(m => m.name) ? `
    <tr>
      <td style="padding:5px 0;color:#6b7280;font-size:13px;vertical-align:top;">Memberships</td>
      <td style="padding:5px 0;color:#111827;font-size:13px;">${(d.memberships as TierRow[]).filter(m => m.name).map(m => `${m.name}${m.fee ? ' · $' + m.fee + '/yr' : ''}`).join('<br>')}</td>
    </tr>
  ` : '';

  const photosRow = Array.isArray(d.photos) && (d.photos as string[]).length > 0 ? `
    <tr>
      <td style="padding:5px 0;color:#6b7280;font-size:13px;">Photos</td>
      <td style="padding:5px 0;color:#111827;font-size:13px;">${(d.photos as string[]).length} photo${(d.photos as string[]).length !== 1 ? 's' : ''} uploaded</td>
    </tr>
  ` : '';

  const restRows = Object.entries(d)
    .filter(([k, v]) => !skipKeys.has(k) && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0) && typeof v !== 'object')
    .map(([k, v]) => `
    <tr>
      <td style="padding:5px 0;color:#6b7280;font-size:13px;width:48%;vertical-align:top;">${DETAIL_LABELS[k] || k}</td>
      <td style="padding:5px 0;color:#111827;font-size:13px;">${Array.isArray(v) ? (v as string[]).join(', ') : String(v)}</td>
    </tr>`).join('');

  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">We got your details, ${data.firstName}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Here's everything you submitted for <strong>${data.courseName}</strong>.
      If anything looks wrong, just reply to this email and we'll fix it.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;color:#111827;font-size:13px;font-weight:700;">What you submitted</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${teeRow}${teeSetsRow}${membershipsRow}${restRows}${photosRow}
      </table>
    </div>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">
      We'll review your sheet and follow up within 1–2 business days with next steps.
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a>.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `We got your setup sheet — ${data.courseName}`,
    html,
  });
}

export async function sendDetailsRequestEmail(data: {
  contactName: string; email: string; courseName: string; detailsLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">One short form to get ${data.courseName} live.</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${data.contactName} — great news. We reviewed your inquiry and we&apos;d love to have ${data.courseName} on GreenReserve.
      Before we build your booking page, we need a few specifics: tee sheet schedule, green fees, policies, and facilities.
      Takes about 5 minutes. It saves as you go, so you can close and come back anytime.
    </p>
    <a href="${data.detailsLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:600;font-size:15px;margin-bottom:20px;">
      Fill Out Setup Sheet &rarr;
    </a>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #E6E3D7;color:#1C1C18;font-size:14px;font-weight:600;">1. Fill out the sheet</td><td style="padding:10px 0;border-bottom:1px solid #E6E3D7;color:#6E6D64;font-size:14px;">~5 minutes — one screen at a time</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #E6E3D7;color:#1C1C18;font-size:14px;font-weight:600;">2. We build your page</td><td style="padding:10px 0;border-bottom:1px solid #E6E3D7;color:#6E6D64;font-size:14px;">Usually the same business day</td></tr>
      <tr><td style="padding:10px 0;color:#1C1C18;font-size:14px;font-weight:600;">3. You go live</td><td style="padding:10px 0;color:#6E6D64;font-size:14px;">Review everything before golfers can book</td></tr>
    </table>
    <p style="margin:0;color:#98968B;font-size:12px;">
      Questions? Reply to this email — hello@greenreserve.app.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Quick setup sheet for ${data.courseName}`,
    html,
  });
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
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Set up your call with GreenReserve</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${escHtml(data.firstName)} — thanks for the note about <strong>${escHtml(data.courseName)}</strong>.
      Pick a 30-minute time that suits you and I'll call you then.
    </p>
    <a href="${data.url}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:20px;">
      Pick a time &rarr;
    </a>
    <p style="margin:0 0 6px;color:#111827;font-size:14px;font-weight:600;">What the call covers</p>
    <ul style="margin:0 0 20px;padding-left:20px;color:#6b7280;font-size:14px;line-height:1.6;">
      ${data.agendaLines.map(l => `<li>${escHtml(l)}</li>`).join('')}
    </ul>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">If none of the times work, just reply to this email.</p>
    <p style="margin:0;color:#111827;font-size:14px;">Cam<br /><span style="color:#98968B;font-size:12px;">GreenReserve · hello@greenreserve.app</span></p>
  `);
  const r = await getResend().emails.send({ from: FROM, to: data.email, subject: 'Set up your call with GreenReserve', html });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// SC-2 §3: to the course on book / move / cancel, with a .ics so it lands in
// their own calendar with no integration on their side.
export async function sendCallBookedEmail(data: {
  kind: 'booked' | 'moved' | 'cancelled';
  contactName: string; email: string; courseName: string; callId: string;
  scheduledAt: Date; durationMin: number; direction: string; phone: string; agendaLabels: string[]; manageUrl: string;
}) {
  const when = data.scheduledAt.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const who = data.direction === 'they_call' ? 'You call us — reply to this email and we\u2019ll send the number.' : `We\u2019ll call you at ${escHtml(data.phone)}.`;
  const first = escHtml(data.contactName.split(' ')[0] || data.contactName);
  const heading = data.kind === 'cancelled' ? 'Your call is cancelled' : data.kind === 'moved' ? `Moved — ${when} ET` : `You\u2019re booked — ${when} ET`;
  const agenda = data.agendaLabels.length && data.kind !== 'cancelled'
    ? `<p style="margin:16px 0 6px;color:#111827;font-size:14px;font-weight:600;">What we'll go over</p><ul style="margin:0 0 16px;padding-left:20px;color:#6b7280;font-size:14px;line-height:1.6;">${data.agendaLabels.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>`
    : '';
  const body = data.kind === 'cancelled'
    ? `<p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">Hi ${first} — the call about <strong>${escHtml(data.courseName)}</strong> set for ${when} ET is cancelled. Nothing is booked now.</p>
       <a href="${data.manageUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:16px;">Pick a new time &rarr;</a>`
    : `<p style="margin:0 0 4px;color:#111827;font-size:15px;line-height:1.6;"><strong>${when} ET</strong> · about ${data.durationMin} minutes</p>
       <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">${who}</p>
       ${agenda}
       <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">Need to change it? <a href="${data.manageUrl}" style="color:#1b4332;">Reschedule or cancel</a> — the same link works until we talk.</p>`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">${heading}</h1>
    ${data.kind !== 'cancelled' ? `<p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">Hi ${first} — here are the details for our call about <strong>${escHtml(data.courseName)}</strong>. The calendar file is attached.</p>` : ''}
    ${body}
    <p style="margin:0;color:#98968B;font-size:12px;">Questions? Reply to this email — hello@greenreserve.app.</p>
  `);
  const { buildIcs } = await import('./ics');
  const ics = buildIcs({
    uid: `call-${data.callId}@greenreserve.app`, start: data.scheduledAt, durationMin: data.durationMin,
    summary: `Call with GreenReserve — ${data.courseName}`, description: `${data.direction === 'they_call' ? 'You call GreenReserve.' : `GreenReserve calls you at ${data.phone}.`}\n${data.manageUrl}`,
    url: data.manageUrl, method: data.kind === 'cancelled' ? 'CANCEL' : 'REQUEST', sequence: data.kind === 'booked' ? 0 : 1,
  });
  const subject = data.kind === 'cancelled' ? `Cancelled — your call with GreenReserve` : data.kind === 'moved' ? `Moved — your call with GreenReserve, ${when} ET` : `You\u2019re booked — ${when} ET`;
  const r = await getResend().emails.send({
    from: FROM, to: data.email, subject, html,
    attachments: [{ filename: data.kind === 'cancelled' ? 'cancelled.ics' : 'greenreserve-call.ics', content: Buffer.from(ics, 'utf8') }],
  });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// SC-2 §3: to hello@ — course, contact, phone, time, link to the inquiry.
export async function sendCallBookedAdminEmail(data: {
  kind: 'booked' | 'moved' | 'cancelled'; contactName: string; phone: string; courseName: string; inquiryId: string; scheduledAt: Date; direction: string;
}) {
  const when = data.scheduledAt.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const verb = data.kind === 'booked' ? 'booked a call' : data.kind === 'moved' ? 'moved their call' : 'cancelled their call';
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;font-weight:700;">${escHtml(data.courseName)} ${verb}</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">${when} ET · ${escHtml(data.contactName)} · ${escHtml(data.phone)} · ${data.direction === 'they_call' ? 'they call us' : 'we call them'}</p>
    <a href="${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/admin/inquiries/${data.inquiryId}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">
      Open the inquiry &rarr;
    </a>
  `);
  const r = await getResend().emails.send({ from: FROM, to: 'hello@greenreserve.app', subject: `${data.kind === 'cancelled' ? 'Cancelled' : data.kind === 'moved' ? 'Moved' : 'Booked'}: ${subj(data.courseName)} — ${when} ET`, html });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// SC-2 §2 (S5): the booking page could not read the calendar — Cam should know.
export async function sendCalendarUnavailableAlert(data: { courseName: string; inquiryId: string; error: string }) {
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:20px;font-weight:700;">Call booking page could not read Google Calendar</h2>
    <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">${escHtml(data.courseName)} opened their booking link and saw the "reply with a couple of times" fallback instead of the grid.</p>
    <p style="margin:0 0 16px;color:#374151;font-size:13px;font-family:monospace;">${escHtml(data.error.slice(0, 400))}</p>
    <a href="${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/admin/inquiries/${data.inquiryId}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">Open the inquiry &rarr;</a>
  `);
  const r = await getResend().emails.send({ from: FROM, to: 'hello@greenreserve.app', subject: `Calendar unreachable — ${subj(data.courseName)} could not book`, html });
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
          <td style="padding:8px 0;border-bottom:1px solid #E6E3D7;color:#6b7280;font-size:13px;width:38%;vertical-align:top;">${escHtml(label)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #E6E3D7;color:#111827;font-size:13px;">${escHtml(val)}</td>
        </tr>`).join('');
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Thanks for the call, ${escHtml(data.contactName.split(' ')[0] || data.contactName)}.</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
      Here is what we wrote down about <strong>${escHtml(data.courseName)}</strong> on ${when}. It will show up
      pre-filled on your setup sheet, where you can change any of it — and if something below is off, just reply to this email.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">${rows}
    </table>
    <p style="margin:0;color:#98968B;font-size:12px;">
      Questions? Reply to this email — hello@greenreserve.app.
    </p>
  `);
  const r = await getResend().emails.send({
    from: FROM,
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
  const when = data.scheduledAt.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const who = data.direction === 'they_call'
    ? `You call us${data.phone ? ` at ${data.phone}` : ''}.`
    : `We call you${data.phone ? ` at ${data.phone}` : ''}.`;
  const agenda = data.agendaLabels.length
    ? `<p style="margin:16px 0 6px;color:#111827;font-size:14px;font-weight:600;">What we'll go over</p><ul style="margin:0 0 16px;padding-left:20px;color:#6b7280;font-size:14px;line-height:1.6;">${data.agendaLabels.map(l => `<li>${l}</li>`).join('')}</ul>`
    : '';
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Your call with GreenReserve</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${data.contactName} — here are the details for our call about <strong>${data.courseName}</strong>.
    </p>
    <p style="margin:0 0 4px;color:#111827;font-size:15px;line-height:1.6;"><strong>${when} ET</strong> · about ${data.durationMin} minutes</p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">${who}</p>
    ${agenda}
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">Reply to this email if the time doesn't work and we'll find another.</p>
  `);
  const r = await getResend().emails.send({ from: FROM, to: data.email, subject: `Your call with GreenReserve — ${when} ET`, html });
  if (r.error) throw new Error(r.error.message);
}

export async function sendInquiryDeclinedEmail(data: {
  contactName: string; email: string; courseName: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Thanks for considering GreenReserve.</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${data.contactName} — we&apos;ve looked over your inquiry for <strong>${data.courseName}</strong>,
      and we&apos;re not able to take it on right now.
    </p>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
      That is not a verdict on your course. We are a small team bringing courses on in a deliberate order,
      and where we are in that order changes. If you would like us to take another look later,
      just reply to this email — we keep every inquiry on file.
    </p>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6;">
      Either way, thank you for the time you spent telling us about ${data.courseName}.
    </p>
    <p style="margin:0;color:#98968B;font-size:12px;">
      Questions? Reply to this email — hello@greenreserve.app.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Your GreenReserve inquiry — ${data.courseName}`,
    html,
  });
}

export async function sendDetailsSubmittedNotification(data: { courseName: string; contactName: string }) {
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:700;">Setup sheet submitted ✅</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      <strong>${data.contactName}</strong> from <strong>${data.courseName}</strong> just submitted their detail sheet.
      It's ready to build.
    </p>
    <a href="${process.env.NEXT_PUBLIC_URL}/admin" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">
      Review in Admin &rarr;
    </a>
  `);
  await getResend().emails.send({
    from: FROM,
    to: 'hello@greenreserve.app',
    subject: `Setup sheet ready: ${data.courseName}`,
    html,
  });
}

export async function sendCourseApprovedNotification(data: { courseName: string; contactName: string }) {
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:700;">Course approved their page ✅</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      <strong>${data.contactName}</strong> from <strong>${data.courseName}</strong> reviewed their preview page and approved it — ready to go live.
    </p>
    <a href="${process.env.NEXT_PUBLIC_URL}/admin" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">
      Review in Admin &rarr;
    </a>
  `);
  await getResend().emails.send({
    from: FROM,
    to: 'hello@greenreserve.app',
    subject: `Approved: ${data.courseName}`,
    html,
  });
}

// Sent the moment a course actually goes live (mark_live), not at account
// creation — this is the "now that golfers can book, here's how to run the
// place" orientation, distinct from sendOperatorWelcomeEmail's initial login.
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
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">✓ You're live</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">${data.courseName} is bookable right now.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Golfers can find and book your tee sheet at <a href="${bookingUrl}" style="color:#1b4332;font-weight:600;">${bookingUrl.replace('https://', '')}</a>.
      Here's a quick map of your dashboard so you know where everything lives.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${sections.map(([title, desc]) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0 0 2px;color:#111827;font-size:14px;font-weight:700;">${title}</p>
          <p style="margin:0;color:#6b7280;font-size:13px;">${desc}</p>
        </td>
      </tr>`).join('')}
    </table>

    <a href="${dashboardUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:20px;">
      Go to My Dashboard &rarr;
    </a>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:18px 20px;margin-bottom:8px;">
      <p style="margin:0 0 6px;color:#111827;font-size:13px;font-weight:700;">A few things worth knowing:</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">• Golfers pay GreenReserve's $1.50 per player on top of your price, in the same card payment as your green fee; Stripe's normal processing fee applies to the payment, and GreenReserve charges you nothing on top of it.</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">• Need to close for a day (weather, maintenance, outing)? Block it from Schedule.</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">• Payouts come from Stripe on its normal payout schedule for your account — check Settings → Payments for your payout status.</p>
    </div>

    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
      Questions or something looks wrong? Reply to this email or reach us at <a href="mailto:hello@greenreserve.app" style="color:#6b7280;">hello@greenreserve.app</a> — a real person reads it.
    </p>
  `);

  await getResend().emails.send({
    from: FROM,
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
  const dashboardUrl = `${process.env.NEXT_PUBLIC_URL}/dashboard`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Finish setting up ${data.courseName}</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${data.operatorName} — ${data.courseName} isn&apos;t bookable yet. Here&apos;s what's left:
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;color:#374151;font-size:14px;line-height:1.8;">
      ${data.remainingSteps.map(s => `<li>${s}</li>`).join('')}
    </ul>
    <a href="${dashboardUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">
      Finish Setup &rarr;
    </a>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">
      Stuck on something? Reply to this email — hello@greenreserve.app.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `${data.courseName} is still waiting to go live`,
    html,
  });
}

export async function sendMembershipPaymentLinkEmail(data: {
  name: string; email: string; courseName: string; tierName: string;
  annualFee: number; initiationFee: number; payLink: string; isRenewal?: boolean;
}) {
  const total = data.annualFee + data.initiationFee;
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">${data.isRenewal ? 'Membership renewal' : 'Membership dues'}</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">${data.isRenewal ? `Time to renew, ${data.name}.` : `Complete your membership, ${data.name}.`}</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      ${data.isRenewal
        ? `Your <strong>${data.tierName}</strong> membership at <strong>${data.courseName}</strong> is coming up for renewal. Pay your dues online to keep your member rates and booking privileges.`
        : `<strong>${data.courseName}</strong> has set you up as a <strong>${data.tierName}</strong> member. Pay your dues online to activate your membership.`}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;color:#374151;">
      ${data.initiationFee > 0 ? `<tr><td style="padding:6px 0;">One-time initiation fee</td><td style="text-align:right;font-weight:700;">$${data.initiationFee.toFixed(2)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;">${data.tierName} dues</td><td style="text-align:right;font-weight:700;">$${data.annualFee.toFixed(2)}</td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:800;color:#111827;">Total due</td><td style="text-align:right;border-top:1px solid #e5e7eb;font-weight:700;color:#111827;">$${total.toFixed(2)}</td></tr>
    </table>
    <a href="${data.payLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Pay Membership Dues &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Payment goes directly to ${data.courseName}. Paying at the pro shop instead? Just let the course know.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: data.isRenewal
      ? `Renew your membership at ${data.courseName}`
      : `Pay your membership dues — ${data.courseName}`,
    html,
  });
}

export async function sendAdminSetPasswordEmail(data: {
  name: string; email: string; setPasswordLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">Set your admin password</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.name} — you've been added as a GreenReserve admin. Click the button below to set your password and activate your account. This link expires in 24 hours.
    </p>
    <a href="${data.setPasswordLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Set My Password &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      If you weren't expecting this, you can safely ignore it.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: 'Set your GreenReserve admin password',
    html,
  });
}

export async function sendMemberMagicLink(data: {
  name: string; email: string; courseName: string; magicLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">Sign in to your member account</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Click the button below to sign in to your <strong>${data.courseName}</strong> member portal. This link expires in 15 minutes.
    </p>
    <a href="${data.magicLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Sign In to Member Portal &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Sign in to ${data.courseName} member portal`,
    html,
  });
}

export async function sendMembershipReceiptEmail(data: {
  name: string; email: string; courseName: string; tierName: string;
  amountPaid: number; expiresAt: Date | null;
}) {
  const until = data.expiresAt
    ? data.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">Payment received</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">You're all set, ${data.name}.</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Your payment of <strong>$${data.amountPaid.toFixed(2)}</strong> to <strong>${data.courseName}</strong> went through.
      Your <strong>${data.tierName}</strong> membership is active${until ? ` through <strong>${until}</strong>` : ''}.
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px;">Keep this email as your receipt. Member rates apply automatically when you book while signed in.</p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Receipt — ${data.tierName} membership at ${data.courseName}`,
    html,
  });
}

export async function sendMessageNotificationEmail(data: {
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  courseName: string;
  messageBody: string;
  replyUrl: string;
}) {
  const preview = data.messageBody.length > 200 ? data.messageBody.slice(0, 200) + '…' : data.messageBody;
  const bodyLines = preview.split('\n').map(l => `<p style="margin:0 0 8px;color:#374151;font-size:15px;">${l}</p>`).join('');
  const html = baseTemplate(`
    <p style="color:#374151;font-size:15px;margin:0 0 16px;">Hi ${data.recipientName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;"><strong>${data.senderName}</strong> sent a message about <strong>${data.courseName}</strong>:</p>
    <div style="background:#f9fafb;border-left:3px solid #1b4332;padding:14px 18px;margin:0 0 24px;border-radius:0 4px 4px 0;">${bodyLines}</div>
    <a href="${data.replyUrl}" style="display:inline-block;background:#1b4332;color:#ffffff;font-size:14px;font-weight:600;padding:10px 22px;border-radius:4px;text-decoration:none;">View &amp; Reply</a>
    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0;">Reply directly at greenreserve.app — no need to respond to this email.</p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.recipientEmail,
    subject: `Message from ${data.senderName} — ${data.courseName}`,
    html,
  });
}

export async function sendAnnouncementEmail(data: {
  operatorName: string;
  operatorEmail: string;
  title: string;
  body: string;
}) {
  const bodyHtml = data.body
    .split('\n')
    .map(line => line.trim() ? `<p style="margin:0 0 12px;color:#374151;font-size:15px;">${line}</p>` : '')
    .join('');
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600;padding:4px 14px;border-radius:4px;">Platform announcement</span></div>
    <h1 style="margin:16px 0 16px;color:#111827;font-size:24px;font-weight:700;">${data.title}</h1>
    <div style="margin:0 0 20px;">${bodyHtml}</div>
    <p style="margin:0;color:#9ca3af;font-size:12px;">This message is from the GreenReserve team to all course operators on the platform.</p>
  `);
  // MP-7a: the Resend SDK returns { error } rather than throwing, and this
  // function discarded it — a rejected email counted as sent. Throw, so the
  // broadcast route's per-recipient tally is real.
  const r = await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `[GreenReserve] ${data.title}`,
    html,
  });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// MP-6b. A refund the golfer did not see coming reads as a mistake; one they
// asked for and never hear about reads as ignored. Either way, tell them.
export async function sendRefundEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; amountCents: number; full: boolean; reason: string; bookingId: string;
}) {
  const amount = `$${(data.amountCents / 100).toFixed(2)}`;
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#f0fdf4;color:#166534;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Refund issued</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:700;">${amount} is on its way back to your card.</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;">${data.courseName} &middot; ${data.date} at ${data.time}${data.full ? '' : ' &middot; partial refund'}</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${data.reason}</p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">Refunds usually appear on your statement within 5&ndash;10 business days, depending on your bank. It goes back to the card you paid with.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  const r = await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Refund: ${amount} from ${data.courseName}`, html });
  if (r.error) throw new Error(r.error.message || 'Resend rejected the email');
}

// AG-2 §2: "Your signed GreenReserve agreements" — the PDFs attached, a copy
// to hello@. `pending` names any document whose PDF did not render; the
// signing itself is on record regardless and the copy follows by email.
export async function sendSignedAgreementsEmail(data: {
  operatorName: string; operatorEmail: string; courseName: string; legalName: string;
  signerName: string; signerEmail: string; acceptedAt: Date;
  documents: { title: string; version: string }[];
  pending: string[];
  attachments: { filename: string; content: Buffer }[];
}) {
  const when = data.acceptedAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }) + ' ET';
  const list = data.documents.map(d => `<li style="margin:0 0 4px;">${d.title} <span style="color:#6b7280;">v${d.version}</span></li>`).join('');
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Your signed GreenReserve agreements</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${data.operatorName} &mdash; ${data.signerName || 'you'} signed the following for <strong>${data.legalName || data.courseName}</strong> on ${when}.
      ${data.attachments.length ? 'The signed copies are attached.' : ''}
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#111827;font-size:14px;">${list}</ul>
    ${data.pending.length ? `<p style="margin:0 0 16px;color:#92400e;font-size:13px;">The PDF for ${data.pending.join(' and ')} is still being prepared and will follow.</p>` : ''}
    <p style="margin:0;color:#9ca3af;font-size:12px;">Signed electronically from ${data.signerEmail}. Keep this email for your records. Questions? Reply to this email &mdash; hello@greenreserve.app.</p>
  `);
  const r = await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    cc: 'hello@greenreserve.app',
    replyTo: 'hello@greenreserve.app',
    subject: `Your signed GreenReserve agreements — ${data.courseName}`,
    html,
    attachments: data.attachments.map(a => ({ filename: a.filename, content: a.content })),
  });
  if (r.error) throw new Error(r.error.message);
}

// AG-3 §2: the day-0 notice of a version bump that requires re-acceptance.
export async function sendAgreementBumpNoticeEmail(data: {
  operatorName: string; operatorEmail: string; courseName: string;
  title: string; version: string; effectiveAt: Date; reacceptBy: Date; changeSummary: string;
}) {
  const d = (x: Date) => x.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const signUrl = `${process.env.NEXT_PUBLIC_URL}/dashboard/sign`;
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">The ${data.title} has changed</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">
      Hi ${data.operatorName} &mdash; a new version (v${data.version}) of the GreenReserve ${data.title} took effect on ${d(data.effectiveAt)} for <strong>${data.courseName}</strong>.
      Please review and sign it by <strong>${d(data.reacceptBy)}</strong>.
    </p>
    ${data.changeSummary ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:16px;margin-bottom:20px;"><p style="margin:0 0 4px;color:#374151;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">What changed</p><p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${data.changeSummary}</p></div>` : ''}
    <a href="${signUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:20px;">Review and sign &rarr;</a>
    <p style="margin:0 0 12px;color:#6b7280;font-size:13px;line-height:1.6;">After ${d(data.reacceptBy)}, course settings in your dashboard become read-only until the new version is signed. Bookings and check-ins are never affected.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;">Questions? Reply to this email &mdash; hello@greenreserve.app.</p>
  `);
  const r = await getResend().emails.send({
    from: FROM, to: data.operatorEmail, replyTo: 'hello@greenreserve.app',
    subject: `Action needed: the GreenReserve ${data.title} changed — sign by ${d(data.reacceptBy)}`,
    html,
  });
  if (r.error) throw new Error(r.error.message);
}

export async function sendAgreementBumpAdminSummaryEmail(data: { title: string; version: string; reacceptBy: Date; notified: number; failures: string[] }) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">${data.title} v${data.version}: day-0 notice sent</h1>
    <p style="margin:0 0 12px;color:#6b7280;font-size:14px;line-height:1.6;">${data.notified} operator${data.notified === 1 ? '' : 's'} notified. Re-acceptance deadline ${data.reacceptBy.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}.</p>
    ${data.failures.length ? `<p style="margin:0;color:#92400e;font-size:13px;">Failed to send to: ${data.failures.join(', ')} — contact them another way.</p>` : ''}
  `);
  const r = await getResend().emails.send({ from: FROM, to: 'hello@greenreserve.app', subject: `[GreenReserve] ${data.title} v${data.version} notice sent to ${data.notified}`, html });
  if (r.error) throw new Error(r.error.message);
}
