import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { validatePasswordStrength } from '@/lib/password';
import { sendPasswordChangedNotification } from '@/lib/email';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const operator = await prisma.courseOperator.findUnique({ where: { resetToken: token } });
  if (!operator || !operator.resetTokenExpiry || operator.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  return NextResponse.json({ valid: true, email: operator.email });
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const operator = await prisma.courseOperator.findUnique({ where: { resetToken: token } });
  if (!operator || !operator.resetTokenExpiry || operator.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.courseOperator.update({
    where: { id: operator.id },
    data: { password: hashed, resetToken: null, resetTokenExpiry: null },
  });

  sendPasswordChangedNotification({ operatorName: operator.name, operatorEmail: operator.email })
    .catch(err => console.error('Password-changed notification failed:', err));

  return NextResponse.json({ success: true });
}
