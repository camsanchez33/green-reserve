// @brain inquiry-signin-challenge
// SD-11 — the "are you trying to sign in?" challenge that sits between the
// public sign-up form and a course that already exists.
//
// Cam 2026-09-16: "just cause an email got put in doesnt send them stright to
// sign in but they should be asked and then if they answer yes they have to
// enter a verification code via that email or a phone number on file."
//
// WHAT THE CODE DOES AND DOES NOT DO. It proves the person controls the address
// on file. It does NOT sign anyone in. Operators log in with a password and then
// a 2FA code; a second door that swapped both for "can read this inbox" would be
// a downgrade dressed as a convenience, and it would be the weakest way into a
// dashboard that moves money. So a correct code buys exactly one thing: we tell
// them which address their account uses and point them at the real login.
//
// NO SCHEMA CHANGE. The challenge lives in a signed, short-lived, httpOnly
// cookie rather than new columns on CourseInquiry — schema changes here are
// attended work (CLAUDE.md), and this needs no durable state: the code is
// useless after ten minutes and belongs to one browser. The attempt counter
// rides in the same cookie and is re-signed on every miss, so it cannot be
// edited away; a per-IP limit in front covers someone throwing the cookie away
// to reset it.

import { SignJWT, jwtVerify } from 'jose';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');

export const SIGNIN_COOKIE = 'gr_signin_challenge';
export const MAX_CODE_ATTEMPTS = 5;
/** Ten minutes, matching the operator 2FA code it deliberately does not replace. */
export const CODE_TTL_SECONDS = 600;

export interface SigninChallenge {
  inquiryId: string;
  /** bcrypt hash — the plaintext code exists only in the email. */
  codeHash: string;
  attempts: number;
}

export function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function signChallenge(c: SigninChallenge): Promise<string> {
  return new SignJWT({ ...c, type: 'signin_challenge' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CODE_TTL_SECONDS}s`)
    .sign(secret);
}

export async function readChallenge(token: string | undefined): Promise<SigninChallenge | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== 'signin_challenge') return null;
    if (typeof payload.inquiryId !== 'string' || typeof payload.codeHash !== 'string') return null;
    const attempts = typeof payload.attempts === 'number' ? payload.attempts : 0;
    return { inquiryId: payload.inquiryId, codeHash: payload.codeHash, attempts };
  } catch {
    return null;
  }
}

export async function checkCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

/** Same options everywhere, so the cookie cannot be cleared in one place and
 *  left behind in another. */
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
