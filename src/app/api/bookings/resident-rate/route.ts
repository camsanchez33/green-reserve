import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferMembership, getMemberSession, golferResident } from '@/lib/member-session';

// RES-1: what the booking page shows a signed-in resident before they book —
// the same rule POST /api/bookings applies (one player at the resident rate,
// never on top of a member rate). Says nothing to anyone else.
export async function GET(req: NextRequest) {
  const teeTimeId = req.nextUrl.searchParams.get('teeTimeId') ?? '';
  const none = NextResponse.json({ residentGreenFee: null });
  if (!teeTimeId) return none;
  const tt = await prisma.teeTime.findUnique({ where: { id: teeTimeId }, select: { courseId: true, date: true, residentRateCents: true } });
  if (!tt || tt.residentRateCents == null) return none;
  const membership = await getGolferMembership(tt.courseId);
  if (membership) {
    const m = await prisma.courseMembership.findUnique({ where: { id: membership.membershipId }, select: { tierId: true } });
    if (m?.tierId) return none; // the member rate applies instead
  }
  // The member sign-in cookie wins at booking too (POST /api/bookings).
  const memberSession = await getMemberSession();
  if (memberSession && memberSession.courseId === tt.courseId) {
    const m = await prisma.courseMembership.findUnique({ where: { id: memberSession.membershipId }, select: { tierId: true, status: true } });
    if (m?.tierId && m.status === 'active') return none;
  }
  if (!(await golferResident(tt.courseId, tt.date))) return none;
  return NextResponse.json({ residentGreenFee: tt.residentRateCents / 100 });
}
