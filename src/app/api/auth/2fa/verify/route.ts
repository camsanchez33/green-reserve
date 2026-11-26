import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, verifyToken } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { securityEvent } from '@/lib/security-events';
import { readStoredCode } from '@/lib/two-factor';
import { claimSecondFactorAttempt, spendSecondFactorIfOut, useSecondFactorCode } from '@/lib/login-guard';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await rateLimit(`2fa:op:${ip}`, 10, 300);
  if (!allowed) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'course', detail: 'sign-in code' });
    return NextResponse.json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 });
  }

  const pendingToken = req.cookies.get('gr_2fa_pending')?.value;
  if (!pendingToken) return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });

  const payload = await verifyToken(pendingToken);
  if (!payload || payload.type !== 'pending_2fa') {
    return NextResponse.json({ error: 'No pending login. Please sign in again.' }, { status: 401 });
  }
  const { operatorId } = payload as { operatorId: string };

  const { code } = ((await req.json().catch(() => null)) ?? {}) as { code?: unknown };
  if (typeof code !== 'string' || !code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const operator = await prisma.courseOperator.findUnique({ where: { id: operatorId } });
  if (!operator || !operator.twoFactorCode || !operator.twoFactorCodeExpiry || operator.twoFactorCodeExpiry < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
  }

  // Audit 2026-11-24 M8: the try is claimed before the compare, against this exact code (lib/login-guard).
  const storedCode = operator.twoFactorCode;
  if (!(await claimSecondFactorAttempt('operator', operator.id, storedCode))) {
    // No tries left, or the code changed under us (a new one was just sent).
    const out = await spendSecondFactorIfOut('operator', operator.id);
    await securityEvent(req, { kind: 'second_factor_failed', surface: 'course', email: operator.email, accountId: operator.id, detail: out ? 'sign-in code, no tries left' : 'sign-in code no longer current' });
    return NextResponse.json({ error: out ? 'Too many incorrect attempts. Please sign in again to get a new code.' : 'Invalid or expired code.' }, { status: 400 });
  }

  const stored = readStoredCode(storedCode);
  const valid = await bcrypt.compare(code, stored.hash);
  if (!valid) {
    const clearCode = await spendSecondFactorIfOut('operator', operator.id, { storedCode });
    // Logged after the attempt counter moves, never before it (security audit).
    await securityEvent(req, { kind: 'second_factor_failed', surface: 'course', email: operator.email, accountId: operator.id, detail: 'sign-in code' });
    return NextResponse.json({ error: clearCode ? 'Too many incorrect attempts. Please sign in again to get a new code.' : 'Invalid or expired code.' }, { status: 400 });
  }

  const confirmsEmail = stored.channel === 'email' && !operator.emailVerified;
  // MP-3: stamp the login here, not at the password step — an operator who
  // never completes 2FA has not logged in. This is the column A-07's
  // "operator last login" health signal needed; it rendered "—" for every
  // course because CourseOperator had no such field until now.
  // Used up once: a second request with the same code, sent at the same moment, finds it gone.
  const used = await useSecondFactorCode('operator', operator.id, storedCode, {
    twoFactorCode: null, twoFactorCodeExpiry: null, lastLoginAt: new Date(),
    // A right code that went by email proves the inbox, so no "confirm your email" link after it.
    // A texted code does not — that owner still confirms by link.
    ...(confirmsEmail ? { emailVerified: true, verificationToken: null, onboardingStep: Math.max(operator.onboardingStep, 1) } : {}),
  });
  if (!used) {
    await securityEvent(req, { kind: 'second_factor_failed', surface: 'course', email: operator.email, accountId: operator.id, detail: 'sign-in code, already used' });
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
  }

  await securityEvent(req, { kind: 'signin_ok', surface: 'course', email: operator.email, accountId: operator.id, detail: confirmsEmail ? 'owner, email confirmed by sign-in code' : 'owner' });
  const token = await signToken({ operatorId: operator.id, email: operator.email, sv: operator.sessionVersion });
  let redirect = '/dashboard';
  if (!operator.emailVerified && !confirmsEmail) redirect = '/dashboard/verify';
  else if (operator.onboardingStep < 3) redirect = '/dashboard/onboarding';

  const res = NextResponse.json({ success: true, redirect });
  res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  res.cookies.set('gr_2fa_pending', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' });
  return res;
}
