import { NextRequest, NextResponse } from 'next/server';
import { memberPricingOn, residentPricingOn } from '@/lib/pricing-switch';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { liveMembershipWhere } from '@/lib/member-rates';
import { isDay, tierCoversDay } from '@/lib/season-pass';
import { todayIn } from '@/lib/course-time';

// Revamp 3 dead end 20 (Cam 2026-10-29): booking a walk-in or phone booking at a
// member's rate. By default the member shows their membership and staff pick them
// here (only live memberships — lib/member-rates); a course that set
// counterMemberRate 'any' also gets its memberships to pick from. Names and
// membership only — no contact details. Gated like adding the walk-in itself.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.walkin'); if (denied) return denied; }
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { counterMemberRate: true, memberGraceDays: true, timezone: true, hasMemberPricing: true, hasResidentPricing: true } });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Switched off in Settings (lib/pricing-switch): the walk-in form offers no member or resident price.
  const membersOn = memberPricingOn(course);
  const mode = course.counterMemberRate === 'any' ? 'any' : 'member';
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  const contains = { contains: q, mode: 'insensitive' as const };
  // Memberships item 4 (Cam 2026-11-16: the pass rate is keyed on the round's play date): given the tee time's date, a
  // season pass whose season covers it is offered whenever it is booked (lib/counter-pay checks the same day).
  const day = req.nextUrl.searchParams.get('date');
  const onDay = isDay(day) ? day : undefined;
  const [members, tiers] = await Promise.all([
    membersOn && q.length >= 2 ? prisma.courseMembership.findMany({
      where: { courseId: session.courseId, tierId: { not: null }, AND: [liveMembershipWhere(course, new Date(), onDay)], OR: [{ inviteName: contains }, { golfer: { OR: [{ firstName: contains }, { lastName: contains }] } }] },
      take: 8, select: { id: true, inviteName: true, tier: { select: { name: true } }, golfer: { select: { firstName: true, lastName: true } } },
    }) : Promise.resolve([]),
    membersOn && mode === 'any' ? prisma.membershipTier.findMany({ where: { courseId: session.courseId, active: true }, select: { id: true, name: true, kind: true, passStartsOn: true, passEndsOn: true }, orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
  ]);
  // A season pass is offered as a tier only for a round in its season (lib/counter-pay refuses it otherwise).
  const playDay = onDay ?? todayIn(course.timezone);
  const offered = tiers.filter(t => tierCoversDay(t, playDay)).map(t => ({ id: t.id, name: t.name }));
  return NextResponse.json({
    mode, membersOn, residentsOn: residentPricingOn(course),
    members: members.map(m => ({ id: m.id, name: (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}` : m.inviteName).trim() || 'Member', tier: m.tier?.name ?? '' })),
    tiers: offered,
  });
}
