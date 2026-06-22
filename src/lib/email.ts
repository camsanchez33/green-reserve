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
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:#1b4332;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
            <span style="color:#fff;font-size:24px;font-weight:900;letter-spacing:-0.5px;">Green<span style="color:#6ee7b7;">Reserve</span></span>
          </td>
        </tr>
        <tr><td style="background:#fff;padding:40px;border-radius:0 0 16px 16px;">${content}</td></tr>
        <tr>
          <td style="padding:24px 0;text-align:center;color:#9ca3af;font-size:12px;">
            Green Reserve &middot; <a href="https://greenreserve.app" style="color:#6b7280;">greenreserve.app</a>
          </td>
        </tr>
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
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 12px;border-radius:20px;">&#10003; Booking Confirmed</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're on the tee sheet.</h1>
    <p style="margin:0 0 32px;color:#6b7280;font-size:15px;">Here are your booking details for ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Course</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.courseName}</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Date &amp; Time</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.date} at ${data.time}</span></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Players</span><br><span style="color:#111827;font-size:15px;font-weight:600;">${data.players} player${data.players > 1 ? 's' : ''} &middot; ${data.holes} holes</span></td></tr>
        ${data.appliedRate !== 'standard' ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Rate</span><br><span style="color:#166534;font-size:15px;font-weight:600;text-transform:capitalize;">${data.appliedRate}</span></td></tr>` : ''}
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Green Fee</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</span></td></tr>
        ${data.cartFeeTotal > 0 ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Cart Fee</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</span></td></tr>` : ''}
        <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="color:#6b7280;font-size:13px;">Service Fee</span><br><span style="color:#111827;font-size:15px;font-weight:600;">$${(data.accessFeeTotal / 100).toFixed(2)}</span></td></tr>
        <tr><td style="padding:12px 0 0;"><span style="color:#6b7280;font-size:13px;">Total Charged</span><br><span style="color:#111827;font-size:20px;font-weight:900;">$${(data.totalAmount / 100).toFixed(2)}</span></td></tr>
      </table>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">&#128205; ${data.courseAddress}</p>
      <p style="margin:8px 0 0;color:#92400e;font-size:12px;">Arrive 15 minutes early and check in at the pro shop.</p>
    </div>
    <a href="https://greenreserve.app/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:16px;">Manage My Booking &rarr;</a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Confirmed: ${data.courseName} — ${data.date} at ${data.time}`, html });
}

export async function sendOperatorBookingNotification(data: BookingEmailData & { operatorEmail: string }) {
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:900;">New Booking &#127949;</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">A tee time has been booked at ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;">
      <p style="margin:0 0 8px;"><strong>Golfer:</strong> ${data.golferName} (${data.golferEmail})</p>
      <p style="margin:0 0 8px;"><strong>Date:</strong> ${data.date} at ${data.time}</p>
      <p style="margin:0 0 8px;"><strong>Players:</strong> ${data.players} &middot; ${data.holes} holes</p>
      <p style="margin:0;"><strong>Green Fee Revenue:</strong> $${(data.greenFeeTotal / 100).toFixed(2)}</p>
    </div>
    <a href="https://greenreserve.app/dashboard" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;margin-top:20px;">View Tee Sheet &rarr;</a>
  `);
  await getResend().emails.send({ from: FROM, to: data.operatorEmail, subject: `New booking: ${data.players} player${data.players > 1 ? 's' : ''} — ${data.date} at ${data.time}`, html });
}

export async function sendCancellationEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; players: number; refundAmount: number; bookingId: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:600;padding:4px 12px;border-radius:20px;">Booking Cancelled</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">Your booking has been cancelled.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">${data.courseName} &middot; ${data.date} at ${data.time} &middot; ${data.players} player${data.players > 1 ? 's' : ''}</p>
    ${data.refundAmount > 0
      ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#166534;font-size:15px;font-weight:600;">&#128176; Refund of $${(data.refundAmount / 100).toFixed(2)} issued to your original payment method.</p><p style="margin:8px 0 0;color:#166534;font-size:13px;">Allow 5&ndash;10 business days.</p></div>`
      : `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:24px;"><p style="margin:0;color:#92400e;font-size:14px;">Outside the refund window &mdash; no refund per the course&rsquo;s cancellation policy.</p></div>`
    }
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await getResend().emails.send({ from: FROM, to: data.golferEmail, subject: `Cancelled: ${data.courseName} — ${data.date} at ${data.time}`, html });
}

export async function sendWaitlistNotification(data: {
  name: string; email: string; courseName: string; date: string; time: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:900;">A spot just opened up! &#9971;</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Good news &mdash; a tee time you were waitlisted for at <strong>${data.courseName}</strong> is now available.</p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:18px;">${data.time}</p>
      <p style="margin:0;color:#6b7280;">${data.date} &middot; ${data.courseName}</p>
    </div>
    <a href="https://greenreserve.app/courses" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">Book Now &rarr;</a>
  `);
  await getResend().emails.send({ from: FROM, to: data.email, subject: `Spot available: ${data.time} at ${data.courseName}`, html });
}

export async function sendReminderEmail(data: {
  golferName: string; golferEmail: string; courseName: string; courseAddress: string;
  date: string; time: string; players: number; holes: number; bookingId: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:26px;font-weight:900;">&#9971; Tee time tomorrow!</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">You&rsquo;re on the tee sheet at ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:20px;">
      <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:900;">${data.time}</p>
      <p style="margin:0 0 4px;color:#374151;font-weight:600;">${data.courseName}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">&#128205; ${data.courseAddress}</p>
      <p style="margin:0;color:#6b7280;font-size:14px;">${data.players} player${data.players > 1 ? 's' : ''} &middot; ${data.holes} holes</p>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:13px;">&#128336; Arrive 15 minutes early and check in at the pro shop.</p>
    </div>
    <a href="https://greenreserve.app/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">View or Cancel Booking &rarr;</a>
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
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;">✓ You're approved</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">Welcome to GreenReserve, ${data.operatorName}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      <strong>${data.courseName}</strong> has been approved and your dashboard is ready to set up.
      It takes about 5 minutes to go live.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px;">
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

    <a href="${data.setupLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:800;font-size:16px;margin-bottom:16px;">
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
    <a href="${data.resetLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:800;font-size:16px;margin-bottom:16px;">
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

export async function sendMemberInviteEmail(data: {
  name: string; email: string; courseName: string; tierName: string; setupLink: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;">⛳ You've been added as a member</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">Welcome, ${data.name}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      <strong>${data.courseName}</strong> has added you as a <strong>${data.tierName}</strong> member on GreenReserve.
      Set up your account to start booking your member rate online.
    </p>
    <a href="${data.setupLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:800;font-size:16px;margin-bottom:16px;">
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
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;">⛳ Membership added</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:900;">You're now a member at ${data.courseName}.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      You've been added as a <strong>${data.tierName}</strong> member. Your member rate will automatically apply
      next time you book a tee time there — just log in with this email.
    </p>
    <a href="${process.env.NEXT_PUBLIC_URL}/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">
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
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">${data.courseName}</p>
      <p style="margin:0 0 4px;color:#6b7280;font-size:14px;">${data.city}, ${data.state} · ${data.courseType}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Current booking: ${data.currentBookingMethod}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Contact:</strong> ${data.contactName} — ${data.contactTitle}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Email:</strong> ${data.email}</p>
      <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Phone:</strong> ${data.phone}</p>
      ${data.greenFeeRange ? `<p style="margin:8px 0 0;color:#374151;font-size:14px;"><strong>Fee range:</strong> ${data.greenFeeRange}</p>` : ''}
      ${data.additionalNotes ? `<p style="margin:8px 0 0;color:#374151;font-size:14px;"><strong>Notes:</strong> ${data.additionalNotes}</p>` : ''}
    </div>
    <a href="${process.env.NEXT_PUBLIC_URL}/admin" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">
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
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;">⛳ Next step</span></div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:24px;font-weight:900;">Let's get ${data.courseName} set up.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Hi ${data.contactName} — thanks for your interest in GreenReserve. We just need a few more details
      about your pricing, policies, and facilities so we can build your booking page correctly the first time.
      Takes about 5 minutes.
    </p>
    <a href="${data.detailsLink}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:800;font-size:16px;margin-bottom:16px;">
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
    <a href="${process.env.NEXT_PUBLIC_URL}/admin" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">
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
    <div style="margin-bottom:8px;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;">✓ You're live</span></div>
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

    <a href="${dashboardUrl}" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:800;font-size:16px;margin-bottom:20px;">
      Go to My Dashboard &rarr;
    </a>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:8px;">
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
