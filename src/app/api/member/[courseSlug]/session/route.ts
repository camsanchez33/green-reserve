import { windowFor } from '@/lib/booking-window';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollars, centsToDollarsOr0 } from '@/lib/money';
import { getMemberSession } from '@/lib/member-session';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, memberAdvanceDays: true, publicAdvanceDays: true },
  });
  if (!course) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Cam 2026-11-18: only this course's member sign-in (gr_member) recognises a member; there are no golfer accounts.
  const session = await getMemberSession();
  if (!session || course.id !== session.courseId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const membershipId = session.membershipId;
  const fallbackEmail: string | null = session.email;

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
    source: 'member',
    // BOOKING WINDOWS: how far ahead this member can book (tier, else course default).
    // Memberships item 3: a membership on "the public window" books as far ahead as the public (lib/booking-window).
    windowDays: windowFor(course, { tier: membership.tier }).days,
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
          initiationFee: membership.initiationWaived ? 0 : centsToDollarsOr0(membership.tier.initiationFeeCents),
        }
      : null,
  });
}
