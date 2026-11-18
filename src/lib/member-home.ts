// "Your <Course>" (GOLFER-LOGIN-1, lanes/golfer.md item 6; Build 2026-11-18 session shape): what the logged-in golfer's
// own page shows — one line of benefits, and their upcoming bookings here, each opening its manage page. No statements,
// no dues. Read by GET /api/member/[courseSlug]/session for the email the log-in proved. Words only: every price itself
// comes from the booking (lib/tier-rates when it was priced).
import { prisma } from './prisma';
import { ciEquals } from './like-exact';
import { todayIn, clockIn } from './course-time';
import { withinWindow } from './booking-window';
import { rulesFor } from './booking-rules';
import { memberBenefitParts, type BenefitTier } from './member-benefits';
import { feeCoveredCents } from './booking-fees';
import type { WindowCourse } from './booking-window';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * One sentence of what the golfer's groups give here, e.g. "20% off every round and you can book 9 days out. 6 guest
 * passes a year." `tier` is the live membership's (null when there is none, or it has lapsed), `resident` whether a
 * resident card is good today. `memberPricing` is the course's Members switch (lib/pricing-switch): off, no member rate
 * is charged anywhere, so none is promised here; the window and guest passes are not prices and stay. Null when
 * nothing applies.
 */
export function benefitsSentence(tier: BenefitTier | null, member: boolean, resident: boolean, course: WindowCourse, memberPricing = true): string | null {
  if (member) {
    const priced = tier && !memberPricing ? { ...tier, discountPct: null, greenFeeWeekdayCents: null, greenFeeWeekendCents: null, lineRates: null } : tier;
    const parts = memberBenefitParts(priced, course);
    const rate = parts.find(p => !p.startsWith('book ') && !p.includes('guest pass'));
    const window = parts.find(p => p.startsWith('book '));
    const passes = parts.find(p => p.includes('guest pass'));
    const first = [rate, window ? (rate ? `you can ${window}` : `You can ${window}`) : null].filter(Boolean).join(' and ');
    const out = [first ? first[0].toUpperCase() + first.slice(1) + '.' : '', passes ? passes[0].toUpperCase() + passes.slice(1) + '.' : ''].filter(Boolean).join(' ');
    if (out) return out;
  }
  if (resident) return 'The resident rate on your own round.';
  return null;
}

/** The confirmation email's own wording for what is left to pay (lib/email sendBookingConfirmation). */
export function dueLine(b: { paymentStatus: string; paidOffline: boolean; paidAt: Date | null; stripePaymentMethodId: string | null; totalAmount: number; accessFeeTotal: number; feePaidCents: number | null }): string {
  if (b.paymentStatus === 'paid' || b.paidOffline || b.paidAt) return 'Paid';
  if (!b.stripePaymentMethodId) return `Total due at the course: ${usd(b.totalAmount)}`;
  // FEE-AT-BOOKING: the part of the booking fee already taken is not collected again (lib/booking-fees, as the round
  // charge counts it, so a party that grew after booking still shows what check-in will take).
  return `Estimated total at check-in: ${usd(b.totalAmount - feeCoveredCents(b))}`;
}

export type UpcomingBooking = { bookingId: string; manageUrl: string; date: string; time: string; players: number; holes: number; membersOnlyDay: boolean; dueLine: string };

/**
 * This course's confirmed bookings still to come under the proven email (case-insensitive and exact, lib/like-exact),
 * soonest first. Today's tee times that have passed drop off, on the course's clock. A day outside the public window
 * today is a members-only day (the booking page outlines it).
 */
export async function upcomingFor(course: { id: string; slug: string; timezone: string | null; publicAdvanceDays?: number | null; minPlayers?: number | null; maxPlayers?: number | null }, email: string, now: Date = new Date(), take = 20): Promise<UpcomingBooking[]> {
  if (!email.trim()) return [];
  const today = todayIn(course.timezone, now);
  const clock = clockIn(course.timezone, now);
  const rows = await prisma.booking.findMany({
    // Still to come on the course's clock: a later day, or today after now (in the query, so `take` is exact).
    where: { courseId: course.id, status: 'confirmed', golferEmail: ciEquals(email.trim()), OR: [{ teeTime: { date: { gt: today } } }, { teeTime: { date: today, time: { gt: clock } } }] },
    select: {
      id: true, players: true, checkInToken: true, paymentStatus: true, paidOffline: true, paidAt: true, stripePaymentMethodId: true, totalAmount: true, accessFeeTotal: true, feePaidCents: true,
      teeTime: { select: { date: true, time: true, holes: true, product: { select: { publicAdvanceDays: true, minPlayers: true, maxPlayers: true } } } },
    },
    orderBy: [{ teeTime: { date: 'asc' } }, { teeTime: { time: 'asc' } }],
    take,
  });
  return rows.map(b => ({
      bookingId: b.id,
      // The link the confirmation email sent to this same address (the log-in already proved the email), as a path on
      // this site (Golfer lane, Build 2026-11-18); a booking with no token gets the course page, as the email does.
      manageUrl: b.checkInToken ? `/manage/${b.id}?token=${encodeURIComponent(b.checkInToken)}` : `/courses/${course.slug}`,
      date: b.teeTime.date,
      time: b.teeTime.time,
      players: b.players,
      holes: b.teeTime.holes,
      membersOnlyDay: !withinWindow(b.teeTime.date, rulesFor(course, b.teeTime.product).publicAdvanceDays, now, course.timezone),
      dueLine: dueLine(b),
    }));
}
