import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normCode, promoFits } from '@/lib/promo-codes';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// PRICE-1 (Cam 2026-10-30): the booking page checks a promo code before the golfer books,
// so the price shown is the price. Public, rate-limited per address (no guessing a
// course's codes). It says only whether the code fits this tee time and what it takes off
// a player's green fee; the booking itself checks again (once per golfer, member and
// resident rates, uses left) and prices it on the server.
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`promo-check:${clientIp(req)}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many tries — wait a while and try again.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { teeTimeId?: unknown; code?: unknown };
  const code = normCode(body.code);
  if (!code || typeof body.teeTimeId !== 'string') return NextResponse.json({ error: 'Enter a code.' }, { status: 400 });
  const tt = await prisma.teeTime.findUnique({ where: { id: body.teeTimeId }, select: { courseId: true, date: true, time: true } });
  if (!tt) return NextResponse.json({ error: 'Tee time not found.' }, { status: 404 });
  const row = await prisma.promoCode.findUnique({ where: { courseId_code: { courseId: tt.courseId, code } } });
  if (!row) return NextResponse.json({ error: 'That code isn’t valid here.' }, { status: 400 });
  const why = promoFits(row, tt, { rateApplied: false });
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  return NextResponse.json({ code: row.code, kind: row.kind, value: row.value, withRates: row.withRates });
}
