import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, signStaffToken, signPendingTwoFactorToken } from '@/lib/auth';
import { issueTwoFactorCode, TooManyCodesError, TOO_MANY_CODES_MESSAGE } from '@/lib/two-factor';
import bcrypt from 'bcryptjs';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { securityEvent } from '@/lib/security-events';
import { failUnknownLogin, unknownLoginLockedUntil, claimPasswordAttempt, clearPasswordAttempts, dummyPasswordCheck, LOGIN_MAX_ATTEMPTS } from '@/lib/login-guard';

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

function lockoutResponse(lockoutUntil: Date) {
  const minutes = Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000);
  return NextResponse.json({ error: `Too many attempts, try again in ${minutes} minute${minutes === 1 ? '' : 's'}` }, { status: 429 });
}

export async function POST(req: NextRequest) {
  const { email: rawEmail, password } = ((await req.json().catch(() => null)) ?? {}) as { email?: unknown; password?: unknown };
  // Strings only, before any lookup (audit 2026-11-24 M14): a number reached bcrypt for a real
  // account and threw (500) while an unknown email answered 401, which told them apart.
  if (typeof rawEmail !== 'string' || typeof password !== 'string' || !rawEmail || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
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

    // Audit 2026-11-24 M3: the try is claimed atomically before the compare (lib/login-guard).
    const claim = await claimPasswordAttempt('operator', operator.id);
    if (!claim.claimed) {
      // Locked by a try sent at the same moment: the same bcrypt work an unknown email does in that race.
      await dummyPasswordCheck(password);
      await securityEvent(req, { kind: 'signin_failed', surface: 'course', email, accountId: operator.id, detail: 'owner login, while locked out' });
      return lockoutResponse(claim.lockoutUntil);
    }
    const valid = await bcrypt.compare(password, operator.password);
    if (!valid) {
      const lockoutUntil = claim.attempts >= LOGIN_MAX_ATTEMPTS ? claim.lockoutUntil : null;
      await securityEvent(req, { kind: lockoutUntil ? 'locked_out' : 'signin_failed', surface: 'course', email, accountId: operator.id, detail: 'owner login, wrong password' });
      if (lockoutUntil) return lockoutResponse(lockoutUntil);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await clearPasswordAttempts('operator', operator.id);

    try {
      await issueTwoFactorCode(operator);
    } catch (err) {
      // Only someone with the right password reaches this, so saying so tells nobody anything.
      if (err instanceof TooManyCodesError) {
        await securityEvent(req, { kind: 'rate_limited', surface: 'course', email, accountId: operator.id, detail: 'sign-in codes per account' });
        return NextResponse.json({ error: TOO_MANY_CODES_MESSAGE }, { status: 429 });
      }
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
    if (!staff.active || staff.removedAt) return unknownLogin(req, email, password, staff.id, 'staff login turned off');
    if (staff.lockoutUntil && staff.lockoutUntil > new Date()) {
      await securityEvent(req, { kind: 'signin_failed', surface: 'course', email, accountId: staff.id, detail: 'staff login, while locked out' });
      return lockoutResponse(staff.lockoutUntil);
    }

    // Audit 2026-11-24 M3: the try is claimed atomically before the compare (lib/login-guard).
    const claim = await claimPasswordAttempt('staff', staff.id);
    if (!claim.claimed) {
      // Locked by a try sent at the same moment: the same bcrypt work an unknown email does in that race.
      await dummyPasswordCheck(password);
      await securityEvent(req, { kind: 'signin_failed', surface: 'course', email, accountId: staff.id, detail: 'staff login, while locked out' });
      return lockoutResponse(claim.lockoutUntil);
    }
    const valid = await bcrypt.compare(password, staff.password);
    if (!valid) {
      const lockoutUntil = claim.attempts >= LOGIN_MAX_ATTEMPTS ? claim.lockoutUntil : null;
      await securityEvent(req, { kind: lockoutUntil ? 'locked_out' : 'signin_failed', surface: 'course', email, accountId: staff.id, detail: 'staff login, wrong password' });
      if (lockoutUntil) return lockoutResponse(lockoutUntil);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await clearPasswordAttempts('staff', staff.id);
    await securityEvent(req, { kind: 'signin_ok', surface: 'course', email, accountId: staff.id, detail: 'staff' });

    const token = await signStaffToken({ staffId: staff.id, courseId: staff.courseId, email: staff.email, sv: staff.sessionVersion });
    const res = NextResponse.json({ success: true, redirect: '/dashboard' });
    res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  return unknownLogin(req, email, password, undefined, 'unknown account');
}
