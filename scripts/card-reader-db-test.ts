// POS-3 R3 (Cam 2026-10-24): a Stripe card reader at the register, driven from
// the server — against a real database with Stripe's Terminal and
// PaymentIntent calls stubbed (a fake reader that can be tapped, declined,
// cancelled or knocked offline). Run: npx tsx scripts/card-reader-db-test.ts
import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { createSale, settleOpenSale, cancelSaleIntent, reconcileStuckSale } from '../src/lib/shop-sales';
import { registerReader, listReaders, startReaderPayment, readerSaleStatus, cancelReaderPayment, simulateTap, removeReader, SIMULATED_CODE } from '../src/lib/card-reader';
const TAG = 'pos3reader';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// ── Stripe stubs: PaymentIntents and Terminal on connected accounts ─────────
type PI = { id: string; amount: number; status: string; account: string; types: string[]; key: string };
const intents = new Map<string, PI>();
type Rdr = { id: string; label: string; location: string; account: string; status: string; device_type: string; serial_number: string; action: null | { type: string; status: string; failure_message?: string; process_payment_intent?: { payment_intent: string } } };
const readers = new Map<string, Rdr>();
const locations: { id: string; account: string; key: string }[] = [];
let nextReaderOffline = false;
let cancelRefused = false; // the reader is authorising: Stripe won't stop it
let dispatch: 'ok' | 'timeout_after' | 'timeout_before' = 'ok';
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.paymentIntents.create = async (p: { amount: number; payment_method_types: string[] }, o: { stripeAccount: string; idempotencyKey: string }) => {
  const found = [...intents.values()].find(x => x.key === o.idempotencyKey);
  if (found) return { ...found };
  const pi = { id: `pi_${intents.size + 1}`, amount: p.amount, status: 'requires_payment_method', account: o.stripeAccount, types: p.payment_method_types, key: o.idempotencyKey };
  intents.set(pi.id, pi); return { ...pi };
};
s.paymentIntents.retrieve = async (id: string, _p: unknown, o: { stripeAccount: string }) => {
  const pi = intents.get(id); if (!pi || pi.account !== o.stripeAccount) throw new Stripe.errors.StripeInvalidRequestError({ message: 'No such payment_intent', type: 'invalid_request_error' } as never);
  return { ...pi };
};
s.paymentIntents.capture = async (id: string) => { intents.get(id)!.status = 'succeeded'; return { ...intents.get(id)! }; };
s.paymentIntents.cancel = async (id: string) => { intents.get(id)!.status = 'canceled'; return { ...intents.get(id)! }; };
const terminal = stripe.terminal as unknown as Record<string, Record<string, unknown>>;
terminal.locations.create = async (_p: unknown, o: { stripeAccount: string; idempotencyKey: string }) => {
  const found = locations.find(l => l.key === o.idempotencyKey); if (found) return { id: found.id };
  const l = { id: `tml_${locations.length + 1}`, account: o.stripeAccount, key: o.idempotencyKey }; locations.push(l); return { id: l.id };
};
terminal.readers.create = async (p: { registration_code: string; label: string; location: string }, o: { stripeAccount: string }) => {
  if (p.registration_code !== SIMULATED_CODE && p.registration_code !== 'good-code') throw new Stripe.errors.StripeInvalidRequestError({ message: 'Invalid registration code.', type: 'invalid_request_error' } as never);
  const r: Rdr = { id: `tmr_${readers.size + 1}`, label: p.label, location: p.location, account: o.stripeAccount, status: 'online', device_type: p.registration_code === SIMULATED_CODE ? 'simulated_wisepos_e' : 'bbpos_wisepos_e', serial_number: `SN${readers.size + 1}`, action: null };
  readers.set(r.id, r); return { ...r };
};
terminal.readers.list = async (p: { location: string }, o: { stripeAccount: string }) => ({ data: [...readers.values()].filter(r => r.location === p.location && r.account === o.stripeAccount) });
terminal.readers.retrieve = async (id: string, _p: unknown, o: { stripeAccount: string }) => {
  const r = readers.get(id); if (!r || r.account !== o.stripeAccount) throw new Stripe.errors.StripeInvalidRequestError({ message: 'No such reader', type: 'invalid_request_error' } as never);
  return { ...r };
};
terminal.readers.del = async (id: string) => { readers.delete(id); return { id, deleted: true }; };
const processed: string[] = [];
terminal.readers.processPaymentIntent = async (id: string, p: { payment_intent: string }) => {
  const r = readers.get(id)!;
  if (nextReaderOffline) { nextReaderOffline = false; throw new Stripe.errors.StripeInvalidRequestError({ message: 'Reader is offline', type: 'invalid_request_error', code: 'terminal_reader_offline' } as never); }
  if (r.action?.status === 'in_progress') throw new Stripe.errors.StripeInvalidRequestError({ message: 'Reader is busy', type: 'invalid_request_error', code: 'terminal_reader_busy' } as never);
  if (dispatch === 'timeout_before') { dispatch = 'ok'; throw new Stripe.errors.StripeConnectionError({ message: 'timed out' } as never); }
  r.action = { type: 'process_payment_intent', status: 'in_progress', process_payment_intent: { payment_intent: p.payment_intent } };
  processed.push(p.payment_intent);
  if (dispatch === 'timeout_after') { dispatch = 'ok'; throw new Stripe.errors.StripeConnectionError({ message: 'timed out' } as never); }
  return { ...r };
};
terminal.readers.cancelAction = async (id: string) => {
  const r = readers.get(id)!;
  if (cancelRefused) throw new Stripe.errors.StripeInvalidRequestError({ message: 'Reader is processing a payment', type: 'invalid_request_error' } as never);
  if (!r.action || r.action.status !== 'in_progress') throw new Stripe.errors.StripeInvalidRequestError({ message: 'No action to cancel', type: 'invalid_request_error' } as never);
  r.action = null; return { ...r };
};
// A customer at the reader: a good card pays the intent; a bad one fails the action.
const tap = (readerId: string, good = true) => {
  const r = readers.get(readerId)!; const pi = intents.get(r.action!.process_payment_intent!.payment_intent)!;
  if (good) { pi.status = 'succeeded'; r.action!.status = 'succeeded'; } else { r.action!.status = 'failed'; r.action!.failure_message = 'Your card was declined.'; }
};
const helpers = (stripe.testHelpers as unknown as { terminal: { readers: Record<string, unknown> } }).terminal.readers;
helpers.presentPaymentMethod = async (id: string, p: { card_present?: { number: string } }) => { tap(id, !p.card_present); return { ...readers.get(id)! }; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, acct: string) => prisma.course.create({ data: { name: `Reader ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Main', city: 'X', state: 'NJ', zipCode: '07001', holes: 18, timezone: 'UTC', stripeAccountId: acct, stripeAccountActive: true } });
  const c = await mk('a', 'acct_a'), other = await mk('b', 'acct_b');
  const noStripe = await prisma.course.create({ data: { name: 'No Stripe', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const balls = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Balls', priceCents: 4500, stockCount: 10 } });
  const sell = async (courseId = c.id) => {
    const r = await createSale({ courseId, lines: [{ shopItemId: balls.id, quantity: 1 }], pay: 'reader', soldBy: 'desk@t.local' });
    if (!r.ok) throw new Error(r.error); return r.value;
  };
  const sale = (id: string) => prisma.shopSale.findUniqueOrThrow({ where: { id } });

  // ── Connecting a reader ──
  ok('no Stripe, no reader', !(await registerReader(noStripe.id, { code: SIMULATED_CODE })).ok);
  process.env.STRIPE_SECRET_KEY = 'sk_live_fake';
  ok('a simulated reader is refused with live keys', !(await registerReader(c.id, { code: SIMULATED_CODE })).ok);
  ok('…and so is a simulated tap', !(await simulateTap(c.id, 'x')).ok);
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  ok('a wrong pairing code says so', !(await registerReader(c.id, { code: 'nope' })).ok);
  const [r1, r2] = await Promise.all([registerReader(c.id, { code: SIMULATED_CODE, label: 'Front' }), registerReader(c.id, { code: 'good-code', label: 'Back' })]);
  const loc = (await prisma.course.findUniqueOrThrow({ where: { id: c.id } })).terminalLocationId;
  ok('two readers connected at once share ONE location on the course’s account', r1.ok && r2.ok && locations.length === 1 && loc === locations[0].id && locations[0].account === 'acct_a', { locations, loc });
  const front = r1.ok ? r1.value.id : '', back = r2.ok ? r2.value.id : '';
  const listed = await listReaders(c.id);
  ok('the course lists its readers, simulated marked', listed.ok && listed.value.length === 2 && listed.value.some(r => r.simulated && r.label === 'Front'));
  const theirs = await registerReader(other.id, { code: 'good-code', label: 'Theirs' });
  const theirReader = theirs.ok ? theirs.value.id : '';

  // ── A sale on the reader, paid ──
  const s1 = await sell();
  ok('a reader sale starts unpaid, with no pay link', s1.status === 'open' && !s1.payToken && !s1.link);
  ok('another course’s reader can’t take this course’s sale', !(await startReaderPayment(c.id, s1.id, theirReader)).ok && (await sale(s1.id)).status === 'open');
  const st = await startReaderPayment(c.id, s1.id, front);
  const pi1 = (await sale(s1.id)).paymentIntentId;
  ok('sent to the reader: claimed, one in-person intent on the course’s account', st.ok && (await sale(s1.id)).status === 'paying' && (await sale(s1.id)).readerId === front
    && intents.get(pi1)?.types[0] === 'card_present' && intents.get(pi1)?.account === 'acct_a' && intents.get(pi1)?.amount === 4500, { st, pi: intents.get(pi1) });
  ok('…can’t be sent twice', !(await startReaderPayment(c.id, s1.id, back)).ok && processed.length === 1);
  const w = await readerSaleStatus(c.id, s1.id);
  ok('…waits while the customer is at the reader', w.ok && w.value.status === 'waiting');
  await simulateTap(c.id, s1.id);
  const paid = await readerSaleStatus(c.id, s1.id);
  ok('a tap pays it: paid by card, off the shelf', paid.ok && paid.value.status === 'paid' && (await sale(s1.id)).status === 'paid_card' && (await prisma.shopItem.findUniqueOrThrow({ where: { id: balls.id } })).stockCount === 9, paid);
  ok('…and asking again changes nothing', (await readerSaleStatus(c.id, s1.id)).ok && (await prisma.shopItem.findUniqueOrThrow({ where: { id: balls.id } })).stockCount === 9);

  // ── Declined, then tried again on the same intent ──
  const s2 = await sell();
  await startReaderPayment(c.id, s2.id, front);
  await simulateTap(c.id, s2.id, 'declined');
  const d = await readerSaleStatus(c.id, s2.id);
  ok('a declined card puts the sale back, with the reader’s reason', d.ok && d.value.status === 'declined' && /declined/.test(d.value.message ?? '') && (await sale(s2.id)).status === 'open', d);
  const pi2 = (await sale(s2.id)).paymentIntentId;
  await startReaderPayment(c.id, s2.id, front);
  ok('trying again reuses the sale’s one intent', (await sale(s2.id)).paymentIntentId === pi2 && [...intents.values()].filter(x => x.key.endsWith(s2.id)).length === 1);
  tap(front);
  ok('…and the second card pays it', (await readerSaleStatus(c.id, s2.id)).ok && (await sale(s2.id)).status === 'paid_card');

  // ── Cancel ──
  const s3 = await sell();
  await startReaderPayment(c.id, s3.id, front);
  const cx = await cancelReaderPayment(c.id, s3.id);
  ok('cancel stops the reader and puts the sale back; nothing charged', cx.ok && cx.value.status === 'cancelled' && (await sale(s3.id)).status === 'open' && readers.get(front)!.action === null);
  await startReaderPayment(c.id, s3.id, front);
  tap(front); // the card goes through just as staff press cancel
  const late = await cancelReaderPayment(c.id, s3.id);
  ok('a card that went through as staff pressed cancel is recorded as paid', late.ok && late.value.status === 'paid' && (await sale(s3.id)).status === 'paid_card', late);
  const s4 = await sell();
  await startReaderPayment(c.id, s4.id, front);
  readers.get(front)!.action = null; // cancelled on the reader itself
  const gone = await readerSaleStatus(c.id, s4.id);
  ok('cancelled on the reader itself: the sale goes back to open', gone.ok && gone.value.status === 'cancelled' && (await sale(s4.id)).status === 'open');

  // ── Races the reviewer found ──
  const s7 = await sell();
  await startReaderPayment(c.id, s7.id, front);
  cancelRefused = true; // the customer tapped; the reader is authorising and won't stop
  const refused = await cancelReaderPayment(c.id, s7.id);
  cancelRefused = false;
  ok('cancel refused mid-authorisation: the sale stays on the reader, never "nothing was charged"', refused.ok && refused.value.status === 'waiting' && (await sale(s7.id)).status === 'paying', refused);
  tap(front);
  ok('…and the card going through is recorded', (await readerSaleStatus(c.id, s7.id)).ok && (await sale(s7.id)).status === 'paid_card');
  const s8 = await sell();
  dispatch = 'timeout_after';
  const unsure = await startReaderPayment(c.id, s8.id, front);
  ok('a timeout after the reader got the job keeps the sale on the reader', unsure.ok && (await sale(s8.id)).status === 'paying', unsure);
  tap(front);
  ok('…so a tap pays it', (await readerSaleStatus(c.id, s8.id)).ok && (await sale(s8.id)).status === 'paid_card');
  const s9 = await sell();
  dispatch = 'timeout_before';
  await startReaderPayment(c.id, s9.id, front);
  const never = await readerSaleStatus(c.id, s9.id);
  ok('a timeout where the reader never got the job: the next check puts the sale back', never.ok && never.value.status === 'cancelled' && (await sale(s9.id)).status === 'open', never);
  await startReaderPayment(c.id, s9.id, front);
  intents.get((await sale(s9.id)).paymentIntentId)!.status = 'requires_capture';
  ok('a card only held is taken, not left stuck', (await readerSaleStatus(c.id, s9.id)).ok && (await sale(s9.id)).status === 'paid_card');
  readers.get(front)!.action = null;
  const noAddr = await prisma.course.create({ data: { name: 'No address', slug: `${TAG}-d`, operatorId: op.id, address: '', city: '', state: '', zipCode: '', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_d', stripeAccountActive: true } });
  const na = await registerReader(noAddr.id, { code: SIMULATED_CODE });
  ok('no city/state/ZIP: says to add them, before asking Stripe', !na.ok && /city, state and ZIP/.test(na.ok ? '' : na.error) && !locations.some(l => l.account === 'acct_d'), na);

  // ── Offline, busy ──
  nextReaderOffline = true;
  const off = await startReaderPayment(c.id, s4.id, front);
  ok('an offline reader says so and leaves the sale open', !off.ok && /offline/.test(off.ok ? '' : off.error) && (await sale(s4.id)).status === 'open', off);
  const s5 = await sell();
  await startReaderPayment(c.id, s4.id, front);
  const busy = await startReaderPayment(c.id, s5.id, front);
  ok('a reader busy with another sale says so; that sale stays open', !busy.ok && /busy/.test(busy.ok ? '' : busy.error) && (await sale(s5.id)).status === 'open', busy);
  await cancelReaderPayment(c.id, s4.id);

  // ── Cash or void instead ──
  const blocked = await cancelSaleIntent(c.id, s4.id);
  ok('taking cash after a cancel stops the sale’s card intent first', blocked === null && intents.get((await sale(s4.id)).paymentIntentId)!.status === 'canceled');
  const cash = await settleOpenSale(c.id, s4.id, 'paid_cash');
  ok('…then records the cash', cash.ok && (await sale(s4.id)).status === 'paid_cash');
  ok('a paid sale can’t go back on the reader', !(await startReaderPayment(c.id, s1.id, front)).ok);
  const link = await createSale({ courseId: c.id, lines: [{ shopItemId: balls.id, quantity: 1 }], pay: 'link', soldBy: 't', customerPhone: '5555555555' });
  ok('a pay-link sale can’t be moved to the reader', link.ok && !(await startReaderPayment(c.id, link.value.id, front)).ok);
  ok('under 50¢ is cash only', !(await createSale({ courseId: c.id, lines: [{ name: 'Tee', priceCents: 40, quantity: 1 }], pay: 'reader', soldBy: 't' })).ok);

  // ── A sale stuck on the reader is settled from Stripe ──
  const s6 = await sell();
  await startReaderPayment(c.id, s6.id, back);
  await prisma.shopSale.update({ where: { id: s6.id }, data: { chargeStartedAt: new Date(Date.now() - 11 * 60 * 1000) } });
  ok('a reader sale left waiting 10 minutes with nothing paid goes back to open — and the reader is stopped', (await reconcileStuckSale(c.id, s6.id)) === 'open' && readers.get(back)!.action === null);

  // ── Removing ──
  ok('another course can’t remove this course’s reader', !(await removeReader(other.id, front)).ok && readers.has(front));
  ok('…so it can go straight back on the reader', (await startReaderPayment(c.id, s6.id, back)).ok);
  ok('a reader taking a payment can’t be removed', !(await removeReader(c.id, back)).ok);
  await cancelReaderPayment(c.id, s6.id);
  const rm = await removeReader(c.id, back);
  ok('the owner removes a reader', rm.ok && !readers.has(back), rm);

  // ── Routes ──
  const route = readFileSync('src/app/api/operator/card-readers/route.ts', 'utf8');
  ok('only the owner connects or removes a reader', (route.match(/if \(session\.isStaff\) return NextResponse\.json\(\{ error: STAFF_FORBIDDEN \}/g) ?? []).length === 2 && route.includes("requirePermission(session, 'shop.sell')"));
  const sales = readFileSync('src/app/api/operator/shop-sales/route.ts', 'utf8');
  ok('starting a reader payment needs a current agreement, like a pay link', /action === 'reader_start'\) \{\s*const agreementBlock = await requireAgreementCurrent/.test(sales));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('card-reader-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
