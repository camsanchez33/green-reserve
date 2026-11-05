import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { verifyOtpChallenge, otpCodeMatches, otpUsedKey } from '@/lib/golfer-otp';
import { signGolferToken } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { securityEvent } from '@/lib/security-events';

/** The 10 digits of a US/Canadian number, or null for anything else (a foreign or malformed number). */
function nanp10(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return /^1\d{10}$/.test(d) ? d.slice(1) : null;
  if (d.length === 10) return d;
  if (d.length === 11 && d[0] === '1') return d.slice(1);
  return null;
}

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
  // AUDIT-1: only a North American number links, and only to bookings whose
  // number is the SAME North American number — a foreign number that merely
  // ends in the same 10 digits never takes someone else's bookings.
  const last10 = nanp10(identifier);
  if (!last10) return;
  const candidates = await prisma.booking.findMany({
    where: { golferAccountId: null, golferPhone: { contains: last10 } },
    select: { id: true, golferPhone: true },
  });
  const matches = candidates.filter(c => nanp10(c.golferPhone) === last10);
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
    await securityEvent(req, { kind: 'rate_limited', surface: 'golfer', email: challenge.type === 'email' ? challenge.identifier : '', detail: 'sign-in code' });
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  const valid = otpCodeMatches(challenge, String(code).trim());
  if (!valid) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'golfer', email: challenge.type === 'email' ? challenge.identifier : '', detail: challenge.type === 'email' ? 'wrong emailed code' : 'wrong texted code' });
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 });
  }
  // Single use: a challenge + code seen once (a shared screen, a logged
  // request) cannot sign anyone in a second time inside its 10 minutes.
  if (!(await rateLimit(otpUsedKey(challenge.cid), 1, 600))) {
    return NextResponse.json({ error: 'That code was already used. Request a new one.' }, { status: 400 });
  }

  const isEmail = challenge.type === 'email';

  let golfer = await prisma.golferAccount.findUnique({
    where: isEmail ? { email: challenge.identifier } : { phone: challenge.identifier },
  });

  if (!golfer) {
    // Backfill a name from a prior guest booking under this identifier, if any.
    const phone10 = isEmail ? null : nanp10(challenge.identifier);
    const guestBooking = isEmail
      ? await prisma.booking.findFirst({
          where: { golferAccountId: null, golferEmail: { equals: challenge.identifier, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
          select: { golferName: true },
        })
      : phone10
        ? (await prisma.booking.findMany({
            where: { golferAccountId: null, golferPhone: { contains: phone10 } },
            orderBy: { createdAt: 'desc' },
            select: { golferName: true, golferPhone: true },
            take: 20,
          })).find(b => nanp10(b.golferPhone) === phone10) ?? null
        : null;
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
