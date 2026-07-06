import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

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
}

export async function signAdminToken(payload: AdminSession) {
  return new SignJWT({ ...payload, type: 'admin_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret);
}

export async function resolveAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const p = payload as AdminSession & { type: string };
    if (p.type !== 'admin_session') return null;
    return { adminId: p.adminId, email: p.email, name: p.name, role: p.role };
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
