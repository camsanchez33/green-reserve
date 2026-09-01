import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollars, centsToDollarsOr0 } from '@/lib/money';
import { getMemberSession, getGolferMembership } from '@/lib/member-session';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true },
  });
  if (!course) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await getMemberSession();
  let membershipId: string;
  let fallbackEmail: string | null = null;
  let source: 'member' | 'golfer' = 'member';

  if (session) {
    if (course.id !== session.courseId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    membershipId = session.membershipId;
    fallbackEmail = session.email;
  } else {
    // G5b: no gr_member session — recognize an active membership via the
    // gr_golfer session instead (same possession proof as the magic link).
    const golferMembership = await getGolferMembership(course.id);
    if (!golferMembership) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    membershipId = golferMembership.membershipId;
    source = 'golfer';
  }

  const membership = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    include: {
      tier: true,
      golfer: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!membership || membership.status !== 'active' || membership.courseId !== course.id) {
    return NextResponse.json({ error: 'Membership inactive' }, { status: 403 });
  }

  return NextResponse.json({
    source,
    email: fallbackEmail ?? membership.golfer?.email ?? membership.inviteEmail,
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
          // MP-3 B2a: cents at rest, dollars on the wire — the course page's
          // member-pricing UI formats these as dollars and was not changed.
          greenFeeWeekday: centsToDollars(membership.tier.greenFeeWeekdayCents),
          greenFeeWeekend: centsToDollars(membership.tier.greenFeeWeekendCents),
          cartFeeWeekday: centsToDollars(membership.tier.cartFeeWeekdayCents),
          cartFeeWeekend: centsToDollars(membership.tier.cartFeeWeekendCents),
          discountPct: membership.tier.discountPct,
          advanceBookingDays: membership.tier.advanceBookingDays,
          annualFee: centsToDollarsOr0(membership.tier.annualFeeCents),
          initiationFee: centsToDollarsOr0(membership.tier.initiationFeeCents),
        }
      : null,
  });
}
