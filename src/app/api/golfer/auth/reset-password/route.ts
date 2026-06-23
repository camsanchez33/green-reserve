import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { validatePasswordStrength } from '@/lib/password';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const golfer = await prisma.golferAccount.findUnique({ where: { resetToken: token } });
  if (!golfer || !golfer.resetTokenExpiry || golfer.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  return NextResponse.json({ valid: true, email: golfer.email });
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const golfer = await prisma.golferAccount.findUnique({ where: { resetToken: token } });
  if (!golfer || !golfer.resetTokenExpiry || golfer.resetTokenExpiry < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.golferAccount.update({
    where: { id: golfer.id },
    data: { password: hashed, resetToken: null, resetTokenExpiry: null },
  });

  return NextResponse.json({ success: true });
}
