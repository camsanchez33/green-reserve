// MEM-ACCT hardening (Cam 2026-10-31): ONE PaymentIntent per statement, exercised through the real
// lib/stripe chargeOneIntent with Stripe stubbed. A second card confirms the same intent; a lost reply
// is read back, never charged again; staff taking cash never stops a payment in flight; a stopped
// intent is replaced, so the statement can still be paid by card.
// Needs a database. Run: npx tsx scripts/statement-intent-db-test.ts
import { prisma } from '../src/lib/prisma';
import { stripe, chargeOneIntent } from '../src/lib/stripe';
import { chargeStatement, markStatementPaidOffline } from '../src/lib/member-statements';

const TAG = 'statementintentdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

type PI = { id: string; amount: number; status: string };
const intents = new Map<string, PI>();
let created = 0, confirms = 0, cancels = 0, nextConfirm: 'ok' | 'decline' | 'lost' | 'hang' = 'ok';
let release: () => void = () => {};
const keys = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = stripe as any;
s.paymentIntents.create = async (p: { amount: number }, o: { idempotencyKey: string }) => {
  if (keys.has(o.idempotencyKey)) return { ...intents.get(keys.get(o.idempotencyKey)!)! };
  const pi = { id: `pi_${TAG}_${++created}`, amount: p.amount, status: 'requires_payment_method' };
  intents.set(pi.id, pi); keys.set(o.idempotencyKey, pi.id); return { ...pi };
};
s.paymentIntents.retrieve = async (id: string) => ({ ...intents.get(id)! });
s.paymentIntents.cancel = async (id: string) => { cancels++; intents.get(id)!.status = 'canceled'; return { ...intents.get(id)! }; };
s.paymentIntents.confirm = async (id: string) => {
  confirms++;
  const pi = intents.get(id)!;
  if (pi.status === 'canceled') throw new Error('This PaymentIntent is canceled.');
  if (pi.status === 'succeeded') throw new Error('Already succeeded.');
  if (nextConfirm === 'hang') await new Promise<void>(r => { release = r; });
  if (nextConfirm === 'decline') { pi.status = 'requires_payment_method'; throw new Error('Your card was declined.'); }
  pi.status = 'succeeded';
  if (nextConfirm === 'lost') throw new Error('Request timed out');
  return { ...pi };
};
s.paymentMethods.create = async () => ({ id: `pm_clone_${Math.random()}` });

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.memberStatement.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const card = (pm: string) => ({ customerId: 'cus_x', paymentMethodId: pm, actor: 'golfer' as const });

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Intent GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_x', stripeAccountActive: true } });
  const m = await prisma.courseMembership.create({ data: { courseId: c.id, inviteName: 'Pat', status: 'active' } });
  let n = 0;
  const statement = () => prisma.memberStatement.create({ data: { courseId: c.id, membershipId: m.id, period: `2026-0${++n}`, closedAt: new Date(), dueAt: new Date(Date.now() + 15 * 86_400_000), totalCents: 5000, feeCents: 150, payToken: `${TAG}-${n}` } });
  const row = (id: string) => prisma.memberStatement.findUniqueOrThrow({ where: { id } });
  const moves = (id: string) => prisma.moneyMove.count({ where: { courseId: c.id, stripeId: id } });

  // A decline, then another card: the same intent.
  const a = await statement();
  nextConfirm = 'decline';
  const d1 = await chargeStatement(a.id, card('pm_1'), chargeOneIntent);
  const aIntent = (await row(a.id)).paymentIntentId;
  nextConfirm = 'ok';
  const p1 = await chargeStatement(a.id, card('pm_2'), chargeOneIntent);
  ok('declined, then another card: one intent created, confirmed twice, paid once', d1.status === 'declined' && p1.status === 'paid' && created === 1 && confirms === 2 && (await row(a.id)).paymentIntentId === aIntent && (await row(a.id)).status === 'paid' && (await moves(aIntent)) === 1, { d1, p1, created, confirms });

  // The reply is lost after Stripe charged: read back, not a decline, not charged again.
  const b = await statement();
  nextConfirm = 'lost';
  const lost = await chargeStatement(b.id, card('pm_3'), chargeOneIntent);
  const bIntent = (await row(b.id)).paymentIntentId;
  ok('a lost reply after a real charge: paid once, one ledger row', lost.status === 'paid' && (await row(b.id)).status === 'paid' && (await moves(bIntent)) === 1 && intents.get(bIntent)!.status === 'succeeded', lost);
  nextConfirm = 'ok';
  ok('…paying again is refused', (await chargeStatement(b.id, card('pm_4'), chargeOneIntent)).status === 'skipped');

  // Staff take cash while the golfer's card payment is in flight: refused, and the intent is NOT stopped.
  const w = await statement();
  nextConfirm = 'hang';
  const inflight = chargeStatement(w.id, card('pm_5'), chargeOneIntent);
  for (let i = 0; i < 50 && !(await row(w.id)).paymentIntentId; i++) await new Promise(r => setTimeout(r, 20));
  const cancelsBefore = cancels;
  const staff = await markStatementPaidOffline(c.id, w.id, 'cash');
  ok('cash while a card payment is going through: refused, the payment left alone', !staff.ok && staff.status === 409 && cancels === cancelsBefore && intents.get((await row(w.id)).paymentIntentId)!.status !== 'canceled', staff);
  release();
  const wPaid = await inflight;
  ok('…the card payment then completes', wPaid.status === 'paid' && (await row(w.id)).status === 'paid');

  // Cash with an unpaid intent: the intent is stopped, then the statement marked.
  const k = await statement();
  nextConfirm = 'decline';
  await chargeStatement(k.id, card('pm_6'), chargeOneIntent);
  const kIntent = (await row(k.id)).paymentIntentId;
  const cash = await markStatementPaidOffline(c.id, k.id, 'cash');
  ok('cash after a declined card: the intent is stopped, the statement paid at the course', cash.ok && intents.get(kIntent)!.status === 'canceled' && (await row(k.id)).status === 'paid_offline');

  // A stopped intent left on an open statement (a crash between stop and mark): a fresh one replaces it.
  const z = await statement();
  nextConfirm = 'decline';
  await chargeStatement(z.id, card('pm_7'), chargeOneIntent);
  const zOld = (await row(z.id)).paymentIntentId;
  intents.get(zOld)!.status = 'canceled';
  nextConfirm = 'ok';
  const zPaid = await chargeStatement(z.id, card('pm_8'), chargeOneIntent);
  const zNew = (await row(z.id)).paymentIntentId;
  ok('a stopped intent never wedges the statement: a new intent, paid by card', zPaid.status === 'paid' && zNew !== zOld && intents.get(zNew)!.status === 'succeeded' && (await row(z.id)).status === 'paid', { zPaid, zOld, zNew });

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('statement-intent-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
