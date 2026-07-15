import { SignJWT, jwtVerify } from 'jose';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';

// Passwordless golfer sign-in (GOLFER_SPEC G5). No schema change was allowed
// for this phase, so — unlike operator 2FA, which stores the hashed code on
// CourseOperator — the challenge (identifier + code hash) is carried in a
// short-lived signed JWT the client round-trips back on verify. Rate limiting
// (attempt + resend caps) is enforced via the existing RateLimit table, keyed
// by identifier, so a stolen challenge token still can't be brute-forced.

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

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export async function signOtpChallenge(identifier: string, type: OtpIdentifierType, codeHash: string): Promise<string> {
  return new SignJWT({ identifier, type, codeHash, purpose: 'golfer_otp' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(getSecret());
}

export async function verifyOtpChallenge(token: string): Promise<{ identifier: string; type: OtpIdentifierType; codeHash: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== 'golfer_otp') return null;
    const { identifier, type, codeHash } = payload as Record<string, unknown>;
    if (typeof identifier !== 'string' || typeof codeHash !== 'string') return null;
    if (type !== 'email' && type !== 'phone') return null;
    return { identifier, type, codeHash };
  } catch {
    return null;
  }
}
