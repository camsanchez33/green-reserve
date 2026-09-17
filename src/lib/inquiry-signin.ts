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
// NO SCHEMA CHANGE. The challenge is a signed, short-lived, httpOnly cookie —
// schema changes here are attended work (CLAUDE.md), and there is nothing
// durable to keep: the code dies in ten minutes and belongs to one browser.

import { SignJWT, jwtVerify } from 'jose';
import { randomInt, randomUUID, createHmac, timingSafeEqual } from 'crypto';

// Fails CLOSED in production, like every sibling token lib in this codebase
// (auth.ts, admin-session.ts, member-session.ts, owner-totp.ts, golfer-otp.ts,
// preview-token.ts). The first version took the dev fallback unconditionally and
// was the only one of the seven that did: with JWT_SECRET unset in production
// anyone could forge a challenge for any inquiry id under a published string.
// The dev fallback itself is the convention and stays — a local checkout has no
// JWT_SECRET and every one of those six libs would refuse to load without it.
const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) {
  throw new Error('JWT_SECRET is not set — refusing to sign sign-in challenges in production');
}
// Narrowed once here rather than inside macCode: TypeScript does not carry the
// throw above into a function body, and `rawSecret!` would silence the check
// that is the whole point of the lines above it.
const MAC_KEY: string = rawSecret;
const secret = new TextEncoder().encode(MAC_KEY);

export const SIGNIN_COOKIE = 'gr_signin_challenge';
export const MAX_CODE_ATTEMPTS = 5;
/** Ten minutes, matching the operator 2FA code it deliberately does not replace. */
export const CODE_TTL_SECONDS = 600;

export interface SigninChallenge {
  inquiryId: string;
  /** Random per challenge. The attempt counter is keyed on it SERVER-side, so a
   *  replayed cookie cannot reset the count — see verifyAttemptKey below. */
  cid: string;
  /** HMAC, not bcrypt. A JWT claim is signed, not encrypted, so the client holds
   *  whatever goes in here: a bcrypt hash of a six-digit code is a verifier for a
   *  10^6 keyspace, crackable offline in under a minute on one GPU, which makes
   *  the TTL and both rate limits irrelevant. An HMAC under a key the client does
   *  not have cannot be attacked offline at all, and a short code needs no work
   *  factor once its verifier is unguessable. */
  codeMac: string;
}

export function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function newChallengeId(): string {
  return randomUUID();
}

/** Bound to the challenge id, so a MAC from one challenge cannot be presented
 *  against another. */
export function macCode(cid: string, code: string): string {
  return createHmac('sha256', MAC_KEY).update(`${cid}:${code}`).digest('hex');
}

export function codeMatches(cid: string, code: string, mac: string): boolean {
  const expected = Buffer.from(macCode(cid, code), 'utf8');
  const given = Buffer.from(mac, 'utf8');
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** The server-side attempt counter's key. Rides on the existing RateLimit table
 *  rather than a new column, and is derived from the cid INSIDE the token, so
 *  replaying an older cookie lands on the same counter. */
export const verifyAttemptKey = (cid: string) => `signin-attempt:${cid}`;

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
    const { inquiryId, cid, codeMac } = payload as Record<string, unknown>;
    if (typeof inquiryId !== 'string' || typeof cid !== 'string' || typeof codeMac !== 'string') return null;
    return { inquiryId, cid, codeMac };
  } catch {
    return null;
  }
}

/** A challenge that cannot succeed, for the paths that must not admit they found
 *  nothing. The route sets one of these whenever it declines, so the presence of
 *  a Set-Cookie header stops being an answer. */
export function inertChallenge(): SigninChallenge {
  const cid = newChallengeId();
  return { inquiryId: 'none', cid, codeMac: macCode(cid, generateCode() + '-never-sent') };
}

/** Same options everywhere, so the cookie cannot be cleared in one place and
 *  left behind in another. */
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
