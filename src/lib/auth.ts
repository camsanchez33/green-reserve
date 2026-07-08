import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Fail closed: in production a missing JWT_SECRET must never silently fall
// back to a publicly known dev secret (forged tokens would verify).
const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) {
  throw new Error('JWT_SECRET is not set — refusing to sign/verify tokens in production');
}
const secret = new TextEncoder().encode(rawSecret);

const OPERATOR_TTL = '7d';
const OPERATOR_MAX_AGE = 60 * 60 * 24 * 7;
const GOLFER_TTL = '90d';
const GOLFER_MAX_AGE = 60 * 60 * 24 * 90;

// ── Operator auth ─────────────────────────────────────────────────────────────
export async function signToken(payload: { operatorId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'operator' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(OPERATOR_TTL)
    .sign(secret);
}

export async function signStaffToken(payload: { staffId: string; courseId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'staff' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(OPERATOR_TTL)
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch { return null; }
}

// ── Pending 2FA tokens ───────────────────────────────────────────────────────
// Short-lived token issued after a correct password when the operator has 2FA
// enabled — does NOT grant dashboard access on its own, only lets /api/auth/2fa/verify
// know which operator is mid-login.
export async function signPendingTwoFactorToken(payload: { operatorId: string }) {
  return new SignJWT({ ...payload, type: 'pending_2fa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

// Returns session for both operators and staff — unified shape
export type DashboardSession =
  | { kind: 'operator'; operatorId: string; email: string }
  | { kind: 'staff'; staffId: string; courseId: string; email: string };

export async function getOperatorSession(): Promise<DashboardSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_operator')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  if (payload.type === 'operator') {
    const p = payload as { operatorId: string; email: string; iat?: number; exp?: number };
    // Sliding renewal: reissue token when >50% of TTL has elapsed
    await maybeRefreshOperatorToken(p, cookieStore);
    return { kind: 'operator', operatorId: p.operatorId, email: p.email };
  }
  if (payload.type === 'staff') {
    const p = payload as { staffId: string; courseId: string; email: string; iat?: number; exp?: number };
    await maybeRefreshStaffToken(p, cookieStore);
    return { kind: 'staff', staffId: p.staffId, courseId: p.courseId, email: p.email };
  }
  return null;
}

async function maybeRefreshOperatorToken(
  p: { operatorId: string; email: string; iat?: number; exp?: number },
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  if (!p.iat || !p.exp) return;
  const elapsed = Date.now() / 1000 - p.iat;
  const total = p.exp - p.iat;
  if (elapsed / total < 0.5) return;
  try {
    const newToken = await signToken({ operatorId: p.operatorId, email: p.email });
    cookieStore.set('gr_operator', newToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: OPERATOR_MAX_AGE, path: '/',
    });
  } catch { /* silently skip in server-component page context */ }
}

async function maybeRefreshStaffToken(
  p: { staffId: string; courseId: string; email: string; iat?: number; exp?: number },
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  if (!p.iat || !p.exp) return;
  const elapsed = Date.now() / 1000 - p.iat;
  const total = p.exp - p.iat;
  if (elapsed / total < 0.5) return;
  try {
    const newToken = await signStaffToken({ staffId: p.staffId, courseId: p.courseId, email: p.email });
    cookieStore.set('gr_operator', newToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: OPERATOR_MAX_AGE, path: '/',
    });
  } catch { /* silently skip in server-component page context */ }
}

// ── Golfer auth ───────────────────────────────────────────────────────────────
export async function signGolferToken(payload: { golferId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'golfer' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(GOLFER_TTL)
    .sign(secret);
}

export async function getGolferSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_golfer')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as { golferId: string; email: string; type: string; iat?: number; exp?: number };
    if (p.type !== 'golfer') return null;
    // Sliding renewal: reissue when >50% of 90-day TTL has elapsed
    if (p.iat && p.exp) {
      const elapsed = Date.now() / 1000 - p.iat;
      const total = p.exp - p.iat;
      if (elapsed / total > 0.5) {
        try {
          const newToken = await signGolferToken({ golferId: p.golferId, email: p.email });
          cookieStore.set('gr_golfer', newToken, {
            httpOnly: true, secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax', maxAge: GOLFER_MAX_AGE, path: '/',
          });
        } catch { /* silently skip in server-component page context */ }
      }
    }
    return p;
  } catch { return null; }
}

// ── Member invite (set-password) tokens ─────────────────────────────────────────
// Lets an operator-added member who has no GolferAccount yet land on a link and
// set a password, without needing a golferId (which doesn't exist until they do).
export async function signMemberInviteToken(payload: { membershipId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'member_invite' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14d')
    .sign(secret);
}

export async function verifyMemberInviteToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as { membershipId: string; email: string; type: string };
    if (p.type !== 'member_invite') return null;
    return p;
  } catch { return null; }
}
