import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';
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
  await prisma.courseOperator.update({ where: { id: operator.id }, data: { password: hashed } });

  sendPasswordChangedNotification({ operatorName: operator.name, operatorEmail: operator.email })
    .catch(err => console.error('Password-changed notification failed:', err));

  return NextResponse.json({ success: true });
}
