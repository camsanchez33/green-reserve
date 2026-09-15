import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession, signToken } from '@/lib/auth';
import { validatePasswordStrength } from '@/lib/password';
import { sendPasswordChangedNotification } from '@/lib/email';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Staff accounts (CourseStaff) are a separate login system with their own
  // password column — this endpoint is only for the operator/owner account.
  if (session.kind !== 'operator') return NextResponse.json({ error: "Staff accounts can't change passwords from here yet — ask the course owner." }, { status: 403 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const operator = await prisma.courseOperator.findUnique({ where: { id: session.operatorId } });
  if (!operator) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const matches = await bcrypt.compare(currentPassword, operator.password);
  if (!matches) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const hashed = await bcrypt.hash(newPassword, 12);
  // SD-5: every other device's session dies with the old password; this one
  // gets a fresh token with the new version so the operator is not bounced.
  const updated = await prisma.courseOperator.update({ where: { id: operator.id }, data: { password: hashed, sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });

  sendPasswordChangedNotification({ operatorName: operator.name, operatorEmail: operator.email })
    .catch(err => console.error('Password-changed notification failed:', err));

  const token = await signToken({ operatorId: operator.id, email: operator.email, sv: updated.sessionVersion });
  const res = NextResponse.json({ success: true, signedOutElsewhere: true });
  res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  return res;
}
