// Memberships item 1 (Cam 2026-11-16, "payment by Card reader, Cash or Type a card … they are a member only once
// paid"): a membership's dues paid on the course's card reader. Like a round on the reader (lib/reader-rounds), it
// is ONE card_present PaymentIntent on the course's account for what the pay link would charge (dues + the 1%
// GreenReserve fee as the application fee, lib/membership-dues amountsDue), and the term is recorded exactly as
// every dues payment records it (recordPaidTerm), ledger first.
//
// While the dues are on the reader the membership is CLAIMED: duesChargeStartedAt is the claim's stamp,
// duesReaderId says it is the reader's, and duesIntentId is the reader's intent. The pay link, the automatic
// renewal and cash at the counter all refuse a membership with duesReaderId set (their claims require it empty),
// so nothing else can be paid meanwhile. The claim ends paid, or — only once Stripe says the intent is unpaid and
// it has been cancelled — released, so a later tap can never pay it. A claim left 10 minutes is settled from
// Stripe by whatever touches the dues next (settleDuesReader).
//
// The register gate (DRAWER-1: the reader is the register's) is the route's, as for rounds on the reader.
import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { courseStripe, ownReader, stripeMessage } from './card-reader';
import { amountsDue, recordPaidTerm } from './membership-dues';
import { paidUntilRenewal } from './membership-renewal';
import { recordMove } from './money-ledger';
import { afterDuesPaid } from './member-welcome';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
export type DuesReaderStatus = { status: 'waiting' | 'paid' | 'declined' | 'cancelled' | 'open'; message?: string; dueCents?: number;
  /** This call recorded the paid term (exactly one call does): the caller sends the receipt. */
  recorded?: { amountCents: number; feeCents: number; firstPayment: boolean } };

export const DUES_READER_STALE_MS = 10 * 60_000;
const STARTABLE = ['active', 'awaiting_payment'];

/** End this claim (only the claim with this stamp). The intent stays in duesIntentId: it is cancelled or paid by now. */
async function release(membershipId: string, stamp: Date) {
  await prisma.courseMembership.updateMany({ where: { id: membershipId, duesChargeStartedAt: stamp, duesReaderId: { not: '' } }, data: { duesChargeStartedAt: null, duesReaderId: '' } });
}

/** The tap went through: the money on the ledger first, then the term (the same write as every dues payment). */
async function finalize(membershipId: string, pi: Stripe.PaymentIntent, stamp: Date, actor: string): Promise<DuesReaderStatus> {
  const m = await prisma.courseMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { courseId: true, startedAt: true, lastPaidAt: true, expiresAt: true, lastPaymentIntentId: true, membershipType: true, tier: { select: { name: true, termMonths: true } } } });
  await recordMove({ courseId: m.courseId, what: 'dues', direction: 'in', method: 'card_present', account: 'course', amountCents: pi.amount, platformFeeCents: pi.application_fee_amount ?? 0, stripeId: pi.id, membershipId, actor: 'staff', note: `${m.tier?.name ?? m.membershipType} on the card reader${actor ? ` (${actor.slice(0, 80)})` : ''}` });
  let recorded: DuesReaderStatus['recorded'];
  if (m.lastPaymentIntentId !== pi.id) {
    const ok = await recordPaidTerm({ id: membershipId, startedAt: m.startedAt, termMonths: m.tier?.termMonths ?? 12 }, { lastPaidAt: m.lastPaidAt, expiresAt: m.expiresAt }, pi.id, { autoRenewFailedAt: null, autoRenewRetryAt: null });
    if (ok) recorded = { amountCents: pi.amount, feeCents: pi.application_fee_amount ?? 0, firstPayment: !m.lastPaidAt };
    else console.error(JSON.stringify({ ev: 'dues_reader.term_changed', membershipId, paymentIntentId: pi.id }));
  }
  // recordPaidTerm ended the claim with the term; this ends it if the term was already recorded.
  await release(membershipId, stamp);
  return { status: 'paid', ...(recorded ? { recorded } : {}) };
}

/**
 * Put a membership's dues on a reader. Refused while anything else is paying them, when nothing is due, or when they
 * are paid until the renewal window (the pay link's rule). A card intent left from an earlier pay-link attempt is
 * asked about first: paid → recorded, never charged again; still processing → refused; otherwise stopped.
 */
export async function startDuesOnReader(courseId: string, membershipId: string, readerId: string, actor: string): Promise<Result<DuesReaderStatus>> {
  const c = await courseStripe(courseId);
  if (!c.ok) return c;
  let m = await prisma.courseMembership.findFirst({ where: { id: membershipId, courseId }, select: { status: true, duesReaderId: true, duesChargeStartedAt: true } });
  if (!m) return fail(404, 'That member isn’t on your list — refresh and try again.');
  if (m.duesReaderId && m.duesChargeStartedAt && Date.now() - m.duesChargeStartedAt.getTime() > DUES_READER_STALE_MS) {
    await settleDuesReader(courseId, membershipId, actor);
    m = await prisma.courseMembership.findFirst({ where: { id: membershipId, courseId }, select: { status: true, duesReaderId: true, duesChargeStartedAt: true } });
    if (!m) return fail(404, 'That member isn’t on your list — refresh and try again.');
  }
  if (m.duesReaderId) return fail(409, 'These dues are already on the card reader — wait for it, or cancel it.');
  if (!STARTABLE.includes(m.status)) return fail(409, 'This membership isn’t active — set it to active before taking dues.');
  const reader = await ownReader(c.value.account, c.value.terminalLocationId, readerId);
  if (!reader.ok) return reader;

  const stamp = new Date();
  const claimed = await prisma.courseMembership.updateMany({
    where: { id: membershipId, courseId, status: { in: STARTABLE }, duesReaderId: '', OR: [{ duesChargeStartedAt: null }, { duesChargeStartedAt: { lt: new Date(stamp.getTime() - DUES_READER_STALE_MS) } }] },
    data: { duesChargeStartedAt: stamp, duesReaderId: readerId },
  });
  if (!claimed.count) return fail(409, 'A payment for these dues is going through — wait a few minutes.');
  const full = await prisma.courseMembership.findUniqueOrThrow({ where: { id: membershipId }, include: { tier: true } });
  const termMonths = full.tier?.termMonths ?? 12;
  if (paidUntilRenewal(full, termMonths)) { await release(membershipId, stamp); return fail(409, 'These dues are already paid — nothing due until renewal.'); }
  const due = amountsDue(full);
  if (due.duesCents <= 0) { await release(membershipId, stamp); return fail(409, 'Nothing is due on this membership.'); }
  if (due.totalCents < 50) { await release(membershipId, stamp); return fail(400, 'Card payments start at $0.50 — take this one as cash.'); }
  const acct = { stripeAccount: c.value.account };

  // A card intent from an earlier attempt (the pay link): never let it charge after this one.
  if (full.duesIntentId) {
    let old: Stripe.PaymentIntent;
    try { old = await stripe.paymentIntents.retrieve(full.duesIntentId, {}, acct); }
    catch (err) { await release(membershipId, stamp); return fail(502, stripeMessage(err, 'Couldn’t check the earlier card payment — try again.')); }
    if (old.status === 'succeeded') {
      await finalizeCard(membershipId, old);
      await release(membershipId, stamp);
      return fail(409, 'These dues were just paid by card — nothing to take. Refresh to see it.');
    }
    if (old.status === 'processing') { await release(membershipId, stamp); return fail(409, 'A card payment for these dues is still going through — wait a few minutes.'); }
    if (old.status !== 'canceled') {
      try { await stripe.paymentIntents.cancel(old.id, {}, acct); }
      catch (err) { await release(membershipId, stamp); return fail(502, stripeMessage(err, 'Couldn’t stop the earlier card payment — nothing was changed. Try again.')); }
    }
  }

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: due.totalCents, currency: 'usd', payment_method_types: ['card_present'],
      application_fee_amount: due.feeCents > 0 ? due.feeCents : undefined,
      description: `Membership dues - ${full.tier?.name ?? full.membershipType} - ${c.value.name}`,
      metadata: { membershipId, source: 'card_reader' },
    }, { ...acct, idempotencyKey: `reader-dues-${membershipId}-${stamp.getTime()}` });
  } catch (err) {
    await release(membershipId, stamp); // no intent → nothing can be charged
    return fail(502, stripeMessage(err, 'Card payments are not working right now — try again, or take cash.'));
  }
  const stored = await prisma.courseMembership.updateMany({ where: { id: membershipId, duesChargeStartedAt: stamp, duesReaderId: readerId }, data: { duesIntentId: pi.id } });
  if (!stored.count) {
    // The claim ended meanwhile (cancelled while this was starting): never send an unclaimed payment to the reader.
    await stripe.paymentIntents.cancel(pi.id, {}, acct).catch(() => {});
    return fail(409, 'This was cancelled while it was starting — nothing was charged. Try again.');
  }
  try {
    await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: pi.id }, { ...acct, idempotencyKey: `reader-process-${pi.id}` });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'dues_reader.process.fail', membershipId, readerId, error: err instanceof Error ? err.message : String(err) }));
    if (err instanceof Stripe.errors.StripeInvalidRequestError || err instanceof Stripe.errors.StripeCardError) {
      // The reader refused the job: nothing was presented. Stop the intent so nothing can pay it later.
      await stripe.paymentIntents.cancel(pi.id, {}, acct).catch(() => {});
      await release(membershipId, stamp);
      return fail(409, stripeMessage(err, 'The card reader didn’t take the payment — try again.'));
    }
    // Unsure whether the reader got it: keep the claim; the status checks settle it.
    return { ok: true, value: { status: 'waiting', dueCents: due.totalCents, message: 'Checking whether the reader got the payment…' } };
  }
  return { ok: true, value: { status: 'waiting', dueCents: due.totalCents } };
}

/** A card intent from the pay link found paid while starting the reader: record it as the card payment it was. */
async function finalizeCard(membershipId: string, pi: Stripe.PaymentIntent) {
  const m = await prisma.courseMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { courseId: true, startedAt: true, lastPaidAt: true, expiresAt: true, lastPaymentIntentId: true, tier: { select: { termMonths: true } } } });
  await recordMove({ courseId: m.courseId, what: 'dues', direction: 'in', method: 'card', account: 'course', amountCents: pi.amount, platformFeeCents: pi.application_fee_amount ?? 0, stripeId: pi.id, membershipId, actor: 'system', note: 'paid by card (found when starting the reader)' });
  if (m.lastPaymentIntentId !== pi.id) await recordPaidTerm({ id: membershipId, startedAt: m.startedAt, termMonths: m.tier?.termMonths ?? 12 }, { lastPaidAt: m.lastPaidAt, expiresAt: m.expiresAt }, pi.id, { autoRenewFailedAt: null, autoRenewRetryAt: null });
}

/**
 * Where dues on the reader stand. stopFirst (cancel, a stale claim): stop the reader before deciding. Released
 * only when the intent is unpaid and has been cancelled.
 */
async function evaluate(courseId: string, membershipId: string, actor: string, stopFirst: boolean): Promise<Result<DuesReaderStatus>> {
  const m = await prisma.courseMembership.findFirst({ where: { id: membershipId, courseId }, select: { duesChargeStartedAt: true, duesReaderId: true, duesIntentId: true, paymentStatus: true, lastPaidAt: true, course: { select: { stripeAccountId: true } } } });
  if (!m) return fail(404, 'That member isn’t on your list.');
  const stamp = m.duesChargeStartedAt;
  // A reader mark with no claim behind it (the claim ended some other way): nothing is on the reader — clear it.
  if (m.duesReaderId && !stamp) await prisma.courseMembership.updateMany({ where: { id: membershipId, duesReaderId: m.duesReaderId, duesChargeStartedAt: null }, data: { duesReaderId: '' } });
  if (!m.duesReaderId || !stamp) return { ok: true, value: { status: m.paymentStatus === 'paid' && m.lastPaidAt && Date.now() - m.lastPaidAt.getTime() < 15 * 60_000 ? 'paid' : 'open' } };
  const account = m.course.stripeAccountId;
  if (!account) return fail(409, 'Stripe isn’t connected.');
  const acct = { stripeAccount: account };
  if (!m.duesIntentId) {
    // Claimed but no intent stored yet: nothing can have been charged.
    if (Date.now() - stamp.getTime() > 60_000 || stopFirst) { await release(membershipId, stamp); return { ok: true, value: { status: 'cancelled' } }; }
    return { ok: true, value: { status: 'waiting' } };
  }
  try {
    let pi = await stripe.paymentIntents.retrieve(m.duesIntentId, {}, acct);
    // Only the reader's own intent belongs to this claim (a card intent stored before the claim was cancelled at start).
    if (!pi.payment_method_types.includes('card_present')) {
      if (Date.now() - stamp.getTime() > 60_000 || stopFirst) { await release(membershipId, stamp); return { ok: true, value: { status: 'cancelled' } }; }
      return { ok: true, value: { status: 'waiting' } };
    }
    if (pi.status === 'requires_capture') pi = await stripe.paymentIntents.capture(pi.id, {}, { ...acct, idempotencyKey: `reader-capture-${pi.id}` });
    if (pi.status === 'succeeded') return { ok: true, value: await finalize(membershipId, pi, stamp, actor) };
    if (pi.status === 'processing') return { ok: true, value: { status: 'waiting' } };

    const r = await stripe.terminal.readers.retrieve(m.duesReaderId, {}, acct).catch(() => null);
    const action = r && !('deleted' in r && r.deleted) ? (r as Stripe.Terminal.Reader).action : null;
    const mine = !!action && action.type === 'process_payment_intent' && action.process_payment_intent?.payment_intent === pi.id;
    if (mine && action!.status === 'in_progress') {
      if (!stopFirst) return { ok: true, value: { status: 'waiting' } };
      try {
        await stripe.terminal.readers.cancelAction(m.duesReaderId, {}, acct);
      } catch {
        return { ok: true, value: { status: 'waiting', message: 'The card is already going through — wait a moment.' } };
      }
      pi = await stripe.paymentIntents.retrieve(pi.id, {}, acct);
      if (pi.status === 'succeeded') return { ok: true, value: await finalize(membershipId, pi, stamp, actor) };
      if (pi.status === 'processing') return { ok: true, value: { status: 'waiting' } };
    } else if (mine && action!.status === 'succeeded') {
      return { ok: true, value: { status: 'waiting' } }; // the intent catches up on the next look
    }
    // Unpaid: stop the intent for good, then end the claim.
    if (pi.status !== 'canceled') {
      try {
        await stripe.paymentIntents.cancel(pi.id, {}, acct);
      } catch (err) {
        const again = await stripe.paymentIntents.retrieve(pi.id, {}, acct);
        if (again.status === 'succeeded') return { ok: true, value: await finalize(membershipId, again, stamp, actor) };
        return fail(502, stripeMessage(err, 'Couldn’t stop the card payment — try again.'));
      }
    }
    await release(membershipId, stamp);
    if (mine && action!.status === 'failed') return { ok: true, value: { status: 'declined', message: action!.failure_message || 'The card was declined.' } };
    return { ok: true, value: { status: 'cancelled' } };
  } catch (err) {
    return fail(502, stripeMessage(err, 'Couldn’t check the card reader — try again.'));
  }
}

/** The page asks this every 2 seconds while the dues are on the reader. */
export const duesReaderStatus = (courseId: string, membershipId: string, actor: string) => evaluate(courseId, membershipId, actor, false);
/** Staff cancel: stop the reader, then decide from Stripe. */
export const cancelDuesOnReader = (courseId: string, membershipId: string, actor: string) => evaluate(courseId, membershipId, actor, true);
/** A reader claim left 10 minutes: stop the reader and settle it (called before anything else takes the dues). */
export async function settleDuesReader(courseId: string, membershipId: string, actor = 'system'): Promise<void> {
  const r = await evaluate(courseId, membershipId, actor, true);
  if (!r.ok) { console.error(JSON.stringify({ ev: 'dues_reader.settle.fail', membershipId, error: r.error })); return; }
  // A tap nobody was watching: the receipt (and a counter add's welcome) still go out.
  if (r.value.recorded) await afterDuesPaid(membershipId, r.value.recorded).catch(err => console.error(JSON.stringify({ ev: 'dues_reader.settle.email_fail', membershipId, error: err instanceof Error ? err.message : String(err) })));
}

/**
 * The hourly cron: every reader claim left 10 minutes, whatever the membership's status, is settled from Stripe —
 * so a tap made after the page was closed is on the ledger and recorded within the hour, never left unrecorded.
 */
export async function settleStaleDuesReaders(now = new Date()): Promise<number> {
  const stale = await prisma.courseMembership.findMany({
    where: { duesReaderId: { not: '' }, OR: [{ duesChargeStartedAt: null }, { duesChargeStartedAt: { lt: new Date(now.getTime() - DUES_READER_STALE_MS) } }] },
    select: { id: true, courseId: true }, take: 200,
  });
  for (const m of stale) await settleDuesReader(m.courseId, m.id);
  return stale.length;
}
/** Settle a stale reader claim on this membership, if there is one. Fresh claims are left alone (the reader is in use). */
export async function settleStaleDuesReader(m: { id: string; courseId: string; duesReaderId: string; duesChargeStartedAt: Date | null }): Promise<void> {
  if (m.duesReaderId && m.duesChargeStartedAt && Date.now() - m.duesChargeStartedAt.getTime() > DUES_READER_STALE_MS) await settleDuesReader(m.courseId, m.id);
}
