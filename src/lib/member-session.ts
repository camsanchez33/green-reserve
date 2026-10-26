import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { getGolferSession } from './auth';
import { cardValidOn } from './residents';
import { groupCourseIds } from './course-group';

const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) {
  throw new Error('JWT_SECRET is not set — refusing to sign/verify member tokens in production');
}
const secret = new TextEncoder().encode(rawSecret);

// 15-minute magic link token — sent in email
export async function signMemberMagicToken(payload: {
  membershipId: string;
  courseId: string;
  email: string;
}) {
  return new SignJWT({ ...payload, type: 'member_magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(secret);
}

export async function verifyMemberMagicToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as { membershipId: string; courseId: string; email: string; type: string };
    if (p.type !== 'member_magic') return null;
    return p;
  } catch { return null; }
}

// 7-day session token — stored in httpOnly cookie, scoped to courseId. R-AUTH-009
// (Cam 2026-10-26): 7 days absolute, the same as the cookie it rides in.
export async function signMemberSessionToken(payload: {
  membershipId: string;
  courseId: string;
  email: string;
}) {
  return new SignJWT({ ...payload, type: 'member_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
}

export async function getMemberSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_member')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as { membershipId: string; courseId: string; email: string; type: string };
    if (p.type !== 'member_session') return null;
    return p;
  } catch { return null; }
}

// GOLFER_SPEC G5b — member pricing recognition via the golfer session, no
// separate member sign-in required. Safe because gr_golfer only exists after
// OTP possession-proof (email or phone) — the exact same proof the member
// magic link already relies on. Strictly courseId-scoped: only ever resolves
// a membership at the ONE course being asked about, never leaks across courses.
export async function getGolferMembership(courseId: string): Promise<{ membershipId: string; tierName: string } | null> {
  const golferSession = await getGolferSession();
  if (!golferSession) return null;

  const golfer = await prisma.golferAccount.findUnique({
    where: { id: golferSession.golferId },
    select: { email: true },
  });
  if (!golfer) return null;

  const membership = await prisma.courseMembership.findFirst({
    where: {
      courseId,
      status: 'active',
      OR: [
        { golferId: golferSession.golferId },
        { inviteEmail: { equals: golfer.email, mode: 'insensitive' } },
      ],
    },
    include: { tier: { select: { name: true } } },
  });
  if (!membership) return null;

  return { membershipId: membership.id, tierName: membership.tier?.name ?? membership.membershipType };
}

/** The signed-in golfer's resident card at this course, if it is good on `dateYmd`. */
export async function golferResident(courseId: string, dateYmd: string) {
  const session = await getGolferSession();
  if (!session) return null;
  // The account's email from the database (as getGolferMembership does), not the token's copy.
  const golfer = await prisma.golferAccount.findUnique({ where: { id: session.golferId }, select: { email: true } });
  return golfer?.email ? residentOn(courseId, golfer.email, dateYmd) : null;
}

/** The resident card listed under this email at this course — or, for a course
 *  in a group (GRP-1), at any course in the group — if it is good on `dateYmd`. */
export async function residentOn(courseId: string, emailRaw: string, dateYmd: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;
  const cards = await prisma.courseResident.findMany({ where: { courseId: { in: await groupCourseIds(courseId) }, email } });
  return cards.find(r => cardValidOn(r.expiresOn, dateYmd)) ?? null;
}
