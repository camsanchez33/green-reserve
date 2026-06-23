import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, signStaffToken, signPendingTwoFactorToken } from '@/lib/auth';
import { sendTwoFactorCodeEmail } from '@/lib/email';
import bcrypt from 'bcryptjs';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function lockoutResponse(lockoutUntil: Date) {
  const minutes = Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000);
  return NextResponse.json({ error: `Too many attempts, try again in ${minutes} minute${minutes === 1 ? '' : 's'}` }, { status: 429 });
}

export async function POST(req: NextRequest) {
  const { email: rawEmail, password } = await req.json();
  if (!rawEmail || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  // Try operator first
  const operator = await prisma.courseOperator.findUnique({ where: { email } });
  if (operator) {
    if (operator.lockoutUntil && operator.lockoutUntil > new Date()) return lockoutResponse(operator.lockoutUntil);

    const valid = await bcrypt.compare(password, operator.password);
    if (!valid) {
      const failedLoginAttempts = operator.failedLoginAttempts + 1;
      const lockoutUntil = failedLoginAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
      await prisma.courseOperator.update({ where: { id: operator.id }, data: { failedLoginAttempts, lockoutUntil } });
      if (lockoutUntil) return lockoutResponse(lockoutUntil);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.courseOperator.update({ where: { id: operator.id }, data: { failedLoginAttempts: 0, lockoutUntil: null } });

    if (operator.twoFactorEnabled) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = await bcrypt.hash(code, 10);
      await prisma.courseOperator.update({
        where: { id: operator.id },
        data: { twoFactorCode: hashedCode, twoFactorCodeExpiry: new Date(Date.now() + 10 * 60 * 1000) },
      });

      try {
        await sendTwoFactorCodeEmail({ operatorName: operator.name, operatorEmail: operator.email, code });
      } catch (err) {
        console.error('2FA code email failed:', err);
        return NextResponse.json({ error: 'Could not send verification code. Try again shortly.' }, { status: 500 });
      }

      const pendingToken = await signPendingTwoFactorToken({ operatorId: operator.id });
      const res = NextResponse.json({ success: true, redirect: '/dashboard/2fa' });
      res.cookies.set('gr_2fa_pending', pendingToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' });
      return res;
    }

    const token = await signToken({ operatorId: operator.id, email: operator.email });
    let redirect = '/dashboard';
    if (!operator.emailVerified) redirect = '/dashboard/verify';
    else if (operator.onboardingStep < 3) redirect = '/dashboard/onboarding';

    const res = NextResponse.json({ success: true, redirect });
    res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  // Try staff account
  const staff = await prisma.courseStaff.findUnique({ where: { email } });
  if (staff) {
    if (!staff.active) return NextResponse.json({ error: 'Account disabled' }, { status: 401 });
    if (staff.lockoutUntil && staff.lockoutUntil > new Date()) return lockoutResponse(staff.lockoutUntil);

    const valid = await bcrypt.compare(password, staff.password);
    if (!valid) {
      const failedLoginAttempts = staff.failedLoginAttempts + 1;
      const lockoutUntil = failedLoginAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
      await prisma.courseStaff.update({ where: { id: staff.id }, data: { failedLoginAttempts, lockoutUntil } });
      if (lockoutUntil) return lockoutResponse(lockoutUntil);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.courseStaff.update({ where: { id: staff.id }, data: { failedLoginAttempts: 0, lockoutUntil: null } });

    const token = await signStaffToken({ staffId: staff.id, courseId: staff.courseId, email: staff.email });
    const res = NextResponse.json({ success: true, redirect: '/dashboard' });
    res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
