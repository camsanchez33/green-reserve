import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

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
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  const operator = await prisma.courseOperator.findUnique({ where: { resetToken: token } });
  if (!operator || !operator.resetTokenExpiry || operator.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.courseOperator.update({
    where: { id: operator.id },
    data: { password: hashed, resetToken: null, resetTokenExpiry: null },
  });

  return NextResponse.json({ success: true });
}
