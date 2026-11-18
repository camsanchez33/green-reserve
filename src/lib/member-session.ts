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
// group) are worked out on every request (groupsAt), so a lapsed membership or an expired card stops counting at
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

/** The proven email logged in to THIS course, or null. A session from another course never counts here, even in a group. */
export async function loggedInAt(courseId: string): Promise<{ email: string } | null> {
  const s = await getMemberSession();
  return s && s.courseId === courseId ? { email: s.email } : null;
}

// Cam 2026-11-18: a member is recognised only by this course's gr_member session. The G5b path (an active
// membership found through the GreenReserve-wide gr_golfer session) is retired with golfer accounts.

/** This course's memberships under an email (the member's own, or an older linked account's), case-insensitive and exact (lib/like-exact). */
function membershipEmailWhere(courseId: string, email: string): Prisma.CourseMembershipWhereInput {
  const e = email.trim();
  return { courseId, OR: [{ inviteEmail: ciEquals(e) }, { golfer: { email: ciEquals(e) } }] };
}

/** The membership whose member rates and window apply to this email at this course right now (lib/member-rates), or null. */
export async function liveMembershipFor(course: { id: string } & LapseRule, email: string) {
  if (!email.trim()) return null;
  return prisma.courseMembership.findFirst({
    where: { AND: [membershipEmailWhere(course.id, email), liveMembershipWhere(course)] },
    include: { tier: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * The groups this email is in at this course: a live membership here, and a resident card good on `dateYmd` here or
 * in the course's group (RES-1, GRP-1). In this version a member's rate still wins over a resident's, as before.
 */
export async function groupsAt(course: { id: string } & LapseRule, email: string, dateYmd: string) {
  const [membership, resident] = await Promise.all([liveMembershipFor(course, email), residentOn(course.id, email, dateYmd)]);
  return { membership, resident };
}

/**
 * Whether this email may log in to this course now: an active membership here, or a resident card good today (on
 * the course's clock) here or in its group while the course gives residents their rate. Asked only in after() or after a proven link, so its answer never
 * reaches someone who just typed an email.
 */
export async function canLogIn(course: { id: string; timezone?: string | null; hasResidentPricing?: boolean | null }, email: string): Promise<{ name: string } | null> {
  const m = await activeMembershipFor(course.id, email);
  if (m) return { name: (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}`.trim() : '') || m.inviteName || 'Member' };
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
