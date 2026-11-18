import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
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

// Cam 2026-11-18: a member is recognised only by this course's gr_member session. The G5b path (an active
// membership found through the GreenReserve-wide gr_golfer session) is retired with golfer accounts.

/**
 * RES-1 online: the resident card of whoever is signed in to THIS course (gr_member, its email proven by the
 * member link), if it is good on `dateYmd`. Cam 2026-11-18: there is no other online sign-in, so a resident
 * who is not a member here gets the resident rate at the counter until resident cards become a membership type.
 */
export async function signedInResident(courseId: string, dateYmd: string) {
  const session = await getMemberSession();
  if (!session || session.courseId !== courseId || !session.email) return null;
  return residentOn(courseId, session.email, dateYmd);
}

/** The resident card listed under this email at this course — or, for a course
 *  in a group (GRP-1), at any course in the group — if it is good on `dateYmd`. */
export async function residentOn(courseId: string, emailRaw: string, dateYmd: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return null;
  const cards = await prisma.courseResident.findMany({ where: { courseId: { in: await groupCourseIds(courseId) }, email } });
  return cards.find(r => cardValidOn(r.expiresOn, dateYmd)) ?? null;
}
