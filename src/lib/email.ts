import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Green Reserve <onboarding@resend.dev>';

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
            Green Reserve &middot; <a href="https://green-reserve.vercel.app" style="color:#6b7280;">green-reserve.vercel.app</a>
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
    <a href="https://green-reserve.vercel.app/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:16px;">Manage My Booking &rarr;</a>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await resend.emails.send({ from: FROM, to: data.golferEmail, subject: `Confirmed: ${data.courseName} — ${data.date} at ${data.time}`, html });
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
    <a href="https://green-reserve.vercel.app/dashboard" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;margin-top:20px;">View Tee Sheet &rarr;</a>
  `);
  await resend.emails.send({ from: FROM, to: data.operatorEmail, subject: `New booking: ${data.players} player${data.players > 1 ? 's' : ''} — ${data.date} at ${data.time}`, html });
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
  await resend.emails.send({ from: FROM, to: data.golferEmail, subject: `Cancelled: ${data.courseName} — ${data.date} at ${data.time}`, html });
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
    <a href="https://green-reserve.vercel.app/courses" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">Book Now &rarr;</a>
  `);
  await resend.emails.send({ from: FROM, to: data.email, subject: `Spot available: ${data.time} at ${data.courseName}`, html });
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
    <a href="https://green-reserve.vercel.app/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">View or Cancel Booking &rarr;</a>
  `);
  await resend.emails.send({ from: FROM, to: data.golferEmail, subject: `Tomorrow: ${data.time} at ${data.courseName}`, html });
}
