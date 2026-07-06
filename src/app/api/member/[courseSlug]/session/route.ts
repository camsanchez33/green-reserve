import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMemberSession } from '@/lib/member-session';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;
  const session = await getMemberSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true },
  });
  if (!course || course.id !== session.courseId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.courseMembership.findUnique({
    where: { id: session.membershipId },
    include: {
      tier: true,
      golfer: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!membership || membership.status !== 'active') {
    return NextResponse.json({ error: 'Membership inactive' }, { status: 403 });
  }

  return NextResponse.json({
    email: session.email,
    name: membership.golfer
      ? `${membership.golfer.firstName} ${membership.golfer.lastName}`
      : (membership.inviteName || 'Member'),
    membershipType: membership.membershipType,
    status: membership.status,
    paymentStatus: membership.paymentStatus,
    startedAt: membership.startedAt,
    expiresAt: membership.expiresAt,
    lastPaidAt: membership.lastPaidAt,
    tier: membership.tier
      ? {
          id: membership.tier.id,
          name: membership.tier.name,
          color: membership.tier.color,
          greenFeeWeekday: membership.tier.greenFeeWeekday,
          greenFeeWeekend: membership.tier.greenFeeWeekend,
          cartFeeWeekday: membership.tier.cartFeeWeekday,
          cartFeeWeekend: membership.tier.cartFeeWeekend,
          discountPct: membership.tier.discountPct,
          advanceBookingDays: membership.tier.advanceBookingDays,
          annualFee: membership.tier.annualFee,
          initiationFee: membership.tier.initiationFee,
        }
      : null,
  });
}
