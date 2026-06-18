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

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { operatorId: string; email: string; type: string };
  } catch { return null; }
}

export async function getOperatorSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_operator')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.type !== 'operator') return null;
  return payload;
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
