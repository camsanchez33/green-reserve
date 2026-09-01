import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { getMemberSession, getGolferMembership } from '@/lib/member-session';

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
  const tier = membership && membership.courseId === course.id ? membership.tier : null;

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: course.id, date, status: { not: 'blocked' } },
    orderBy: { time: 'asc' },
  });

  // Strip past slots on today
  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().split('T')[0];
  const currentTimeStr = `${nowUtc.getUTCHours().toString().padStart(2, '0')}:${nowUtc.getUTCMinutes().toString().padStart(2, '0')}`;
  const visible = date === todayUtc
    ? teeTimes.filter(t => t.time > currentTimeStr)
    : teeTimes;

  const d = new Date(date + 'T12:00:00');
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

  return NextResponse.json(
    visible.map(t => {
      const spotsLeft = t.playersAvailable - t.playersBooked;
      const slotStatus =
        spotsLeft <= 1 ? 'almost_full' : spotsLeft <= 2 ? 'limited' : 'available';

      // Resolve member rate: tier flat rate > teeTime.memberRate > tier discount > standard
      let memberGreenFee: number | null = null;
      let memberCartFee: number | null = null;
      if (tier) {
        // MP-3 B2c: the B2a unit boundary is GONE — tier and TeeTime are both
        // cents now, so nothing here converts and nothing can mix units. Work
        // entirely in cents and convert once, at the response below.
        const flatGreenCents = isWeekend ? tier.greenFeeWeekendCents : tier.greenFeeWeekdayCents;
        const flatCartCents = isWeekend ? tier.cartFeeWeekendCents : tier.cartFeeWeekdayCents;
        if (flatGreenCents != null) {
          memberGreenFee = flatGreenCents;
        } else if (t.memberRateCents != null) {
          memberGreenFee = t.memberRateCents;
        } else if (tier.discountPct != null) {
          memberGreenFee = Math.round(t.greenFeeCents * (1 - tier.discountPct / 100));
        }
        if (flatCartCents != null) memberCartFee = flatCartCents;
      }

      return {
        id: t.id,
        date: t.date,
        time: t.time,
        holes: t.holes,
        players_available: spotsLeft,
        // cents at rest, dollars on the wire — the course page renders these.
        green_fee: centsToDollarsOr0(t.greenFeeCents),
        member_green_fee: centsToDollarsOr0(memberGreenFee ?? t.greenFeeCents),
        cart_fee: centsToDollarsOr0(memberCartFee ?? t.cartFeeCents),
        walking_allowed: t.walkingAllowed,
        status: slotStatus,
        has_member_rate: memberGreenFee !== null,
      };
    })
  );
}
