import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'greenreserve-dev-secret'
);

export async function signToken(payload: { operatorId: string; email: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { operatorId: string; email: string };
  } catch {
    return null;
  }
}

export async function getOperatorSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('gr_operator')?.value;
  if (!token) return null;
  return verifyToken(token);
}
