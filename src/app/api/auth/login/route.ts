import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, signStaffToken, signPendingTwoFactorToken } from '@/lib/auth';
import { issueTwoFactorCode } from '@/lib/two-factor';
import bcrypt from 'bcryptjs';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { securityEvent } from '@/lib/security-events';
import { failUnknownLogin, unknownLoginLockedUntil } from '@/lib/login-guard';

// SEC-3 audit: an email with no usable login (none, or a staff login turned
// off) answers, takes as long and locks exactly like a real one — so nothing
// here says which emails have a course login (lib/login-guard).
async function unknownLogin(req: NextRequest, email: string, password: string, accountId: string | undefined, detail: string) {
  const locked = await unknownLoginLockedUntil('course', email);
  if (locked) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'course', email, accountId, detail: `${detail}, while locked out` });
    return lockoutResponse(locked);
  }
  const lock = await failUnknownLogin('course', email, password);
  await securityEvent(req, { kind: lock ? 'locked_out' : 'signin_failed', surface: 'course', email, accountId, detail });
  if (lock) return lockoutResponse(lock);
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}

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

  // Per-IP limit (credential stuffing) — per-account lockout below handles
  // targeted attacks on a single account.
  const ipAllowed = await rateLimit(`login:op:${clientIp(req)}`, 20, 600);
  if (!ipAllowed) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'course', detail: 'sign-in' });
    return NextResponse.json({ error: 'Too many attempts from your network, try again in a few minutes' }, { status: 429 });
  }

  // Try operator first
  const operator = await prisma.courseOperator.findUnique({ where: { email } });
  if (operator) {
    if (operator.lockoutUntil && operator.lockoutUntil > new Date()) {
      await securityEvent(req, { kind: 'signin_failed', surface: 'course', email, accountId: operator.id, detail: 'owner login, while locked out' });
      return lockoutResponse(operator.lockoutUntil);
    }

    const valid = await bcrypt.compare(password, operator.password);
    if (!valid) {
      const failedLoginAttempts = operator.failedLoginAttempts + 1;
      const lockoutUntil = failedLoginAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
      await prisma.courseOperator.update({ where: { id: operator.id }, data: { failedLoginAttempts, lockoutUntil } });
      await securityEvent(req, { kind: lockoutUntil ? 'locked_out' : 'signin_failed', surface: 'course', email, accountId: operator.id, detail: 'owner login, wrong password' });
      if (lockoutUntil) return lockoutResponse(lockoutUntil);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.courseOperator.update({ where: { id: operator.id }, data: { failedLoginAttempts: 0, lockoutUntil: null } });

    try {
      await issueTwoFactorCode(operator);
    } catch (err) {
      // Both SMS and email failed — extremely rare. Log and let them in via
      // the resend buttons on the 2FA page rather than blocking login entirely.
      console.error('2FA: both SMS and email delivery failed:', err);
    }

    const pendingToken = await signPendingTwoFactorToken({ operatorId: operator.id });
    const res = NextResponse.json({ success: true, redirect: '/dashboard/2fa' });
    res.cookies.set('gr_2fa_pending', pendingToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' });
    return res;
  }

  // Try staff account
  const staff = await prisma.courseStaff.findUnique({ where: { email } });
  if (staff) {
    if (!staff.active) return unknownLogin(req, email, password, staff.id, 'staff login turned off');
    if (staff.lockoutUntil && staff.lockoutUntil > new Date()) {
      await securityEvent(req, { kind: 'signin_failed', surface: 'course', email, accountId: staff.id, detail: 'staff login, while locked out' });
      return lockoutResponse(staff.lockoutUntil);
    }

    const valid = await bcrypt.compare(password, staff.password);
    if (!valid) {
      const failedLoginAttempts = staff.failedLoginAttempts + 1;
      const lockoutUntil = failedLoginAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
      await prisma.courseStaff.update({ where: { id: staff.id }, data: { failedLoginAttempts, lockoutUntil } });
      await securityEvent(req, { kind: lockoutUntil ? 'locked_out' : 'signin_failed', surface: 'course', email, accountId: staff.id, detail: 'staff login, wrong password' });
      if (lockoutUntil) return lockoutResponse(lockoutUntil);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.courseStaff.update({ where: { id: staff.id }, data: { failedLoginAttempts: 0, lockoutUntil: null } });
    await securityEvent(req, { kind: 'signin_ok', surface: 'course', email, accountId: staff.id, detail: 'staff' });

    const token = await signStaffToken({ staffId: staff.id, courseId: staff.courseId, email: staff.email });
    const res = NextResponse.json({ success: true, redirect: '/dashboard' });
    res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  return unknownLogin(req, email, password, undefined, 'unknown account');
}
