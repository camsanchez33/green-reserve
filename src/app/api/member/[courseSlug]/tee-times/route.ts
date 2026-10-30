import { NextRequest, NextResponse } from 'next/server';
import { dealPct, dealRateSeat } from '@/lib/last-minute';
import { demandPctAt, onlinePublicSeat, dealWins, loadDemand } from '@/lib/demand-pricing';
import { todayIn, clockIn } from '@/lib/course-time';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { getMemberSession, getGolferMembership, golferResident } from '@/lib/member-session';
import { windowFor, withinWindow, outsideWindowBody } from '@/lib/booking-window';
import { rulesFor, walkingAllowedAt } from '@/lib/booking-rules';
import { applyTierRates } from '@/lib/tier-rates';
import { membershipLive } from '@/lib/member-rates';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;

  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { slug: courseSlug } });
  if (!course) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await getMemberSession();
  let membershipId: string;
  if (session) {
    if (course.id !== session.courseId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    membershipId = session.membershipId;
  } else {
    const golferMembership = await getGolferMembership(course.id, course);
    if (!golferMembership) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    membershipId = golferMembership.membershipId;
  }

  const membership = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    include: { tier: true },
  });
  // Booking applies member rates and the member window only to an active
  // membership (api/bookings), so this list does too — otherwise a lapsed
  // member sees a member rate and is charged the public one.
  // Lapsed (past its end date + the course's grace days, lib/member-rates): public rates and window, as booking charges.
  const tier = membership && membership.courseId === course.id ? membership.tier : null;
  const live = !!membership && membership.courseId === course.id && membershipLive(membership, course);
  const pricingTier = live ? tier : null;

  // BOOKING WINDOWS: a member sees as far ahead as their tier allows (the
  // course's member default when the tier does not say).
  const win = windowFor(course, live ? { tier } : null);
  if (!withinWindow(date, win.days, new Date(), course.timezone)) {
    return NextResponse.json(outsideWindowBody(win.days, win.scope, course), { status: 403 });
  }

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: course.id, date, status: { not: 'blocked' } },
    orderBy: { time: 'asc' },
    include: { product: { select: { label: true, walkingPolicy: true, minPlayers: true, maxPlayers: true, publicAdvanceDays: true } } },
  });

  // Strip past slots on today — on the course's clock (SD-3).
  const todayLocal = todayIn(course.timezone);
  const nowLocal = clockIn(course.timezone);
  const visible = (date === todayLocal
    ? teeTimes.filter(t => t.time > nowLocal)
    : teeTimes)
    // W2-6 slice 3: a round's shorter public window holds for a non-member here too.
    .filter(t => win.scope === 'member' || withinWindow(date, rulesFor(course, t.product).publicAdvanceDays, new Date(), course.timezone));

  // A member pays exactly what applyTierRates says — the one function booking
  // (api/bookings), moves and check-in pricing use. This list used to carry its
  // own copy with a different order (member rate before a % off), a different
  // weekend fallback and no % off the cart, so it could show one price and
  // charge another.
  // RES-1: booking charges ONE player — the signed-in golfer — the tee time's
  // resident rate when no membership price applied and their resident card is
  // good on the date (api/bookings: golferResident, groupGreenFee). Same lookup
  // here, so the list can show it; the page adds it up the same way.
  const resident = !pricingTier ? await golferResident(course.id, date) : null;

  const hasTierPrice = !!pricingTier && (pricingTier.greenFeeWeekdayCents != null || pricingTier.greenFeeWeekendCents != null || pricingTier.discountPct != null);

  const demand = await loadDemand(course);
  return NextResponse.json(
    visible.map(t => {
      // W2-6 slice 3: the time's booking rules; spots are what one booking may take.
      const rules = rulesFor(course, t.product);
      const spotsLeft = Math.min(t.playersAvailable - t.playersBooked, rules.maxPlayers);
      const open = t.playersAvailable - t.playersBooked; // how full it really is
      const slotStatus =
        open <= 1 ? 'almost_full' : open <= 2 ? 'limited' : 'available';
      const rates = pricingTier ? applyTierRates(t, pricingTier) : null;
      const hasMemberRate = !!pricingTier && (hasTierPrice || t.memberRateCents != null);
      // PRICE-2: inside a last-minute window, priced as POST /api/bookings prices it (lib/last-minute).
      // PRICE-5: the public seat is the lower of the deal and the demand price; a member never pays above it.
      const pct = dealPct(course, t, 'online');
      const dem = demandPctAt(course, demand, t);
      const pub = onlinePublicSeat(t.greenFeeCents, pct, dem);
      const rated = (c: number) => Math.min(pub, dealRateSeat(pct, c, t.greenFeeCents, course.lastMinuteStack));
      const dealShown = dealWins(t.greenFeeCents, pct, dem);

      return {
        id: t.id,
        date: t.date,
        time: t.time,
        holes: t.holes,
        product_id: t.productId ?? null,
        product_label: t.product?.label ?? null,
        players_available: spotsLeft,
        // cents at rest, dollars on the wire — the course page renders these.
        green_fee: centsToDollarsOr0(pub),
        list_green_fee: dealShown ? centsToDollarsOr0(t.greenFeeCents) : null,
        deal_pct: dealShown ? pct : 0,
        member_green_fee: centsToDollarsOr0(rates ? rated(rates.greenFeeCents) : pub),
        cart_fee: centsToDollarsOr0(rates?.cartFeeCents ?? t.cartFeeCents),
        walking_allowed: walkingAllowedAt(t),
        cart_required: !walkingAllowedAt(t),
        min_players: rules.minPlayers,
        max_players: rules.maxPlayers,
        status: slotStatus,
        has_member_rate: hasMemberRate,
        // Cam 2026-10-29: whether the rest of the group pays the member rate too (else the public green_fee).
        guests_member_rate: !!pricingTier?.guestsPayMemberRate,
        // What the signed-in golfer pays for their own spot as a resident (one
        // player); null when the resident rate doesn't apply to this time.
        resident_green_fee: resident && t.residentRateCents != null ? centsToDollarsOr0(rated(t.residentRateCents)) : null,
      };
    })
  );
}
