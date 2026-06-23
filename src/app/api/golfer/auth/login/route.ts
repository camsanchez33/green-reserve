import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signGolferToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function lockoutResponse(lockoutUntil: Date) {
  const minutes = Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000);
  return NextResponse.json({ error: `Too many attempts, try again in ${minutes} minute${minutes === 1 ? '' : 's'}` }, { status: 429 });
}

export async function POST(req: NextRequest) {
  const { email: rawEmail, password } = await req.json();
  if (!rawEmail || !password)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const golfer = await prisma.golferAccount.findUnique({ where: { email } });
  if (!golfer) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  if (golfer.lockoutUntil && golfer.lockoutUntil > new Date()) return lockoutResponse(golfer.lockoutUntil);

  const valid = await bcrypt.compare(password, golfer.password);
  if (!valid) {
    const failedLoginAttempts = golfer.failedLoginAttempts + 1;
    const lockoutUntil = failedLoginAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.golferAccount.update({ where: { id: golfer.id }, data: { failedLoginAttempts, lockoutUntil } });
    if (lockoutUntil) return lockoutResponse(lockoutUntil);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await prisma.golferAccount.update({ where: { id: golfer.id }, data: { failedLoginAttempts: 0, lockoutUntil: null } });

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
