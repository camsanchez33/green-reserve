// DENSE-5 (Cam 2026-10-28): each member's rounds here — last round ever, rounds and
// spend since January 1 — and the members' rounds this year in all. A round is a
// checked-in (completed) booking matched to the member by account id or by an email
// on the membership; a booking matched by several keys, or by two memberships, is
// counted once in the total. Spend is Analytics' course share (courseShareCents:
// green fee, cart, range balls — no shop items), so a golfer's spend reads the same
// here as on Analytics → Golfers. Money is returned only when the caller may see it.
import { prisma } from './prisma';
import { courseShareCents } from './analytics';

/** Analytics' "collected": a completed booking paid by card or at the counter. */
const COLLECTED = new Set(['paid', 'paid_offline']);

export type MemberKeys = { id: string; keys: string[] };
export type MemberRoundStats = { lastRound: string | null; roundsThisYear: number; spendThisYearCents: number | null };

export async function memberRoundStats(courseId: string, members: MemberKeys[], yearStart: string, withMoney: boolean) {
  const keys = (m: MemberKeys) => m.keys.map(k => k.toLowerCase()).filter(Boolean);
  const all = [...new Set(members.flatMap(keys))];
  const rounds = all.length === 0 ? [] : await prisma.booking.findMany({
    where: { courseId, status: 'completed', OR: [{ golferAccountId: { in: all } }, { golferEmail: { in: all, mode: 'insensitive' } }] },
    select: { id: true, golferAccountId: true, golferEmail: true, paymentStatus: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, teeTime: { select: { date: true } } },
  });
  type Round = (typeof rounds)[number];
  const byKey = new Map<string, Round[]>();
  const add = (k: string, r: Round) => { if (!k) return; const list = byKey.get(k); if (list) list.push(r); else byKey.set(k, [r]); };
  for (const r of rounds) { add((r.golferAccountId ?? '').toLowerCase(), r); add(r.golferEmail.toLowerCase(), r); }

  const byMember = new Map<string, MemberRoundStats>();
  const countedThisYear = new Set<string>();
  for (const m of members) {
    const mine = new Map<string, Round>();
    for (const k of keys(m)) for (const r of byKey.get(k) ?? []) mine.set(r.id, r);
    const list = [...mine.values()];
    const thisYear = list.filter(r => r.teeTime.date >= yearStart);
    thisYear.forEach(r => countedThisYear.add(r.id));
    byMember.set(m.id, {
      lastRound: list.map(r => r.teeTime.date).sort().pop() ?? null,
      roundsThisYear: thisYear.length,
      // Spend is Analytics' collected money: paid by card or at the counter — a refunded round played, but paid nothing.
      spendThisYearCents: withMoney ? thisYear.filter(r => COLLECTED.has(r.paymentStatus)).reduce((n, r) => n + courseShareCents(r), 0) : null,
    });
  }
  return { byMember, roundsThisYear: countedThisYear.size };
}
