// Membership dues: what a term costs and how a paid term is recorded. ONE place, used by the dues
// pay link (api/membership/[id]) and MEM-RENEW's automatic renewal charge (lib/membership-autorenew),
// so a term is always priced and extended the same way.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { stripe, membershipFeeCents } from './stripe';
import { recordMove } from './money-ledger';

/** Initiation is only owed on the first payment ever — never by a member who
 *  joined before the course came to GreenReserve (imported, initiationWaived). */
export function amountsDue(m: { lastPaidAt: Date | null; initiationWaived: boolean; tier: { annualFeeCents: number; initiationFeeCents: number } | null }) {
  // MP-3 B2a: this used to multiply dollars by 100 to reach cents. The columns
  // ARE cents now, so that multiplication would have charged 100x — exactly the
  // silent failure the rename exists to make impossible.
  const annualCents = m.tier?.annualFeeCents ?? 0;
  const initiationCents = m.lastPaidAt || m.initiationWaived ? 0 : (m.tier?.initiationFeeCents ?? 0);
  const duesCents = annualCents + initiationCents;
  // The 1% rides on top: the course receives its full dues, the member pays dues + fee.
  const feeCents = membershipFeeCents(duesCents);
  return { annualCents, initiationCents, duesCents, feeCents, totalCents: duesCents + feeCents };
}


/**
 * Record a paid term. It extends from the end date when renewing early, from today otherwise; a
 * first payment (nothing paid before) always starts today — the end date typed when the member was
 * added is not a paid term (Cam 2026-10-29: it paid two terms). One plain update, only if the term is
 * still the one charged for: a replayed charge the first try already recorded is not a second term.
 * Returns false when it wasn't (the caller logs it). MEM-JOIN: a paid online join becomes active.
 */
export async function recordPaidTerm(
  m: { id: string; startedAt: Date | null; termMonths: number },
  now: { lastPaidAt: Date | null; expiresAt: Date | null },
  paymentIntentId: string,
  extra: Prisma.CourseMembershipUpdateManyMutationInput = {},
): Promise<boolean> {
  const base = now.lastPaidAt && now.expiresAt && now.expiresAt.getTime() > Date.now() ? new Date(now.expiresAt) : new Date();
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + m.termMonths);
  const recorded = await prisma.courseMembership.updateMany({
    where: { id: m.id, lastPaidAt: now.lastPaidAt },
    data: {
      paymentStatus: 'paid',
      status: 'active',
      startedAt: m.startedAt ?? new Date(),
      lastPaidAt: new Date(),
      lastPaymentIntentId: paymentIntentId,
      expiresAt: newExpiry,
      renewalRemindedAt: null,
      duesChargeStartedAt: null,
      duesIntentId: '',
      ...extra,
    },
  });
  return recorded.count > 0;
}

const STALE_MS = 10 * 60_000;
type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

/**
 * Staff: dues paid at the course (cash or check). LEDGER-2: what staff actually took, and how — without
 * an amount (an older screen) it is what was due. MEM-ACCT hardening (Cam 2026-10-31): one payment at a
 * time — the dues are claimed like the pay link and the renewal do; a card payment already started is
 * asked about (paid → recorded as card, no cash taken; still processing → refused) and otherwise stopped,
 * so it can never go through after; then the term is recorded under the claim in one write, and the cash
 * goes on the ledger.
 */
export async function markDuesPaidAtCourse(courseId: string, membershipId: string, input: { amountCents?: unknown; method?: unknown }, now = new Date()): Promise<{ ok: true } | Fail> {
  const membership = await prisma.courseMembership.findFirst({ where: { id: membershipId, courseId }, include: { tier: true, course: { select: { stripeAccountId: true } } } });
  if (!membership) return fail(404, 'Not found');
  const termMonths = membership.tier?.termMonths ?? 12;
  // A first payment starts today; only a renewal extends from the end date (Cam 2026-10-29).
  const base = membership.lastPaidAt && membership.expiresAt && membership.expiresAt.getTime() > now.getTime() ? new Date(membership.expiresAt) : new Date(now);
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + termMonths);
  const dueCents = (membership.tier?.annualFeeCents ?? 0) + (membership.lastPaidAt || membership.initiationWaived ? 0 : (membership.tier?.initiationFeeCents ?? 0));
  const takenCents = input.amountCents === undefined || input.amountCents === null || input.amountCents === '' ? dueCents : Number(input.amountCents);
  if (!Number.isInteger(takenCents) || takenCents < 1 || takenCents > 10_000_000) return fail(400, 'Enter the amount taken (up to $100,000).');
  const method = input.method === 'check' ? 'check' : input.method === 'cash' || input.method === undefined ? 'cash' : null;
  if (!method) return fail(400, 'Say whether it was cash or a check.');

  const claimed = await prisma.courseMembership.updateMany({ where: { id: membershipId, courseId, OR: [{ duesChargeStartedAt: null }, { duesChargeStartedAt: { lt: new Date(now.getTime() - STALE_MS) } }] }, data: { duesChargeStartedAt: now } });
  if (!claimed.count) return fail(409, 'A card payment for these dues is going through — wait a few minutes.');
  const release = () => prisma.courseMembership.updateMany({ where: { id: membershipId, duesChargeStartedAt: now }, data: { duesChargeStartedAt: null } });
  const fresh = await prisma.courseMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { duesIntentId: true } });
  if (fresh.duesIntentId && membership.course.stripeAccountId) {
    const acct = { stripeAccount: membership.course.stripeAccountId };
    let pi;
    try { pi = await stripe.paymentIntents.retrieve(fresh.duesIntentId, {}, acct); }
    catch (err) { await release(); return fail(502, `Couldn’t check the card payment (${err instanceof Error ? err.message : 'Stripe error'}) — try again.`); }
    if (pi.status === 'succeeded') {
      // Paid by card but not yet recorded (a reply lost on the way back): record it now, take no cash.
      await recordMove({ courseId, what: 'dues', direction: 'in', method: 'card', account: 'course', amountCents: pi.amount, platformFeeCents: pi.application_fee_amount ?? 0, stripeId: pi.id, membershipId, actor: 'system', note: 'paid by card (found when taking cash)' });
      await recordPaidTerm({ id: membershipId, startedAt: membership.startedAt, termMonths }, { lastPaidAt: membership.lastPaidAt, expiresAt: membership.expiresAt }, pi.id, { autoRenewFailedAt: null, autoRenewRetryAt: null });
      await release();
      return fail(409, 'These dues were just paid by card — nothing to take. Refresh to see it.');
    }
    if (pi.status === 'processing') { await release(); return fail(409, 'A card payment for these dues is still going through — wait a few minutes.'); }
    if (pi.status !== 'canceled') {
      try { await stripe.paymentIntents.cancel(pi.id, {}, acct); }
      catch (err) { await release(); return fail(502, `Couldn’t stop the card payment (${err instanceof Error ? err.message : 'Stripe error'}) — nothing was changed. Try again.`); }
    }
  }
  // The term is recorded under the claim, in one write, so no card payment can start in between.
  const marked = await prisma.courseMembership.updateMany({
    where: { id: membershipId, duesChargeStartedAt: now },
    data: {
      duesChargeStartedAt: null, duesIntentId: '',
      paymentStatus: 'paid_offline',
      status: 'active',
      startedAt: membership.startedAt ?? now,
      lastPaidAt: now,
      expiresAt: newExpiry,
      renewalRemindedAt: null,
      // MEM-RENEW: paid — any declined automatic renewal is settled, so the next term renews as agreed.
      autoRenewFailedAt: null,
      autoRenewRetryAt: null,
    },
  });
  if (!marked.count) return fail(409, 'These dues just changed — refresh and look again.');
  await recordMove({ courseId, what: 'dues', direction: 'in', method: method === 'cash' ? 'cash' : 'other', account: 'course', amountCents: takenCents, membershipId, actor: 'staff', note: method === 'check' ? 'check at the course' : 'cash at the course' });
  return { ok: true };
}
