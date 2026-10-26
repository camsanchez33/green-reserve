// SEC-3 security audit (2026-10-26): a sign-in must not say whether an email
// has an account — not by its timing and not by its answer. A real account
// locks for 15 minutes after its 5th wrong password and relocks on the next
// wrong one after that (its counter only resets on a successful sign-in). An
// email with no account (or a login that's turned off, or never activated)
// now locks the same way, on the same counts, with the same message, so
// "5 wrong passwords then a 429" no longer separates real emails from made-up
// ones. Counters live in the RateLimit table under login-unknown:* keys.
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { rateLimitCount } from './rate-limit';

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
/** Cost 12, like every real password hash, so a check of it takes as long. */
const DUMMY_HASH = '$2a$12$x9I/Ln7XwBr4.techzuhLufMEVbOz1lhUde8CTW8YVHD9pGubcv7u';
/** Unknown-email failures are remembered this long — a real account's counter never expires on its own. */
const UNKNOWN_MEMORY_SECONDS = 30 * 24 * 60 * 60;

/** The typed email as a key part — capped, so an attacker can't write huge keys. */
const keyEmail = (email: string) => email.slice(0, 200);

/** The lock in force for an unknown email right now, or null. Checked before any password work, as for a real account. */
export async function unknownLoginLockedUntil(door: string, email: string, now = new Date()): Promise<Date | null> {
  const lock = await prisma.rateLimit.findUnique({ where: { key: `login-unknown-lock:${door}:${keyEmail(email)}` } }).catch(() => null);
  if (!lock) return null;
  const until = new Date(lock.windowStart.getTime() + LOGIN_LOCKOUT_MS);
  return until > now ? until : null;
}

/**
 * A wrong password for an email with no usable account: the same bcrypt work
 * as a real check, then the same counting as a real account. Returns the lock
 * to answer with (on the 5th failure and every one after), or null for the
 * plain "invalid" answer.
 */
export async function failUnknownLogin(door: string, email: string, password: string, now = new Date()): Promise<Date | null> {
  await bcrypt.compare(String(password), DUMMY_HASH);
  const { used } = await rateLimitCount(`login-unknown:${door}:${keyEmail(email)}`, LOGIN_MAX_ATTEMPTS, UNKNOWN_MEMORY_SECONDS);
  if (used < LOGIN_MAX_ATTEMPTS) return null;
  const key = `login-unknown-lock:${door}:${keyEmail(email)}`;
  await prisma.rateLimit.upsert({ where: { key }, create: { key, count: 1, windowStart: now }, update: { count: 1, windowStart: now } }).catch(() => {});
  return new Date(now.getTime() + LOGIN_LOCKOUT_MS);
}
