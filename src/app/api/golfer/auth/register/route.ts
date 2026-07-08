import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signGolferToken } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await rateLimit(`register:golfer:${ip}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts, try again later.' }, { status: 429 });

  const { email: rawEmail, password, firstName, lastName, phone } = await req.json();
  if (!rawEmail || !password || !firstName || !lastName)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  if (typeof password !== 'string' || password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const email = String(rawEmail).trim().toLowerCase();

  const existing = await prisma.golferAccount.findUnique({ where: { email } });
  if (existing) {
    // Generic response — don't reveal whether this email is registered
    return NextResponse.json({ error: 'Could not create account. Please check your details or try signing in.' }, { status: 409 });
  }

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
    maxAge: 60 * 60 * 24 * 90,
    path: '/',
  });
  return res;
}
