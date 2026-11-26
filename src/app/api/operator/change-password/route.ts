import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { liveOperatorSession } from '@/lib/session';
import { securityEvent } from '@/lib/security-events';
import { changePasswordTryAllowed, CHANGE_PASSWORD_LIMITED } from '@/lib/password-change-guard';
import { validatePasswordStrength } from '@/lib/password';
import { sendPasswordChangedNotification } from '@/lib/email';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  // Audit 2026-11-24 M4: a cookie killed by a password reset no longer reaches this door. It did, and a
  // right guess here minted a fresh, live cookie with no second factor.
  const session = await liveOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Staff accounts (CourseStaff) are a separate login system with their own
  // password column — this endpoint is only for the operator/owner account.
  if (session.kind !== 'operator') return NextResponse.json({ error: "Staff accounts can't change passwords from here yet — ask the course owner." }, { status: 403 });

  const { currentPassword, newPassword } = ((await req.json().catch(() => null)) ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const operator = await prisma.courseOperator.findUnique({ where: { id: session.operatorId } });
  if (!operator) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // M4: counted before the compare, so the current password can't be guessed without limit.
  if (!(await changePasswordTryAllowed('operator', operator.id))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'course', email: operator.email, accountId: operator.id, detail: 'change password' });
    return NextResponse.json({ error: CHANGE_PASSWORD_LIMITED }, { status: 429 });
  }
  const matches = await bcrypt.compare(currentPassword, operator.password);
  if (!matches) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'course', email: operator.email, accountId: operator.id, detail: 'change password, wrong current password' });
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const hashed = await bcrypt.hash(newPassword, 12);
  // SD-5: every other device's session dies with the old password; this one
  // gets a fresh token with the new version so the operator is not bounced.
  const updated = await prisma.courseOperator.update({ where: { id: operator.id }, data: { password: hashed, sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });

  await securityEvent(req, { kind: 'password_changed', surface: 'course', email: operator.email, accountId: operator.id, detail: 'changed in Settings' });
  after(sendPasswordChangedNotification({ operatorName: operator.name, operatorEmail: operator.email })
    .catch(err => console.error('Password-changed notification failed:', err)));

  const token = await signToken({ operatorId: operator.id, email: operator.email, sv: updated.sessionVersion });
  const res = NextResponse.json({ success: true, signedOutElsewhere: true });
  res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  return res;
}
