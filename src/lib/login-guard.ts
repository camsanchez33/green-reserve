// SEC-3 security audit (2026-10-26): a sign-in must not say whether an email
// has an account — not by its timing and not by its answer. A real account
// locks for 15 minutes after its 5th wrong password and relocks on the next
// wrong one after that (its counter only resets on a successful sign-in). An
// email with no account (or a login that's turned off, or never activated)
// now locks the same way, on the same counts, with the same message, so
// "5 wrong passwords then a 429" no longer separates real emails from made-up
// ones. Counters live in the RateLimit table under login-unknown:* keys.
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { rateLimit, rateLimitCount } from './rate-limit';

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

/** The same bcrypt work as a real check, for a refusal that must take as long as one. */
export async function dummyPasswordCheck(password: string): Promise<void> {
  await bcrypt.compare(String(password), DUMMY_HASH);
}

// Audit 2026-11-24 M3: the real-account counters were read, then written as read + 1, so six wrong
// passwords sent at once all wrote 1 and the account never locked, while an unknown email (counted
// atomically above) answered 429. Now every password try on a real account is CLAIMED before the
// password is compared, in one UPDATE that only succeeds while the account isn't locked and that sets
// the lock itself on the 5th claim. A burst gets exactly 5 compares, then refusals, like an unknown email.
// The column is a UTC timestamp without a zone, so "now" is taken in UTC to match it.
const LOGIN_TABLES = { operator: Prisma.raw('"CourseOperator"'), staff: Prisma.raw('"CourseStaff"'), admin: Prisma.raw('"AdminUser"') } as const;
export type LoginTable = keyof typeof LOGIN_TABLES;

export type PasswordClaim = { claimed: true; attempts: number; lockoutUntil: Date | null } | { claimed: false; lockoutUntil: Date };

export async function claimPasswordAttempt(table: LoginTable, id: string): Promise<PasswordClaim> {
  const t = LOGIN_TABLES[table];
  const rows = await prisma.$queryRaw<{ failedLoginAttempts: number; lockoutUntil: Date | null }[]>(Prisma.sql`
    UPDATE ${t} SET
      "failedLoginAttempts" = "failedLoginAttempts" + 1,
      "lockoutUntil" = CASE WHEN "failedLoginAttempts" + 1 >= ${LOGIN_MAX_ATTEMPTS}
        THEN (now() AT TIME ZONE 'UTC') + make_interval(secs => ${LOGIN_LOCKOUT_MS / 1000})
        ELSE "lockoutUntil" END
    WHERE "id" = ${id} AND ("lockoutUntil" IS NULL OR "lockoutUntil" <= (now() AT TIME ZONE 'UTC'))
    RETURNING "failedLoginAttempts", "lockoutUntil"`);
  if (rows[0]) return { claimed: true, attempts: Number(rows[0].failedLoginAttempts), lockoutUntil: rows[0].lockoutUntil };
  const row = await prisma.$queryRaw<{ lockoutUntil: Date | null }[]>(Prisma.sql`SELECT "lockoutUntil" FROM ${t} WHERE "id" = ${id}`);
  return { claimed: false, lockoutUntil: row[0]?.lockoutUntil ?? new Date(Date.now() + LOGIN_LOCKOUT_MS) };
}

/** A right password: the counter and any lock the claim set go back to zero. */
export async function clearPasswordAttempts(table: LoginTable, id: string): Promise<void> {
  const t = LOGIN_TABLES[table];
  await prisma.$executeRaw(Prisma.sql`UPDATE ${t} SET "failedLoginAttempts" = 0, "lockoutUntil" = NULL WHERE "id" = ${id}`);
}

// Audit 2026-11-24 M8: the second-factor counter was read, then written as read + 1, so a burst of
// codes all counted as one; and /cam set it back to 0 on every right password, so 4 wrong codes, the
// password again, 4 more... never ran out. Each try is now claimed before the compare, against the
// exact code it is for, and only while tries remain. A right code is used up by a conditional write,
// so two requests with one code can't both sign in. Nothing resets the counter except a right code
// or running out (which also throws the code away, so a new one needs the password again — and new
// codes are capped per account, `SECOND_FACTOR_ISSUES_PER_HOUR`).
export const MAX_SECOND_FACTOR_ATTEMPTS = 5;
export const SECOND_FACTOR_ISSUES_PER_HOUR = 10;
export type SecondFactorAccount = 'operator' | 'admin';

type Where = { id: string; twoFactorCode?: string; twoFactorAttempts?: { lt: number } | { gte: number } };
type Data = Record<string, unknown>;
function updateMany(kind: SecondFactorAccount, where: Where, data: Data) {
  return kind === 'operator'
    ? prisma.courseOperator.updateMany({ where, data })
    : prisma.adminUser.updateMany({ where, data });
}

/** Take one try at `storedCode`. False: no tries left, or that code is gone (used, replaced or thrown away). */
export async function claimSecondFactorAttempt(kind: SecondFactorAccount, id: string, storedCode: string): Promise<boolean> {
  const r = await updateMany(kind, { id, twoFactorCode: storedCode, twoFactorAttempts: { lt: MAX_SECOND_FACTOR_ATTEMPTS } }, { twoFactorAttempts: { increment: 1 } });
  return r.count === 1;
}

/** After a wrong code: if that was the last try, the code is thrown away. True when it was. */
export async function spendSecondFactorIfOut(kind: SecondFactorAccount, id: string): Promise<boolean> {
  const r = await updateMany(kind, { id, twoFactorAttempts: { gte: MAX_SECOND_FACTOR_ATTEMPTS } }, { twoFactorCode: null, twoFactorCodeExpiry: null, twoFactorAttempts: 0 });
  return r.count > 0;
}

/** A right code: used up once, with `data` written in the same step. False: another request used it first. */
export async function useSecondFactorCode(kind: SecondFactorAccount, id: string, storedCode: string, data: Data): Promise<boolean> {
  const r = await updateMany(kind, { id, twoFactorCode: storedCode }, { ...data, twoFactorAttempts: 0 });
  return r.count === 1;
}

/** One more code (or authenticator step) for this account in the hour, or false when it has had its share. */
export async function mayIssueSecondFactor(kind: SecondFactorAccount, id: string): Promise<boolean> {
  return rateLimit(`2fa-issue:${kind}:${id}`, SECOND_FACTOR_ISSUES_PER_HOUR, 3600);
}
