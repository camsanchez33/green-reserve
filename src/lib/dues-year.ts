// Memberships page (Cam 2026-11-16): "Dues collected this year", broken down by each membership. Read from the
// ledger (MoneyMove what 'dues' or 'pass' — every dues and season-pass payment and refund is one row there, LEDGER-1), money in less money
// back, since January 1 of the course's own year. What the course keeps: the 1% GreenReserve fee a card pays on top
// is not dues (platformFeeCents comes off). One membership's dues count under the tier it is on now.
import { prisma } from './prisma';
import { MEMBERSHIP_WHATS } from './season-pass';
import { todayIn, DEFAULT_TZ } from './course-time';
import { teeToUtcMs } from './tee-time-utils';

export type DuesYear = { year: string; totalCents: number; byTier: { tierId: string | null; cents: number }[] };

export function yearStartUtc(tz: string | null | undefined, now = new Date()): { year: string; from: Date } {
  const year = todayIn(tz, now).slice(0, 4);
  return { year, from: new Date(teeToUtcMs(`${year}-01-01`, '00:00', tz || DEFAULT_TZ)) };
}

export async function duesThisYear(courseId: string, tz: string | null | undefined, now = new Date()): Promise<DuesYear> {
  const { year, from } = yearStartUtc(tz, now);
  const moves = await prisma.moneyMove.findMany({
    where: { courseId, what: { in: MEMBERSHIP_WHATS }, at: { gte: from, lte: now } },
    select: { direction: true, amountCents: true, platformFeeCents: true, membershipId: true },
  });
  const ids = [...new Set(moves.map(m => m.membershipId).filter((x): x is string => !!x))];
  const tiers = ids.length ? await prisma.courseMembership.findMany({ where: { id: { in: ids }, courseId }, select: { id: true, tierId: true } }) : [];
  const tierOf = new Map(tiers.map(t => [t.id, t.tierId]));
  const by = new Map<string | null, number>();
  let total = 0;
  for (const m of moves) {
    const kept = (m.direction === 'out' ? -1 : 1) * (m.amountCents - m.platformFeeCents);
    const tier = m.membershipId ? tierOf.get(m.membershipId) ?? null : null;
    by.set(tier, (by.get(tier) ?? 0) + kept);
    total += kept;
  }
  return { year, totalCents: total, byTier: [...by.entries()].map(([tierId, cents]) => ({ tierId, cents })).sort((a, b) => b.cents - a.cents) };
}
