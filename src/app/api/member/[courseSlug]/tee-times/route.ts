import { NextRequest, NextResponse } from 'next/server';
import { todayIn, clockIn } from '@/lib/course-time';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { getMemberSession, getGolferMembership } from '@/lib/member-session';
import { windowFor, withinWindow, outsideWindowBody } from '@/lib/booking-window';
import { applyTierRates } from '@/lib/tier-rates';

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
    const golferMembership = await getGolferMembership(course.id);
    if (!golferMembership) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    membershipId = golferMembership.membershipId;
  }

  const membership = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    include: { tier: true },
  });
  // Booking applies member rates only to an active membership (api/bookings),
  // so the prices shown here do too — otherwise a lapsed member sees a member
  // rate and is charged the public one. The window still uses the tier.
  const tier = membership && membership.courseId === course.id ? membership.tier : null;
  const pricingTier = membership?.status === 'active' ? tier : null;

  // BOOKING WINDOWS: a member sees as far ahead as their tier allows (the
  // course's member default when the tier does not say).
  const win = windowFor(course, { tier });
  if (!withinWindow(date, win.days)) {
    return NextResponse.json(outsideWindowBody(win.days, win.scope, course), { status: 403 });
  }

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: course.id, date, status: { not: 'blocked' } },
    orderBy: { time: 'asc' },
    include: { product: { select: { label: true } } },
  });

  // Strip past slots on today — on the course's clock (SD-3).
  const todayLocal = todayIn(course.timezone);
  const nowLocal = clockIn(course.timezone);
  const visible = date === todayLocal
    ? teeTimes.filter(t => t.time > nowLocal)
    : teeTimes;

  // A member pays exactly what applyTierRates says — the one function booking
  // (api/bookings), moves and check-in pricing use. This list used to carry its
  // own copy with a different order (member rate before a % off), a different
  // weekend fallback and no % off the cart, so it could show one price and
  // charge another.
  const hasTierPrice = !!pricingTier && (pricingTier.greenFeeWeekdayCents != null || pricingTier.greenFeeWeekendCents != null || pricingTier.discountPct != null);

  return NextResponse.json(
    visible.map(t => {
      const spotsLeft = t.playersAvailable - t.playersBooked;
      const slotStatus =
        spotsLeft <= 1 ? 'almost_full' : spotsLeft <= 2 ? 'limited' : 'available';
      const rates = pricingTier ? applyTierRates(t, pricingTier) : null;
      const hasMemberRate = !!pricingTier && (hasTierPrice || t.memberRateCents != null);

      return {
        id: t.id,
        date: t.date,
        time: t.time,
        holes: t.holes,
        product_id: t.productId ?? null,
        product_label: t.product?.label ?? null,
        players_available: spotsLeft,
        // cents at rest, dollars on the wire — the course page renders these.
        green_fee: centsToDollarsOr0(t.greenFeeCents),
        member_green_fee: centsToDollarsOr0(rates?.greenFeeCents ?? t.greenFeeCents),
        cart_fee: centsToDollarsOr0(rates?.cartFeeCents ?? t.cartFeeCents),
        walking_allowed: t.walkingAllowed,
        status: slotStatus,
        has_member_rate: hasMemberRate,
      };
    })
  );
}
