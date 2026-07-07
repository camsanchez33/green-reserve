import { Resend } from 'resend';

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
        <tr>
          <td style="background:#0a0a0a;padding:20px 36px;text-align:left;">
            <span style="color:#fff;font-size:16px;font-weight:700;letter-spacing:-0.3px;">Green<span style="color:#34d399;">Reserve</span></span>
          </td>
        </tr>
        <tr><td style="background:#ffffff;padding:36px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">${content}</td></tr>
        <tr>
          <td style="background:#ffffff;padding:0 36px 20px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;">
            <div style="border-top:1px solid #f4f4f5;padding-top:20px;text-align:center;color:#a1a1aa;font-size:11px;">
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
  golferName: string; golferEmail: string; courseName: string; courseAddress: string;
  date: string; time: string; players: number; holes: number;
  greenFeeTotal: number; cartFeeTotal: number; accessFeeTotal: number; totalAmount: number;
  bookingId: string; appliedRate: string;
  rangeBallsTotal?: number; cancellationFeeTotal?: number; cancellationHours?: number;
  checkInToken?: string;
  noCard?: boolean; // true for no-fee-policy courses where no card was collected
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  const cancellationHours = data.cancellationHours ?? 24;
  const cancellationFee = data.cancellationFeeTotal ?? 0;
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
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
    <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Fees</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.accessFeeTotal / 100).toFixed(2)}</span></td></tr>
  `;

  let intro: string;
  let totalRow: string;
  let policyBox: string;
  let ctaButtons: string;

  if (noCard) {
    // No-fee-policy course — no card collected, golfer pays at check-in
    intro = `<h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're on the tee sheet.</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Your spot at ${data.courseName} is confirmed. <strong>No card required</strong> — pay at the course when you check in, or use the link below to pay online.</p>`;
    totalRow = `<tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">Total due at the course</span><br><span style="color:#111827;font-size:20px;font-weight:900;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>`;
    policyBox = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:13px;font-weight:600;">&#10003; Free cancellation any time — no fees, no card on file.</p>
    </div>`;
    ctaButtons = `
      ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay Online &rarr;</a>` : ''}
      <a href="https://greenreserve.app/account" style="display:block;color:#1b4332;text-decoration:none;text-align:center;padding:8px;font-weight:700;font-size:13px;margin-bottom:16px;">Manage My Booking &rarr;</a>`;
  } else if (cancellationFee > 0) {
    // Card on file, course has a cancellation fee
    intro = `<h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're on the tee sheet.</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Here are your booking details for ${data.courseName}. <strong>Nothing has been charged yet</strong> — your card is saved to hold your spot.</p>`;
    totalRow = `<tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">Estimated total at check-in</span><br><span style="color:#111827;font-size:20px;font-weight:900;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>`;
    policyBox = `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 4px;color:#1e3a8a;font-size:13px;font-weight:700;">Cancellation policy</p>
      <p style="margin:0;color:#1e40af;font-size:13px;">Cancel any time up to ${cancellationHours} hours before your tee time at no charge. After that, a $${(cancellationFee / 100).toFixed(2)} late-cancellation fee will be charged to your card — it&rsquo;s refunded in full when you check in and pay for your round.</p>
    </div>`;
    ctaButtons = `
      ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay &rarr;</a>` : ''}
      <a href="https://greenreserve.app/account" style="display:block;${checkInUrl ? 'color:#1b4332;' : 'background:#1b4332;color:#fff;'}text-decoration:none;text-align:center;padding:${checkInUrl ? '8px' : '14px'};border-radius:4px;font-weight:700;font-size:${checkInUrl ? '13px' : '15px'};margin-bottom:16px;">Manage My Booking &rarr;</a>`;
  } else {
    // Card on file, no cancellation fee policy
    intro = `<h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're on the tee sheet.</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Here are your booking details for ${data.courseName}. <strong>Nothing has been charged yet</strong> — your card is saved to hold your spot.</p>`;
    totalRow = `<tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">Estimated total at check-in</span><br><span style="color:#111827;font-size:20px;font-weight:900;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>`;
    policyBox = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:13px;font-weight:600;">&#10003; Free cancellation any time — this course has no late-cancellation fee.</p>
    </div>`;
    ctaButtons = `
      ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay &rarr;</a>` : ''}
      <a href="https://greenreserve.app/account" style="display:block;${checkInUrl ? 'color:#1b4332;' : 'background:#1b4332;color:#fff;'}text-decoration:none;text-align:center;padding:${checkInUrl ? '8px' : '14px'};border-radius:4px;font-weight:700;font-size:${checkInUrl ? '13px' : '15px'};margin-bottom:16px;">Manage My Booking &rarr;</a>`;
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
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:900;">New Booking &#127949;</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">A tee time has been booked at ${data.courseName}. ${noCard ? 'No card was collected — golfer pays at the course or via check-in link.' : "Their card is on file — nothing's charged until they check in (or the cancellation window closes)."}</p>
    <div style="background:#f9fafb;border-radius:4px;padding:20px;">
      <p style="margin:0 0 8px;"><strong>Golfer:</strong> ${data.golferName} (${data.golferEmail})</p>
      <p style="margin:0 0 8px;"><strong>Date:</strong> ${data.date} at ${data.time}</p>
      <p style="margin:0 0 12px;"><strong>Players:</strong> ${data.players} &middot; ${data.holes} holes</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:10px;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Green Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</td></tr>
        ${data.cartFeeTotal > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Cart Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</td></tr>` : ''}
        ${(data.rangeBallsTotal ?? 0) > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Range Balls</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.rangeBallsTotal! / 100).toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:8px 0 4px;color:#166534;font-size:14px;font-weight:800;">Expected Revenue</td><td style="padding:8px 0 4px;text-align:right;color:#166534;font-size:16px;font-weight:900;">$${yourRevenue.toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:6px 0 0;color:#9ca3af;font-size:11px;">Once they check in and pay. + $${(data.accessFeeTotal / 100).toFixed(2)} GreenReserve fee, charged to the golfer — not deducted from you.</td></tr>
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
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Booking Cancelled</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">Your booking has been cancelled.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">${data.courseName} &middot; ${data.date} at ${data.time} &middot; ${data.players} player${data.players > 1 ? 's' : ''}</p>
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
export async function sendCancellationFeeChargedEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; feeAmount: number; bookingId: string; checkInToken?: string | null;
}) {
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Cancellation window closed</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:900;">You've been charged $${(data.feeAmount / 100).toFixed(2)}.</h1>
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
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; feeAmount: number; bookingId: string; cancellationHours: number;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">Action required</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:900;">Your cancellation window closes soon.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.golferName} — your tee time at <strong style="color:#111827;">${data.courseName}</strong> on ${data.date} at ${data.time} is coming up.
      The free-cancellation window (${data.cancellationHours} hours before your tee time) closes within the next hour.
    </p>
    <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:4px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 6px;color:#92400e;font-size:14px;font-weight:700;">If you need to cancel, do it now.</p>
      <p style="margin:0;color:#92400e;font-size:14px;">After the window closes, a $${(data.feeAmount / 100).toFixed(2)} late-cancellation fee will be charged to your card automatically.</p>
    </div>
    <a href="${process.env.NEXT_PUBLIC_URL}/account" style="display:block;background:#111827;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:16px;">Cancel for Free &rarr;</a>
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
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're locked in — check in any time.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      The free-cancellation window for your ${data.date} at ${data.time} tee time at ${data.courseName} has closed.
      You can check in and pay online now, or just show up and check in at the pro shop.
    </p>
    ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:16px;">Check In &amp; Pay Online &rarr;</a>` : ''}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Ready to check in — ${data.courseName} ${data.date} at ${data.time}`, html });
}

// Fired the moment performCheckIn() successfully charges a golfer for their
// round at check-in. Itemizes the same numbers as the original booking
// confirmation, plus the late-cancellation fee refund if one applied.
export async function sendCheckInReceiptEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  feeRefunded: boolean; feeRefundAmount: number;
  bookingId: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 12px;border-radius:3px;">&#10003; Checked in</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're charged $${(data.totalAmount / 100).toFixed(2)} — enjoy your round!</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">${data.courseName} &middot; ${data.date} at ${data.time}</p>
    <div style="background:#f9fafb;border-radius:4px;padding:24px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Green Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</td></tr>
        ${data.cartFeeTotal > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Cart Fee</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</td></tr>` : ''}
        ${data.rangeBallsTotal > 0 ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Range Balls</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.rangeBallsTotal / 100).toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Fees</td><td style="padding:4px 0;text-align:right;color:#111827;font-size:13px;font-weight:600;">$${(data.accessFeeTotal / 100).toFixed(2)}</td></tr>
        <tr><td style="padding:10px 0 0;color:#111827;font-size:14px;font-weight:800;border-top:1px solid #e5e7eb;">Total Charged</td><td style="padding:10px 0 0;text-align:right;color:#111827;font-size:18px;font-weight:900;border-top:1px solid #e5e7eb;">$${(data.totalAmount / 100).toFixed(2)}</td></tr>
      </table>
    </div>
    ${data.feeRefunded ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#166534;font-size:14px;font-weight:600;">&#10003; The $${(data.feeRefundAmount / 100).toFixed(2)} late-cancellation fee you were charged earlier has been refunded.</p></div>` : ''}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Receipt: ${data.courseName} — $${(data.totalAmount / 100).toFixed(2)}`, html });
}

export async function sendWaitlistNotification(data: {
  name: string; email: string; courseName: string; date: string; time: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:900;">A spot just opened up! &#9971;</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Good news &mdash; a tee time you were waitlisted for at <strong>${data.courseName}</strong> is now available.</p>
    <div style="background:#f9fafb;border-radius:4px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:18px;">${data.time}</p>
      <p style="margin:0;color:#6b7280;">${data.date} &middot; ${data.courseName}</p>
    </div>
    <a href="https://greenreserve.app/courses" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">Book Now &rarr;</a>
  `);
  await getResend().emails.send({ from: FROM, to: data.email, subject: `Spot available: ${data.time} at ${data.courseName}`, html });
}

export async function sendReminderEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseAddress: string;
  date: string; time: string; players: number; holes: number; bookingId: string; checkInToken?: string | null;
}) {
  const checkInUrl = data.checkInToken ? `${process.env.NEXT_PUBLIC_URL}/checkin/${data.bookingId}?token=${data.checkInToken}` : '';
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:26px;font-weight:900;">&#9971; Tee time tomorrow!</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">You&rsquo;re on the tee sheet at ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:4px;padding:24px;margin-bottom:20px;">
      <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:900;">${data.time}</p>
      <p style="margin:0 0 4px;color:#374151;font-weight:600;">${data.courseName}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">&#128205; ${data.courseAddress}</p>
      <p style="margin:0;color:#6b7280;font-size:14px;">${data.players} player${data.players > 1 ? 's' : ''} &middot; ${data.holes} holes</p>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:4px;padding:14px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:13px;">&#128336; ${checkInUrl ? 'Check in and pay below before you head out, or do it at the pro shop when you arrive.' : 'Arrive 15 minutes early and check in at the pro shop.'}</p>
    </div>
    ${checkInUrl ? `<a href="${checkInUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;margin-bottom:10px;">Check In &amp; Pay &rarr;</a>` : ''}
    <a href="https://greenreserve.app/account" style="display:block;${checkInUrl ? 'color:#1b4332;' : 'background:#1b4332;color:#fff;'}text-decoration:none;text-align:center;padding:${checkInUrl ? '8px' : '14px'};font-weight:600;font-size:${checkInUrl ? '13px' : '15px'};">View or Cancel Booking &rarr;</a>
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
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">Welcome to GreenReserve, ${data.operatorName}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      <strong>${data.courseName}</strong> has been approved and your dashboard is ready to set up.
      It takes about 5 minutes to go live.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Login Email</p>
      <p style="margin:0 0 16px;color:#111827;font-size:15px;font-weight:600;">${data.operatorEmail}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Temporary Password</p>
      <p style="margin:0;color:#111827;font-size:18px;font-weight:900;font-family:monospace;letter-spacing:0.1em;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;display:inline-block;">${data.tempPassword}</p>
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
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:900;">Reset your password</h1>
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

export async function sendGolferPasswordResetEmail(data: {
  golferName: string;
  golferEmail: string;
  resetLink: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:900;">Reset your password</h1>
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
export async function sendTwoFactorCodeEmail(data: {
  operatorName: string;
  operatorEmail: string;
  code: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:900;">Your verification code</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.operatorName} — enter this code to finish signing in to your GreenReserve dashboard.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:24px;margin-bottom:20px;text-align:center;">
      <p style="margin:0;color:#111827;font-size:32px;font-weight:900;font-family:monospace;letter-spacing:0.2em;">${data.code}</p>
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

// Fired after ANY successful password change (in-dashboard change-password,
// or the emailed reset-link flow) — pure notification, doesn't gate anything.
// Lets the real owner know if a change wasn't them.
export async function sendPasswordChangedNotification(data: {
  operatorName: string;
  operatorEmail: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:24px;font-weight:900;">Your password was changed</h1>
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
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">Welcome, ${data.name}.</h1>
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
  name: string; email: string; courseName: string; tierName: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">⛳ Membership added</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:900;">You're now a member at ${data.courseName}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      You've been added as a <strong>${data.tierName}</strong> member. Your member rate will automatically apply
      next time you book a tee time there — just log in with this email.
    </p>
    <a href="${process.env.NEXT_PUBLIC_URL}/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:15px;">
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
}) {
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:900;">New Course Inquiry ⛳</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">A new course has submitted interest on GreenReserve.</p>
    <div style="background:#f9fafb;border-radius:4px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${data.courseName}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:14px;">${data.city}, ${data.state} · ${data.courseType}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Current booking: ${data.currentBookingMethod}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Contact:</strong> ${data.contactName} — ${data.contactTitle}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Email:</strong> ${data.email}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Phone:</strong> ${data.phone}</p>
      ${data.greenFeeRange ? `<p style="margin:8px 0 0;color:#374151;font-size:14px;"><strong>Fee range:</strong> ${data.greenFeeRange}</p>` : ''}
      ${data.additionalNotes ? `<p style="margin:8px 0 0;color:#374151;font-size:14px;"><strong>Notes:</strong> ${data.additionalNotes}</p>` : ''}
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

export async function sendDetailsRequestEmail(data: {
  contactName: string; email: string; courseName: string; detailsLink: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">⛳ Next step</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:900;">Let's get ${data.courseName} set up.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.contactName} — thanks for your interest in GreenReserve. We just need a few more details
      about your pricing, policies, and facilities so we can build your booking page correctly the first time.
      Takes about 5 minutes.
    </p>
    <a href="${data.detailsLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:4px;font-weight:800;font-size:16px;margin-bottom:16px;">
      Complete Setup Sheet &rarr;
    </a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Once we receive this, we'll build your page and send your login — usually same day.
    </p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.email,
    subject: `Quick setup sheet for ${data.courseName}`,
    html,
  });
}

export async function sendDetailsSubmittedNotification(data: { courseName: string; contactName: string }) {
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:900;">Setup sheet submitted ✅</h2>
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
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">${data.courseName} is bookable right now.</h1>
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
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">• You keep 100% of green fees and cart fees — GreenReserve's $1.50 access fee is charged to the golfer, not deducted from you.</p>
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

export async function sendMembershipPaymentLinkEmail(data: {
  name: string; email: string; courseName: string; tierName: string;
  annualFee: number; initiationFee: number; payLink: string; isRenewal?: boolean;
}) {
  const total = data.annualFee + data.initiationFee;
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:3px;">${data.isRenewal ? 'Membership renewal' : 'Membership dues'}</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">${data.isRenewal ? `Time to renew, ${data.name}.` : `Complete your membership, ${data.name}.`}</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      ${data.isRenewal
        ? `Your <strong>${data.tierName}</strong> membership at <strong>${data.courseName}</strong> is coming up for renewal. Pay your dues online to keep your member rates and booking privileges.`
        : `<strong>${data.courseName}</strong> has set you up as a <strong>${data.tierName}</strong> member. Pay your dues online to activate your membership.`}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;color:#374151;">
      ${data.initiationFee > 0 ? `<tr><td style="padding:6px 0;">One-time initiation fee</td><td style="text-align:right;font-weight:700;">$${data.initiationFee.toFixed(2)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;">${data.tierName} dues</td><td style="text-align:right;font-weight:700;">$${data.annualFee.toFixed(2)}</td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;font-weight:800;color:#111827;">Total due</td><td style="text-align:right;border-top:1px solid #e5e7eb;font-weight:900;color:#111827;">$${total.toFixed(2)}</td></tr>
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
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:900;">Set your admin password</h1>
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
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:900;">Sign in to your member account</h1>
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
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're all set, ${data.name}.</h1>
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
    <h1 style="margin:16px 0 16px;color:#111827;font-size:24px;font-weight:900;">${data.title}</h1>
    <div style="margin:0 0 20px;">${bodyHtml}</div>
    <p style="margin:0;color:#9ca3af;font-size:12px;">This message is from the GreenReserve team to all course operators on the platform.</p>
  `);
  await getResend().emails.send({
    from: FROM,
    to: data.operatorEmail,
    subject: `[GreenReserve] ${data.title}`,
    html,
  });
}
