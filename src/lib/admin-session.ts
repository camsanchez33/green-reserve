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

/**
 * Thrown when the session store itself is unreachable. Distinct from "no
 * session" so a route can answer 503 rather than logging everyone out.
 */
export class AdminSessionUnavailable extends Error {
  constructor() { super('Admin session store unavailable'); this.name = 'AdminSessionUnavailable'; }
}

// Defined in admin-roles.ts (client-safe) and re-exported here so existing
// server-side imports are unchanged. This module is server-only — it pulls in
// prisma and next/headers — so client components must import from admin-roles.
export { OWNER_ONLY, MANAGER_PLUS, SUPPORT_PLUS } from './admin-roles';

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
 * with a cheaper claim comparison.
 *
 * Role is read from that same row (MP-2d), so a demotion also takes effect at
 * once. `mfa` remains a claim: it records how this session was authenticated,
 * which no later row change retroactively alters.
 */
export async function resolveAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return null;

  // Step 1 — verify the token. A bad/expired/tampered token is simply "no
  // session"; its catch must NOT extend over the DB read below.
  let claims: (AdminSession & { type: string }) | null = null;
  try {
    const { payload } = await jwtVerify(token, secret);
    claims = payload as unknown as AdminSession & { type: string };
  } catch { return null; }
  if (!claims || claims.type !== 'admin_session') return null;

  // Step 2 — is the account still active? (MP-2 fix-now #9.)
  //
  // MP-2b put this inside the JWT try/catch, so the rethrow below was swallowed
  // by that catch two lines later and the whole thing was inert — a Postgres
  // blip still became a 401 and still logged every admin out. It is outside now,
  // which is the difference between the fix existing and not.
  // MP-2d B2: role comes from the ROW, not the token. MP-2c selected only
  // `active` and returned claims.role, so a demoted admin kept their old
  // privileges for up to 12h — and employees/route.ts blocks self-modification
  // but not changing ANOTHER owner's role, so a demoted owner could demote the
  // real owner back and mint a fresh owner account. The row was already on the
  // wire; this costs nothing. (mfa stays a claim: it records how this session
  // was authenticated, which no later row change can retroactively alter.)
  let admin: { active: boolean; role: string } | null;
  try {
    admin = await prisma.adminUser.findUnique({
      where: { id: claims.adminId },
      select: { active: true, role: true },
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'admin_session.db_unavailable', adminId: claims.adminId, error: err instanceof Error ? err.message : String(err) }));
    throw new AdminSessionUnavailable();
  }

  // Deleted or deactivated since the token was minted — the session is over.
  if (!admin || !admin.active) return null;

  return { adminId: claims.adminId, email: claims.email, name: claims.name, role: admin.role, mfa: claims.mfa === true };
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
