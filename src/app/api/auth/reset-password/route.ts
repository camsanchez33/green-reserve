import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { validatePasswordStrength } from '@/lib/password';
import { sendPasswordChangedNotification } from '@/lib/email';
import { verifyStaffResetToken, signToken } from '@/lib/auth';
import { securityEvent } from '@/lib/security-events';

// SD-9c: an operator's reset token is 64 hex chars stored in a column; a staff
// member's is a signed JWT (see lib/auth.ts signStaffResetToken).
const isStaffToken = (t: string) => t.split('.').length === 3;

async function staffFromToken(token: string) {
  const staffId = await verifyStaffResetToken(token, async id =>
    (await prisma.courseStaff.findUnique({ where: { id }, select: { password: true } }))?.password ?? null);
  if (!staffId) return null;
  const staff = await prisma.courseStaff.findUnique({ where: { id: staffId } });
  return staff?.active ? staff : null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  if (isStaffToken(token)) {
    const staff = await staffFromToken(token);
    if (!staff) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    return NextResponse.json({ valid: true, email: staff.email });
  }

  const operator = await prisma.courseOperator.findUnique({ where: { resetToken: token } });
  if (!operator || !operator.resetTokenExpiry || operator.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  return NextResponse.json({ valid: true, email: operator.email });
}

export async function POST(req: NextRequest) {
  const { token, password, setup } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  if (isStaffToken(token)) {
    const staff = await staffFromToken(token);
    if (!staff) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    // The new hash changes the fingerprint, which kills this link. Clearing the
    // lockout lets a staff member who locked themselves out back in at once.
    // NOT done, and cannot be without a schema change: signing out their other
    // sessions — CourseStaff has no sessionVersion (operators do).
    // RV-2: conditional on the hash the link was issued against, so two
    // simultaneous submits of one link cannot both land — the loser matches
    // zero rows and is told the link is spent.
    const { count } = await prisma.courseStaff.updateMany({
      where: { id: staff.id, password: staff.password },
      data: { password: await bcrypt.hash(password, 12), failedLoginAttempts: 0, lockoutUntil: null },
    });
    if (count === 0) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    after(sendPasswordChangedNotification({ operatorName: staff.name, operatorEmail: staff.email })
      .catch(err => console.error('Password-changed notification failed:', err)));
    return NextResponse.json({ success: true });
  }

  const operator = await prisma.courseOperator.findUnique({ where: { resetToken: token } });
  if (!operator || !operator.resetTokenExpiry || operator.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  // Cam 2026-10-27 — the "set your password" link (lib/operator-setup) lands here
  // with setup: true. Following it proves the inbox, so it also confirms the email.
  // On an owner's FIRST setup it signs them in too, when their sign-in codes go to
  // that same inbox (the link is the same factor as the emailed code); an owner who
  // gets codes by text signs in normally, so the link never skips their phone.
  const isSetup = setup === true;
  // Signs in only on a token minted as a setup link (7 days) — a forgot-password
  // token (1 hour) sent back with setup: true sets the password and nothing more.
  const setupToken = operator.resetTokenExpiry.getTime() - Date.now() > 60 * 60 * 1000;
  const signIn = isSetup && setupToken && !operator.lastLoginAt && !(operator.twoFactorMethod === 'sms' && operator.phone);
  const hashed = await bcrypt.hash(password, 12);
  // Conditional on the token still being there, so two submits of one link can't both land.
  const { count } = await prisma.courseOperator.updateMany({
    where: { id: operator.id, resetToken: token },
    // SD-5: a reset signs every existing session out.
    data: {
      password: hashed, resetToken: null, resetTokenExpiry: null, sessionVersion: { increment: 1 },
      ...(isSetup ? { emailVerified: true, verificationToken: null, onboardingStep: Math.max(operator.onboardingStep, 1) } : {}),
      ...(signIn ? { lastLoginAt: new Date(), failedLoginAttempts: 0, lockoutUntil: null } : {}),
    },
  });
  if (count === 0) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });

  // Choosing a first password is not a "your password was changed" moment.
  if (!isSetup) {
    after(sendPasswordChangedNotification({ operatorName: operator.name, operatorEmail: operator.email })
      .catch(err => console.error('Password-changed notification failed:', err)));
  }
  if (!signIn) return NextResponse.json({ success: true, signedIn: false });

  await securityEvent(req, { kind: 'signin_ok', surface: 'course', email: operator.email, accountId: operator.id, detail: 'owner, set-your-password link' });
  const session = await signToken({ operatorId: operator.id, email: operator.email, sv: operator.sessionVersion + 1 });
  const redirect = operator.onboardingStep < 3 ? '/dashboard/onboarding' : '/dashboard';
  const res = NextResponse.json({ success: true, signedIn: true, redirect });
  res.cookies.set('gr_operator', session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  return res;
}
