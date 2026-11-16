// Memberships item 1 (Cam 2026-11-16): dues taken at the course — on the card reader (lib/dues-reader), with a typed
// card (lib/dues-payment, the pay link's own path), or in cash (mark_paid, register open) — each recorded ONCE on the
// ledger, and the member active only once paid. Against a real database with Stripe stubbed.
// Run: npx tsx scripts/dues-payment-db-test.ts
import Stripe from 'stripe';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { startDuesOnReader, duesReaderStatus, cancelDuesOnReader, DUES_READER_STALE_MS } from '../src/lib/dues-reader';
import { payDuesByCard } from '../src/lib/dues-payment';
import { markDuesPaidAtCourse } from '../src/lib/membership-dues';
import { duesThisYear } from '../src/lib/dues-year';
import { daySummary } from '../src/lib/register-close';
const TAG = 'duespay1';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// ── Stripe stubs ─────────────────────────────────────────────────────────────
type PI = { id: string; amount: number; status: string; account: string; payment_method_types: string[]; application_fee_amount?: number; key: string; metadata: Record<string, string> };
const intents = new Map<string, PI>();
type Act = { type: string; status: string; failure_message?: string; process_payment_intent: { payment_intent: string } };
const readers = new Map<string, { id: string; location: string; account: string; status: string; device_type: string; action: Act | null }>();
let confirmOutcome: 'succeeded' | 'decline' = 'succeeded';
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.paymentIntents.create = async (p: { amount: number; payment_method_types: string[]; application_fee_amount?: number; metadata: Record<string, string> }, o: { stripeAccount: string; idempotencyKey: string }) => {
  const found = [...intents.values()].find(x => x.key === o.idempotencyKey); if (found) return { ...found };
  const pi: PI = { id: `pi_${intents.size + 1}`, amount: p.amount, status: 'requires_payment_method', account: o.stripeAccount, payment_method_types: p.payment_method_types, application_fee_amount: p.application_fee_amount, key: o.idempotencyKey, metadata: p.metadata ?? {} };
  intents.set(pi.id, pi); return { ...pi };
};
s.paymentIntents.retrieve = async (id: string) => ({ ...intents.get(id)! });
s.paymentIntents.cancel = async (id: string) => { const pi = intents.get(id)!; if (pi.status === 'succeeded') throw new Stripe.errors.StripeInvalidRequestError({ message: 'already succeeded', type: 'invalid_request_error' } as never); pi.status = 'canceled'; return { ...pi }; };
s.paymentIntents.capture = async (id: string) => { intents.get(id)!.status = 'succeeded'; return { ...intents.get(id)! }; };
s.paymentIntents.confirm = async (id: string) => {
  const pi = intents.get(id)!;
  if (!pi.payment_method_types.includes('card')) throw new Stripe.errors.StripeInvalidRequestError({ message: 'payment method type not allowed', type: 'invalid_request_error' } as never);
  if (confirmOutcome === 'decline') throw new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' } as never);
  pi.status = 'succeeded'; return { ...pi };
};
s.customers.create = async () => ({ id: `cus_${Math.random().toString(36).slice(2, 8)}` });
s.paymentMethods.attach = async () => ({});
s.paymentMethods.create = async () => ({ id: `pm_clone_${Math.random().toString(36).slice(2, 8)}` });
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
terminal.readers.cancelAction = async (id: string) => { const r = readers.get(id)!; if (!r.action || r.action.status !== 'in_progress') throw new Stripe.errors.StripeInvalidRequestError({ message: 'Cannot cancel', type: 'invalid_request_error' } as never); r.action = null; return { ...r }; };
const tap = (readerId: string, good = true) => {
  const r = readers.get(readerId)!; const pi = intents.get(r.action!.process_payment_intent.payment_intent)!;
  if (good) { pi.status = 'succeeded'; r.action!.status = 'succeeded'; } else { r.action!.status = 'failed'; r.action!.failure_message = 'Your card was declined.'; }
};

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.registerClose.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.registerOpen.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, acct: string) => prisma.course.create({ data: { name: `Dues ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC', stripeAccountId: acct, stripeAccountActive: true, terminalLocationId: `tml_${n}` } });
  const c = await mk('a', 'acct_a'), other = await mk('b', 'acct_b');
  readers.set('tmr_a', { id: 'tmr_a', location: 'tml_a', account: 'acct_a', status: 'online', device_type: 'simulated_wisepos_e', action: null });
  readers.set('tmr_b', { id: 'tmr_b', location: 'tml_b', account: 'acct_b', status: 'online', device_type: 'simulated_wisepos_e', action: null });
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', annualFeeCents: 100_000, initiationFeeCents: 20_000, termMonths: 12 } });
  let n = 0;
  const member = (o: { status?: string } = {}) => prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, membershipType: 'Full', status: o.status ?? 'awaiting_payment', addedBy: 'counter', inviteEmail: `${TAG}+${n++}@t.local`, inviteName: 'New Member', payToken: `tok${n}` } });
  const get = (id: string) => prisma.courseMembership.findUniqueOrThrow({ where: { id } });
  const moves = (id: string) => prisma.moneyMove.findMany({ where: { membershipId: id }, orderBy: { at: 'asc' } });

  // ── On the card reader ──
  const a = await member();
  ok('another course can’t put this member on its reader', !(await startDuesOnReader(other.id, a.id, 'tmr_b', 'staff')).ok);
  ok('another course’s reader can’t take these dues', !(await startDuesOnReader(c.id, a.id, 'tmr_b', 'staff')).ok);
  const st = await startDuesOnReader(c.id, a.id, 'tmr_a', 'staff@x');
  const pi = intents.get((await get(a.id)).duesIntentId)!;
  ok('on the reader: one in-person intent for dues + initiation + 1%, the 1% as GreenReserve’s fee', st.ok && st.value.dueCents === 121_200 && pi.amount === 121_200 && pi.application_fee_amount === 1_200 && pi.payment_method_types[0] === 'card_present' && pi.account === 'acct_a', { st, pi });
  ok('…the membership is claimed for the reader', (await get(a.id)).duesReaderId === 'tmr_a');
  ok('a second start is refused', !(await startDuesOnReader(c.id, a.id, 'tmr_a', 'staff')).ok);
  const link = await payDuesByCard({ membershipId: a.id, paymentMethodId: 'pm_x', expectedTotalCents: 121_200, by: 'golfer' });
  ok('the pay link waits while the dues are on the reader', !link.ok && /card reader/.test(link.error), link);
  const cash = await markDuesPaidAtCourse(c.id, a.id, { method: 'cash' });
  ok('cash waits while the dues are on the reader', !cash.ok && /card reader/.test(cash.error), cash);
  ok('still waiting before the tap; not a member yet', (await duesReaderStatus(c.id, a.id, 'staff')).ok && (await get(a.id)).status === 'awaiting_payment');
  tap('tmr_a');
  const paid = await duesReaderStatus(c.id, a.id, 'staff');
  const after = await get(a.id);
  ok('the tap goes through: paid, active, the claim gone, the term recorded once (this look says it recorded it)', paid.ok && paid.value.status === 'paid' && !!paid.value.recorded && paid.value.recorded.firstPayment && after.status === 'active' && after.paymentStatus === 'paid' && !after.duesReaderId && !after.duesChargeStartedAt && !!after.expiresAt, { paid, after });
  const again = await duesReaderStatus(c.id, a.id, 'staff');
  ok('looking again records nothing more', again.ok && !again.value.recorded);
  const am = await moves(a.id);
  ok('one ledger row: dues in, in person, the 1% as GreenReserve’s part', am.length === 1 && am[0].what === 'dues' && am[0].method === 'card_present' && am[0].amountCents === 121_200 && am[0].platformFeeCents === 1_200 && am[0].stripeId === pi.id, am);

  // ── Declined, then cancelled ──
  const b = await member();
  await startDuesOnReader(c.id, b.id, 'tmr_a', 'staff');
  tap('tmr_a', false);
  const dec = await duesReaderStatus(c.id, b.id, 'staff');
  const bAfter = await get(b.id);
  ok('a declined card: said so, the intent stopped, the claim released, still not a member', dec.ok && dec.value.status === 'declined' && intents.get(bAfter.duesIntentId)!.status === 'canceled' && !bAfter.duesReaderId && bAfter.status === 'awaiting_payment', { dec, bAfter });
  readers.get('tmr_a')!.action = null;
  await startDuesOnReader(c.id, b.id, 'tmr_a', 'staff');
  const firstReaderPi = (await get(b.id)).duesIntentId;
  const can = await cancelDuesOnReader(c.id, b.id, 'staff');
  ok('cancel stops the reader and the intent, and releases', can.ok && can.value.status === 'cancelled' && intents.get(firstReaderPi)!.status === 'canceled' && !(await get(b.id)).duesReaderId, can);

  // ── A typed card after the reader was cancelled ──
  const typed = await payDuesByCard({ membershipId: b.id, courseId: c.id, paymentMethodId: 'pm_typed', expectedTotalCents: 121_200, by: 'staff' });
  const bPaid = await get(b.id);
  const bm = await moves(b.id);
  ok('a typed card at the course: a fresh card intent (never the cancelled reader one), paid, active, one ledger row', typed.ok && typed.firstPayment && bPaid.status === 'active' && bm.length === 1 && bm[0].method === 'card' && bm[0].stripeId !== firstReaderPi && bm[0].actor === 'staff' && bm[0].platformFeeCents === 1_200, { typed, bm });
  ok('staff never turn on automatic renewal', !bPaid.autoRenew);
  const twice = await payDuesByCard({ membershipId: b.id, courseId: c.id, paymentMethodId: 'pm_typed', expectedTotalCents: 121_200, by: 'staff' });
  ok('paid until renewal: a second typed card is refused', !twice.ok && /already paid/.test(twice.error), twice);
  ok('another course can’t take a card for this member', !(await payDuesByCard({ membershipId: b.id, courseId: other.id, paymentMethodId: 'pm', expectedTotalCents: 121_200, by: 'staff' })).ok);
  const d = await member();
  const stale = await payDuesByCard({ membershipId: d.id, courseId: c.id, paymentMethodId: 'pm', expectedTotalCents: 100_000, by: 'staff' });
  ok('a total that isn’t what is due now is refused (refresh, never a surprise charge)', !stale.ok && /changed/.test(stale.error), stale);
  confirmOutcome = 'decline';
  const declined = await payDuesByCard({ membershipId: d.id, courseId: c.id, paymentMethodId: 'pm', expectedTotalCents: 121_200, by: 'staff' });
  ok('a declined typed card: no ledger row, the claim released, not a member', !declined.ok && (await moves(d.id)).length === 0 && !(await get(d.id)).duesChargeStartedAt && (await get(d.id)).status === 'awaiting_payment', declined);
  confirmOutcome = 'succeeded';

  // ── A stale reader claim is settled before anything else takes the dues ──
  const e = await member();
  await startDuesOnReader(c.id, e.id, 'tmr_a', 'staff');
  const ePi = (await get(e.id)).duesIntentId;
  await prisma.courseMembership.update({ where: { id: e.id }, data: { duesChargeStartedAt: new Date(Date.now() - DUES_READER_STALE_MS - 60_000) } });
  const eCard = await payDuesByCard({ membershipId: e.id, courseId: c.id, paymentMethodId: 'pm', expectedTotalCents: 121_200, by: 'staff' });
  ok('a reader left 10 minutes is stopped first, then the typed card goes through — one payment', eCard.ok && intents.get(ePi)!.status === 'canceled' && (await moves(e.id)).length === 1, eCard);
  readers.get('tmr_a')!.action = null;

  // ── Cash at the course, and the close-out ──
  const f = await member();
  const fc = await markDuesPaidAtCourse(c.id, f.id, { method: 'cash' });
  const fm = await moves(f.id);
  ok('cash: active, paid offline, one cash row of the dues alone (no 1% on cash)', fc.ok && (await get(f.id)).status === 'active' && fm.length === 1 && fm[0].method === 'cash' && fm[0].amountCents === 120_000 && fm[0].platformFeeCents === 0, fm);
  const today = new Date().toISOString().slice(0, 10);
  const sum = await daySummary(c.id, today);
  ok('the close-out counts the dues cash in the expected cash', sum.ok && sum.value.otherCash.cents === 120_000, sum.ok ? sum.value.otherCash : sum);

  // ── Dues this year ──
  const year = await duesThisYear(c.id, 'UTC');
  ok('dues this year: what the course kept (cards less the 1%, plus cash), by membership', year.totalCents === 120_000 * 4 && year.byTier.length === 1 && year.byTier[0].tierId === tier.id && year.byTier[0].cents === 480_000, year);
  ok('another course sees none of it', (await duesThisYear(other.id, 'UTC')).totalCents === 0);

  await cleanup(); await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
