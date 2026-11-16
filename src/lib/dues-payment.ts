// Membership dues paid with a typed card — ONE path for the golfer's pay link (api/membership/[id]) and staff typing
// the card at the course (Memberships item 1, Cam 2026-11-16: "Type a card (Stripe's own fields)"). Moved here from
// the pay-link route unchanged in what it does:
//
//  LEDGER-1 (Cam 2026-10-30): claim the membership (one payment at a time), charge outside any transaction, put the
//  money on the ledger, then record the term. ONE intent per term (lib/stripe chargeOneIntent), shared with the
//  automatic renewal: a retry with any card, a second tab or a lost reply can never be a second charge. Audit
//  2026-10-31: charge only the total that was shown (expectedTotalCents), and only under the renewal terms ticked.
//
// Staff never turn on automatic renewal for a member (MEM-RENEW: only the golfer agrees to it, with the box), so a
// staff payment on a tier that renews automatically is a plain one-term payment.
import { prisma } from './prisma';
import { stripe, chargeOneIntent } from './stripe';
import { recordMove } from './money-ledger';
import { paidUntilRenewal } from './membership-renewal';
import { amountsDue, recordPaidTerm } from './membership-dues';
import { autoRenewTermsText, duesIntentKey } from './membership-autorenew';
import { settleStaleDuesReader } from './dues-reader';
import { termOf, passOnSale, ledgerWhat, isPassTier, PASS_OVER } from './season-pass';
import { todayIn } from './course-time';

/** A dues claim older than this is from a request that died; a new payment may take over. */
const DUES_CLAIM_STALE_MS = 10 * 60_000;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
export type CardPaid = { ok: true; chargedCents: number; feeCents: number; initiationCents: number; recorded: boolean; expiresAt: Date | null; autoRenewOn: boolean; firstPayment: boolean };

export async function payDuesByCard(opts: {
  membershipId: string;
  /** Staff: the session's course — a membership of another course is not found. */
  courseId?: string;
  paymentMethodId: unknown;
  expectedTotalCents: unknown;
  by: 'golfer' | 'staff';
  /** Golfer only: the renewal box and the terms it showed. */
  autoRenewConsent?: unknown;
  autoRenewTerms?: unknown;
}): Promise<CardPaid | Fail> {
  const m = await prisma.courseMembership.findFirst({
    where: { id: opts.membershipId, ...(opts.courseId ? { courseId: opts.courseId } : {}) },
    include: { tier: true, course: { select: { name: true, stripeAccountId: true, stripeAccountActive: true, timezone: true } } },
  });
  if (!m) return fail(404, 'Not found');
  const paymentMethodId = typeof opts.paymentMethodId === 'string' ? opts.paymentMethodId : '';
  if (!paymentMethodId) return fail(400, 'Missing payment details.');
  if (!m.course.stripeAccountActive || !m.course.stripeAccountId) {
    return fail(422, opts.by === 'golfer' ? 'This course is not set up for online payments yet — please pay at the pro shop.' : 'Connect Stripe on Revenue → Payouts before taking cards.');
  }
  if (amountsDue(m).duesCents <= 0) return fail(409, 'Nothing due on this membership.');
  // Memberships item 4: a season pass is sold until its last day, and ends on it whenever it is paid.
  const term = termOf(m.tier);
  if (!passOnSale(term, todayIn(m.course.timezone))) return fail(409, PASS_OVER);
  // MEM-RENEW: a tier that renews automatically is paid by the golfer only with their agreement to its terms (the
  // required box). A season pass never renews.
  const renews = opts.by === 'golfer' && !!m.tier?.autoRenew && !isPassTier(m.tier);
  const autoTerms = renews && m.tier ? autoRenewTermsText({ courseName: m.course.name, tierName: m.tier.name, termMonths: m.tier.termMonths, annualFeeCents: m.tier.annualFeeCents }) : '';
  if (renews && opts.autoRenewConsent !== true) return fail(400, 'This membership renews automatically — tick the box to agree to the renewal terms.');

  // Dues left on the card reader 10 minutes: settle them from Stripe first (lib/dues-reader).
  await settleStaleDuesReader(m);
  const startedAt = new Date();
  const claimed = await prisma.courseMembership.updateMany({
    // MEM-JOIN / item 1: a golfer who joined online, or a member added at the course, is 'awaiting_payment' until paid.
    where: { id: m.id, status: { in: ['active', 'awaiting_payment'] }, duesReaderId: '', OR: [{ duesChargeStartedAt: null }, { duesChargeStartedAt: { lt: new Date(Date.now() - DUES_CLAIM_STALE_MS) } }] },
    data: { duesChargeStartedAt: startedAt },
  });
  if (!claimed.count) {
    const s = await prisma.courseMembership.findUnique({ where: { id: m.id }, select: { status: true, duesReaderId: true } });
    if (s?.status !== 'active' && s?.status !== 'awaiting_payment') return fail(409, 'This membership is no longer active — please contact the course.');
    return fail(409, s?.duesReaderId ? 'These dues are being paid on the course’s card reader — wait a moment and refresh.' : 'These dues are being paid right now — wait a moment and refresh.');
  }
  const release = () => prisma.courseMembership.updateMany({ where: { id: m.id, duesChargeStartedAt: startedAt }, data: { duesChargeStartedAt: null } });
  const now = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id }, select: { paymentStatus: true, expiresAt: true, lastPaidAt: true, duesIntentId: true } });
  // A paid membership can only be paid again within its renewal window (30 days of expiry) — no double-pays from old emails.
  if (paidUntilRenewal(now, term)) {
    await release();
    return fail(409, 'These dues are already paid — nothing due until renewal.');
  }
  // What is due is worked out from the row as it is now, under the claim.
  const due = amountsDue({ ...m, lastPaidAt: now.lastPaidAt });
  // A price or term edited while the page was open is a refresh, never a surprise charge.
  if (Number(opts.expectedTotalCents) !== due.totalCents || (renews && opts.autoRenewTerms !== autoTerms)) {
    await release();
    return fail(409, 'The amount or terms changed since this page loaded — refresh to see them.');
  }

  let paymentIntentId: string;
  let chargedCents: number;
  let chargedFeeCents: number;
  let customerId = '';
  try {
    const customer = await stripe.customers.create({
      email: m.inviteEmail,
      name: m.inviteName,
      metadata: { membershipId: m.id, source: opts.by === 'staff' ? 'membership_dues_counter' : 'membership_dues' },
    });
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    customerId = customer.id;
    const pi = await chargeOneIntent({
      existingIntentId: now.duesIntentId, intentKey: duesIntentKey(m.id, now.lastPaidAt),
      onCreated: intentId => prisma.courseMembership.update({ where: { id: m.id }, data: { duesIntentId: intentId } }),
      customerId: customer.id,
      paymentMethodId,
      connectedAccountId: m.course.stripeAccountId,
      amountCents: due.totalCents,
      applicationFeeCents: due.feeCents,
      description: `${isPassTier(m.tier) ? 'Season pass' : 'Membership dues'} - ${m.tier?.name ?? m.membershipType} - ${m.course.name}`,
      metadata: { membershipId: m.id },
    });
    if (pi.status === 'processing') {
      // Still settling at Stripe: the claim stays, so nothing can be paid twice meanwhile.
      return fail(409, opts.by === 'golfer' ? 'Your bank is still processing this payment. Please don’t pay again — check back in a few minutes.' : 'The bank is still processing this payment. Don’t take it again — check back in a few minutes.');
    }
    if (pi.status !== 'succeeded') { await release(); return fail(402, 'Payment failed: the card needs another step this page can’t do — try another card.'); }
    paymentIntentId = pi.id;
    chargedCents = pi.amount;
    // What Stripe actually took for GreenReserve (a payment recovered after the dues changed keeps its own fee).
    chargedFeeCents = pi.application_fee_amount ?? due.feeCents;
  } catch (err) {
    await release();
    const message = err instanceof Error ? err.message : 'Card could not be charged.';
    return fail(402, `Payment failed: ${message}`);
  }
  // The money moved: on the ledger first, so nothing after this can lose it.
  await recordMove({ courseId: m.courseId, what: ledgerWhat(m.tier), direction: 'in', method: 'card', account: 'course', amountCents: chargedCents, platformFeeCents: chargedFeeCents, stripeId: paymentIntentId, membershipId: m.id, actor: opts.by, note: `${m.tier?.name ?? m.membershipType}${due.initiationCents ? ' + initiation' : ''}${opts.by === 'staff' ? ' (card typed at the course)' : ''}` });

  // MEM-RENEW: with the golfer's agreement, keep the card and the exact terms; any earlier declined renewal is settled.
  const autoRenewData = renews
    ? { autoRenew: true, autoRenewConsentAt: new Date(), autoRenewTerms: autoTerms, savedCustomerId: customerId, savedPaymentMethodId: paymentMethodId, autoRenewCancelledAt: null, autoRenewFailedAt: null, autoRenewRetryAt: null }
    : { autoRenewFailedAt: null, autoRenewRetryAt: null };
  const recorded = await recordPaidTerm({ id: m.id, startedAt: m.startedAt, term }, now, paymentIntentId, autoRenewData);
  if (!recorded) {
    await release();
    console.error(JSON.stringify({ ev: 'membership.pay.term_changed', membershipId: m.id, paymentIntentId }));
  }
  const updated = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id }, select: { expiresAt: true } });
  return { ok: true, chargedCents, feeCents: due.feeCents, initiationCents: due.initiationCents, recorded, expiresAt: updated.expiresAt, autoRenewOn: renews, firstPayment: !now.lastPaidAt };
}
