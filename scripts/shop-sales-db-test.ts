// POS-2 — the walk-up sale status machine, run against a database with the
// Stripe client's methods swapped for fakes (as pos-shop-test.ts does).
// Needs a database, no Stripe. Run: npx tsx scripts/shop-sales-db-test.ts
import Stripe from 'stripe';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { createSale, settleOpenSale, chargeSale, reconcileStuckSale, cancelSaleIntent, STALE_CHARGE_MS } from '../src/lib/shop-sales';

const TAG = 'shopsaledbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// ── Fake Stripe: one PaymentIntent store; confirm does what `next` says ──────
type PI = { id: string; status: string; amount: number };
const intents = new Map<string, PI>();
let created = 0, confirms = 0, cancels = 0;
let next: 'succeed' | 'decline' | 'timeout' = 'succeed';
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.customers.create = async () => ({ id: 'cus_fake' });
s.paymentMethods.attach = async () => ({ id: 'pm_fake' });
s.paymentMethods.create = async () => ({ id: 'pm_clone_fake' });
s.paymentIntents.create = async (p: { amount: number }, o: { idempotencyKey: string }) => {
  const id = `pi_${o.idempotencyKey}`;
  if (!intents.has(id)) { created++; intents.set(id, { id, status: 'requires_payment_method', amount: p.amount }); }
  return { ...intents.get(id)! };
};
s.paymentIntents.retrieve = async (id: string) => ({ ...intents.get(id)! });
s.paymentIntents.cancel = async (id: string) => { cancels++; intents.get(id)!.status = 'canceled'; return { ...intents.get(id)! }; };
s.paymentIntents.confirm = async (id: string) => {
  confirms++;
  const pi = intents.get(id)!;
  if (pi.status === 'canceled') throw new Error('You cannot confirm this PaymentIntent because it has a status of canceled.');
  if (next === 'decline') throw new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' } as never);
  if (next === 'timeout') { pi.status = 'succeeded'; throw new Error('Request timed out'); } // charged, but we never heard
  pi.status = 'succeeded';
  return { ...pi };
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId } } });
  await prisma.shopSale.deleteMany({ where: { courseId } });
  await prisma.shopItem.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Shop Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Shop ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });
  const course = await mk('a');
  const other = await mk('b');
  const balls = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Balls', priceCents: 1200, stockCount: 10 } });
  const tees = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Tees', priceCents: 300 } });
  const foreign = await prisma.shopItem.create({ data: { courseId: other.id, name: 'Hat', priceCents: 2500 } });
  const stock = async () => (await prisma.shopItem.findUnique({ where: { id: balls.id } }))!.stockCount;
  const status = async (id: string) => (await prisma.shopSale.findUnique({ where: { id } }))!.status;
  const link = async () => {
    const r = await createSale({ courseId: course.id, lines: [{ shopItemId: balls.id, quantity: 2 }], pay: 'link', soldBy: 't' });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  // Cash
  const cash = await createSale({ courseId: course.id, lines: [{ shopItemId: balls.id, quantity: 1 }, { shopItemId: tees.id, quantity: 2 }, { shopItemId: balls.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  check('cash sale is paid at once, priced from the catalog, duplicate lines merged', cash.ok && cash.value.status === 'paid_cash' && cash.value.totalCents === 3000, cash);
  check('cash takes stock; uncounted items are left alone', (await stock()) === 8 && (await prisma.shopItem.findUnique({ where: { id: tees.id } }))!.stockCount === null);
  const cross = await createSale({ courseId: course.id, lines: [{ shopItemId: foreign.id, quantity: 1 }], pay: 'cash', soldBy: 't' });
  check('another course\'s item cannot be sold', !cross.ok && cross.status === 404);

  // Link → card paid
  const a = await link();
  check('a link sale waits and takes no stock', a.status === 'open' && (await stock()) === 8);
  check('a wrong token is refused', !(await chargeSale(a.id, 'nope', 'pm_x', a.totalCents)).ok);
  check('a stale total is refused', (await chargeSale(a.id, a.payToken, 'pm_x', 1)).ok === false);
  next = 'succeed';
  const paid = await chargeSale(a.id, a.payToken, 'pm_card1', a.totalCents);
  check('the card pays the sale and takes stock', paid.ok && (await status(a.id)) === 'paid_card' && (await stock()) === 6, paid);
  const again = await chargeSale(a.id, a.payToken, 'pm_card2', a.totalCents);
  check('a paid sale cannot be charged again', !again.ok && confirms === 1);
  check('staff cannot void or take cash for a card-paid sale', !(await settleOpenSale(course.id, a.id, 'void')).ok);

  // Decline → open → retry on the SAME intent
  const b = await link();
  next = 'decline';
  const d = await chargeSale(b.id, b.payToken, 'pm_bad', b.totalCents);
  check('a decline reopens the sale', !d.ok && d.status === 402 && (await status(b.id)) === 'open', d);
  next = 'succeed';
  const createdBefore = created;
  const ok2 = await chargeSale(b.id, b.payToken, 'pm_good', b.totalCents);
  check('the retry confirms the same PaymentIntent (one per sale)', ok2.ok && created === createdBefore && (await status(b.id)) === 'paid_card');

  // Timeout → stays paying; a retry reads the intent and records it, never charges twice
  const c = await link();
  next = 'timeout';
  const t = await chargeSale(c.id, c.payToken, 'pm_t', c.totalCents);
  check('a timeout keeps the claim ("don\'t pay again")', !t.ok && t.status === 502 && (await status(c.id)) === 'paying', t);
  check('staff cannot take cash while a payment may be going through', (await cancelSaleIntent(course.id, c.id)) !== null && cancels === 0);
  check('a second tap during the claim is refused', !(await chargeSale(c.id, c.payToken, 'pm_t2', c.totalCents)).ok);
  await prisma.shopSale.update({ where: { id: c.id }, data: { chargeStartedAt: new Date(Date.now() - STALE_CHARGE_MS - 1000) } });
  const confirmsBefore = confirms;
  check('the pro shop\'s list settles it from Stripe as paid', (await reconcileStuckSale(course.id, c.id)) === 'paid_card' && (await status(c.id)) === 'paid_card' && confirms === confirmsBefore);

  // Took cash on an open link sale whose intent exists → intent canceled; the link then says so
  const e = await link();
  next = 'decline';
  await chargeSale(e.id, e.payToken, 'pm_bad', e.totalCents); // creates the intent, back to open
  check('took cash: the open sale\'s intent is canceled first', (await cancelSaleIntent(course.id, e.id)) === null && cancels === 1);
  const cashed = await settleOpenSale(course.id, e.id, 'paid_cash');
  check('then the sale is cash-paid and takes stock', cashed.ok && (await status(e.id)) === 'paid_cash');
  const late = await chargeSale(e.id, e.payToken, 'pm_late', e.totalCents);
  check('the customer\'s page then refuses to charge', !late.ok && late.status === 409);

  // Intent canceled but the sale still open (cancel landed, settle did not)
  const f = await link();
  await chargeSale(f.id, f.payToken, 'pm_bad', f.totalCents);
  await cancelSaleIntent(course.id, f.id);
  next = 'succeed';
  const closed = await chargeSale(f.id, f.payToken, 'pm_g', f.totalCents);
  check('a canceled intent is "ask for a new link", not a stuck "wait"', !closed.ok && closed.status === 409 && (await status(f.id)) === 'open', closed);

  // A claim that died before its intent was stored
  const g = await link();
  await prisma.shopSale.update({ where: { id: g.id }, data: { status: 'paying', chargeStartedAt: new Date(Date.now() - STALE_CHARGE_MS - 1000) } });
  check('a stale claim with no intent goes back to open', (await reconcileStuckSale(course.id, g.id)) === 'open' && (await status(g.id)) === 'open');
  const v = await settleOpenSale(course.id, g.id, 'void');
  check('an open sale can be voided', v.ok && (await status(g.id)) === 'void');
  check('a voided sale cannot be paid', !(await chargeSale(g.id, g.payToken, 'pm_v', g.totalCents)).ok);
  check('another course cannot void this course\'s sale', !(await settleOpenSale(other.id, b.id, 'void')).ok);

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
