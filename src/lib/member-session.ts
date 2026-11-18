import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { cardValidOn } from './residents';
import { groupCourseIds } from './course-group';
import { ciEquals } from '@/lib/like-exact';
import { liveMembershipWhere, type LapseRule } from './member-rates';
import { todayIn } from './course-time';
import { residentPricingOn } from './pricing-switch';
import type { Prisma } from '@prisma/client';

const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) {
  throw new Error('JWT_SECRET is not set — refusing to sign/verify member tokens in production');
}
const secret = new TextEncoder().encode(rawSecret);

// Residents log in (Cam 2026-11-18, GOLFER-LOGIN-1): gr_member is "this email, proven, at this course", not one
// membership. The groups that email is in (a live membership here, a resident card good here or in the course's
// group) are worked out on every request (liveMembershipFor, residentOn), so a lapsed membership or an expired card stops counting at
// once rather than lasting for the cookie's 7 days. Tokens issued before this carried a membershipId; it is ignored,
// and their email (proven when they were issued) is the identity.
type Proven = { courseId: string; email: string };

function readProven(payload: unknown, type: string): Proven | null {
  const p = payload as { courseId?: unknown; email?: unknown; type?: unknown };
  if (p.type !== type || typeof p.courseId !== 'string' || typeof p.email !== 'string') return null;
  const email = p.email.trim().toLowerCase();
  if (!p.courseId || !email) return null;
  return { courseId: p.courseId, email };
}

// 15-minute magic link token — sent in email. `membershipId` is accepted for older callers and not signed.
export async function signMemberMagicToken(payload: Proven & { membershipId?: string }) {
  return new SignJWT({ courseId: payload.courseId, email: payload.email.trim().toLowerCase(), type: 'member_magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(secret);
}

export async function verifyMemberMagicToken(token: string): Promise<Proven | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return readProven(payload, 'member_magic');
  } catch { return null; }
}

// 7-day session token — stored in httpOnly cookie, scoped to courseId. R-AUTH-009
// (Cam 2026-10-26): 7 days absolute, the same as the cookie it rides in.
export async function signMemberSessionToken(payload: Proven & { membershipId?: string }) {
  return new SignJWT({ courseId: payload.courseId, email: payload.email.trim().toLowerCase(), type: 'member_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
}

export async function getMemberSession(): Promise<Proven | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_member')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return readProven(payload, 'member_session');
  } catch { return null; }
}

/**
 * The proven email logged in to THIS course, or null. A session from another course never counts here, even in a
 * group. A course that turned "Show Log in on your booking page" off (Course.memberLoginOn) recognises no session:
 * its groups book at the public price online, staff apply their rates at the counter.
 */
export async function loggedInAt(courseId: string): Promise<{ email: string } | null> {
  const s = await getMemberSession();
  if (!s || s.courseId !== courseId) return null;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { memberLoginOn: true } });
  return c?.memberLoginOn ? { email: s.email } : null;
}

/**
 * The groups a golfer can log in as at this course, for the log-in line ("For <Course> members and residents."):
 * 'members' when some membership here could log in now (canLogIn's rule: status active, with an email to log in with;
 * Build 2026-11-18 — not "has an active tier", which disagreed with canLogIn), 'residents' when residents get their rate here and this course
 * or its group lists a card someone could log in with now: one with an email (a counter-only card has none) that is
 * good today on the course's clock, the same rule canLogIn uses. Empty when the course turned Log in off. Says
 * nothing about any email. `timezone` is required: a card's "good today" is on the course's clock, as canLogIn has it.
 */
export async function loginGroups(course: { id: string; memberLoginOn?: boolean | null; hasResidentPricing?: boolean | null; timezone: string | null }): Promise<('members' | 'residents')[]> {
  if (course.memberLoginOn === false) return [];
  const today = todayIn(course.timezone);
  const [members, cards] = await Promise.all([
    prisma.courseMembership.count({ where: { courseId: course.id, status: 'active', OR: [{ NOT: { inviteEmail: '' } }, { golferId: { not: null } }] } }),
    residentPricingOn(course)
      ? prisma.courseResident.count({ where: { courseId: { in: await groupCourseIds(course.id) }, email: { not: null }, NOT: { email: '' }, OR: [{ expiresOn: '' }, { expiresOn: { gte: today } }] } })
      : Promise.resolve(0),
  ]);
  const out: ('members' | 'residents')[] = [];
  if (members > 0) out.push('members');
  if (cards > 0) out.push('residents');
  return out;
}

// Cam 2026-11-18: a member is recognised only by this course's gr_member session. The G5b path (an active
// membership found through the GreenReserve-wide gr_golfer session) is retired with golfer accounts.

/**
 * This course's memberships under an email, case-insensitive and exact (lib/like-exact). The member's own email
 * (inviteEmail, which staff edit) is the one that logs in; an older linked golfer account's email counts only where
 * no member email was ever typed. GOLFER-LOGIN-1 2c (Build 2026-11-18): staff can now edit a linked member's contact,
 * so the typed email has to win; every course and member today is test data wiped before launch, so no backfill.
 */
function membershipEmailWhere(courseId: string, email: string): Prisma.CourseMembershipWhereInput {
  const e = email.trim();
  return { courseId, OR: [{ inviteEmail: ciEquals(e) }, { inviteEmail: '', golfer: { email: ciEquals(e) } }] };
}

/** The membership whose member rates and window apply to this email at this course right now (lib/member-rates), or
 *  null. A member's rate still wins over a resident's; the two-groups rule (lower price, longer window) comes later. */
export async function liveMembershipFor(course: { id: string } & LapseRule, email: string) {
  if (!email.trim()) return null;
  return prisma.courseMembership.findFirst({
    where: { AND: [membershipEmailWhere(course.id, email), liveMembershipWhere(course)] },
    include: { tier: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Whether this email may log in to this course now: an active membership here, or a resident card good today (on
 * the course's clock) here or in its group while the course gives residents their rate. Asked only in after() or after a proven link, so its answer never
 * reaches someone who just typed an email.
 */
export async function canLogIn(course: { id: string; timezone?: string | null; hasResidentPricing?: boolean | null }, email: string): Promise<{ name: string } | null> {
  const m = await activeMembershipFor(course.id, email);
  if (m) return { name: m.inviteName || (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}`.trim() : '') || 'Member' };
  // Residents switched off in Settings (lib/pricing-switch): a resident card gives nothing online, so it is no log-in.
  if (!email.trim() || !residentPricingOn(course)) return null;
  const card = await residentOn(course.id, email, todayIn(course.timezone));
  return card ? { name: card.name || 'Resident' } : null;
}

/** This email's membership at this course with status active (lapsed or not; pricing asks liveMembershipFor). */
export async function activeMembershipFor(courseId: string, email: string) {
  if (!email.trim()) return null;
  return prisma.courseMembership.findFirst({
    where: { AND: [membershipEmailWhere(courseId, email), { status: 'active' }] },
    include: { tier: true, golfer: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * RES-1 online: the resident card of whoever is logged in to THIS course (gr_member, its email proven), if it is
 * good on `dateYmd`. Only this course's list (or its group's, GRP-1), never another course's session.
 */
export async function loggedInResident(courseId: string, dateYmd: string) {
  const session = await loggedInAt(courseId);
  return session ? residentOn(courseId, session.email, dateYmd) : null;
}

/** The resident card listed under this email at this course — or, for a course
 *  in a group (GRP-1), at any course in the group — if it is good on `dateYmd`. */
export async function residentOn(courseId: string, emailRaw: string, dateYmd: string) {
  const email = emailRaw.trim();
  if (!email) return null;
  // Case-insensitive and exact (lib/like-exact): a list typed "Jo@X.com" still matches, and _ or % never act as wildcards.
  const cards = await prisma.courseResident.findMany({ where: { courseId: { in: await groupCourseIds(courseId) }, email: ciEquals(email) } });
  return cards.find(r => cardValidOn(r.expiresOn, dateYmd)) ?? null;
}
