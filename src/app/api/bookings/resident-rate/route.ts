import { NextRequest, NextResponse } from 'next/server';
import { memberPricingOn, residentPricingOn } from '@/lib/pricing-switch';
import { prisma } from '@/lib/prisma';
import { getGolferMembership, getMemberSession, golferResident } from '@/lib/member-session';
import { applyTierRates } from '@/lib/tier-rates';
import { membershipLive } from '@/lib/member-rates';
import { dealPct, dealRateSeat } from '@/lib/last-minute';
import { demandPctFor, onlinePublicSeat } from '@/lib/demand-pricing';
import { holdingsFor } from '@/lib/round-packs';
import { getGolferSession } from '@/lib/auth';

// What the booking page shows the signed-in golfer before they book — the same
// rules POST /api/bookings applies, so the page can't show one price and charge
// another:
//  • a live membership with a tier (golfer session first, then the member sign-in
//    cookie): the member's own spot at the member rate, guests at the public rate
//    unless the tier includes them (Cam 2026-10-29, lib/member-rates);
//  • otherwise RES-1: one player at the resident rate when their card is good.
// PRICE-3: and the golfer's own round packs here. Says nothing to anyone else.
export async function GET(req: NextRequest) {
  const teeTimeId = req.nextUrl.searchParams.get('teeTimeId') ?? '';
  if (!teeTimeId) return NextResponse.json({ residentGreenFee: null, member: null, packs: [] });
  const tt = await prisma.teeTime.findUnique({
    where: { id: teeTimeId },
    select: { courseId: true, date: true, time: true, residentRateCents: true, greenFeeCents: true, cartFeeCents: true, memberRateCents: true, course: { select: { memberGraceDays: true, timezone: true, hasMemberPricing: true, hasResidentPricing: true, lastMinuteOn: true, lastMinuteHours: true, lastMinutePct: true, lastMinuteCounter: true, lastMinuteStack: true, id: true, demandMode: true, demandFloorPct: true, demandCeilingPct: true } } },
  });
  if (!tt) return NextResponse.json({ residentGreenFee: null, member: null, packs: [] });
  const grace = tt.course;
  // PRICE-2: inside a last-minute window the rate is priced as POST /api/bookings prices it.
  const pct = dealPct(tt.course, tt, 'online');
  // PRICE-5: never above the online public seat (the lower of the deal and the demand price).
  const pub = onlinePublicSeat(tt.greenFeeCents, pct, await demandPctFor(tt.course, tt));
  const rated = (cents: number) => Math.min(pub, dealRateSeat(pct, cents, tt.greenFeeCents, tt.course.lastMinuteStack));
  // PRICE-3: the signed-in golfer's own round packs at this course (their account email is the holder).
  const golfer = await getGolferSession();
  const packs = golfer?.email ? (await holdingsFor(tt.courseId, golfer.email)).map(h => ({ lineId: h.lineId, name: h.name, left: h.left, coversCart: h.coversCart, guests: h.guests, expiresAt: h.expiresAt })) : [];

  let tier: { name: string; guestsPayMemberRate: boolean; greenFeeWeekdayCents: number | null; greenFeeWeekendCents: number | null; cartFeeWeekdayCents: number | null; cartFeeWeekendCents: number | null; discountPct: number | null } | null = null;
  const golferMembership = await getGolferMembership(tt.courseId, grace);
  if (golferMembership) {
    const m = await prisma.courseMembership.findUnique({ where: { id: golferMembership.membershipId }, include: { tier: true } });
    tier = m?.tier ?? null;
  }
  if (!tier) {
    // The member sign-in cookie applies when the golfer session found no member rate (POST /api/bookings).
    const memberSession = await getMemberSession();
    if (memberSession && memberSession.courseId === tt.courseId) {
      const m = await prisma.courseMembership.findUnique({ where: { id: memberSession.membershipId }, include: { tier: true } });
      if (m && m.courseId === tt.courseId && membershipLive(m, grace)) tier = m.tier;
    }
  }
  // Switched off in Settings (lib/pricing-switch): no member or resident rate is shown, as none is charged.
  if (!memberPricingOn(tt.course)) tier = null;
  if (tier) {
    const rates = applyTierRates(tt, tier);
    return NextResponse.json({
      residentGreenFee: null,
      member: { name: tier.name, greenFee: rated(rates.greenFeeCents) / 100, cartFee: rates.cartFeeCents / 100, guestsMemberRate: tier.guestsPayMemberRate },
      packs,
    });
  }
  if (tt.residentRateCents == null || !residentPricingOn(tt.course) || !(await golferResident(tt.courseId, tt.date))) return NextResponse.json({ residentGreenFee: null, member: null, packs });
  return NextResponse.json({ residentGreenFee: rated(tt.residentRateCents) / 100, member: null, packs });
}
