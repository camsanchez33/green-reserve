// W2-9b (Cam 2026-10-22: "completely up to the courses on how to handle/charge
// money … deposits need flexibility"; refunds "up to courses … we just have to be
// able to accommodate that"). Money toward an event: any amount, any number of
// payments, each either taken at the course (recorded — cash, check, the
// course's own card machine; no charge here, no GreenReserve fee, like
// paid_offline) or a pay link the organizer opens on their own phone, which is
// a direct charge on the course's Stripe account.
//
// A pay link is the walk-up sale machine (lib/shop-sales.ts), every write
// conditional on the status it expects:
//   open ──(card claimed)──▶ paying ──(charged)──▶ paid
//                              └──(declined)──▶ open
//   open ──(void / paid another way)──▶ void / paid
// ONE PaymentIntent per payment (idempotency key per payment), so a retry, a
// second tab or a reclaimed stale claim can never charge twice. Void and
// "paid another way" cancel that intent first.
//
// Refunds: reserved on the payment first (refundedCents, conditional on what is
// left), then Stripe is asked with the refund row's id as the idempotency key
// and in its metadata. A definite Stripe refusal gives the reservation back; an
// unsure answer keeps it pending, and "Try again" first looks for a refund
// already carrying that id (the key alone expires after 24 hours).
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { ACCESS_FEE_CENTS, EVENT_FEE_ON } from './booking-fees';

export const MAX_EVENT_PAYMENT_CENTS = 10_000_000; // $100,000 — a typo guard
export const STALE_CHARGE_MS = 10 * 60 * 1000;
export const PAY_KINDS = ['deposit', 'balance', 'other', 'player'] as const;
export const COURSE_METHODS = ['cash', 'check', 'card_counter', 'other'] as const;
export const METHOD_LABEL: Record<string, string> = { link: 'Pay link', cash: 'Cash', check: 'Check', card_counter: 'Card at the course', other: 'Other' };

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const str = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

/** Dollars typed by staff → cents; null if not a positive amount within the guard. */
export function toCents(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const c = Math.round(n * 100);
  return c > 0 && c <= MAX_EVENT_PAYMENT_CENTS ? c : null;
}

/** GreenReserve's fee on an online payment, while EVENT_FEE_ON: $1.50 × players on a balance, $1.50 on a player's own payment. */
export function eventFeeFor(kind: string, headcount: number | null, on: boolean = EVENT_FEE_ON): number {
  if (!on) return 0;
  if (kind === 'player') return ACCESS_FEE_CENTS;
  return kind === 'balance' && headcount && headcount > 0 ? headcount * ACCESS_FEE_CENTS : 0;
}

/**
 * Pure: where an event's money stands. Only paid payments count; refunds come off.
 * Until a balance confirms the headcount, an organizer's guarantee is the floor:
 * the higher of the guarantee and the players on the list (Cam 2026-10-24).
 */
export function eventMoney(e: { pricePerPlayerCents: number; finalHeadcount: number | null; players: number; entrants: number; payer?: string; guaranteedPlayers?: number | null },
  payments: { status: string; amountCents: number; refundedCents: number }[]) {
  const guaranteed = e.payer !== 'players' ? e.guaranteedPlayers ?? null : null;
  const headcount = e.finalHeadcount ?? (guaranteed != null ? Math.max(guaranteed, e.entrants) : (e.entrants || e.players));
  const totalCents = e.pricePerPlayerCents * headcount;
  const paidCents = payments.filter(p => p.status === 'paid').reduce((n, p) => n + p.amountCents, 0);
  const refundedCents = payments.filter(p => p.status === 'paid').reduce((n, p) => n + p.refundedCents, 0);
  const openCents = payments.filter(p => p.status === 'open' || p.status === 'paying').reduce((n, p) => n + p.amountCents, 0);
  return { headcount, headcountConfirmed: e.finalHeadcount != null, totalCents, paidCents, refundedCents, keptCents: paidCents - refundedCents, openCents, owedCents: Math.max(0, totalCents - (paidCents - refundedCents)) };
}

async function eventOf(courseId: string, eventId: string) {
  return prisma.courseEvent.findFirst({ where: { id: eventId, courseId }, include: { _count: { select: { entrants: true } } } });
}

/**
 * W2-9c: a payment for one player on the event's list. The player must be on
 * THIS event; their name and contact fill in what staff left blank.
 */
async function playerOf(eventId: string, playerId: unknown) {
  if (playerId == null || playerId === '') return { player: null };
  const player = await prisma.courseEventPlayer.findFirst({ where: { id: String(playerId), eventId } });
  return player ? { player } : { error: fail(404, 'That player isn\u2019t on this event any more — refresh the page.') };
}

/**
 * W2-9d: a player's own payments — their own, plus their sign-up group's (one
 * charge paid by whoever signed the group up covers everyone in it).
 */
export function playerPaymentsWhere(eventId: string, player: { id: string; groupKey: string }) {
  return { eventId, OR: [{ playerId: player.id }, ...(player.groupKey ? [{ groupKey: player.groupKey }] : [])] };
}

/** W2-9d: how long a paying-now sign-up keeps its spots while they pay. */
export const HOLD_MINUTES = 30;

/**
 * W2-9d: a sign-up group's hold, checked before their card is charged. Null =
 * fine to charge (still held and in time, or already on the list).
 */
export async function holdProblem(groupKey: string, now: Date = new Date()): Promise<string | null> {
  if (!groupKey) return null;
  const ps = await prisma.courseEventPlayer.findMany({ where: { groupKey }, select: { status: true, holdUntil: true } });
  if (!ps.length) return 'The course took this sign-up off the list — ask them about it.';
  if (ps.every(p => p.status === 'in')) return null;
  if (ps.some(p => p.status === 'waitlist')) return 'You\u2019re on the waiting list — the course will be in touch if a spot opens.';
  if (ps.some(p => p.status === 'held' && p.holdUntil && p.holdUntil > now)) return null;
  return `Your ${HOLD_MINUTES}-minute hold ran out, so the spots went back. Sign up again if there\u2019s still room.`;
}

/** W2-9d: a sign-up group's payment went through — they're on the list (even if the hold had just run out: the money is taken). */
async function confirmGroupOf(paymentId: string) {
  const p = await prisma.courseEventPayment.findUnique({ where: { id: paymentId }, select: { groupKey: true, status: true } });
  if (!p?.groupKey || p.status !== 'paid') return;
  await prisma.courseEventPlayer.updateMany({ where: { groupKey: p.groupKey, status: { in: ['held', 'lapsed'] } }, data: { status: 'in', holdUntil: null } });
}

/** Pure: where one player's own payments stand. */
export function playerPayState(payments: { status: string; amountCents: number; refundedCents: number }[]): 'paid' | 'sent' | 'none' {
  if (payments.some(p => p.status === 'paid' && p.amountCents > p.refundedCents)) return 'paid';
  if (payments.some(p => p.status === 'open' || p.status === 'paying')) return 'sent';
  return 'none';
}

/** A payment taken at the course: recorded as paid, nothing charged here. */
export async function recordCoursePayment(courseId: string, eventId: string, input: Record<string, unknown>, actor: string): Promise<Result<{ id: string }>> {
  const event = await eventOf(courseId, eventId);
  if (!event) return fail(404, 'Event not found.');
  const amountCents = toCents(input.amount);
  if (!amountCents) return fail(400, 'Enter the amount taken (up to $100,000).');
  const method = (COURSE_METHODS as readonly string[]).includes(String(input.method)) ? String(input.method) : null;
  if (!method) return fail(400, 'Say how it was paid.');
  const who = await playerOf(eventId, input.playerId);
  if (who.error) return who.error;
  const player = who.player;
  const kind = player ? 'player' : (PAY_KINDS as readonly string[]).includes(String(input.kind)) && input.kind !== 'player' ? String(input.kind) : 'other';
  const data = {
    eventId, courseId, kind, playerId: player?.id ?? null,
    label: str(input.label, 80) || (player ? `${player.name} — entry` : kind === 'deposit' ? 'Deposit' : kind === 'balance' ? 'Balance' : 'Payment'),
    amountCents, method, status: 'paid', paidAt: new Date(),
    payerName: str(input.payerName, 120) || player?.name || '', note: str(input.note, 300), createdBy: actor,
  };
  if (!player) {
    const p = await prisma.courseEventPayment.create({ data });
    return { ok: true, value: { id: p.id } };
  }
  // A player's own payment: under the same lock as sending them a link, and
  // never alongside one that is paid, being paid, or still open — so cash at
  // the counter and their card can't both land.
  const r = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CourseEventPlayer" WHERE id = ${player.id} FOR UPDATE`;
    const theirs = await tx.courseEventPayment.findMany({ where: playerPaymentsWhere(eventId, player), select: { status: true, amountCents: true, refundedCents: true } });
    if (theirs.some(x => x.status === 'paying')) return 'paying' as const;
    const state = playerPayState(theirs);
    if (state !== 'none') return state;
    return tx.courseEventPayment.create({ data });
  });
  if (r === 'paying') return fail(409, `${player.name} is paying their link right now — wait a moment and refresh.`);
  if (r === 'paid') return fail(409, `${player.name} has already paid.`);
  if (r === 'sent') return fail(409, `${player.name} has a pay link — mark that link paid instead, so they can\u2019t pay twice.`);
  return { ok: true, value: { id: r.id } };
}

/** A pay link for the organizer: any amount the course chooses; a balance confirms the headcount. */
export async function createPayLink(courseId: string, eventId: string, input: Record<string, unknown>, actor: string): Promise<Result<{ id: string; payToken: string; amountCents: number; feeCents: number; label: string }>> {
  const event = await eventOf(courseId, eventId);
  if (!event) return fail(404, 'Event not found.');
  if (event.status !== 'planned') return fail(409, 'This event was cancelled.');
  const who = await playerOf(eventId, input.playerId);
  if (who.error) return who.error;
  const player = who.player;
  const kind = player ? 'player' : (PAY_KINDS as readonly string[]).includes(String(input.kind)) && input.kind !== 'player' ? String(input.kind) : 'other';
  let headcount: number | null = null;
  if (kind === 'balance') {
    const h = Number(input.headcount);
    if (!Number.isInteger(h) || h < 1 || h > 1000) return fail(400, 'Confirm the final headcount (1 to 1,000).');
    headcount = h;
  }
  const amountCents = toCents(input.amount);
  if (!amountCents) return fail(400, 'Enter the amount (up to $100,000).');
  const payerEmail = (str(input.payerEmail, 200) || player?.email || '').toLowerCase();
  if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) return fail(400, 'That email doesn’t look right.');
  const feeCents = eventFeeFor(kind, headcount);
  const label = str(input.label, 80) || (player ? `${player.name} — entry` : kind === 'deposit' ? 'Deposit' : kind === 'balance' ? `Balance for ${headcount} player${headcount === 1 ? '' : 's'}` : 'Payment');
  const payToken = randomUUID();
  const p = await prisma.$transaction(async tx => {
    if (player) {
      // One live link per player. The player's row is locked while we check and
      // create, so two sends at once can't both make a link.
      await tx.$queryRaw`SELECT id FROM "CourseEventPlayer" WHERE id = ${player.id} FOR UPDATE`;
      const theirs = await tx.courseEventPayment.findMany({ where: playerPaymentsWhere(eventId, player), select: { status: true, amountCents: true, refundedCents: true } });
      const state = playerPayState(theirs);
      if (state !== 'none') return state;
    }
    if (headcount != null) await tx.courseEvent.update({ where: { id: eventId }, data: { finalHeadcount: headcount } });
    return tx.courseEventPayment.create({
      data: {
        eventId, courseId, kind, label, amountCents, feeCents, method: 'link', status: 'open', payToken, headcount, playerId: player?.id ?? null,
        payerName: str(input.payerName, 120) || player?.name || '', payerEmail, payerPhone: str(input.payerPhone, 40) || player?.phone || '', note: str(input.note, 300), createdBy: actor,
      },
    });
  });
  if (p === 'paid') return fail(409, `${player!.name} has already paid.`);
  if (p === 'sent') return fail(409, `${player!.name} already has a pay link — send it again instead.`);
  return { ok: true, value: { id: p.id, payToken, amountCents, feeCents, label } };
}

export const whyNotOpen = (status: string) =>
  status === 'paying' ? 'The organizer is paying right now — wait a moment and refresh.'
    : status === 'paid' ? 'This payment is already paid.'
    : 'This pay link was cancelled.';

/** Stop an open link's PaymentIntent so it can't be paid later. Null = safe to settle. */
async function stopIntent(courseId: string, paymentId: string): Promise<string | null> {
  const p = await prisma.courseEventPayment.findFirst({ where: { id: paymentId, courseId }, select: { status: true, paymentIntentId: true, chargeStartedAt: true } });
  if (!p) return 'Payment not found.';
  if (p.status !== 'open') return whyNotOpen(p.status);
  if (!p.paymentIntentId) return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true } });
  if (!course?.stripeAccountId) return null;
  const pi = await stripe.paymentIntents.retrieve(p.paymentIntentId, {}, { stripeAccount: course.stripeAccountId });
  if (pi.status === 'succeeded') { await markPaid(paymentId, p.chargeStartedAt ?? new Date(0), pi.id); return 'This was just paid by card — it can’t be cancelled.'; }
  if (pi.status === 'processing') return 'The organizer’s card payment is still going through — wait a few minutes.';
  if (pi.status !== 'canceled') await stripe.paymentIntents.cancel(pi.id, {}, { stripeAccount: course.stripeAccountId });
  return null;
}

/** Cancel an open pay link, or record that it was paid another way at the course. */
export async function settleOpenPayment(courseId: string, paymentId: string, to: 'void' | { method: string }): Promise<Result<null>> {
  if (to !== 'void' && !(COURSE_METHODS as readonly string[]).includes(to.method)) return fail(400, 'Say how it was paid.');
  const stop = await stopIntent(courseId, paymentId);
  if (stop) return fail(409, stop);
  const done = await prisma.courseEventPayment.updateMany({
    where: { id: paymentId, courseId, status: 'open' },
    data: to === 'void' ? { status: 'void', voidedAt: new Date() } : { status: 'paid', paidAt: new Date(), method: to.method, feeCents: 0 },
  });
  if (!done.count) {
    const p = await prisma.courseEventPayment.findFirst({ where: { id: paymentId, courseId }, select: { status: true } });
    return fail(p ? 409 : 404, p ? whyNotOpen(p.status) : 'Payment not found.');
  }
  if (to !== 'void') await confirmGroupOf(paymentId);
  return { ok: true, value: null };
}

/** Cancelling an event cancels its open pay links (never one being paid right now). */
export async function voidOpenLinks(courseId: string, eventId: string): Promise<{ voided: number; failed: string[] }> {
  const open = await prisma.courseEventPayment.findMany({ where: { eventId, courseId, status: 'open' }, select: { id: true, label: true } });
  let voided = 0; const failed: string[] = [];
  for (const p of open) {
    try { const r = await settleOpenPayment(courseId, p.id, 'void'); if (r.ok) voided++; else failed.push(`${p.label}: ${r.error}`); }
    catch (err) { failed.push(`${p.label}: ${err instanceof Error ? err.message : 'Stripe error'}`); }
  }
  return { voided, failed };
}

/** What the organizer's pay page shows. Null unless the token matches. */
export async function paymentForPayPage(paymentId: string, token: string) {
  if (!token) return null;
  const p = await prisma.courseEventPayment.findUnique({
    where: { id: paymentId },
    include: { event: { select: { name: true, date: true, status: true, course: { select: { name: true, brandColor: true, logoUrl: true, heroImageUrl: true, stripeAccountId: true, stripeAccountActive: true } } } } },
  });
  if (!p || !p.payToken || p.payToken !== token) return null;
  return p;
}

/** The organizer pays a link with a card or wallet. See the header for why this can't double-charge. */
export async function chargeEventPayment(paymentId: string, token: string, paymentMethodId: string, expectedTotalCents: number): Promise<Result<{ status: 'paid' | 'processing' }>> {
  const p = await paymentForPayPage(paymentId, token);
  if (!p) return fail(404, 'This pay link is not valid any more. Ask the course for a new one.');
  if (p.status === 'paid') return fail(409, 'This is already paid. Thank you!');
  // W2-9d: a sign-up's payment only while its spots are held.
  const held = await holdProblem(p.groupKey);
  if (held) return fail(409, held);
  if (p.status === 'void') return fail(409, 'The course cancelled this pay link.');
  if (p.event.status !== 'planned') return fail(409, 'This event was cancelled — nothing can be paid toward it.');
  const course = p.event.course;
  if (!course.stripeAccountId || !course.stripeAccountActive) return fail(409, 'This course can’t take card payments yet — please pay the course directly.');
  const total = p.amountCents + p.feeCents;
  if (Number(expectedTotalCents) !== total) return fail(409, 'The amount changed since this page loaded — refresh to see it.');
  if (typeof paymentMethodId !== 'string' || !paymentMethodId.startsWith('pm_')) return fail(400, 'Card details are missing — try again.');
  const account = course.stripeAccountId;

  const now = new Date();
  const claimed = await prisma.courseEventPayment.updateMany({
    where: { id: paymentId, payToken: token, OR: [{ status: 'open' }, { status: 'paying', chargeStartedAt: { lt: new Date(now.getTime() - STALE_CHARGE_MS) } }] },
    data: { status: 'paying', chargeStartedAt: now },
  });
  if (claimed.count === 0) return fail(409, 'A payment is already going through — wait a moment and refresh.');
  // A sign-up's spots stay held while the card goes through.
  if (p.groupKey) {
    const until = new Date(now.getTime() + STALE_CHARGE_MS);
    await prisma.courseEventPlayer.updateMany({ where: { groupKey: p.groupKey, status: 'held', holdUntil: { lt: until } }, data: { holdUntil: until } });
  }
  const release = () => prisma.courseEventPayment.updateMany({ where: { id: paymentId, status: 'paying', chargeStartedAt: now }, data: { status: 'open', chargeStartedAt: null } });
  const unsure = fail(502, 'We couldn’t confirm the payment. Please don’t pay again — wait a few minutes and reopen this link, or call the course.');

  let pi;
  try {
    pi = await paymentIntent(paymentId, p.paymentIntentId, p.amountCents, p.feeCents, `${course.name} - ${p.event.name} - ${p.label}`, account);
  } catch (err) {
    console.error(JSON.stringify({ ev: 'event_payment.intent.fail', paymentId, error: err instanceof Error ? err.message : String(err) }));
    await release();
    return fail(502, 'Card payments are not working right now — try again later, or pay the course directly.');
  }
  if (pi.status === 'succeeded') { await markPaid(paymentId, now, pi.id); return { ok: true, value: { status: 'paid' } }; }
  if (pi.status === 'processing') return { ok: true, value: { status: 'processing' } };
  if (pi.status === 'canceled') { await release(); return fail(409, 'The course closed this pay link — ask them for a new one.'); }

  let clonedId: string;
  try {
    const customer = await stripe.customers.create({ email: p.payerEmail || undefined, name: p.payerName || undefined, metadata: { eventPaymentId: paymentId, source: 'event_payment' } });
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    const cloned = await stripe.paymentMethods.create({ customer: customer.id, payment_method: paymentMethodId }, { stripeAccount: account, idempotencyKey: `${pi.id}-${paymentMethodId}-pm` });
    clonedId = cloned.id;
  } catch (err) {
    await release();
    return fail(402, err instanceof Stripe.errors.StripeCardError ? (err.message || 'That card can’t be used — try another.') : 'That card can’t be used — try another.');
  }

  try {
    console.log(JSON.stringify({ ev: 'event_payment.charge.attempt', paymentId, paymentIntentId: pi.id, amountCents: total }));
    const done = await stripe.paymentIntents.confirm(pi.id, { payment_method: clonedId, off_session: true }, { stripeAccount: account, idempotencyKey: `${pi.id}-${paymentMethodId}-confirm` });
    if (done.status === 'succeeded') { await markPaid(paymentId, now, done.id); return { ok: true, value: { status: 'paid' } }; }
    if (done.status === 'requires_payment_method' || done.status === 'canceled') { await release(); return fail(402, 'The card was declined — try another card.'); }
    if (done.status === 'processing') return { ok: true, value: { status: 'processing' } };
    await release();
    return fail(402, 'This card needs a step this page can’t do — try another card.');
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      await release();
      return fail(402, err.message ? `The card was declined: ${err.message}` : 'The card was declined — try another card.');
    }
    console.error(JSON.stringify({ ev: 'event_payment.charge.unsure', paymentId, paymentIntentId: pi.id, error: err instanceof Error ? err.message : String(err) }));
    return unsure;
  }
}

/** The payment's single PaymentIntent on the course's account: made once, then reused. */
async function paymentIntent(paymentId: string, existingId: string, amountCents: number, feeCents: number, description: string, account: string) {
  if (existingId) return stripe.paymentIntents.retrieve(existingId, {}, { stripeAccount: account });
  const pi = await stripe.paymentIntents.create({
    amount: amountCents + feeCents, currency: 'usd', payment_method_types: ['card'],
    application_fee_amount: feeCents > 0 ? feeCents : undefined,
    description: description.slice(0, 200),
    metadata: { eventPaymentId: paymentId },
  }, { stripeAccount: account, idempotencyKey: `event-payment-intent-${paymentId}` });
  await prisma.courseEventPayment.update({ where: { id: paymentId }, data: { paymentIntentId: pi.id } });
  return pi;
}

async function markPaid(paymentId: string, stamp: Date, paymentIntentId: string) {
  const done = await prisma.courseEventPayment.updateMany({ where: { id: paymentId, status: 'paying', chargeStartedAt: stamp }, data: { status: 'paid', paidAt: new Date(), paymentIntentId } });
  if (done.count) { await confirmGroupOf(paymentId); return; }
  // The money is taken; record it even if the claim went stale.
  console.error(JSON.stringify({ ev: 'event_payment.charge.claim_lost', paymentId, paymentIntentId }));
  await prisma.courseEventPayment.updateMany({ where: { id: paymentId, status: { in: ['open', 'paying'] } }, data: { status: 'paid', paidAt: new Date(), paymentIntentId } });
  await confirmGroupOf(paymentId);
}

/** Settle a link left 'paying' by a request that never finished: read its intent. Called when the event page loads. */
export async function reconcileStuckPayments(courseId: string, eventId: string): Promise<void> {
  const stuck = await prisma.courseEventPayment.findMany({ where: { eventId, courseId, status: 'paying', chargeStartedAt: { lt: new Date(Date.now() - STALE_CHARGE_MS) } } });
  if (!stuck.length) return;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true } });
  for (const p of stuck) {
    try {
      if (!p.paymentIntentId) {
        await prisma.courseEventPayment.updateMany({ where: { id: p.id, status: 'paying', chargeStartedAt: p.chargeStartedAt, paymentIntentId: '' }, data: { status: 'open', chargeStartedAt: null } });
        continue;
      }
      if (!course?.stripeAccountId) continue;
      const pi = await stripe.paymentIntents.retrieve(p.paymentIntentId, {}, { stripeAccount: course.stripeAccountId });
      if (pi.status === 'succeeded') await markPaid(p.id, p.chargeStartedAt!, pi.id);
      else if (pi.status === 'requires_payment_method' || pi.status === 'canceled' || pi.status === 'requires_action') {
        await prisma.courseEventPayment.updateMany({ where: { id: p.id, status: 'paying', chargeStartedAt: p.chargeStartedAt }, data: { status: 'open', chargeStartedAt: null } });
      }
    } catch (err) {
      console.error(JSON.stringify({ ev: 'event_payment.reconcile.fail', paymentId: p.id, error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

/**
 * Refund all or part of a paid payment, when the course decides to (its own
 * terms). A card payment is refunded through Stripe on the course's account;
 * one taken at the course is recorded as refunded (the course hands the money
 * back itself). GreenReserve's fee, when there is one, is not refunded here.
 */
export async function refundPayment(courseId: string, paymentId: string, input: { amount?: unknown; reason?: unknown }, actor: string): Promise<Result<{ status: 'done' | 'pending' }>> {
  const p = await prisma.courseEventPayment.findFirst({ where: { id: paymentId, courseId } });
  if (!p) return fail(404, 'Payment not found.');
  if (p.status !== 'paid') return fail(409, 'Only a paid payment can be refunded.');
  const left = p.amountCents - p.refundedCents;
  const amountCents = toCents(input.amount);
  if (!amountCents) return fail(400, 'Enter the amount to refund.');
  if (amountCents > left) return fail(400, `At most $${(left / 100).toFixed(2)} can still be refunded on this payment.`);
  // Reserve it: only if that much is still left (two refunds at once can't both take the last of it).
  const refund = await prisma.$transaction(async tx => {
    const reserved = await tx.courseEventPayment.updateMany({ where: { id: paymentId, status: 'paid', refundedCents: { lte: p.amountCents - amountCents } }, data: { refundedCents: { increment: amountCents } } });
    if (!reserved.count) return null;
    return tx.courseEventRefund.create({ data: { paymentId, amountCents, reason: str(input.reason, 300), createdBy: actor } });
  });
  if (!refund) return fail(409, 'Someone else just refunded part of this — refresh and try again.');
  if (p.method !== 'link') {
    await prisma.courseEventRefund.update({ where: { id: refund.id }, data: { status: 'done' } });
    return { ok: true, value: { status: 'done' } };
  }
  return sendRefund(courseId, refund.id);
}

/** Ask Stripe for a card refund (first time, or again after an unsure answer — the same key, so never twice). */
export async function sendRefund(courseId: string, refundId: string): Promise<Result<{ status: 'done' | 'pending' }>> {
  const r = await prisma.courseEventRefund.findFirst({ where: { id: refundId, payment: { courseId } }, include: { payment: true } });
  if (!r) return fail(404, 'Refund not found.');
  if (r.status === 'done') return { ok: true, value: { status: 'done' } };
  if (r.status === 'failed') return fail(409, 'This refund didn’t go through — start a new one.');
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true } });
  if (!course?.stripeAccountId || !r.payment.paymentIntentId) {
    await giveBack(r.id, r.paymentId, r.amountCents, 'This course has no Stripe account to refund from.');
    return fail(409, 'This course has no Stripe account to refund from.');
  }
  try {
    // Stripe forgets an idempotency key after 24 hours, so a "Try again" the next
    // day would refund twice. Ask Stripe first whether this refund already exists
    // (every refund carries its row id in its metadata).
    const earlier = await stripe.refunds.list({ payment_intent: r.payment.paymentIntentId, limit: 100 }, { stripeAccount: course.stripeAccountId });
    const found = earlier.data.find(x => x.metadata?.eventRefundId === r.id && x.status !== 'failed' && x.status !== 'canceled');
    if (found) {
      await prisma.courseEventRefund.update({ where: { id: r.id }, data: { status: 'done', stripeRefundId: found.id, error: '' } });
      return { ok: true, value: { status: 'done' } };
    }
    const sr = await stripe.refunds.create(
      { payment_intent: r.payment.paymentIntentId, amount: r.amountCents, metadata: { eventRefundId: r.id, eventPaymentId: r.paymentId } },
      { stripeAccount: course.stripeAccountId, idempotencyKey: `event-refund-${r.id}` },
    );
    await prisma.courseEventRefund.update({ where: { id: r.id }, data: { status: 'done', stripeRefundId: sr.id, error: '' } });
    return { ok: true, value: { status: 'done' } };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError || err instanceof Stripe.errors.StripeCardError) {
      // A definite no from Stripe: nothing was refunded, so the amount is free again.
      await giveBack(r.id, r.paymentId, r.amountCents, err.message || 'Stripe refused the refund.');
      return fail(402, `Stripe refused the refund: ${err.message || 'no reason given'}. Nothing was refunded.`);
    }
    console.error(JSON.stringify({ ev: 'event_refund.unsure', refundId: r.id, error: err instanceof Error ? err.message : String(err) }));
    await prisma.courseEventRefund.update({ where: { id: r.id }, data: { error: 'Stripe didn’t answer.' } });
    return { ok: true, value: { status: 'pending' } };
  }
}

/** A definite no: mark the refund failed and free its amount — once, by whichever call marks it. */
async function giveBack(refundId: string, paymentId: string, amountCents: number, error: string) {
  await prisma.$transaction(async tx => {
    const marked = await tx.courseEventRefund.updateMany({ where: { id: refundId, status: 'pending' }, data: { status: 'failed', error } });
    if (marked.count) await tx.courseEventPayment.update({ where: { id: paymentId }, data: { refundedCents: { decrement: amountCents } } });
  });
}
