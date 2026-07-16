import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { getGolferSession } from './auth';

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

// 90-day session token — stored in httpOnly cookie, scoped to courseId
export async function signMemberSessionToken(payload: {
  membershipId: string;
  courseId: string;
  email: string;
}) {
  return new SignJWT({ ...payload, type: 'member_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('90d')
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
