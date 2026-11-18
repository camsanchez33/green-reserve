// Log in with a code (Cam 2026-11-18, GOLFER-LOGIN-1, lanes/golfer.md item 2): the per-course "Log in" emails a
// 6-digit code that works for 10 minutes. One live code per course and email: a new one cancels the last. A code is
// used once and dies after MAX_TRIES wrong guesses. Codes are stored as an HMAC under the server secret, so a copy
// of the table can't be turned back into codes by trying all million.
// The first log-in at a course needs the terms box (MemberTermsAgreement, one row per version): the server asks for
// it only after a correct code, so the question never tells anyone whether an email is on a course's list.
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_TRIES = 5;

const rawSecret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
if (!rawSecret) throw new Error('JWT_SECRET is not set — refusing to issue member log-in codes in production');
const KEY = `member-login-code:${rawSecret}`;

const norm = (email: string) => email.trim().toLowerCase();
function hashCode(courseId: string, email: string, code: string): string {
  return createHmac('sha256', KEY).update(`${courseId}\n${norm(email)}\n${code}`).digest('hex');
}

/** A fresh code for this course and email; any unused earlier one stops working. Returns the code to email. */
export async function issueLoginCode(courseId: string, email: string, now = new Date()): Promise<string> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const e = norm(email);
  await prisma.$transaction([
    prisma.memberLoginCode.updateMany({ where: { courseId, email: e, usedAt: null }, data: { usedAt: now } }),
    prisma.memberLoginCode.create({ data: { courseId, email: e, codeHash: hashCode(courseId, e, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) } }),
  ]);
  return code;
}

export type CheckResult = { ok: true; codeId: string } | { ok: false };

/**
 * Whether `code` is this course's live code for this email. A wrong guess counts a try (the last allowed one ends
 * the code). A right one is NOT used up here: the caller uses it (useLoginCode) once the terms question is settled.
 */
export async function checkLoginCode(courseId: string, email: string, codeRaw: string, now = new Date()): Promise<CheckResult> {
  const code = String(codeRaw ?? '').replace(/\D/g, '');
  const e = norm(email);
  const row = await prisma.memberLoginCode.findFirst({ where: { courseId, email: e, usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } });
  if (!row) return { ok: false };
  const want = Buffer.from(row.codeHash, 'hex');
  const got = Buffer.from(hashCode(courseId, e, code), 'hex');
  if (code.length === 6 && want.length === got.length && timingSafeEqual(want, got)) return { ok: true, codeId: row.id };
  // Counted atomically, so parallel guesses can't each see the same count.
  const tries = await prisma.memberLoginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
  if (tries.attempts >= MAX_TRIES) await prisma.memberLoginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  return { ok: false };
}

/** Uses the code up; false when someone else used it first (two taps of Log in). */
export async function useLoginCode(codeId: string, now = new Date()): Promise<boolean> {
  const r = await prisma.memberLoginCode.updateMany({ where: { id: codeId, usedAt: null }, data: { usedAt: now } });
  return r.count === 1;
}

/** Whether this email has agreed to `version` of the terms for this course. */
export async function hasAgreed(courseId: string, email: string, version: string): Promise<boolean> {
  return !!(await prisma.memberTermsAgreement.findUnique({ where: { courseId_email_version: { courseId, email: norm(email), version } }, select: { id: true } }));
}

/** Records the first-log-in terms tick (idempotent per version). */
export async function recordAgreement(courseId: string, email: string, version: string, ip: string): Promise<void> {
  await prisma.memberTermsAgreement.upsert({
    where: { courseId_email_version: { courseId, email: norm(email), version } },
    create: { courseId, email: norm(email), version, ip: ip.slice(0, 64) },
    update: {},
  });
}
