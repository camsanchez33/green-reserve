import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, verifyToken } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';

const MAX_2FA_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await rateLimit(`2fa:op:${ip}`, 10, 300);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });

  const pendingToken = req.cookies.get('gr_2fa_pending')?.value;
  if (!pendingToken) return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });

  const payload = await verifyToken(pendingToken);
  if (!payload || payload.type !== 'pending_2fa') {
    return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });
  }
  const { operatorId } = payload as { operatorId: string };

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const operator = await prisma.courseOperator.findUnique({ where: { id: operatorId } });
  if (!operator || !operator.twoFactorCode || !operator.twoFactorCodeExpiry || operator.twoFactorCodeExpiry < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
  }

  if (operator.twoFactorAttempts >= MAX_2FA_ATTEMPTS) {
    await prisma.courseOperator.update({ where: { id: operator.id }, data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0 } });
    return NextResponse.json({ error: 'Too many incorrect attempts. Please sign in again to get a new code.' }, { status: 400 });
  }

  const valid = await bcrypt.compare(String(code), operator.twoFactorCode);
  if (!valid) {
    const attempts = operator.twoFactorAttempts + 1;
    const clearCode = attempts >= MAX_2FA_ATTEMPTS;
    await prisma.courseOperator.update({
      where: { id: operator.id },
      data: {
        twoFactorAttempts: clearCode ? 0 : attempts,
        ...(clearCode ? { twoFactorCode: null, twoFactorCodeExpiry: null } : {}),
      },
    });
    return NextResponse.json({ error: clearCode ? 'Too many incorrect attempts. Please sign in again to get a new code.' : 'Invalid or expired code.' }, { status: 400 });
  }

  await prisma.courseOperator.update({ where: { id: operator.id }, data: { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0 } });

  const token = await signToken({ operatorId: operator.id, email: operator.email });
  let redirect = '/dashboard';
  if (!operator.emailVerified) redirect = '/dashboard/verify';
  else if (operator.onboardingStep < 3) redirect = '/dashboard/onboarding';

  const res = NextResponse.json({ success: true, redirect });
  res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  res.cookies.set('gr_2fa_pending', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' });
  return res;
}
