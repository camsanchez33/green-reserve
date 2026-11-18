import { windowFor } from '@/lib/booking-window';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollars, centsToDollarsOr0 } from '@/lib/money';
import { loggedInAt, activeMembershipFor, residentOn } from '@/lib/member-session';
import { membershipLive } from '@/lib/member-rates';
import { todayIn } from '@/lib/course-time';
import { residentPricingOn, memberPricingOn } from '@/lib/pricing-switch';
import { benefitsSentence, upcomingFor } from '@/lib/member-home';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, slug: true, memberAdvanceDays: true, publicAdvanceDays: true, timezone: true, memberGraceDays: true, hasResidentPricing: true, hasMemberPricing: true, minPlayers: true, maxPlayers: true },
  });
  if (!course) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Cam 2026-11-18: only this course's log-in (gr_member) recognises a golfer; there are no golfer accounts.
  // Residents log in: the session is a proven email, and its groups are read now (lib/member-session).
  const session = await loggedInAt(course.id);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const fallbackEmail: string | null = session.email;

  const [membership, resident] = await Promise.all([
    activeMembershipFor(course.id, session.email),
    residentPricingOn(course) ? residentOn(course.id, session.email, todayIn(course.timezone)) : null,
  ]);
  // In no group here any more (membership ended, card expired or removed): not logged in.
  if (!membership && !resident) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // The member window only while the membership's rates apply (lib/member-rates), as booking enforces.
  const live = !!membership && membershipLive(membership, course);

  const groups: ({ kind: 'member'; name: string; color: string | null } | { kind: 'resident'; name: 'Resident'; expiresOn: string })[] = [];
  if (membership) groups.push({ kind: 'member', name: membership.tier?.name ?? membership.membershipType, color: membership.tier?.color ?? null });
  if (resident) groups.push({ kind: 'resident', name: 'Resident', expiresOn: resident.expiresOn });

  // "Your <Course>" (Build 2026-11-18): one line of benefits and the upcoming bookings here (lib/member-home).
  const upcoming = await upcomingFor(course, session.email);
  const pricing = memberPricingOn(course);
  const benefits = benefitsSentence(live ? membership!.tier : null, live, !!resident, course, pricing);
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  if (!membership) {
    return NextResponse.json({
      source: 'member',
      windowDays: windowFor(course, null).days,
      email: fallbackEmail,
      name: resident!.name || 'Resident',
      // The current member page shows membershipType as the group name.
      membershipType: 'Resident', status: null, paymentStatus: null, startedAt: null, expiresAt: null, lastPaidAt: null,
      tier: null,
      groups,
      benefits,
      renewsOn: null, expiresOn: resident!.expiresOn || null, autoRenew: false, renewalFailed: false,
      upcoming,
    });
  }

  return NextResponse.json({
    source: 'member',
    // BOOKING WINDOWS: how far ahead this member can book (tier, else course default).
    // Memberships item 3: a membership on "the public window" books as far ahead as the public (lib/booking-window).
    windowDays: windowFor(course, live ? { tier: membership.tier } : null).days,
    email: fallbackEmail ?? membership.golfer?.email ?? membership.inviteEmail,
    name: membership.inviteName || (membership.golfer ? `${membership.golfer.firstName} ${membership.golfer.lastName}`.trim() : '') || 'Member',
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
          // Members pricing off (lib/pricing-switch): no member rate is charged, so none is sent for a page to show.
          greenFeeWeekday: pricing ? centsToDollars(membership.tier.greenFeeWeekdayCents) : null,
          greenFeeWeekend: pricing ? centsToDollars(membership.tier.greenFeeWeekendCents) : null,
          cartFeeWeekday: pricing ? centsToDollars(membership.tier.cartFeeWeekdayCents) : null,
          cartFeeWeekend: pricing ? centsToDollars(membership.tier.cartFeeWeekendCents) : null,
          discountPct: pricing ? membership.tier.discountPct : null,
          advanceBookingDays: membership.tier.advanceBookingDays,
          annualFee: centsToDollarsOr0(membership.tier.annualFeeCents),
          initiationFee: membership.initiationWaived ? 0 : centsToDollarsOr0(membership.tier.initiationFeeCents),
        }
      : null,
    groups,
    benefits,
    // The membership's last day: its UTC date, the same day lapseCutoff (lib/member-rates) treats as the last live day
    // at grace 0, and the date the renewal emails show. A client renders it as a calendar date, not a local time.
    renewsOn: membership.autoRenew ? ymd(membership.expiresAt) : null,
    expiresOn: membership.autoRenew ? null : ymd(membership.expiresAt),
    autoRenew: membership.autoRenew,
    // The last automatic renewal was declined (lib/membership-autorenew sets it, a paid term clears it). The Golfer lane
    // shows "Your renewal didn't go through" only on this flag.
    renewalFailed: membership.autoRenewFailedAt != null,
    upcoming,
  });
}
