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

/**
 * Cam 2026-10-26 ("I want to be able to see it before sending them a preview"):
 * the admin's own look at a built page. A separate purpose, so the approve and
 * request-changes routes — which accept only 'preview' — refuse it: an admin
 * looking can never approve or ask for changes on the course's behalf.
 */
export async function signLookToken(courseId: string): Promise<string> {
  return new SignJWT({ courseId, purpose: 'look' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
    .sign(getSecret());
}

/** For the pages that only SHOW the course: the course's preview link or the admin's look. */
export async function verifyViewToken(token: string): Promise<{ courseId: string; look: boolean } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if ((payload.purpose !== 'preview' && payload.purpose !== 'look') || typeof payload.courseId !== 'string') return null;
    return { courseId: payload.courseId, look: payload.purpose === 'look' };
  } catch {
    return null;
  }
}
