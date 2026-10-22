// W2-9b — event payments against a database, with the Stripe client's methods
// swapped for fakes (as shop-sales-db-test.ts does): payments taken at the
// course, pay links (charge once, decline, timeout, void, paid another way),
// refunds (card and recorded, partial, over-refund, a Stripe "no" and an unsure
// answer retried), the money summary, the fee flag, and tenant isolation.
// Needs a database, no Stripe. Run: npx tsx scripts/event-payments-db-test.ts
import Stripe from 'stripe';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import {
  recordCoursePayment, createPayLink, settleOpenPayment, chargeEventPayment, refundPayment, sendRefund, voidOpenLinks,
  reconcileStuckPayments, eventMoney, eventFeeFor, toCents, playerPayState, STALE_CHARGE_MS,
} from '../src/lib/event-payments';
import { EVENT_FEE_ON } from '../src/lib/booking-fees';

const TAG = 'evpaydbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// ── Fake Stripe ──────────────────────────────────────────────────────────────
type PI = { id: string; status: string; amount: number; application_fee_amount?: number };
const intents = new Map<string, PI>();
const refunds = new Map<string, { id: string; amount: number; metadata: Record<string, string> }>();
let keysForgotten = false;
let created = 0, confirms = 0, cancels = 0, refundCalls = 0;
let next: 'succeed' | 'decline' | 'timeout' = 'succeed';
let refundNext: 'ok' | 'refuse' | 'timeout' = 'ok';
const s = stripe as unknown as Record<string, Record<string, unknown>>;
s.customers.create = async () => ({ id: 'cus_fake' });
s.paymentMethods.attach = async () => ({ id: 'pm_fake' });
s.paymentMethods.create = async () => ({ id: 'pm_clone_fake' });
s.paymentIntents.create = async (p: { amount: number; application_fee_amount?: number }, o: { idempotencyKey: string }) => {
  const id = `pi_${o.idempotencyKey}`;
  if (!intents.has(id)) { created++; intents.set(id, { id, status: 'requires_payment_method', amount: p.amount, application_fee_amount: p.application_fee_amount }); }
  return { ...intents.get(id)! };
};
s.paymentIntents.retrieve = async (id: string) => ({ ...intents.get(id)! });
s.paymentIntents.cancel = async (id: string) => { cancels++; intents.get(id)!.status = 'canceled'; return { ...intents.get(id)! }; };
s.paymentIntents.confirm = async (id: string) => {
  confirms++;
  const pi = intents.get(id)!;
  if (pi.status === 'canceled') throw new Error('canceled');
  if (next === 'decline') throw new Stripe.errors.StripeCardError({ message: 'Your card was declined.', type: 'card_error' } as never);
  if (next === 'timeout') { pi.status = 'succeeded'; throw new Error('Request timed out'); }
  pi.status = 'succeeded';
  return { ...pi };
};
// Refunds carry their row id in metadata; list finds them (as Stripe does).
s.refunds.list = async () => ({ data: [...refunds.values()].map(r => ({ ...r, status: 'succeeded' })) });
s.refunds.create = async (p: { amount: number; metadata?: Record<string, string> }, o: { idempotencyKey: string }) => {
  refundCalls++;
  if (refundNext === 'refuse') throw new Stripe.errors.StripeInvalidRequestError({ message: 'Charge has been refunded.', type: 'invalid_request_error' } as never);
  // After 24 hours Stripe has forgotten the key: the same key makes a NEW refund.
  const key = keysForgotten ? `${o.idempotencyKey}#${refunds.size}` : o.idempotencyKey;
  // Stripe keeps the refund even when the answer is lost; the same key returns the same refund.
  if (!refunds.has(key)) refunds.set(key, { id: `re_${refunds.size + 1}`, amount: p.amount, metadata: p.metadata ?? {} });
  if (refundNext === 'timeout') throw new Error('Request timed out');
  return refunds.get(key)!;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  await prisma.courseEvent.deleteMany({ where: { courseId: { in: courses.map(c => c.id) } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Ev', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Ev ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });
  const course = await mk('a'); const other = await mk('b');
  const ev = await prisma.courseEvent.create({ data: { courseId: course.id, name: 'Rotary', date: '2031-05-14', startTime: '08:00', holdFrom: '07:00', holdTo: '12:30', pricePerPlayerCents: 12500, players: 72 } });
  const pay = (id: string) => prisma.courseEventPayment.findUniqueOrThrow({ where: { id } });

  // Pure bits.
  check('dollars typed by staff become cents', toCents('$1,250.50') === 125050 && toCents('0') === null && toCents('-5') === null && toCents('100001') === null);
  check('the fee is off: nothing on a balance', !EVENT_FEE_ON && eventFeeFor('balance', 72) === 0);
  check('…when on, $1.50 × the headcount on a balance only', eventFeeFor('balance', 72, true) === 10800 && eventFeeFor('deposit', 72, true) === 0);

  // Taken at the course.
  const cash = await recordCoursePayment(course.id, ev.id, { kind: 'deposit', amount: '500', method: 'check', note: '#1042' }, 'staff@x');
  check('a check deposit is recorded as paid, nothing charged', cash.ok && (await pay(cash.value.id)).status === 'paid' && created === 0, cash);
  if (!cash.ok) throw new Error(cash.error);
  check('a payment needs a way it was paid', !(await recordCoursePayment(course.id, ev.id, { amount: '5', method: 'crypto' }, 'x')).ok);
  check('another course can’t record against this event', !(await recordCoursePayment(other.id, ev.id, { amount: '5', method: 'cash' }, 'x')).ok);

  // Balance link: confirms the headcount.
  const noHead = await createPayLink(course.id, ev.id, { kind: 'balance', amount: '100' }, 'x');
  check('a balance needs a confirmed headcount', !noHead.ok);
  const bal = await createPayLink(course.id, ev.id, { kind: 'balance', headcount: 70, amount: '8250', payerEmail: 'Org@Example.com' }, 'x');
  if (!bal.ok) throw new Error(bal.error);
  check('a balance link confirms the headcount and labels itself', (await prisma.courseEvent.findUniqueOrThrow({ where: { id: ev.id } })).finalHeadcount === 70 && bal.value.label === 'Balance for 70 players' && bal.value.feeCents === 0);

  // Paying it.
  check('a wrong token is refused', !(await chargeEventPayment(bal.value.id, 'nope', 'pm_x', 825000)).ok);
  check('a stale total is refused', !(await chargeEventPayment(bal.value.id, bal.value.payToken, 'pm_x', 1)).ok);
  next = 'decline';
  const d = await chargeEventPayment(bal.value.id, bal.value.payToken, 'pm_x', 825000);
  check('a declined card leaves the link open', !d.ok && (await pay(bal.value.id)).status === 'open', d);
  next = 'succeed';
  const ok = await chargeEventPayment(bal.value.id, bal.value.payToken, 'pm_y', 825000);
  check('a good card pays it, on one PaymentIntent', ok.ok && (await pay(bal.value.id)).status === 'paid' && created === 1, { ok, created });
  check('paying twice is refused', !(await chargeEventPayment(bal.value.id, bal.value.payToken, 'pm_y', 825000)).ok);
  const pi = intents.get((await pay(bal.value.id)).paymentIntentId)!;
  check('no GreenReserve fee on the charge while the flag is off', pi.amount === 825000 && pi.application_fee_amount === undefined, pi);

  // Timeout: charged but unheard → stays paying; the event page settles it from Stripe.
  const t = await createPayLink(course.id, ev.id, { kind: 'other', amount: '40', label: 'Extra lunch' }, 'x');
  if (!t.ok) throw new Error(t.error);
  next = 'timeout';
  const tr = await chargeEventPayment(t.value.id, t.value.payToken, 'pm_z', 4000);
  check('an unsure answer never releases the claim', !tr.ok && (await pay(t.value.id)).status === 'paying');
  await prisma.courseEventPayment.update({ where: { id: t.value.id }, data: { chargeStartedAt: new Date(Date.now() - STALE_CHARGE_MS - 1000) } });
  await reconcileStuckPayments(course.id, ev.id);
  check('…and loading the event settles it as paid from Stripe', (await pay(t.value.id)).status === 'paid');
  next = 'succeed';

  // Void and paid another way.
  const v = await createPayLink(course.id, ev.id, { kind: 'deposit', amount: '250' }, 'x');
  if (!v.ok) throw new Error(v.error);
  await chargeEventPayment(v.value.id, v.value.payToken, 'pm_d', 0).catch(() => {}); // stale total: refused, no intent made
  const vv = await settleOpenPayment(course.id, v.value.id, 'void');
  check('an open link can be cancelled', vv.ok && (await pay(v.value.id)).status === 'void');
  check('…and then can’t be paid', !(await chargeEventPayment(v.value.id, v.value.payToken, 'pm_q', 25000)).ok);
  const o = await createPayLink(course.id, ev.id, { kind: 'other', amount: '60' }, 'x');
  if (!o.ok) throw new Error(o.error);
  next = 'decline'; await chargeEventPayment(o.value.id, o.value.payToken, 'pm_d', 6000); next = 'succeed'; // makes its intent
  const cancelsBefore = cancels;
  const po = await settleOpenPayment(course.id, o.value.id, { method: 'cash' });
  check('paid another way: the link’s intent is cancelled first, then it’s paid in cash', po.ok && cancels === cancelsBefore + 1 && (await pay(o.value.id)).method === 'cash' && (await pay(o.value.id)).status === 'paid');
  check('another course can’t settle this course’s link', !(await settleOpenPayment(other.id, v.value.id, 'void')).ok);

  // Money summary: deposit 500 + balance 8,250 + extra 40 + cash 60 = 8,850 of 125 × 70 = 8,750.
  const load = async () => {
    const e = await prisma.courseEvent.findUniqueOrThrow({ where: { id: ev.id }, include: { payments: true, _count: { select: { entrants: true } } } });
    return eventMoney({ ...e, entrants: e._count.entrants }, e.payments);
  };
  let m = await load();
  check('money: total from the confirmed headcount, paid counts paid only', m.totalCents === 875000 && m.paidCents === 885000 && m.owedCents === 0 && m.headcountConfirmed, m);

  // Refunds.
  check('more than was paid can’t be refunded', !(await refundPayment(course.id, bal.value.id, { amount: '9000' }, 'x')).ok);
  const r1 = await refundPayment(course.id, bal.value.id, { amount: '100', reason: 'Two dropped out' }, 'owner');
  check('a partial card refund goes to Stripe on the payment’s intent', r1.ok && r1.value.status === 'done' && refundCalls === 1 && (await pay(bal.value.id)).refundedCents === 10000, r1);
  const rc = await refundPayment(course.id, cash.value.id, { amount: '500' }, 'owner');
  check('a check refund is recorded only — Stripe isn’t asked', rc.ok && refundCalls === 1 && (await pay(cash.value.id)).refundedCents === 50000);
  refundNext = 'refuse';
  const rr = await refundPayment(course.id, bal.value.id, { amount: '50' }, 'owner');
  check('a Stripe "no" gives the amount back and marks the refund failed', !rr.ok && (await pay(bal.value.id)).refundedCents === 10000
    && (await prisma.courseEventRefund.count({ where: { paymentId: bal.value.id, status: 'failed' } })) === 1, rr);
  refundNext = 'timeout';
  const rt = await refundPayment(course.id, bal.value.id, { amount: '50' }, 'owner');
  const pending = await prisma.courseEventRefund.findFirstOrThrow({ where: { paymentId: bal.value.id, status: 'pending' } });
  check('an unsure answer keeps the refund pending and the amount reserved', rt.ok && rt.value.status === 'pending' && (await pay(bal.value.id)).refundedCents === 15000);
  refundNext = 'ok';
  const again = await sendRefund(course.id, pending.id);
  check('"Try again" uses the same key — Stripe made one refund, now recorded', again.ok && again.value.status === 'done' && refunds.size === 2
    && (await prisma.courseEventRefund.findUniqueOrThrow({ where: { id: pending.id } })).stripeRefundId === 're_2');
  // A day later: Stripe has forgotten the key. "Try again" must find the refund it already made, not make another.
  refundNext = 'timeout';
  const rt2 = await refundPayment(course.id, bal.value.id, { amount: '25' }, 'owner');
  const pending2 = await prisma.courseEventRefund.findFirstOrThrow({ where: { paymentId: bal.value.id, status: 'pending' } });
  refundNext = 'ok'; keysForgotten = true;
  const before = refunds.size;
  const again2 = await sendRefund(course.id, pending2.id);
  check('a retry after 24 hours finds the refund Stripe already made: no second refund', rt2.ok && again2.ok && refunds.size === before
    && (await prisma.courseEventRefund.findUniqueOrThrow({ where: { id: pending2.id } })).status === 'done', { size: refunds.size, before });
  keysForgotten = false;
  check('another course can’t refund this course’s payment', !(await refundPayment(other.id, bal.value.id, { amount: '1' }, 'x')).ok && !(await sendRefund(other.id, pending.id)).ok);
  m = await load();
  check('money: refunds come off what the course kept', m.refundedCents === 67500 && m.keptCents === 817500 && m.owedCents === 57500, m);

  // W2-9c: players' own payments.
  const jane = await prisma.courseEventPlayer.create({ data: { eventId: ev.id, name: 'Jane Smith', email: 'jane@x.test' } });
  const tom = await prisma.courseEventPlayer.create({ data: { eventId: ev.id, name: 'Tom Lee', phone: '201-555-0100' } });
  const otherEv = await prisma.courseEvent.create({ data: { courseId: course.id, name: 'Other', date: '2031-06-01', startTime: '08:00', holdFrom: '07:00', holdTo: '12:30' } });
  const stranger = await prisma.courseEventPlayer.create({ data: { eventId: otherEv.id, name: 'Elsewhere' } });
  check('the fee on a player\u2019s own payment is $1.50 when on, nothing while off', eventFeeFor('player', null, true) === 150 && eventFeeFor('player', null) === 0);
  check('a player from another event is refused', !(await createPayLink(course.id, ev.id, { playerId: stranger.id, amount: '125' }, 'x')).ok
    && !(await recordCoursePayment(course.id, ev.id, { playerId: stranger.id, amount: '125', method: 'cash' }, 'x')).ok);
  // Two sends at the same instant: exactly one link.
  const many = await Promise.all(Array.from({ length: 8 }, () => createPayLink(course.id, ev.id, { playerId: jane.id, amount: '125' }, 'x')));
  const janes = await prisma.courseEventPayment.findMany({ where: { playerId: jane.id } });
  check('eight sends at once make one link for a player', many.filter(r => r.ok).length === 1 && janes.length === 1, { ok: many.filter(r => r.ok).length, n: janes.length });
  const jl = many.find(r => r.ok)!;
  if (!jl.ok) throw new Error('no link');
  check('a player\u2019s link is labelled and addressed from the list', janes[0].kind === 'player' && janes[0].label === 'Jane Smith — entry' && janes[0].payerEmail === 'jane@x.test' && janes[0].feeCents === 0, janes[0]);
  check('…and a second link for them is refused ("send it again")', /already has a pay link/.test(((await createPayLink(course.id, ev.id, { playerId: jane.id, amount: '125' }, 'x')) as { error?: string }).error ?? ''));
  check('their state reads "sent"', playerPayState(janes) === 'sent');
  await chargeEventPayment(jl.value.id, jl.value.payToken, 'pm_j', 12500);
  const janesPaid = await prisma.courseEventPayment.findMany({ where: { playerId: jane.id } });
  check('once they pay, they read "paid" and can\u2019t be sent another', playerPayState(janesPaid) === 'paid' && /already paid/.test(((await createPayLink(course.id, ev.id, { playerId: jane.id, amount: '125' }, 'x')) as { error?: string }).error ?? ''));
  const tr2 = await recordCoursePayment(course.id, ev.id, { playerId: tom.id, amount: '125', method: 'cash' }, 'x');
  const toms = await prisma.courseEventPayment.findMany({ where: { playerId: tom.id } });
  check('a player paid at the course is recorded against them, no fee', tr2.ok && toms.length === 1 && toms[0].kind === 'player' && toms[0].method === 'cash' && toms[0].payerName === 'Tom Lee' && playerPayState(toms) === 'paid');
  await prisma.courseEventPlayer.delete({ where: { id: tom.id } });
  check('removing a player keeps the money they paid on the event', (await prisma.courseEventPayment.findUniqueOrThrow({ where: { id: toms[0].id } })).playerId === null);
  await prisma.courseEventPayment.deleteMany({ where: { eventId: ev.id, kind: 'player' } }); // keep the money totals below as they were

  // Cancelling the event closes its open links; a link can't be paid on a cancelled event.
  const late = await createPayLink(course.id, ev.id, { kind: 'other', amount: '10' }, 'x');
  if (!late.ok) throw new Error(late.error);
  await prisma.courseEvent.update({ where: { id: ev.id }, data: { status: 'cancelled' } });
  check('a link on a cancelled event can’t be paid', !(await chargeEventPayment(late.value.id, late.value.payToken, 'pm_l', 1000)).ok);
  const vo = await voidOpenLinks(course.id, ev.id);
  check('cancelling the event cancels its open links', vo.voided === 1 && (await pay(late.value.id)).status === 'void', vo);
  check('no new link on a cancelled event', !(await createPayLink(course.id, ev.id, { kind: 'other', amount: '10' }, 'x')).ok);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
