import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signGolferToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { email: rawEmail, password } = await req.json();
  if (!rawEmail || !password)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const golfer = await prisma.golferAccount.findUnique({ where: { email } });
  if (!golfer) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const valid = await bcrypt.compare(password, golfer.password);
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const token = await signGolferToken({ golferId: golfer.id, email: golfer.email });
  const res = NextResponse.json({
    success: true,
    golfer: { id: golfer.id, firstName: golfer.firstName, lastName: golfer.lastName, email: golfer.email },
  });
  res.cookies.set('gr_golfer', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
