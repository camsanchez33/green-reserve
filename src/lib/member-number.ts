// Memberships item 2 (Cam 2026-11-16, "member numbers: an automatic per-membership prefix and sequence, never
// reused"): every member gets a number when they are added — the membership's prefix and its next number, e.g.
// "PH-FM-0012" (the mockup's: course initials, membership initials, four digits).
//
//  • The prefix is fixed on the tier the first time it gives a number (MembershipTier.numberPrefix), so renaming
//    the membership or the course never changes numbers already given or to come. Two memberships whose initials
//    match get a digit ("PH-FM", "PH-FM2"), so a number is never ambiguous within a course.
//  • A tier that has given numbers is never deleted, only made inactive (api/operator/tiers DELETE), so its prefix
//    and count stay taken.
//  • The sequence is the tier's numberLast, taken with one atomic increment: two members added at once get two
//    numbers, and a number is never given again — not after the member ends, is removed, or an add is abandoned.
//  • A member keeps their number when they move to another membership.
//  • Members added before this have none (no backfill without Cam).
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const WORD = /[A-Za-z0-9]+/g;
const SKIP = new Set(['the', 'of', 'and', 'at', 'golf', 'club', 'course', 'cc', 'gc']);

/** Initials of a name, 2–3 letters ("Pine Hollow Golf Club" → "PH"; "Full Member" → "FM"; "Junior" → "JU"). */
export function initials(name: string, fallback: string): string {
  const words = (name.match(WORD) ?? []).filter(w => !SKIP.has(w.toLowerCase()));
  const use = words.length ? words : (name.match(WORD) ?? []);
  let out = use.length >= 2 ? use.slice(0, 3).map(w => w[0]).join('') : (use[0] ?? '').slice(0, 2);
  out = out.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return out.length >= 2 ? out : (out + fallback).slice(0, 2).toUpperCase();
}

export const formatMemberNumber = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, '0')}`;

/** The prefix a tier would get now: course + membership initials, the first one no other tier of the course holds. */
async function proposePrefix(tier: { id: string; name: string; courseId: string; course: { name: string } }): Promise<string> {
  const base = `${initials(tier.course.name, 'GC')}-${initials(tier.name, 'MB')}`;
  const taken = new Set((await prisma.membershipTier.findMany({ where: { courseId: tier.courseId, id: { not: tier.id }, numberPrefix: { startsWith: base } }, select: { numberPrefix: true } })).map(t => t.numberPrefix));
  let prefix = base;
  for (let i = 2; taken.has(prefix); i++) prefix = `${base}${i}`;
  return prefix;
}

const TIER_FOR_PREFIX = { id: true, numberPrefix: true, name: true, courseId: true, course: { select: { name: true } } } as const;

/**
 * The tier's prefix: the one it has, or — the first time it gives a number — a new one, written once. A prefix is unique
 * per course in the database (@@unique([courseId, numberPrefix])): two tiers fixing the same one at once, one wins and
 * the other takes the next free one.
 */
async function prefixFor(tierId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const tier = await prisma.membershipTier.findUniqueOrThrow({ where: { id: tierId }, select: TIER_FOR_PREFIX });
    if (tier.numberPrefix) return tier.numberPrefix;
    try {
      await prisma.membershipTier.updateMany({ where: { id: tierId, numberPrefix: null }, data: { numberPrefix: await proposePrefix(tier) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // another tier just took it
      throw e;
    }
  }
  const t = await prisma.membershipTier.findUniqueOrThrow({ where: { id: tierId }, select: { numberPrefix: true } });
  if (!t.numberPrefix) throw new Error('member number prefix could not be fixed');
  return t.numberPrefix;
}

/** What the next member on this tier will get (the add form's "Made for them automatically"). A preview: writes nothing. */
export async function nextMemberNumber(courseId: string, tierId: string): Promise<string | null> {
  const t = await prisma.membershipTier.findFirst({ where: { id: tierId, courseId }, select: { ...TIER_FOR_PREFIX, numberLast: true } });
  if (!t) return null;
  return formatMemberNumber(t.numberPrefix ?? await proposePrefix(t), t.numberLast + 1);
}

/**
 * Give a membership its number, if it has none and is on a tier. Returns the number (existing or new), or null.
 * Never throws for the caller's sake: a member is added whether or not the number could be given (logged).
 */
export async function assignMemberNumber(membershipId: string): Promise<string | null> {
  try {
    const m = await prisma.courseMembership.findUnique({ where: { id: membershipId }, select: { memberNumber: true, tierId: true, courseId: true } });
    if (!m) return null;
    if (m.memberNumber) return m.memberNumber;
    if (!m.tierId) return null;
    const prefix = await prefixFor(m.tierId);
    for (let attempt = 0; attempt < 3; attempt++) {
      // One atomic increment: this number is ours alone, and is never handed out again.
      const t = await prisma.membershipTier.update({ where: { id: m.tierId }, data: { numberLast: { increment: 1 } }, select: { numberLast: true } });
      const number = formatMemberNumber(prefix, t.numberLast);
      try {
        const set = await prisma.courseMembership.updateMany({ where: { id: membershipId, memberNumber: null }, data: { memberNumber: number } });
        if (set.count) return number;
        return (await prisma.courseMembership.findUnique({ where: { id: membershipId }, select: { memberNumber: true } }))?.memberNumber ?? null;
      } catch (e) {
        // The same number already in this course (a prefix shared with an older tier's numbers): take the next one.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
    return null;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'member_number.assign_failed', membershipId, error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}
