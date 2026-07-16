import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signAdminSetPasswordToken } from '@/lib/admin-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { sendAdminPasswordResetEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await rateLimit(`forgot-password:admin:${ip}`, 5, 900);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });

  const { email: rawEmail } = await req.json();
  if (!rawEmail) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const admin = await prisma.adminUser.findUnique({ where: { email } });

  // Always return success even if no account exists (or it's inactive) — don't
  // let this endpoint be used to check which emails have admin access.
  if (!admin || !admin.active) {
    return NextResponse.json({ success: true });
  }

  const token = await signAdminSetPasswordToken({ adminId: admin.id, email: admin.email });

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      setPasswordToken: token,
      setPasswordTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const resetLink = `${process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app'}/admin/set-password?token=${encodeURIComponent(token)}`;

  try {
    await sendAdminPasswordResetEmail({ adminName: admin.name, adminEmail: admin.email, resetLink });
  } catch (err) {
    console.error('Admin password reset email failed:', err);
    return NextResponse.json({ error: 'Could not send reset email. Try again shortly.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
