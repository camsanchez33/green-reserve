import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signGolferToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { email, password, firstName, lastName, phone } = await req.json();
  if (!email || !password || !firstName || !lastName)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const existing = await prisma.golferAccount.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

  const hashed = await bcrypt.hash(password, 12);
  const golfer = await prisma.golferAccount.create({
    data: { email, password: hashed, firstName, lastName, phone: phone || '' },
  });

  const token = await signGolferToken({ golferId: golfer.id, email: golfer.email });
  const res = NextResponse.json({ success: true });
  res.cookies.set('gr_golfer', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
