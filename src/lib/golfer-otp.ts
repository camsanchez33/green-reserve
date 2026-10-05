import { SignJWT, jwtVerify } from 'jose';
import { randomInt, randomUUID, createHmac, timingSafeEqual } from 'crypto';

// Passwordless golfer sign-in (GOLFER_SPEC G5). No schema change was allowed
// for this phase, so — unlike operator 2FA, which stores the hashed code on
// CourseOperator — the challenge (identifier + code hash) is carried in a
// short-lived signed JWT the client round-trips back on verify. Rate limiting
// (attempt + resend caps) is enforced via the existing RateLimit table, keyed
// by identifier, so a stolen challenge token still can't be brute-forced.
//
// R-AUTH-001: the challenge used to carry bcrypt(code). A JWT is signed, not
// encrypted, so whoever requested the code held a verifier for a 10^6 keyspace
// and could crack it offline inside the 10-minute TTL — the rate limits never
// saw a guess. It now carries an HMAC under JWT_SECRET, bound to a random
// challenge id and the identifier (the inquiry-signin.ts fix), which cannot be
// attacked offline at all.

function getSecret() {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(raw);
}

export type OtpIdentifierType = 'email' | 'phone';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+1' + digits; // assume US/CA for a bare 10-digit number
}

/** Returns null if the input is neither a plausible email nor phone number. */
export function classifyIdentifier(raw: string): { identifier: string; type: OtpIdentifierType } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (EMAIL_RE.test(trimmed)) return { identifier: trimmed.toLowerCase(), type: 'email' };
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15) return { identifier: normalizePhone(trimmed), type: 'phone' };
  return null;
}

export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

export interface OtpChallenge {
  identifier: string;
  type: OtpIdentifierType;
  /** Random per challenge — binds the MAC and keys the single-use marker. */
  cid: string;
  codeMac: string;
}

function macOtpCode(cid: string, identifier: string, code: string): string {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET is not set');
  return createHmac('sha256', raw).update(`golfer_otp:${cid}:${identifier}:${code}`).digest('hex');
}

/** The challenge token for a code just sent. Carries no crackable verifier. */
export async function signOtpChallenge(identifier: string, type: OtpIdentifierType, code: string): Promise<string> {
  const cid = randomUUID();
  return new SignJWT({ identifier, type, cid, codeMac: macOtpCode(cid, identifier, code), purpose: 'golfer_otp' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(getSecret());
}

export function otpCodeMatches(c: OtpChallenge, code: string): boolean {
  const expected = Buffer.from(macOtpCode(c.cid, c.identifier, code), 'utf8');
  const given = Buffer.from(c.codeMac, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** RateLimit key that makes a challenge single-use once its code is accepted. */
export const otpUsedKey = (cid: string) => `golfer-otp-used:${cid}`;

export async function verifyOtpChallenge(token: string): Promise<OtpChallenge | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== 'golfer_otp') return null;
    const { identifier, type, cid, codeMac } = payload as Record<string, unknown>;
    // A pre-fix token (codeHash, no cid) fails here: the golfer asks for a new code.
    if (typeof identifier !== 'string' || typeof cid !== 'string' || typeof codeMac !== 'string') return null;
    if (type !== 'email' && type !== 'phone') return null;
    return { identifier, type, cid, codeMac };
  } catch {
    return null;
  }
}
