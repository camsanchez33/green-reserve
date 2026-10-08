import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';
import { getGolferSession } from '@/lib/auth';
import { canManageBooking } from '@/lib/manage-access';
import { moveBooking } from '@/lib/move-booking';

// The golfer's own "change my time". ACT-1: the move itself — claim, release,
// price, event — is lib/move-booking.ts, shared with staff moves. The golfer
// chose the new time, so it is priced at the new slot (a member keeps their
// tier rate; the booking fee keeps its per-player amount), and the new price
// re-stamps terms consent.
const STATUS: Record<string, number> = { NO_SHOW: 409, NOT_FOUND: 404, WRONG_COURSE: 400, SAME: 409, NOT_CONFIRMED: 409, CHECKED_IN: 409, SLOT_GONE: 409, BLOCKED: 409, PAST: 409, FULL: 409, CONFLICT: 409 };
const COPY: Record<string, string> = {
  NO_SHOW: 'This booking cannot be modified', NOT_FOUND: 'Invalid link', NOT_CONFIRMED: 'This booking cannot be modified', CHECKED_IN: 'This booking cannot be modified',
  SAME: 'That is your current tee time', SLOT_GONE: 'That tee time is no longer available', BLOCKED: 'That tee time is no longer available',
  PAST: 'That tee time is no longer available', FULL: 'That tee time just filled up. Please pick another.',
  WRONG_COURSE: 'Tee time belongs to a different course', CONFLICT: 'Conflict — that slot was just taken. Please try another.',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const golferSession = await getGolferSession();
  const ip = clientIp(req);
  const ok = await rateLimit('manage:swap:' + ip, 10, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json() as { token?: string; newTeeTimeId?: string; termsAccepted?: boolean };
  const { token, newTeeTimeId, termsAccepted } = body;

  if (!newTeeTimeId || (!golferSession && !token)) {
    return NextResponse.json({ error: 'Missing token or newTeeTimeId' }, { status: 400 });
  }
  if (termsAccepted !== true) {
    return NextResponse.json({ error: 'You must agree to the Terms of Service to change this booking.' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { checkInToken: true, golferAccountId: true, courseId: true } });
  if (!booking || !canManageBooking(booking, golferSession?.golferId, token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  try {
    const r = await moveBooking({
      bookingId, newTeeTimeId, courseId: booking.courseId, pricing: 'new_slot',
      actor: { type: 'golfer', id: golferSession?.golferId ?? null }, terms: { version: CURRENT_TERMS_VERSION },
    });
    if (!r.ok) return NextResponse.json({ error: COPY[r.code] ?? r.message }, { status: STATUS[r.code] ?? 409 });
    return NextResponse.json({
      newTeeTimeId: r.to.teeTimeId, date: r.to.date, time: r.to.time, holes: r.to.holes, players: r.players,
      ...r.totals,
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'manage.swap.fail', bookingId, error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
