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

// ── Operator auth ─────────────────────────────────────────────────────────────
export async function signToken(payload: { operatorId: string; email: string; sv?: number }) {
  return new SignJWT({ ...payload, type: 'operator' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(OPERATOR_TTL)
    .sign(secret);
}

/** `sv`: CourseStaff.sessionVersion at sign-in (Team, Cam 2026-11-17); resolveDashboardSession refuses a mismatch. */
export async function signStaffToken(payload: { staffId: string; courseId: string; email: string; sv?: number }) {
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
  | { kind: 'operator'; operatorId: string; email: string; sv?: number }
  | { kind: 'staff'; staffId: string; courseId: string; email: string; sv?: number };

export async function getOperatorSession(): Promise<DashboardSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_operator')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  if (payload.type === 'operator') {
    const p = payload as { operatorId: string; email: string; sv?: number; iat?: number; exp?: number };
    // Sliding renewal: reissue token when >50% of TTL has elapsed
    await maybeRefreshOperatorToken(p, cookieStore);
    return { kind: 'operator', operatorId: p.operatorId, email: p.email, sv: p.sv };
  }
  if (payload.type === 'staff') {
    const p = payload as { staffId: string; courseId: string; email: string; sv?: number; iat?: number; exp?: number };
    await maybeRefreshStaffToken(p, cookieStore);
    return { kind: 'staff', staffId: p.staffId, courseId: p.courseId, email: p.email, sv: p.sv };
  }
  return null;
}

async function maybeRefreshOperatorToken(
  p: { operatorId: string; email: string; sv?: number; iat?: number; exp?: number },
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  if (!p.iat || !p.exp) return;
  const elapsed = Date.now() / 1000 - p.iat;
  const total = p.exp - p.iat;
  if (elapsed / total < 0.5) return;
  try {
    const newToken = await signToken({ operatorId: p.operatorId, email: p.email, sv: p.sv });
    cookieStore.set('gr_operator', newToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: OPERATOR_MAX_AGE, path: '/',
    });
  } catch { /* silently skip in server-component page context */ }
}

async function maybeRefreshStaffToken(
  p: { staffId: string; courseId: string; email: string; sv?: number; iat?: number; exp?: number },
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  if (!p.iat || !p.exp) return;
  const elapsed = Date.now() / 1000 - p.iat;
  const total = p.exp - p.iat;
  if (elapsed / total < 0.5) return;
  try {
    // Carries the token's own sv: a refresh never makes a dead token live (resolveDashboardSession still compares it).
    const newToken = await signStaffToken({ staffId: p.staffId, courseId: p.courseId, email: p.email, sv: p.sv });
    cookieStore.set('gr_operator', newToken, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', maxAge: OPERATOR_MAX_AGE, path: '/',
    });
  } catch { /* silently skip in server-component page context */ }
}

// ── Golfer auth: retired (Cam 2026-11-18) ──────────────────────────────────────
// No GreenReserve-wide golfer accounts yet: the gr_golfer session, its OTP sign-in and the member set-password
// invite are gone. Sign-in is per course (gr_member, lib/member-session); everyone else books as a guest and
// manages a booking with its emailed link. GolferAccount stays as the internal record behind older bookings
// and memberships; nothing creates one now.

// ── Staff password reset (SD-9c) ───────────────────────────────────────────────
// CourseStaff has no resetToken columns, and a schema change is blocked while
// previews are broken. So the reset link is a 1-hour JWT carrying a fingerprint
// of the staff member's CURRENT password hash: the moment the password changes,
// the fingerprint stops matching and the link is dead — single-use by
// construction, no column needed. Its type ('staff_reset') is on no session
// allowlist, so it can never stand in for a login cookie.
// Web Crypto, not node:crypto, so this file stays importable anywhere.
async function passwordFingerprint(hash: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hash));
  return Array.from(new Uint8Array(digest).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}

/** `ttl`: '1h' for a reset; Team's invite link uses 48h (lib/team-welcome INVITE_LINK_TTL). Either way it dies once a password is set. */
export async function signStaffResetToken(staff: { id: string; password: string }, ttl: '1h' | '48h' = '1h') {
  return new SignJWT({ staffId: staff.id, pf: await passwordFingerprint(staff.password), type: 'staff_reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret);
}

/** The staffId if the link is genuine, unexpired and the password has not changed since it was sent. */
export async function verifyStaffResetToken(token: string, currentHash: (staffId: string) => Promise<string | null>): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as { staffId?: string; pf?: string; type?: string };
    if (p.type !== 'staff_reset' || !p.staffId || !p.pf) return null;
    const hash = await currentHash(p.staffId);
    if (!hash || (await passwordFingerprint(hash)) !== p.pf) return null;
    return p.staffId;
  } catch { return null; }
}
