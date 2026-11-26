import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminSetPasswordToken } from '@/lib/admin-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendAdminPasswordResetEmail } from '@/lib/email';
import { securityEvent } from '@/lib/security-events';

// Audit 2026-11-24 M7: an unknown email answered at once while a real one waited on the email send
// (and could answer 500), so the timing and the answer said which emails are admin logins; and the
// only cap was per connection (IP). Now every request gets the same answer straight away, and the lookup, the
// link and the email happen after the response (after()), so no answer and no timing differs. Each
// email address gets at most 3 links an hour, and every request is a security event.
const PER_EMAIL = 3;
const PER_EMAIL_WINDOW_S = 3600;

const SAME_ANSWER = () => NextResponse.json({ success: true });

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await rateLimit(`forgot-password:admin:${ip}`, 5, 900);
  if (!allowed) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'admin', detail: 'forgot password' });
    return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });
  }

  const { email: rawEmail } = ((await req.json().catch(() => null)) ?? {}) as { email?: unknown };
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  const email = rawEmail.trim().toLowerCase().slice(0, 200);

  // Counted for any address, real or not, before anything is looked up.
  const emailAllowed = await rateLimit(`forgot-password:admin-email:${email}`, PER_EMAIL, PER_EMAIL_WINDOW_S);

  after(async () => {
    try {
      const admin = await prisma.adminUser.findUnique({ where: { email } });
      const usable = !!admin && admin.active;
      const surface = admin?.role === 'owner' ? 'owner' as const : 'admin' as const;
      const record = (detail: string) => securityEvent(req, { kind: emailAllowed ? 'reset_requested' : 'rate_limited', surface, email, accountId: admin?.id, detail });
      if (!emailAllowed) { await record('forgot password, too many links for this address'); return; }
      if (!usable) { await record(admin ? 'forgot password, account turned off (nothing sent)' : 'forgot password, unknown account (nothing sent)'); return; }

      const token = await signAdminSetPasswordToken({ adminId: admin.id, email: admin.email });
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { setPasswordToken: token, setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
      const resetLink = `${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/admin/set-password?token=${encodeURIComponent(token)}`;
      try {
        await sendAdminPasswordResetEmail({ adminName: admin.name, adminEmail: admin.email, resetLink });
        await record('forgot password, link sent');
      } catch (err) {
        await record('forgot password, the email did not send');
        throw err;
      }
    } catch (err) {
      // Never the address typed: the error's name only (a message can quote the query's values).
      console.error(JSON.stringify({ ev: 'admin.forgot_password.fail', error: err instanceof Error ? err.name : 'unknown' }));
    }
  });

  return SAME_ANSWER();
}
