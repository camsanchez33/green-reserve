// MEM-RENEW (Cam 2026-10-30: auto-renew "should be up to course decision and also has to send out
// like policies and stuff so they know they are on an auto charge"; consent "separate required
// box"; reminders "30 days yearly, 7 days monthly"; a declined renewal "up to course").
//
//  • A tier the course sets to renew automatically asks the golfer, when they pay the dues, to tick
//    a box agreeing to the terms below (autoRenewTermsText — the ONE place the wording lives). The
//    exact text they agreed to, when, and the card are kept on the membership; a confirmation email
//    repeats the terms with a way to turn it off.
//  • Reminder before each renewal: 30 days ahead for a yearly (or longer) term, 7 days for monthly or
//    shorter — amount, date, card ending, how to turn it off. A renewal is never charged until its
//    reminder has gone out (a reminder sent late pushes the charge back to keep the notice).
//  • On the renewal date the dues (no initiation) + GreenReserve's 1% are charged to the saved card
//    on the course's Stripe account — claimed first (duesChargeStartedAt), one charge per term
//    (the idempotency key is the term), on the ledger before anything else, then the term recorded
//    exactly as the pay link records it (lib/membership-dues recordPaidTerm).
//  • Declined: the golfer is emailed a pay link; if the tier says so the card is tried once more
//    3 days later. Unpaid, the membership lapses after its end date + the course's grace days.
//  • The golfer turns it off from the dues link in any of these emails; staff can turn it off too.
//    Nobody but the golfer turns it on. Turning it off never ends the membership early.
//
// LEGAL: the wording below was drafted to the common US automatic-renewal rules (clear terms before
// the first charge, affirmative consent, a reminder before each renewal, online cancellation). It
// has not been reviewed by a lawyer — Cam to have it read before a course turns auto-renew on.
import { prisma } from './prisma';
import { amountsDue, recordPaidTerm } from './membership-dues';
import { recordMove } from './money-ledger';

export const RETRY_DAYS = 3;
const DAY = 86_400_000;

/** Days before the renewal date the reminder goes out. */
export const reminderLeadDays = (termMonths: number) => (termMonths >= 12 ? 30 : termMonths <= 1 ? 7 : 14);

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const every = (m: number) => (m === 12 ? 'every year' : m === 1 ? 'every month' : `every ${m} months`);

/** What each renewal charges: the dues (no initiation) and GreenReserve's 1%. */
export function renewalCents(tier: { annualFeeCents: number }) {
  const d = amountsDue({ lastPaidAt: new Date(0), initiationWaived: true, tier: { annualFeeCents: tier.annualFeeCents, initiationFeeCents: 0 } });
  return { duesCents: d.duesCents, feeCents: d.feeCents, totalCents: d.totalCents };
}

/** The terms the golfer agrees to — shown beside the box, saved on the membership, emailed back. */
export function autoRenewTermsText(o: { courseName: string; tierName: string; termMonths: number; annualFeeCents: number }) {
  const r = renewalCents(o);
  const lead = reminderLeadDays(o.termMonths);
  return `Your ${o.tierName} membership at ${o.courseName} renews automatically. ${usd(r.totalCents)} (${usd(r.duesCents)} dues + ${usd(r.feeCents)} GreenReserve service fee) will be charged to this card ${every(o.termMonths)} on your renewal date until you turn automatic renewal off. We'll email you ${lead} days before each renewal. You can turn it off any time before then from the link in that email or in your membership emails; your membership then runs to the end of the period you've paid for. The price can change only if the course changes its dues, and you'll be told in the reminder.`;
}

// The real one is lib/stripe chargeOneIntent: ONE PaymentIntent per term (duesIntentId), shared with the pay link.
type Charger = (o: { existingIntentId: string; intentKey: string; onCreated: (id: string) => Promise<unknown>; customerId: string; paymentMethodId: string; connectedAccountId: string; amountCents: number; applicationFeeCents: number; description: string; metadata: Record<string, string> }) => Promise<{ id: string; amount: number; status: string; application_fee_amount?: number | null }>;

/** The one intent's key for a membership's next term (the pay link and the renewal share it). */
export const duesIntentKey = (id: string, lastPaidAt: Date | null) => `dues-intent-${id}-${lastPaidAt ? lastPaidAt.getTime() : 'first'}`;

/** What turning it off writes (also used when a course turns it off on a tier, or a member changes tier). */
export const STOP_DATA = () => ({ autoRenew: false, autoRenewCancelledAt: new Date(), autoRenewRetryAt: null, renewalRemindedAt: null, autoRenewRemindedFor: null, autoRenewRemindedCents: null });

/** Turn auto-renew off (the golfer, or staff). The membership runs to its end date. */
export async function stopAutoRenew(membershipId: string, courseId?: string): Promise<boolean> {
  // renewalRemindedAt cleared: the auto-renew reminder used it, and the ordinary pay-link reminder must still come this term.
  const done = await prisma.courseMembership.updateMany({ where: { id: membershipId, ...(courseId ? { courseId } : {}), autoRenew: true }, data: STOP_DATA() });
  return done.count > 0;
}

const DUE_SELECT = {
  id: true, courseId: true, startedAt: true, expiresAt: true, lastPaidAt: true, savedCustomerId: true, savedPaymentMethodId: true, autoRenewRemindedFor: true, autoRenewRetryAt: true, renewalRemindedAt: true, autoRenewRemindedCents: true,
  tier: { select: { name: true, annualFeeCents: true, termMonths: true, autoRenewRetry: true, autoRenew: true, active: true } },
  course: { select: { name: true, stripeAccountId: true, stripeAccountActive: true } },
  inviteName: true, inviteEmail: true, payToken: true, golfer: { select: { email: true, firstName: true, lastName: true } },
} as const;

/** Members whose renewal reminder is due now (sent once per term). */
export async function remindersDue(now = new Date()) {
  const rows = await prisma.courseMembership.findMany({
    // Only on a tier that still renews automatically (a member moved off it, or a tier switched off, is never charged).
    where: { autoRenew: true, status: 'active', tier: { autoRenew: true, active: true }, expiresAt: { gt: now, lte: new Date(now.getTime() + 30 * DAY) } },
    select: DUE_SELECT, take: 500,
  });
  // Due again when the amount changed since the last reminder (the course changed its dues): the golfer is told first.
  return rows.filter(r => r.tier && r.expiresAt && (!r.autoRenewRemindedFor || r.autoRenewRemindedFor.getTime() !== r.expiresAt.getTime() || r.autoRenewRemindedCents !== renewalCents(r.tier).totalCents)
    && r.expiresAt.getTime() - now.getTime() <= reminderLeadDays(r.tier.termMonths) * DAY);
}

/** Mark a term's reminder sent (after the email went). */
export const markReminded = (id: string, expiresAt: Date, totalCents: number, now = new Date()) => prisma.courseMembership.update({ where: { id }, data: { autoRenewRemindedFor: expiresAt, renewalRemindedAt: now, autoRenewRemindedCents: totalCents } });

/** Members to charge now: their renewal date has come and its reminder went out at least the lead time ago — or a retry is due. */
export async function chargesDue(now = new Date()) {
  const rows = await prisma.courseMembership.findMany({
    where: { autoRenew: true, status: 'active', tier: { autoRenew: true, active: true }, OR: [{ expiresAt: { lte: now }, autoRenewRetryAt: null, autoRenewFailedAt: null }, { autoRenewRetryAt: { lte: now } }] },
    select: DUE_SELECT, take: 200,
  });
  // The reminder went out for this term, and its full notice has run (a late reminder pushes the charge back; 12h slack for the daily run).
  return rows.filter(r => r.tier && r.expiresAt && r.autoRenewRemindedFor && r.autoRenewRemindedFor.getTime() === r.expiresAt.getTime()
    && r.autoRenewRemindedCents === renewalCents(r.tier).totalCents
    && !!r.renewalRemindedAt && now.getTime() - r.renewalRemindedAt.getTime() >= reminderLeadDays(r.tier.termMonths) * DAY - 12 * 3_600_000);
}

export type RenewResult = { status: 'paid'; amountCents: number; expiresAt: Date | null } | { status: 'declined'; error: string; retry: boolean } | { status: 'skipped'; why: string };

/**
 * Charge one renewal. Claims the membership first (the pay link uses the same claim), charges the
 * saved card once per term, puts the money on the ledger, then records the term.
 */
export async function chargeRenewal(membershipId: string, charge: Charger, now = new Date()): Promise<RenewResult> {
  const m = await prisma.courseMembership.findUnique({ where: { id: membershipId }, select: { ...DUE_SELECT, status: true, autoRenew: true, autoRenewFailedAt: true, initiationWaived: true } });
  if (!m || !m.tier || !m.autoRenew || m.status !== 'active' || !m.tier.autoRenew || !m.tier.active) return { status: 'skipped', why: 'not on auto-renew' };
  // Charged only the amount the golfer was reminded of; a changed price waits for a new reminder.
  if (m.autoRenewRemindedCents !== renewalCents(m.tier).totalCents) return { status: 'skipped', why: 'amount changed since the reminder' };
  if (!m.course.stripeAccountActive || !m.course.stripeAccountId) return { status: 'skipped', why: 'course not taking payments' };
  if (!m.savedCustomerId || !m.savedPaymentMethodId) return { status: 'skipped', why: 'no saved card' };
  const claimed = await prisma.courseMembership.updateMany({ where: { id: m.id, status: 'active', autoRenew: true, OR: [{ duesChargeStartedAt: null }, { duesChargeStartedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }] }, data: { duesChargeStartedAt: now } });
  if (!claimed.count) return { status: 'skipped', why: 'being paid now' };
  const release = () => prisma.courseMembership.updateMany({ where: { id: m.id, duesChargeStartedAt: now }, data: { duesChargeStartedAt: null } });
  // Paid since (the pay link, or cash at the shop): nothing to charge.
  const cur = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id }, select: { lastPaidAt: true, expiresAt: true, duesIntentId: true } });
  if (cur.expiresAt && cur.expiresAt.getTime() > now.getTime()) { await release(); return { status: 'skipped', why: 'already renewed' }; }
  const r = renewalCents(m.tier);
  let pi: { id: string; amount: number; status: string; application_fee_amount?: number | null };
  try {
    pi = await charge({
      // One intent per term, shared with the pay link: a retry, a timeout or the member paying by link can never be a second charge.
      existingIntentId: cur.duesIntentId, intentKey: duesIntentKey(m.id, cur.lastPaidAt),
      onCreated: id => prisma.courseMembership.update({ where: { id: m.id }, data: { duesIntentId: id } }),
      customerId: m.savedCustomerId, paymentMethodId: m.savedPaymentMethodId, connectedAccountId: m.course.stripeAccountId,
      amountCents: r.totalCents, applicationFeeCents: r.feeCents,
      description: `Membership renewal - ${m.tier.name} - ${m.course.name}`,
      metadata: { membershipId: m.id, autoRenew: 'true' },
    });
  } catch (err) {
    const retry = m.tier.autoRenewRetry && !m.autoRenewFailedAt;
    await prisma.courseMembership.update({ where: { id: m.id }, data: { duesChargeStartedAt: null, autoRenewFailedAt: now, autoRenewRetryAt: retry ? new Date(now.getTime() + RETRY_DAYS * DAY) : null } });
    return { status: 'declined', error: err instanceof Error ? err.message : 'Card declined', retry };
  }
  // Still settling at Stripe: keep the claim; the next run (or the pay link) reads the same intent.
  if (pi.status === 'processing') return { status: 'skipped', why: 'payment processing' };
  if (pi.status !== 'succeeded') {
    // Not a definite success (e.g. needs the golfer): treat as declined — no term until it's paid.
    const retry = m.tier.autoRenewRetry && !m.autoRenewFailedAt;
    await prisma.courseMembership.update({ where: { id: m.id }, data: { duesChargeStartedAt: null, autoRenewFailedAt: now, autoRenewRetryAt: retry ? new Date(now.getTime() + RETRY_DAYS * DAY) : null } });
    return { status: 'declined', error: `The card needs the member (${pi.status}).`, retry };
  }
  await recordMove({ courseId: m.courseId, what: 'dues', direction: 'in', method: 'card', account: 'course', amountCents: pi.amount, platformFeeCents: pi.application_fee_amount ?? r.feeCents, stripeId: pi.id, membershipId: m.id, actor: 'system', note: `${m.tier.name} renewed automatically` });
  const ok = await recordPaidTerm({ id: m.id, startedAt: m.startedAt, termMonths: m.tier.termMonths }, cur, pi.id, { autoRenewFailedAt: null, autoRenewRetryAt: null });
  if (!ok) { await release(); console.error(JSON.stringify({ ev: 'membership.renew.term_changed', membershipId: m.id, paymentIntentId: pi.id })); }
  const after = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id }, select: { expiresAt: true } });
  return { status: 'paid', amountCents: pi.amount, expiresAt: after.expiresAt };
}

/** Who a membership email goes to: the account's email first (lib/membership-pay-link). */
export const memberContact = (m: { inviteName: string; inviteEmail: string; golfer: { email: string; firstName: string; lastName: string } | null }) => ({
  email: m.golfer?.email || m.inviteEmail,
  name: m.inviteName || [m.golfer?.firstName, m.golfer?.lastName].filter(Boolean).join(' '),
});
