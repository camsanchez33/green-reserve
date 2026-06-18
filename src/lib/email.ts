import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,
  auth: {
    user: 'thegreenreserve@outlook.com',
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: { ciphers: 'SSLv3' },
});

const FROM = 'Green Reserve <thegreenreserve@outlook.com>';

function baseTemplate(content: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#1b4332;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
            <span style="color:#fff;font-size:24px;font-weight:900;letter-spacing:-0.5px;">
              Green<span style="color:#6ee7b7;">Reserve</span>
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:40px;border-radius:0 0 16px 16px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 0;text-align:center;color:#9ca3af;font-size:12px;">
            Green Reserve · thegreenreserve@outlook.com<br>
            <a href="https://green-reserve.vercel.app" style="color:#6b7280;">green-reserve.vercel.app</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface BookingEmailData {
  golferName: string;
  golferEmail: string;
  courseName: string;
  courseAddress: string;
  date: string;
  time: string;
  players: number;
  holes: number;
  greenFeeTotal: number;
  cartFeeTotal: number;
  accessFeeTotal: number;
  totalAmount: number;
  bookingId: string;
  appliedRate: string;
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;">
      <span style="display:inline-block;background:#dcfce7;color:#166534;font-size:13px;font-weight:600;padding:4px 12px;border-radius:20px;">
        ✅ Booking Confirmed
      </span>
    </div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">You're on the tee sheet.</h1>
    <p style="margin:0 0 32px;color:#6b7280;font-size:15px;">Here are your booking details for ${data.courseName}.</p>

    <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:13px;">Course</span><br>
            <span style="color:#111827;font-size:15px;font-weight:600;">${data.courseName}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:13px;">Date &amp; Time</span><br>
            <span style="color:#111827;font-size:15px;font-weight:600;">${data.date} at ${data.time}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:13px;">Players</span><br>
            <span style="color:#111827;font-size:15px;font-weight:600;">${data.players} player${data.players > 1 ? 's' : ''} · ${data.holes} holes</span>
          </td>
        </tr>
        ${data.appliedRate !== 'standard' ? `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:13px;">Rate Applied</span><br>
            <span style="color:#166534;font-size:15px;font-weight:600;text-transform:capitalize;">${data.appliedRate}</span>
          </td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:13px;">Green Fee</span><br>
            <span style="color:#111827;font-size:15px;font-weight:600;">$${(data.greenFeeTotal / 100).toFixed(2)}</span>
          </td>
        </tr>
        ${data.cartFeeTotal > 0 ? `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:13px;">Cart Fee</span><br>
            <span style="color:#111827;font-size:15px;font-weight:600;">$${(data.cartFeeTotal / 100).toFixed(2)}</span>
          </td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:13px;">Service Fee</span><br>
            <span style="color:#111827;font-size:15px;font-weight:600;">$${(data.accessFeeTotal / 100).toFixed(2)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0 0;">
            <span style="color:#6b7280;font-size:13px;">Total Charged</span><br>
            <span style="color:#111827;font-size:20px;font-weight:900;">$${(data.totalAmount / 100).toFixed(2)}</span>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">📍 ${data.courseAddress}</p>
      <p style="margin:8px 0 0;color:#92400e;font-size:12px;">Please arrive 15 minutes before your tee time. Check in at the pro shop.</p>
    </div>

    <a href="https://green-reserve.vercel.app/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:16px;">
      Manage My Booking →
    </a>

    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Booking ID: ${data.bookingId}
    </p>
  `);

  await transporter.sendMail({ from: FROM, to: data.golferEmail, subject: `Confirmed: ${data.courseName} — ${data.date} at ${data.time}`, html });
}

export async function sendOperatorBookingNotification(data: BookingEmailData & { operatorEmail: string }) {
  const html = baseTemplate(`
    <h2 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:900;">New Booking 🏌️</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">A new tee time has been booked at ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;">
      <p style="margin:0 0 8px;"><strong>Golfer:</strong> ${data.golferName} (${data.golferEmail})</p>
      <p style="margin:0 0 8px;"><strong>Date:</strong> ${data.date} at ${data.time}</p>
      <p style="margin:0 0 8px;"><strong>Players:</strong> ${data.players} · ${data.holes} holes</p>
      <p style="margin:0;"><strong>Green Fee Revenue:</strong> $${(data.greenFeeTotal / 100).toFixed(2)}</p>
    </div>
    <a href="https://green-reserve.vercel.app/dashboard" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;margin-top:20px;">View Tee Sheet →</a>
  `);
  await transporter.sendMail({ from: FROM, to: data.operatorEmail, subject: `New booking: ${data.players} player${data.players > 1 ? 's' : ''} — ${data.date} at ${data.time}`, html });
}

export async function sendCancellationEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  date: string; time: string; players: number; refundAmount: number; bookingId: string;
}) {
  const html = baseTemplate(`
    <div style="margin-bottom:8px;">
      <span style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:13px;font-weight:600;padding:4px 12px;border-radius:20px;">
        Booking Cancelled
      </span>
    </div>
    <h1 style="margin:16px 0 4px;color:#111827;font-size:26px;font-weight:900;">Your booking has been cancelled.</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">${data.courseName} · ${data.date} at ${data.time} · ${data.players} player${data.players > 1 ? 's' : ''}</p>
    ${data.refundAmount > 0 ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#166534;font-size:15px;font-weight:600;">
        💰 Refund of $${(data.refundAmount / 100).toFixed(2)} has been issued to your original payment method.
      </p>
      <p style="margin:8px 0 0;color:#166534;font-size:13px;">Allow 5–10 business days to appear on your statement.</p>
    </div>` : `
    <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:14px;">This cancellation falls outside the refund window — no refund will be issued per the course's cancellation policy.</p>
    </div>`}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">Booking ID: ${data.bookingId}</p>
  `);
  await transporter.sendMail({ from: FROM, to: data.golferEmail, subject: `Cancelled: ${data.courseName} — ${data.date} at ${data.time}`, html });
}

export async function sendWaitlistNotification(data: {
  name: string; email: string; courseName: string; date: string; time: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:900;">A spot just opened up! ⛳</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
      Good news — a tee time you were waitlisted for at <strong>${data.courseName}</strong> is now available.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:18px;">${data.time}</p>
      <p style="margin:0;color:#6b7280;">${data.date} · ${data.courseName}</p>
    </div>
    <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Act fast — this spot is first come, first served.</p>
    <a href="https://green-reserve.vercel.app/courses" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">
      Book Now →
    </a>
  `);
  await transporter.sendMail({ from: FROM, to: data.email, subject: `Spot available: ${data.time} at ${data.courseName}`, html });
}

export async function sendReminderEmail(data: {
  golferName: string; golferEmail: string; courseName: string;
  courseAddress: string; date: string; time: string; players: number; holes: number; bookingId: string;
}) {
  const html = baseTemplate(`
    <h1 style="margin:0 0 4px;color:#111827;font-size:26px;font-weight:900;">⛳ Tee time tomorrow!</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Just a reminder — you're on the tee sheet at ${data.courseName}.</p>
    <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:20px;">
      <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:900;">${data.time}</p>
      <p style="margin:0 0 4px;color:#374151;font-weight:600;">${data.courseName}</p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">📍 ${data.courseAddress}</p>
      <p style="margin:0;color:#6b7280;font-size:14px;">${data.players} player${data.players > 1 ? 's' : ''} · ${data.holes} holes</p>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:20px;">
      <p style="margin:0;color:#92400e;font-size:13px;">🕐 Arrive 15 minutes early and check in at the pro shop.</p>
    </div>
    <a href="https://green-reserve.vercel.app/account" style="display:block;background:#1b4332;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px;">
      View or Cancel Booking →
    </a>
  `);
  await transporter.sendMail({ from: FROM, to: data.golferEmail, subject: `Tomorrow: ${data.time} at ${data.courseName}`, html });
}
