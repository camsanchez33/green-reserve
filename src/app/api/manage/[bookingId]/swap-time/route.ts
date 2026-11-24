import { NextRequest, NextResponse } from 'next/server';
import type { MembershipTier } from '@prisma/client';
import { memberPricingOn, residentPricingOn } from '@/lib/pricing-switch';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { termsVersionNow } from '@/lib/terms';
import { canManageBooking } from '@/lib/manage-access';
import { moveBooking } from '@/lib/move-booking';
import { residentOn, loggedInAt, liveMembershipFor } from '@/lib/member-session';

// The golfer's own "change my time". ACT-1: the move itself — claim, release,
// price, event — is lib/move-booking.ts, shared with staff moves. The golfer
// chose the new time, so it is priced at the new slot (a member keeps their
// tier rate; the booking fee keeps its per-player amount), and the new price
// re-stamps terms consent.
const STATUS: Record<string, number> = { CUTOFF: 409, OTHER_DAY: 400, NO_SHOW: 409, NOT_FOUND: 404, WRONG_COURSE: 400, SAME: 409, NOT_CONFIRMED: 409, CHECKED_IN: 409, SLOT_GONE: 409, BLOCKED: 409, PAST: 409, FULL: 409, CONFLICT: 409 };
const COPY: Record<string, string> = {
  NO_SHOW: 'This booking cannot be modified', NOT_FOUND: 'Invalid link', NOT_CONFIRMED: 'This booking cannot be modified', CHECKED_IN: 'This booking cannot be modified',
  SAME: 'That is your current tee time', SLOT_GONE: 'That tee time is no longer available', BLOCKED: 'That tee time is no longer available',
  PAST: 'That tee time is no longer available', FULL: 'That tee time just filled up. Please pick another.',
  WRONG_COURSE: 'Tee time belongs to a different course', CONFLICT: 'Conflict — that slot was just taken. Please try another.',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const ip = clientIp(req);
  const ok = await rateLimit('manage:swap:' + ip, 10, 300);
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json() as { token?: string; newTeeTimeId?: string; termsAccepted?: boolean };
  const { token, newTeeTimeId, termsAccepted } = body;

  if (!newTeeTimeId || !token) {
    return NextResponse.json({ error: 'Missing token or newTeeTimeId' }, { status: 400 });
  }
  if (termsAccepted !== true) {
    return NextResponse.json({ error: 'You must agree to the Terms of Service to change this booking.' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { checkInToken: true, golferAccountId: true, courseId: true, residentPlayers: true, golferAccount: { select: { email: true } } } });
  if (!booking || !canManageBooking(booking, token)) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  // RES-1: the resident rate follows the golfer's own swap only while a PROVEN email is still on the resident list
  // with a card good on the new date: an older booking's linked account, or (Cam 2026-11-18, no golfer accounts)
  // the golfer logged in to this course (a member or a resident), which is how an online resident booking gets the rate now. Never the
  // booking's typed golferEmail. Residents staff set at the counter are set again at the counter.
  // TWO-GROUPS-PRICE (Cam 2026-11-24, lib/two-groups): the same proven email's groups at the new time's date — a live
  // membership here and a resident card — go to the swap, which prices the golfer's own seat at the lower of the two
  // (the member rate on a tie), never both. No proven email: the booking keeps its own pricing, as before.
  let residentPlayers = 0;
  let ownSeatGroups: { memberTier: MembershipTier | null; resident: boolean } | undefined;
  const course = await prisma.course.findUnique({ where: { id: booking.courseId }, select: { id: true, timezone: true, memberGraceDays: true, hasMemberPricing: true, hasResidentPricing: true } });
  const provenEmail = booking.golferAccount?.email || (await loggedInAt(booking.courseId))?.email || '';
  if (course && provenEmail) {
    const slot = await prisma.teeTime.findUnique({ where: { id: String(newTeeTimeId) }, select: { date: true } });
    if (slot) {
      const card = residentPricingOn(course) ? await residentOn(booking.courseId, provenEmail, slot.date) : null;
      if (card && booking.residentPlayers > 0) residentPlayers = 1;
      const memberTier = memberPricingOn(course) ? (await liveMembershipFor(course, provenEmail))?.tier ?? null : null;
      ownSeatGroups = { memberTier, resident: !!card };
    }
  }

  try {
    const r = await moveBooking({
      bookingId, newTeeTimeId, courseId: booking.courseId, pricing: 'new_slot', residentPlayers, ownSeatGroups,
      actor: { type: 'golfer', id: null }, terms: { version: await termsVersionNow() },
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
