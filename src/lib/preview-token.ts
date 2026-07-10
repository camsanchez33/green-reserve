import { SignJWT, jwtVerify } from 'jose';

function getSecret() {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(raw);
}

export async function signPreviewToken(courseId: string): Promise<string> {
  return new SignJWT({ courseId, purpose: 'preview' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifyPreviewToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== 'preview' || typeof payload.courseId !== 'string') return null;
    return payload.courseId;
  } catch {
    return null;
  }
}
