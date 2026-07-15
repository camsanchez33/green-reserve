import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { verifyOtpChallenge, verifyOtpCode } from '@/lib/golfer-otp';
import { signGolferToken } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// Verification is what makes guest-booking linkage safe — once an identifier
// is proven (this endpoint), any guest bookings under that same email/phone
// get attached to the account so they show up in the portal automatically.
async function linkGuestBookings(identifier: string, type: 'email' | 'phone', golferId: string) {
  if (type === 'email') {
    await prisma.booking.updateMany({
      where: { golferAccountId: null, golferEmail: { equals: identifier, mode: 'insensitive' } },
      data: { golferAccountId: golferId },
    });
    return;
  }
  // Phone numbers on guest bookings were typed free-form (not normalized at
  // booking time) — match on the last 10 digits instead of exact string.
  const last10 = identifier.replace(/\D/g, '').slice(-10);
  if (last10.length !== 10) return;
  const candidates = await prisma.booking.findMany({
    where: { golferAccountId: null, golferPhone: { contains: last10 } },
    select: { id: true, golferPhone: true },
  });
  const matches = candidates.filter(c => c.golferPhone.replace(/\D/g, '').slice(-10) === last10);
  if (matches.length > 0) {
    await prisma.booking.updateMany({ where: { id: { in: matches.map(m => m.id) } }, data: { golferAccountId: golferId } });
  }
}

export async function POST(req: NextRequest) {
  const { challengeToken, code } = await req.json().catch(() => ({}));
  if (!challengeToken || !code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const challenge = await verifyOtpChallenge(String(challengeToken));
  if (!challenge) return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 });

  const ip = clientIp(req);
  const attemptsOk = await rateLimit(`golfer-otp-verify:${challenge.identifier}`, 5, 600);
  const ipOk = await rateLimit(`golfer-otp-verify-ip:${ip}`, 20, 600);
  if (!attemptsOk || !ipOk) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  const valid = await verifyOtpCode(String(code).trim(), challenge.codeHash);
  if (!valid) return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 });

  const isEmail = challenge.type === 'email';

  let golfer = await prisma.golferAccount.findUnique({
    where: isEmail ? { email: challenge.identifier } : { phone: challenge.identifier },
  });

  if (!golfer) {
    // Backfill a name from a prior guest booking under this identifier, if any.
    const guestBooking = await prisma.booking.findFirst({
      where: isEmail
        ? { golferAccountId: null, golferEmail: { equals: challenge.identifier, mode: 'insensitive' } }
        : { golferAccountId: null, golferPhone: { contains: challenge.identifier.replace(/\D/g, '').slice(-10) } },
      orderBy: { createdAt: 'desc' },
      select: { golferName: true },
    });
    const [firstName, ...rest] = (guestBooking?.golferName || 'Golfer').trim().split(/\s+/);
    const lastName = rest.join(' ');

    // No password is ever set via OTP sign-in — a random, never-revealed hash
    // just satisfies the column; they'd go through "forgot password" to add one.
    const placeholderPassword = await bcrypt.hash(randomBytes(24).toString('hex'), 12);

    golfer = await prisma.golferAccount.create({
      data: {
        email: isEmail ? challenge.identifier : `otp-${randomBytes(8).toString('hex')}@no-email.greenreserve.app`,
        phone: isEmail ? null : challenge.identifier,
        password: placeholderPassword,
        firstName: firstName || 'Golfer',
        lastName,
      },
    });
  }

  await linkGuestBookings(challenge.identifier, challenge.type, golfer.id);

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
