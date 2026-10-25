// POS-3 R3b (Cam 2026-10-24, "Ok go"): a group's round paid on the course's
// card reader — a real card payment of the booking (performCheckIn with
// cardPresent), GreenReserve's fee as the application fee, the booking claimed
// while it is on the reader. Against a real database with Stripe stubbed.
// Run: npx tsx scripts/reader-rounds-db-test.ts
import Stripe from 'stripe';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { startRoundOnReader, roundReaderStatus, cancelRoundOnReader } from '../src/lib/reader-rounds';
import { performCheckIn } from '../src/lib/checkin-booking';
import { settleAtCounter } from '../src/lib/counter-pay';
import { todayIn, addDaysStr } from '../src/lib/course-time';
const TAG = 'r3bround';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
const STAFF = { type: 'staff' as const, id: null };

// ── Stripe stubs ─────────────────────────────────────────────────────────────
type PI = { id: string; amount: number; status: string; account: string; types: string[]; fee?: number; key: string; metadata: Record<string, string>; created: number };
const intents = new Map<string, PI>();
const refunds: { pi: string; amount?: number; appFee: boolean; account: string }[] = [];
type Act = { type: string; status: string; failure_message?: string; process_payment_intent: { payment_intent: string } };
const readers = new Map<string, { id: string; location: string; account: string; status: string; device_type: string; action: Act | null }>();
let cancelRefused = false;
let onCreate: null | (() => Promise<void>) = null; // runs inside paymentIntents.create, once
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.paymentIntents.create = async (p: { amount: number; payment_method_types: string[]; application_fee_amount?: number; metadata: Record<string, string> }, o: { stripeAccount: string; idempotencyKey: string }) => {
  const found = [...intents.values()].find(x => x.key === o.idempotencyKey); if (found) return { ...found };
  if (onCreate) { const f = onCreate; onCreate = null; await f(); }
  const pi: PI = { id: `pi_${intents.size + 1}`, amount: p.amount, status: 'requires_payment_method', account: o.stripeAccount, types: p.payment_method_types, fee: p.application_fee_amount, key: o.idempotencyKey, metadata: p.metadata, created: Math.floor(Date.now() / 1000) };
  intents.set(pi.id, pi); return { ...pi };
};
s.paymentIntents.retrieve = async (id: string) => ({ ...intents.get(id)! });
s.paymentIntents.cancel = async (id: string) => { const pi = intents.get(id)!; if (pi.status === 'succeeded') throw new Stripe.errors.StripeInvalidRequestError({ message: 'already succeeded', type: 'invalid_request_error' } as never); pi.status = 'canceled'; return { ...pi }; };
s.paymentIntents.capture = async (id: string) => { intents.get(id)!.status = 'succeeded'; return { ...intents.get(id)! }; };
s.paymentIntents.search = async (p: { query: string }, o: { stripeAccount: string }) => {
  const id = /bookingId'\]:'([^']+)'/.exec(p.query)![1];
  return { data: [...intents.values()].filter(x => x.account === o.stripeAccount && x.metadata.bookingId === id && x.status === 'succeeded') };
};
s.refunds.create = async (p: { payment_intent: string; amount?: number; refund_application_fee?: boolean }, o: { stripeAccount: string }) => {
  refunds.push({ pi: p.payment_intent, amount: p.amount, appFee: !!p.refund_application_fee, account: o.stripeAccount });
  return { id: `re_${refunds.length}`, amount: p.amount ?? intents.get(p.payment_intent)?.amount ?? 0 };
};
const terminal = stripe.terminal as unknown as Record<string, Record<string, unknown>>;
terminal.readers.retrieve = async (id: string, _p: unknown, o: { stripeAccount: string }) => {
  const r = readers.get(id); if (!r || r.account !== o.stripeAccount) throw new Stripe.errors.StripeInvalidRequestError({ message: 'No such reader', type: 'invalid_request_error' } as never);
  return { ...r };
};
terminal.readers.processPaymentIntent = async (id: string, p: { payment_intent: string }) => {
  const r = readers.get(id)!;
  if (r.action?.status === 'in_progress') throw new Stripe.errors.StripeInvalidRequestError({ message: 'Reader is busy', type: 'invalid_request_error', code: 'terminal_reader_busy' } as never);
  r.action = { type: 'process_payment_intent', status: 'in_progress', process_payment_intent: { payment_intent: p.payment_intent } }; return { ...r };
};
terminal.readers.cancelAction = async (id: string) => {
  const r = readers.get(id)!;
  if (cancelRefused || !r.action || r.action.status !== 'in_progress') throw new Stripe.errors.StripeInvalidRequestError({ message: 'Cannot cancel', type: 'invalid_request_error' } as never);
  r.action = null; return { ...r };
};
const tap = (readerId: string, good = true) => {
  const r = readers.get(readerId)!; const pi = intents.get(r.action!.process_payment_intent.payment_intent)!;
  if (good) { pi.status = 'succeeded'; r.action!.status = 'succeeded'; } else { r.action!.status = 'failed'; r.action!.failure_message = 'Your card was declined.'; }
};

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, acct: string) => prisma.course.create({ data: { name: `Rounds ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: acct, stripeAccountActive: true, terminalLocationId: `tml_${n}` } });
  const c = await mk('a', 'acct_a'), other = await mk('b', 'acct_b');
  readers.set('tmr_a', { id: 'tmr_a', location: 'tml_a', account: 'acct_a', status: 'online', device_type: 'simulated_wisepos_e', action: null });
  readers.set('tmr_b', { id: 'tmr_b', location: 'tml_b', account: 'acct_b', status: 'online', device_type: 'simulated_wisepos_e', action: null });
  const today = todayIn('UTC');
  let n = 0;
  const book = async (courseId: string, o: { access?: number; players?: number; holdFee?: boolean } = {}) => {
    const players = o.players ?? 2;
    const t = await prisma.teeTime.create({ data: { courseId, date: today, time: `23:${String(n++).padStart(2, '0')}`, holes: 18, greenFeeCents: 5000, playersAvailable: 4, playersBooked: players } });
    const access = o.access ?? 0;
    return prisma.booking.create({ data: { teeTimeId: t.id, courseId, golferName: 'Reader Group', golferEmail: `${TAG}+${n}@t.local`, players,
      greenFeeTotal: 5000 * players, cartFeeTotal: 0, accessFeeTotal: access, totalAmount: 5000 * players + access, status: 'confirmed',
      paymentStatus: o.holdFee ? 'cancellation_fee_charged' : 'no_payment_method', ...(o.holdFee ? { cancellationFeeChargeId: 'pi_hold', cancellationFeeTotal: 1000 } : {}) } });
  };
  const get = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });
  const piOf = async (id: string) => intents.get((await get(id)).readerIntentId)!;

  // ── Paid on the reader ──
  const g = await book(c.id, { access: 300 });
  ok('another course’s reader can’t take this group', !(await startRoundOnReader(c.id, g.id, 'tmr_b', STAFF)).ok);
  ok('another course can’t send this group to its reader', !(await startRoundOnReader(other.id, g.id, 'tmr_b', STAFF)).ok);
  const { registerRounds } = await import('../src/lib/register');
  const listed = (await registerRounds(c.id, today, '00:00')).owing.find(o => o.bookingId === g.id);
  const st = await startRoundOnReader(c.id, g.id, 'tmr_a', STAFF);
  const pi = await piOf(g.id);
  ok('on the reader: one in-person intent for the round, GreenReserve’s $1.50/player as the application fee', st.ok && st.value.status === 'waiting' && st.value.dueCents === 10300
    && pi.amount === 10300 && pi.fee === 300 && pi.types[0] === 'card_present' && pi.account === 'acct_a' && pi.metadata.bookingId === g.id, { st, pi });
  ok('the register shows the card amount the reader charges (cash is the round less the fee)', listed?.cardCents === pi.amount && listed?.dueCents === 10000, listed);
  const claimed = await get(g.id);
  ok('…the booking is claimed and its shop items frozen', !!claimed.readerStartedAt && claimed.readerId === 'tmr_a' && !!claimed.shopLockedAt);
  const link = await performCheckIn(g.id, STAFF);
  ok('the pay link / card check-in waits while it is on the reader', 'error' in link && /card reader/.test(link.error), link);
  const cash = await settleAtCounter(c.id, g.id, { actor: STAFF, actorName: 't' });
  ok('…and so does cash at the counter', !cash.ok && /card reader/.test(cash.ok ? '' : cash.error), cash);
  ok('…and it can’t be sent to the reader twice', !(await startRoundOnReader(c.id, g.id, 'tmr_a', STAFF)).ok);
  ok('waits while the customer is at the reader', (await roundReaderStatus(c.id, g.id, STAFF)).ok && !!(await get(g.id)).readerStartedAt);
  tap('tmr_a');
  const paid = await roundReaderStatus(c.id, g.id, STAFF);
  const after = await get(g.id);
  ok('a tap pays the round: checked in, paid by card, the reader’s payment is the round’s', paid.ok && paid.value.status === 'paid' && after.status === 'completed' && after.paymentStatus === 'paid'
    && after.roundPaymentIntentId === pi.id && after.roundChargedCents === 10300 && !after.paidOffline && !after.readerStartedAt, { paid, after: { s: after.status, p: after.paymentStatus } });
  ok('…with a checked_in event, like any card check-in', (await prisma.bookingEvent.count({ where: { bookingId: g.id, type: 'checked_in' } })) === 1);
  ok('…and asking again changes nothing', (await roundReaderStatus(c.id, g.id, STAFF)).ok && (await prisma.bookingEvent.count({ where: { bookingId: g.id, type: 'checked_in' } })) === 1 && refunds.length === 0);

  // ── Walk-in or phone booking: no GreenReserve fee ──
  const w = await book(c.id);
  await startRoundOnReader(c.id, w.id, 'tmr_a', STAFF);
  ok('a booking with no booking fee has no application fee', (await piOf(w.id)).fee === undefined && (await piOf(w.id)).amount === 10000);
  const cx = await cancelRoundOnReader(c.id, w.id, STAFF);
  const wAfter = await get(w.id);
  ok('cancel: the reader stops, the intent is cancelled for good, the group is free again', cx.ok && cx.value.status === 'cancelled' && intents.get(claimed.readerIntentId || '') !== undefined
    && [...intents.values()].filter(x => x.metadata.bookingId === w.id).every(x => x.status === 'canceled') && !wAfter.readerStartedAt && !wAfter.shopLockedAt, cx);
  const cashNow = await settleAtCounter(c.id, w.id, { actor: STAFF, actorName: 't' });
  ok('…so cash can be taken after', cashNow.ok && (await get(w.id)).paymentStatus === 'paid_offline');

  // ── Declined, then tried again ──
  const d = await book(c.id, { access: 300 });
  await startRoundOnReader(c.id, d.id, 'tmr_a', STAFF);
  const first = await piOf(d.id);
  tap('tmr_a', false);
  const dec = await roundReaderStatus(c.id, d.id, STAFF);
  ok('a declined card: the reason shown, the intent cancelled, the group free', dec.ok && dec.value.status === 'declined' && /declined/.test(dec.value.message ?? '') && first.status === 'canceled' && !(await get(d.id)).readerStartedAt, dec);
  readers.get('tmr_a')!.action = null;
  await startRoundOnReader(c.id, d.id, 'tmr_a', STAFF);
  const second = await piOf(d.id);
  ok('trying again makes a fresh intent (the old one can never be paid)', second.id !== first.id);

  // ── Cancel refused while the card is authorising ──
  cancelRefused = true;
  const busy = await cancelRoundOnReader(c.id, d.id, STAFF);
  cancelRefused = false;
  ok('cancel refused mid-authorisation: still on the reader, never "nothing charged"', busy.ok && busy.value.status === 'waiting' && !!(await get(d.id)).readerStartedAt && second.status !== 'canceled', busy);
  tap('tmr_a');
  ok('…and the card going through pays the round', (await roundReaderStatus(c.id, d.id, STAFF)).ok && (await get(d.id)).paymentStatus === 'paid' && (await get(d.id)).roundPaymentIntentId === second.id);
  readers.get('tmr_a')!.action = null;

  // ── Paid twice: the reader payment is refunded ──
  const x = await book(c.id, { access: 300 });
  await startRoundOnReader(c.id, x.id, 'tmr_a', STAFF);
  const xpi = await piOf(x.id);
  await prisma.booking.update({ where: { id: x.id }, data: { status: 'cancelled' } }); // cancelled from another screen meanwhile
  tap('tmr_a');
  const dup = await roundReaderStatus(c.id, x.id, STAFF);
  ok('a card that goes through on a round cancelled meanwhile is refunded in full, GreenReserve’s fee with it', dup.ok && dup.value.status === 'refunded' && refunds.some(r => r.pi === xpi.id && r.appFee && r.amount === undefined && r.account === 'acct_a') && !(await get(x.id)).readerStartedAt, { dup, refunds });
  readers.get('tmr_a')!.action = null;

  // ── Already paid by card: never a second ──
  const y = await book(c.id, { access: 300 });
  intents.set('pi_link', { id: 'pi_link', amount: 10300, status: 'succeeded', account: 'acct_a', types: ['card'], key: 'k', metadata: { bookingId: y.id }, created: 0 });
  const already = await startRoundOnReader(c.id, y.id, 'tmr_a', STAFF);
  ok('a round already paid by card (a pay link) can’t go on the reader', !already.ok && /already paid/.test(already.ok ? '' : already.error) && !(await get(y.id)).readerStartedAt && !(await get(y.id)).shopLockedAt, already);

  // ── The cutoff hold comes back, as at any card check-in ──
  const h = await book(c.id, { access: 300, holdFee: true });
  await startRoundOnReader(c.id, h.id, 'tmr_a', STAFF);
  tap('tmr_a');
  await roundReaderStatus(c.id, h.id, STAFF);
  ok('paid on the reader: the late-cancellation hold is refunded', (await get(h.id)).paymentStatus === 'paid' && refunds.some(r => r.pi === 'pi_hold'));
  readers.get('tmr_a')!.action = null;

  // ── A claim left 10 minutes is settled before cash is taken ──
  const z = await book(c.id);
  await startRoundOnReader(c.id, z.id, 'tmr_a', STAFF);
  const zpi = await piOf(z.id);
  await prisma.booking.update({ where: { id: z.id }, data: { readerStartedAt: new Date(Date.now() - 11 * 60 * 1000) } });
  // Its stamp moved, so the shop lock with the old stamp is this claim's no longer — free it as a real stale claim would be.
  const zcash = await settleAtCounter(c.id, z.id, { actor: STAFF, actorName: 't' });
  ok('a claim left 10 minutes: the reader is stopped and its intent cancelled, then cash goes through', zcash.ok && zpi.status === 'canceled' && readers.get('tmr_a')!.action === null && (await get(z.id)).paymentStatus === 'paid_offline', zcash);
  const v = await book(c.id);
  await startRoundOnReader(c.id, v.id, 'tmr_a', STAFF);
  await prisma.booking.update({ where: { id: v.id }, data: { readerStartedAt: new Date(Date.now() - 11 * 60 * 1000) } });
  tap('tmr_a'); // the customer did tap — late
  const vcash = await settleAtCounter(c.id, v.id, { actor: STAFF, actorName: 't' });
  ok('…and one that turned out paid is recorded as paid by card, never also cash', !vcash.ok && (await get(v.id)).paymentStatus === 'paid' && !(await get(v.id)).paidOffline, vcash);
  readers.get('tmr_a')!.action = null;

  // ── A move while on the reader keeps the price the reader shows ──
  const m = await book(c.id, { access: 300 });
  await startRoundOnReader(c.id, m.id, 'tmr_a', STAFF);
  // Tomorrow, so the move never lands on a time already gone (a staff move may change the day).
  const dearer = await prisma.teeTime.create({ data: { courseId: c.id, date: addDaysStr(today, 1), time: '09:00', holes: 18, greenFeeCents: 9000, playersAvailable: 4 } });
  const { moveBooking } = await import('../src/lib/move-booking');
  const mv = await moveBooking({ bookingId: m.id, newTeeTimeId: dearer.id, courseId: c.id, pricing: 'new_slot', actor: STAFF });
  ok('moving a group on the reader to a dearer time keeps the price on the reader', mv.ok && (await get(m.id)).totalAmount === 10300 && (await piOf(m.id)).amount === 10300, { mv, total: (await get(m.id)).totalAmount });
  await cancelRoundOnReader(c.id, m.id, STAFF);

  // ── Cancelled while it was starting: nothing unclaimed goes to the reader ──
  const r2 = await book(c.id);
  onCreate = async () => { await prisma.booking.update({ where: { id: r2.id }, data: { readerStartedAt: null } }); };
  const raced = await startRoundOnReader(c.id, r2.id, 'tmr_a', STAFF);
  const racedPi = [...intents.values()].find(x => x.metadata.bookingId === r2.id)!;
  ok('a claim ended while starting: the new intent is cancelled and never sent to the reader', !raced.ok && racedPi.status === 'canceled' && readers.get('tmr_a')!.action === null && !(await get(r2.id)).shopLockedAt, raced);

  // ── Under 50¢ ──
  const tiny = await prisma.booking.create({ data: { teeTimeId: (await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: '22:00', holes: 9, greenFeeCents: 40, playersAvailable: 4, playersBooked: 1 } })).id,
    courseId: c.id, golferName: 'Tiny', golferEmail: `${TAG}+t@t.local`, players: 1, greenFeeTotal: 40, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 40, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  ok('under 50¢ is cash only, and nothing stays claimed', !(await startRoundOnReader(c.id, tiny.id, 'tmr_a', STAFF)).ok && !(await get(tiny.id)).readerStartedAt);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('reader-rounds-db: all passed');
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
