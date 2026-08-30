import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) {
  throw new Error('JWT_SECRET is not set — refusing to start');
}
const secret = new TextEncoder().encode(rawSecret);

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  role: string;
  /**
   * True only for sessions minted by the /api/admin/owner-login verify step,
   * i.e. after a second factor was actually presented. Absent on every other
   * path. Owner-only gates assert this, which turns "owner sessions are
   * 2FA-backed" from an inference into an enforced invariant.
   */
  mfa?: boolean;
}

export const OWNER_ONLY   = ['owner'];
export const MANAGER_PLUS = ['owner', 'manager'];
export const SUPPORT_PLUS = ['owner', 'manager', 'support'];

/**
 * The owner gate. Role alone is not enough — the session must also carry the
 * mfa claim, so a password-only owner session (minted before this shipped, or
 * by any future path that skips the second factor) cannot reach owner-only
 * surfaces.
 */
export function requireOwner(session: AdminSession): boolean {
  return session.role === 'owner' && session.mfa === true;
}

export function requireRole(session: AdminSession, roles: string[]): boolean {
  // An owner-only role list is the owner gate by another name — route it
  // through requireOwner so a call site that reaches for requireRole(…,
  // OWNER_ONLY) can't accidentally skip the second-factor assertion.
  if (roles.length === 1 && roles[0] === 'owner') return requireOwner(session);
  return roles.includes(session.role);
}

/**
 * Error copy for a failed owner gate. An owner who fails it holds a session
 * that predates (or skipped) the second factor — tell them exactly how to fix
 * it rather than showing a bare "Forbidden" they can't act on.
 */
export function ownerGateError(session: AdminSession): string {
  return session.role === 'owner'
    ? 'Owner sign-in required — this session was not verified with a second factor. Sign in again at /admin/owner-login.'
    : 'Forbidden — owner only';
}

export async function signAdminToken(payload: AdminSession) {
  return new SignJWT({ ...payload, type: 'admin_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret);
}

/**
 * MP-2 fix-now #9: `active` used to be checked at LOGIN ONLY, so deactivating an
 * admin left them with full access for up to 12h — the control did not do what
 * its label promised. It is now re-checked on every request.
 *
 * This costs one indexed findUnique per admin request. Measured admin endpoints
 * run 112–440ms, so a primary-key lookup is noise, and correctness on "this
 * person is fired" outranks it. MP-3's AdminUser.sessionVersion replaces this
 * with a cheaper claim comparison and additionally covers role changes, which
 * this deliberately does NOT — a demoted admin keeps their old role until the
 * token expires. That gap is recorded in RUN_QUEUE.
 */
export async function resolveAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as unknown as AdminSession & { type: string };
    if (p.type !== 'admin_session') return null;

    const admin = await prisma.adminUser.findUnique({
      where: { id: p.adminId },
      select: { active: true },
    });
    // Deleted or deactivated since the token was minted — the session is over.
    if (!admin || !admin.active) return null;

    return { adminId: p.adminId, email: p.email, name: p.name, role: p.role, mfa: p.mfa === true };
  } catch { return null; }
}

export async function signAdminSetPasswordToken(payload: { adminId: string; email: string }) {
  return new SignJWT({ ...payload, type: 'admin_set_password' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifyAdminSetPasswordToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as { adminId: string; email: string; type: string };
    if (p.type !== 'admin_set_password') return null;
    return p;
  } catch { return null; }
}
