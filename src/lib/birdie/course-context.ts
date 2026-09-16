// BIRDIE_AI_SPEC B1 — read-only awareness of THE OPERATOR'S OWN course.
//
// Typed server function, scoped by the session's courseId — the model never
// touches the database and never sees another tenant. B1 has no writes.
import { prisma } from '../prisma';
import { centsToDollarsOr0 } from '../money';

export type OperatorCourseContext = {
  courseName: string;
  liveStatus: string;
  timezone: string;
  cancellationHours: number;
  lateCancellationFee: number;
  checkInWindowHours: number;
  walkingAllowed: string;
  publicAdvanceDays: number;
  memberAdvanceDays: number;
  hasMemberPricing: boolean;
  hasResidentPricing: boolean;
  stripeConnected: boolean;
  schedules: { total: number; active: number; products: number };
  membershipTiers: number;
};

export async function operatorCourseContext(courseId: string): Promise<OperatorCourseContext | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      name: true, liveStatus: true, timezone: true, cancellationHours: true, lateCancellationFeeCents: true,
      checkInWindowHours: true, walkingAllowed: true, publicAdvanceDays: true, memberAdvanceDays: true,
      hasMemberPricing: true, hasResidentPricing: true, stripeAccountId: true, stripeAccountActive: true,
      _count: { select: { membershipTiers: true } },
    },
  });
  if (!course) return null;
  const [schedules, activeSchedules, products] = await Promise.all([
    prisma.teeTimeSchedule.count({ where: { courseId } }),
    prisma.teeTimeSchedule.count({ where: { courseId, active: true } }),
    prisma.courseProduct.count({ where: { courseId, active: true } }),
  ]);
  return {
    courseName: course.name,
    liveStatus: course.liveStatus,
    timezone: course.timezone,
    cancellationHours: course.cancellationHours,
    lateCancellationFee: centsToDollarsOr0(course.lateCancellationFeeCents),
    checkInWindowHours: course.checkInWindowHours,
    walkingAllowed: course.walkingAllowed,
    publicAdvanceDays: course.publicAdvanceDays,
    memberAdvanceDays: course.memberAdvanceDays,
    hasMemberPricing: course.hasMemberPricing,
    hasResidentPricing: course.hasResidentPricing,
    stripeConnected: !!course.stripeAccountId && course.stripeAccountActive,
    schedules: { total: schedules, active: activeSchedules, products },
    membershipTiers: course._count.membershipTiers,
  };
}

/** The lines the model reads. Plain facts, no PII, nothing from any other course. */
export function describeCourseContext(c: OperatorCourseContext): string {
  return [
    `Course: ${c.courseName} (status: ${c.liveStatus}; timezone ${c.timezone})`,
    `Cancellation policy: ${c.cancellationHours} hours before the tee time; late-cancellation fee $${c.lateCancellationFee}${c.lateCancellationFee === 0 ? ' (no fee — no card is collected at booking)' : ''}`,
    `Check-in window: golfers can self check in ${c.checkInWindowHours} hours before their time`,
    `Walking: ${c.walkingAllowed}`,
    `Booking windows: public ${c.publicAdvanceDays} days ahead, members ${c.memberAdvanceDays} days ahead`,
    `Member pricing: ${c.hasMemberPricing ? 'on' : 'off'}; resident pricing: ${c.hasResidentPricing ? 'on' : 'off'}; membership tiers: ${c.membershipTiers}`,
    `Stripe: ${c.stripeConnected ? 'connected' : 'NOT connected — payouts cannot start until it is'}`,
    `Schedules: ${c.schedules.total} (${c.schedules.active} running)${c.schedules.products > 0 ? `; ${c.schedules.products} bookable round(s) configured` : ''}`,
  ].join('\n');
}
