// Cam 2026-10-27 (onboarding walk): "change the whole email structure and make it
// just the set your password, and then in there they can be prompted to approve
// their golfer-facing page along with other things."
//
// A course owner is never emailed a password. Every "here's your dashboard" email
// (build, resend welcome, dashboard access, preview) carries ONE single-use link
// that opens /dashboard/reset-password in setup mode. Setting the password there
// confirms the email (the link proves the inbox) and signs them in when their
// sign-in codes go to that same inbox. The Getting Started list takes it from there.
//
// The link reuses the reset-password columns (resetToken / resetTokenExpiry):
// 32 random bytes, single use (cleared on use), expiring after SETUP_LINK_DAYS.
// A later setup or forgot-password email replaces it, so only the newest works.
import { randomBytes } from 'crypto';
import { prisma } from './prisma';

export const SETUP_LINK_DAYS = 7;

/** Mint a fresh setup link for this owner. The current password is left alone. */
export async function issueSetupLink(operatorId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.courseOperator.update({
    where: { id: operatorId },
    data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + SETUP_LINK_DAYS * 86_400_000) },
  });
  return `${process.env.NEXT_PUBLIC_URL || ''}/dashboard/reset-password?token=${token}&setup=1`;
}

/**
 * Has this owner already got into their dashboard? Then a preview or access email
 * must not touch their sign-in — it says "it's in your dashboard" instead of
 * sending a setup link. (The old preview email reset the password every time,
 * locking out an owner who had chosen their own.)
 * Signed in at least once: lastLoginAt is stamped on every completed sign-in, the
 * setup link's included. NOT emailVerified — the admin "create course" route sets
 * that at creation, before the owner has a password.
 */
export function hasSetUp(op: { lastLoginAt: Date | null }): boolean {
  return !!op.lastLoginAt;
}
