import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMemberSession } from '@/lib/member-session';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;
  const session = await getMemberSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { slug: courseSlug } });
  if (!course || course.id !== session.courseId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.courseMembership.findUnique({
    where: { id: session.membershipId },
    include: { tier: true },
  });
  const tier = membership?.tier ?? null;

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
        const flatGreen = isWeekend ? tier.greenFeeWeekend : tier.greenFeeWeekday;
        const flatCart = isWeekend ? tier.cartFeeWeekend : tier.cartFeeWeekday;
        if (flatGreen != null) {
          memberGreenFee = flatGreen;
        } else if (t.memberRate != null) {
          memberGreenFee = t.memberRate;
        } else if (tier.discountPct != null) {
          memberGreenFee = Math.round(t.greenFee * (1 - tier.discountPct / 100) * 100) / 100;
        }
        if (flatCart != null) memberCartFee = flatCart;
      }

      return {
        id: t.id,
        date: t.date,
        time: t.time,
        holes: t.holes,
        players_available: spotsLeft,
        green_fee: t.greenFee,
        member_green_fee: memberGreenFee ?? t.greenFee,
        cart_fee: memberCartFee ?? t.cartFee,
        walking_allowed: t.walkingAllowed,
        status: slotStatus,
        has_member_rate: memberGreenFee !== null,
      };
    })
  );
}
