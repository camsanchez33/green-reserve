import { NextRequest, NextResponse } from 'next/server';
import { memberPricingOn, residentPricingOn } from '@/lib/pricing-switch';
import { prisma } from '@/lib/prisma';
import { loggedInAt, liveMembershipFor, residentOn } from '@/lib/member-session';
import { applyTierRates } from '@/lib/tier-rates';
import { dealPct } from '@/lib/last-minute';
import { pickOwnSeat } from '@/lib/two-groups';
import { demandPctFor, onlinePublicSeat } from '@/lib/demand-pricing';
import { holdingsFor, ROUND_PACKS_ON } from '@/lib/round-packs';

// What the booking page shows the signed-in golfer before they book — the same
// rules POST /api/bookings applies, so the page can't show one price and charge
// another:
//  • a live membership with a tier (this course's member sign-in, gr_member): the member's own spot at the member rate, guests at the public rate
//    unless the tier includes them (Cam 2026-10-29, lib/member-rates);
//  • otherwise RES-1: one player at the resident rate when their card is good;
//  • in both groups (TWO-GROUPS-PRICE, Cam 2026-11-24, lib/two-groups): the lower own seat after deals, the member
//    rate on a tie, never both.
// PRICE-3: and the member's own round packs here. Says nothing to anyone else.
export async function GET(req: NextRequest) {
  const teeTimeId = req.nextUrl.searchParams.get('teeTimeId') ?? '';
  if (!teeTimeId) return NextResponse.json({ residentGreenFee: null, member: null, packs: [] });
  const tt = await prisma.teeTime.findUnique({
    where: { id: teeTimeId },
    select: { courseId: true, date: true, time: true, productId: true, residentRateCents: true, greenFeeCents: true, cartFeeCents: true, memberRateCents: true, course: { select: { memberGraceDays: true, timezone: true, hasMemberPricing: true, hasResidentPricing: true, lastMinuteOn: true, lastMinuteHours: true, lastMinutePct: true, lastMinuteCounter: true, lastMinuteStack: true, id: true, demandMode: true, demandFloorPct: true, demandCeilingPct: true } } },
  });
  if (!tt) return NextResponse.json({ residentGreenFee: null, member: null, packs: [] });
  const grace = tt.course;
  // PRICE-2: inside a last-minute window the rate is priced as POST /api/bookings prices it.
  const pct = dealPct(tt.course, tt, 'online');
  // PRICE-5: never above the online public seat (the lower of the deal and the demand price).
  const pub = onlinePublicSeat(tt.greenFeeCents, pct, await demandPctFor(tt.course, tt));
  const deals = { pubSeat: pub, dealPct: pct, publicCents: tt.greenFeeCents, stack: tt.course.lastMinuteStack };
  // Cam 2026-11-18: only this course's member sign-in counts (no golfer accounts).
  const signedIn = await loggedInAt(tt.courseId);
  // PRICE-3: the signed-in member's own round packs at this course (their member email is the holder).
  const packs = ROUND_PACKS_ON && signedIn ? (await holdingsFor(tt.courseId, signedIn.email)).map(h => ({ lineId: h.lineId, name: h.name, left: h.left, coversCart: h.coversCart, guests: h.guests, expiresAt: h.expiresAt })) : [];

  let tier: { name: string; guestsPayMemberRate: boolean; greenFeeWeekdayCents: number | null; greenFeeWeekendCents: number | null; cartFeeWeekdayCents: number | null; cartFeeWeekendCents: number | null; discountPct: number | null; lineRates: unknown } | null = null;
  // Residents log in: the logged-in email's live membership here, read now (lib/member-session).
  if (signedIn) tier = (await liveMembershipFor(grace, signedIn.email))?.tier ?? null;
  // Switched off in Settings (lib/pricing-switch): no member or resident rate is shown, as none is charged.
  if (!memberPricingOn(tt.course)) tier = null;
  const rates = tier ? applyTierRates(tt, tier) : null;
  const card = tt.residentRateCents != null && residentPricingOn(tt.course) && signedIn ? await residentOn(tt.courseId, signedIn.email, tt.date) : null;
  const pick = pickOwnSeat(rates ? rates.greenFeeCents : null, card ? tt.residentRateCents : null, deals);
  if (tier && rates && pick.group === 'member' && pick.seat != null) {
    return NextResponse.json({
      residentGreenFee: null,
      member: { name: tier.name, greenFee: pick.seat / 100, cartFee: rates.cartFeeCents / 100, guestsMemberRate: tier.guestsPayMemberRate },
      packs,
    });
  }
  if (pick.group === 'resident' && pick.seat != null) return NextResponse.json({ residentGreenFee: pick.seat / 100, member: null, packs });
  return NextResponse.json({ residentGreenFee: null, member: null, packs });
}
