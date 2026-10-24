// POS-3 R3 (Cam 2026-10-24: "we need to start that build" — before a reader is
// in hand). A Stripe card reader at the register, driven from the server
// (Stripe Terminal's server-driven integration): no Terminal SDK in the
// browser, the page only asks this server what the reader is doing.
//
// Readers live on the COURSE's Stripe account, in one Terminal location per
// course (Course.terminalLocationId, made with the first reader). The owner
// connects a reader in Settings → Pro shop with the code it shows; with test
// keys a simulated reader can be added instead, and "Simulate a tap" stands in
// for a customer's card, so the whole flow runs before any hardware arrives.
//
// Paying: a walk-up sale made with pay 'reader' (lib/shop-sales createSale)
// gets the sale's ONE PaymentIntent (card_present) and is claimed 'paying' with
// the reader's id; the reader is told to collect it. The register then asks
// readerSaleStatus() until the card goes through (markCardPaid — the same path
// as a pay link), the reader reports a decline, or staff cancel. A decline or a
// cancel puts the sale back to 'open' ONLY when Stripe says the intent has not
// been paid, so staff can try the card again, take cash or void it — and those
// already refuse a sale whose intent succeeded (cancelSaleIntent).
// A sale stuck 'paying' is settled from Stripe by reconcileStuckSale, as before.
import Stripe from 'stripe';
import { createHash } from 'crypto';
import { prisma } from './prisma';
import { stripe } from './stripe';
import { saleIntent, markCardPaid, whyNotOpen } from './shop-sales';

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

/** Test keys: simulated readers and "Simulate a tap" are offered. Never with live keys. */
export const terminalTestMode = () => (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
export const SIMULATED_CODE = 'simulated-wpe';

export type ReaderView = { id: string; label: string; online: boolean; device: string; simulated: boolean; serial: string };
const view = (r: Stripe.Terminal.Reader): ReaderView => ({
  id: r.id, label: r.label || r.serial_number || 'Card reader', online: r.status === 'online',
  device: r.device_type, simulated: r.device_type.startsWith('simulated'), serial: r.serial_number ?? '',
});
const locationOf = (r: Stripe.Terminal.Reader) => (typeof r.location === 'string' ? r.location : r.location?.id ?? '');

async function courseStripe(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, address: true, city: true, state: true, zipCode: true, stripeAccountId: true, stripeAccountActive: true, terminalLocationId: true } });
  if (!c) return fail(404, 'Course not found.');
  if (!c.stripeAccountId || !c.stripeAccountActive) return fail(409, 'Connect Stripe on Money → Payouts before adding a card reader.');
  return { ok: true as const, value: { ...c, account: c.stripeAccountId } };
}

const stripeMessage = (err: unknown, fallback: string) => {
  if (!(err instanceof Stripe.errors.StripeError)) return fallback;
  if (err.code === 'terminal_reader_offline') return 'The card reader is offline — check it is on and connected to the internet, then try again.';
  if (err.code === 'terminal_reader_busy') return 'The card reader is busy with another payment — finish or cancel it on the reader, then try again.';
  if (err.code === 'terminal_reader_timeout') return 'The card reader didn’t answer — check it is on, then try again.';
  return err.message || fallback;
};

/** The course's readers, from Stripe (the source of truth). Empty until one is connected. */
export async function listReaders(courseId: string): Promise<Result<ReaderView[]>> {
  const c = await courseStripe(courseId);
  if (!c.ok) return c.status === 409 ? { ok: true, value: [] } : c;
  if (!c.value.terminalLocationId) return { ok: true, value: [] };
  try {
    const list = await stripe.terminal.readers.list({ location: c.value.terminalLocationId, limit: 20 }, { stripeAccount: c.value.account });
    return { ok: true, value: list.data.map(view) };
  } catch (err) {
    return fail(502, stripeMessage(err, 'Couldn’t reach Stripe for your card readers — try again.'));
  }
}

/** The course's Terminal location, made once (keyed per course so two first readers can't make two). */
async function ensureLocation(courseId: string, c: { name: string; address: string; city: string; state: string; zipCode: string; account: string; terminalLocationId: string }) {
  if (c.terminalLocationId) return c.terminalLocationId;
  const address = { line1: c.address || c.name, city: c.city, state: c.state, postal_code: c.zipCode, country: 'US' };
  // Keyed by the address too: after a fix in Settings the retry is a new request, not Stripe's stored error.
  const key = `terminal-location-${courseId}-${createHash('sha256').update(JSON.stringify(address)).digest('hex').slice(0, 16)}`;
  const loc = await stripe.terminal.locations.create({ display_name: c.name.slice(0, 100), address, metadata: { courseId } }, { stripeAccount: c.account, idempotencyKey: key });
  // Conditional: a location saved meanwhile by another request wins (it is the same one — same key).
  await prisma.course.updateMany({ where: { id: courseId, terminalLocationId: '' }, data: { terminalLocationId: loc.id } });
  const saved = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { terminalLocationId: true } });
  return saved.terminalLocationId;
}

/** Connect a reader with the code it shows (or, with test keys, a simulated one). Owner only — the route checks. */
export async function registerReader(courseId: string, input: { code?: unknown; label?: unknown }): Promise<Result<ReaderView>> {
  const code = String(input.code ?? '').trim().toLowerCase();
  const label = String(input.label ?? '').trim().slice(0, 60) || 'Pro shop';
  if (!code) return fail(400, 'Enter the code the reader shows.');
  if (code === SIMULATED_CODE && !terminalTestMode()) return fail(400, 'Simulated readers only work in test mode — enter the code from your reader.');
  const c = await courseStripe(courseId);
  if (!c.ok) return c;
  if (!c.value.terminalLocationId && (!c.value.city.trim() || !c.value.state.trim() || !c.value.zipCode.trim())) {
    return fail(400, 'Add your course’s city, state and ZIP in Settings → Your course first — Stripe needs them for a card reader.');
  }
  try {
    const location = await ensureLocation(courseId, c.value);
    const r = await stripe.terminal.readers.create({ registration_code: code, label, location }, { stripeAccount: c.value.account });
    return { ok: true, value: view(r) };
  } catch (err) {
    console.error(JSON.stringify({ ev: 'card_reader.register.fail', courseId, error: err instanceof Error ? err.message : String(err) }));
    return fail(400, stripeMessage(err, 'That code didn’t work — check it on the reader and try again.'));
  }
}

/** A reader of THIS course (its account and its location), or why not. */
async function ownReader(account: string, locationId: string, readerId: string): Promise<Result<Stripe.Terminal.Reader>> {
  if (!/^tmr_[A-Za-z0-9]+$/.test(readerId) || !locationId) return fail(404, 'Card reader not found — refresh and pick it again.');
  try {
    const r = await stripe.terminal.readers.retrieve(readerId, {}, { stripeAccount: account });
    if ('deleted' in r && r.deleted) return fail(404, 'That card reader was removed — refresh and pick another.');
    const reader = r as Stripe.Terminal.Reader;
    if (locationOf(reader) !== locationId) return fail(404, 'Card reader not found — refresh and pick it again.');
    return { ok: true, value: reader };
  } catch (err) {
    return fail(err instanceof Stripe.errors.StripeInvalidRequestError ? 404 : 502, stripeMessage(err, 'Couldn’t reach the card reader — try again.'));
  }
}

export async function removeReader(courseId: string, readerId: string): Promise<Result<null>> {
  const c = await courseStripe(courseId);
  if (!c.ok) return c;
  const r = await ownReader(c.value.account, c.value.terminalLocationId, readerId);
  if (!r.ok) return r;
  if (r.value.action?.status === 'in_progress') return fail(409, 'The reader is taking a payment — finish or cancel it first.');
  try {
    await stripe.terminal.readers.del(readerId, {}, { stripeAccount: c.value.account });
    return { ok: true, value: null };
  } catch (err) {
    return fail(502, stripeMessage(err, 'Couldn’t remove the reader — try again.'));
  }
}

/** Put a sale back to open — only while it is still this reader's claim. */
const releaseToOpen = (saleId: string, stamp: Date) =>
  prisma.shopSale.updateMany({ where: { id: saleId, status: 'paying', chargeStartedAt: stamp }, data: { status: 'open', chargeStartedAt: null } });

/**
 * Send an open reader sale to a reader: claim it, make (or reuse) its one
 * card_present intent, and tell the reader to collect it. A sale made with a
 * pay link can't be moved to the reader (it has its own intent for the link).
 */
export async function startReaderPayment(courseId: string, saleId: string, readerId: string): Promise<Result<{ status: 'waiting'; message?: string }>> {
  const c = await courseStripe(courseId);
  if (!c.ok) return c;
  const sale = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, select: { status: true, payToken: true, totalCents: true, paymentIntentId: true } });
  if (!sale) return fail(404, 'Sale not found.');
  if (sale.payToken) return fail(409, 'This sale was sent as a pay link — take cash for it or void it, and ring it up again on the reader.');
  if (sale.status !== 'open') return fail(409, sale.status === 'paying' ? 'This sale is already on the card reader — wait for it, or cancel it on the register.' : whyNotOpen(sale.status));
  const reader = await ownReader(c.value.account, c.value.terminalLocationId, readerId);
  if (!reader.ok) return reader;

  const stamp = new Date();
  const claimed = await prisma.shopSale.updateMany({ where: { id: saleId, courseId, status: 'open', payToken: '' }, data: { status: 'paying', chargeStartedAt: stamp, readerId } });
  if (!claimed.count) return fail(409, 'This sale changed at the same moment — refresh and try again.');
  let pi: Stripe.PaymentIntent;
  try {
    pi = await saleIntent(saleId, sale.paymentIntentId, sale.totalCents, c.value.name, c.value.account, 'card_present');
  } catch (err) {
    await releaseToOpen(saleId, stamp); // no intent → nothing can be charged
    return fail(502, stripeMessage(err, 'Card payments are not working right now — take cash, or try again.'));
  }
  if (pi.status === 'succeeded') { await markCardPaid(saleId, stamp, pi.id); return fail(409, 'This sale was already paid by card.'); }
  if (pi.status === 'canceled') { await releaseToOpen(saleId, stamp); return fail(409, 'This sale’s card payment was stopped — ring it up again.'); }
  try {
    await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: pi.id }, { stripeAccount: c.value.account, idempotencyKey: `reader-process-${pi.id}-${stamp.getTime()}` });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'card_reader.process.fail', courseId, saleId, readerId, error: err instanceof Error ? err.message : String(err) }));
    // Stripe refused it (offline, busy, bad request): the reader never took the job, so nothing can be charged.
    if (err instanceof Stripe.errors.StripeInvalidRequestError || err instanceof Stripe.errors.StripeCardError) {
      await releaseToOpen(saleId, stamp);
      return fail(409, stripeMessage(err, 'The card reader didn’t take the payment — try again.'));
    }
    // A timeout or a Stripe error: the reader may have the job. Keep the claim; the register's
    // status checks read the reader and settle it (and a stuck sale is settled after 10 minutes).
    return { ok: true, value: { status: 'waiting', message: 'Checking whether the reader got the payment…' } };
  }
  return { ok: true, value: { status: 'waiting' } };
}

export type ReaderSaleStatus = { status: 'waiting' | 'paid' | 'declined' | 'cancelled' | 'open' | 'other'; message?: string };

/**
 * What a reader sale is doing now. Paid when its intent succeeded (recorded
 * here); declined or cancelled when the reader's action failed or is gone and
 * the intent is unpaid (the sale goes back to open); otherwise still waiting.
 */
export async function readerSaleStatus(courseId: string, saleId: string): Promise<Result<ReaderSaleStatus>> {
  const sale = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, select: { status: true, paymentIntentId: true, readerId: true, chargeStartedAt: true, course: { select: { stripeAccountId: true } } } });
  if (!sale) return fail(404, 'Sale not found.');
  if (sale.status === 'paid_card') return { ok: true, value: { status: 'paid' } };
  if (sale.status === 'open') return { ok: true, value: { status: 'open' } };
  if (sale.status !== 'paying' || !sale.readerId || !sale.chargeStartedAt || !sale.course.stripeAccountId) return { ok: true, value: { status: 'other', message: whyNotOpen(sale.status) } };
  const account = sale.course.stripeAccountId;
  try {
    if (!sale.paymentIntentId) return { ok: true, value: { status: 'waiting' } };
    const pi = await stripe.paymentIntents.retrieve(sale.paymentIntentId, {}, { stripeAccount: account });
    if (pi.status === 'succeeded') { await markCardPaid(saleId, sale.chargeStartedAt, pi.id); return { ok: true, value: { status: 'paid' } }; }
    if (pi.status === 'requires_capture') {
      // Automatic capture is the default; should a card ever be only held, take it so the sale isn't stuck.
      const done = await stripe.paymentIntents.capture(pi.id, {}, { stripeAccount: account, idempotencyKey: `reader-capture-${pi.id}` });
      if (done.status === 'succeeded') { await markCardPaid(saleId, sale.chargeStartedAt, done.id); return { ok: true, value: { status: 'paid' } }; }
      return { ok: true, value: { status: 'waiting' } };
    }
    if (pi.status === 'processing') return { ok: true, value: { status: 'waiting' } };
    const r = await stripe.terminal.readers.retrieve(sale.readerId, {}, { stripeAccount: account });
    const action = 'deleted' in r && r.deleted ? null : (r as Stripe.Terminal.Reader).action;
    const mine = action?.type === 'process_payment_intent' && action.process_payment_intent?.payment_intent === pi.id;
    if (mine && action!.status === 'in_progress') return { ok: true, value: { status: 'waiting' } };
    if (mine && action!.status === 'succeeded') return { ok: true, value: { status: 'waiting' } }; // the intent catches up next ask
    // Failed on the reader, or the reader moved on (cancelled there): the intent is unpaid.
    await releaseToOpen(saleId, sale.chargeStartedAt);
    if (mine && action!.status === 'failed') return { ok: true, value: { status: 'declined', message: action!.failure_message || 'The card was declined.' } };
    return { ok: true, value: { status: 'cancelled' } };
  } catch (err) {
    return fail(502, stripeMessage(err, 'Couldn’t check the card reader — try again.'));
  }
}

/**
 * Staff cancel a reader payment: stop the reader, then read the intent. Back to
 * open only when the intent is unpaid; a card that went through as staff
 * pressed cancel is recorded as paid.
 */
export async function cancelReaderPayment(courseId: string, saleId: string): Promise<Result<ReaderSaleStatus>> {
  const sale = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, select: { status: true, paymentIntentId: true, readerId: true, chargeStartedAt: true, course: { select: { stripeAccountId: true } } } });
  if (!sale) return fail(404, 'Sale not found.');
  if (sale.status !== 'paying' || !sale.readerId || !sale.chargeStartedAt || !sale.course.stripeAccountId) return readerSaleStatus(courseId, saleId);
  const account = sale.course.stripeAccountId;
  try {
    try {
      await stripe.terminal.readers.cancelAction(sale.readerId, {}, { stripeAccount: account });
    } catch (err) {
      // Refused: either nothing is on the reader any more (fine — the intent decides), or the
      // reader is already authorising this card and can't be stopped. Then never release.
      console.log(JSON.stringify({ ev: 'card_reader.cancel.refused', saleId, error: err instanceof Error ? err.message : String(err) }));
      const r = await stripe.terminal.readers.retrieve(sale.readerId, {}, { stripeAccount: account });
      const action = 'deleted' in r && r.deleted ? null : (r as Stripe.Terminal.Reader).action;
      if (action?.type === 'process_payment_intent' && action.status === 'in_progress' && action.process_payment_intent?.payment_intent === sale.paymentIntentId) {
        return { ok: true, value: { status: 'waiting', message: 'The card is already going through — wait a moment.' } };
      }
    }
    if (!sale.paymentIntentId) { await releaseToOpen(saleId, sale.chargeStartedAt); return { ok: true, value: { status: 'cancelled' } }; }
    const pi = await stripe.paymentIntents.retrieve(sale.paymentIntentId, {}, { stripeAccount: account });
    if (pi.status === 'succeeded') { await markCardPaid(saleId, sale.chargeStartedAt, pi.id); return { ok: true, value: { status: 'paid', message: 'The card went through before the reader stopped — the sale is paid.' } }; }
    if (pi.status === 'processing') return { ok: true, value: { status: 'waiting', message: 'The card is already going through — wait a moment.' } };
    await releaseToOpen(saleId, sale.chargeStartedAt);
    return { ok: true, value: { status: 'cancelled' } };
  } catch (err) {
    return fail(502, stripeMessage(err, 'Couldn’t stop the card reader — cancel it on the reader, then refresh.'));
  }
}

/** Test mode only: present a test card to the simulated reader holding this sale. */
export async function simulateTap(courseId: string, saleId: string, card: 'ok' | 'declined' = 'ok'): Promise<Result<null>> {
  if (!terminalTestMode()) return fail(403, 'Only in test mode.');
  const sale = await prisma.shopSale.findFirst({ where: { id: saleId, courseId, status: 'paying' }, select: { readerId: true, course: { select: { stripeAccountId: true } } } });
  if (!sale?.readerId || !sale.course.stripeAccountId) return fail(409, 'This sale isn’t waiting on a reader.');
  try {
    await stripe.testHelpers.terminal.readers.presentPaymentMethod(sale.readerId, card === 'declined' ? { card_present: { number: '4000000000000002' }, type: 'card_present' } : {}, { stripeAccount: sale.course.stripeAccountId });
    return { ok: true, value: null };
  } catch (err) {
    return fail(502, stripeMessage(err, 'The simulated reader didn’t take the tap.'));
  }
}
