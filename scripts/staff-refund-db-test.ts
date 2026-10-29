// Revamp 3 dead end 14 (Cam 2026-10-29): staff refund a round — the course's share,
// part or all, never GreenReserve's fee — and give back a late fee kept on a
// cancellation. Stripe is stubbed. Needs a database.
// Run: npx tsx scripts/staff-refund-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { refundRound, waiveLateFee, refundableCents } from '../src/lib/staff-refund';
import { PERMISSIONS } from '../src/lib/staff-permissions';

const TAG = 'staffrefunddbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

type Call = { pi: string; amount?: number; appFee: unknown; account: string; key: string };
const calls: Call[] = [];
const seen = new Map<string, { id: string; amount: number }>();
const refunds = stripe.refunds as unknown as { create: unknown };
refunds.create = async (p: { payment_intent: string; amount?: number; refund_application_fee?: boolean }, o: { stripeAccount: string; idempotencyKey: string }) => {
  calls.push({ pi: p.payment_intent, amount: p.amount, appFee: p.refund_application_fee, account: o.stripeAccount, key: o.idempotencyKey });
  // Idempotent like Stripe: the same key returns the same refund.
  const prior = seen.get(o.idempotencyKey); if (prior) return prior;
  const r = { id: `re_${calls.length}`, amount: p.amount ?? 1500 };
  seen.set(o.idempotencyKey, r);
  return r;
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
  const mk = (s: string) => prisma.course.create({ data: { name: s, slug: `${TAG}-${s}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_test' } });
  const c = await mk('a'), other = await mk('b');
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: '2031-05-13', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 8 } });
  const book = (extra: Record<string, unknown>) => prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'G', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_round', roundChargedCents: 10300, ...extra } });

  // A round of $103 paid by card: $100 is the course's, $3 GreenReserve's.
  const paid = await book({});
  ok('the course can give back its $100 share, never GreenReserve\'s $3', refundableCents(paid, 0) === 10000);
  ok('another course can\'t refund it', !(await refundRound(other.id, paid.id, { amountCents: 1000, reason: 'x', actorName: 't', actor: STAFF })).ok);
  ok('a reason is required', (await refundRound(c.id, paid.id, { amountCents: 1000, reason: ' ', actorName: 't', actor: STAFF }) as { status?: number }).status === 400);
  const tooMuch = await refundRound(c.id, paid.id, { amountCents: 10300, reason: 'rain', actorName: 't', actor: STAFF });
  ok('more than the course\'s share is refused, saying how much can go back', !tooMuch.ok && /\$100\.00/.test((tooMuch as { error: string }).error), tooMuch);

  const part = await refundRound(c.id, paid.id, { amountCents: 4000, reason: 'Two holes closed', actorName: 'desk@t', actor: STAFF });
  ok('a part refund goes back through Stripe on the course\'s account, keeping GreenReserve\'s fee', part.ok && calls.at(-1)?.amount === 4000 && calls.at(-1)?.appFee === false && calls.at(-1)?.account === 'acct_test', calls.at(-1));
  const afterPart = await prisma.booking.findUniqueOrThrow({ where: { id: paid.id } });
  ok('…the round is still paid', afterPart.paymentStatus === 'paid');
  const ev = await prisma.bookingEvent.findFirst({ where: { bookingId: paid.id, type: 'round_refunded' } });
  ok('…and it is on the course\'s Timeline with the reason', !!ev && ev.amountCents === 4000 && JSON.stringify(ev.metadata).includes('Two holes closed'));

  const again = await refundRound(c.id, paid.id, { amountCents: 4000, reason: 'Two holes closed', actorName: 'desk@t', actor: STAFF });
  ok('a second refund of the same amount is its own refund (a new key, after the first)', again.ok && new Set(calls.map(x => x.key)).size === calls.length);
  const rest = await refundRound(c.id, paid.id, { reason: 'Rained off', actorName: 'desk@t', actor: STAFF });
  ok('blank amount refunds what\'s left of the share, and the round reads refunded', rest.ok && (rest as { amountCents: number }).amountCents === 2000 && (await prisma.booking.findUniqueOrThrow({ where: { id: paid.id } })).paymentStatus === 'refunded', rest);
  ok('…after which nothing more can go back', !(await refundRound(c.id, paid.id, { reason: 'x', actorName: 't', actor: STAFF })).ok);

  const cash = await book({ paymentStatus: 'paid_offline', roundPaymentIntentId: '', paidOffline: true });
  const cashR = await refundRound(c.id, cash.id, { reason: 'x', actorName: 't', actor: STAFF });
  ok('a round paid in cash is refunded at the register, not here', !cashR.ok && /register/.test((cashR as { error: string }).error));

  // A late fee kept on a cancellation, given back after the fact.
  const late = await book({ status: 'cancelled', paymentStatus: 'cancellation_fee_charged', cancellationFeeChargeId: 'pi_fee', cancellationFeeTotal: 1500, roundPaymentIntentId: '', roundChargedCents: null });
  const w = await waiveLateFee(c.id, late.id, { reason: 'Family emergency', actorName: 'desk@t', actor: STAFF });
  ok('a kept late fee is given back in full', w.ok && calls.at(-1)?.pi === 'pi_fee' && (await prisma.booking.findUniqueOrThrow({ where: { id: late.id } })).paymentStatus === 'refunded', w);
  ok('…once', !(await waiveLateFee(c.id, late.id, { reason: 'again', actorName: 't', actor: STAFF })).ok);

  // Who may.
  const perm = PERMISSIONS.find(p => p.key === 'money.refund_rounds');
  ok('"Refund rounds" is its own permission that moves money', !!perm && perm.movesMoney === true && (perm.requires ?? []).includes('money.payments'));
  const presets = readFileSync('src/lib/staff-permissions.ts', 'utf8').slice(readFileSync('src/lib/staff-permissions.ts', 'utf8').indexOf('PRESETS'));
  ok('…off in every preset (given per person)', !presets.includes("'money.refund_rounds'"));
  const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
  ok('the route gates refunds on it and a waived fee on sheet.waive_fee', route.includes("refund_round: 'money.refund_rounds', waive_late_fee: 'sheet.waive_fee'"));
  ok('the assistant can\'t refund (its body rules allow only move and pay links)', !readFileSync('src/lib/birdie/proposal-types.ts', 'utf8').includes('refund_round'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('staff-refund-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
