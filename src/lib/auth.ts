import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');

// ── Operator auth ─────────────────────────────────────────────────────────────
export async function signToken(payload: { operatorId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'operator' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
}

export async function signStaffToken(payload: { staffId: string; courseId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'staff' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
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
    const p = payload as { operatorId: string; email: string };
    return { kind: 'operator', operatorId: p.operatorId, email: p.email };
  }
  if (payload.type === 'staff') {
    const p = payload as { staffId: string; courseId: string; email: string };
    return { kind: 'staff', staffId: p.staffId, courseId: p.courseId, email: p.email };
  }
  return null;
}

// ── Golfer auth ───────────────────────────────────────────────────────────────
export async function signGolferToken(payload: { golferId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'golfer' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret);
}

export async function getGolferSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_golfer')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as { golferId: string; email: string; type: string };
    if (p.type !== 'golfer') return null;
    return p;
  } catch { return null; }
}

// ── Member invite (set-password) tokens ─────────────────────────────────────────
// Lets an operator-added member who has no GolferAccount yet land on a link and
// set a password, without needing a golferId (which doesn't exist until they do).
export async function signMemberInviteToken(payload: { membershipId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'member_invite' })
    .setProtectedHeader({ alg: 'HS256' })
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
