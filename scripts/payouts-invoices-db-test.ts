// Revenue page (Cam 2026-11-15): a payout taken apart (lib/payout-detail) and the course's event
// invoices (lib/event-invoices). Stripe is stubbed. Needs a database.
// Run: npx tsx scripts/payouts-invoices-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { recordMove } from '../src/lib/money-ledger';
import { breakdownOf, payoutDetail } from '../src/lib/payout-detail';
import { eventInvoices } from '../src/lib/event-invoices';
import { dayStart } from '../src/lib/ledger-view';

const TAG = 'payinvdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEventPayment.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  // ── Pure ──
  const b = breakdownOf([
    { type: 'charge', cents: 10000, stripeFeeCents: 320, greenReserveFeeCents: 150, refundId: null },
    { type: 'payment', cents: 2000, stripeFeeCents: 60, greenReserveFeeCents: 0, refundId: null },
    { type: 'refund', cents: -3000, stripeFeeCents: 0, greenReserveFeeCents: 0, refundId: 're_ours' },
    { type: 'refund', cents: -1000, stripeFeeCents: 0, greenReserveFeeCents: 0, refundId: 're_dash' },
    { type: 'adjustment', cents: -500, stripeFeeCents: 1500, greenReserveFeeCents: 0, refundId: null },
  ], new Set(['re_ours']), 10000 + 2000 - 3000 - 1000 - 500 - 320 - 150 - 60 - 1500);
  ok('card payments, our refunds, refunds made in Stripe, fees and the rest', b.cardCents === 12000 && b.refundsCents === -3000 && b.stripeDirectRefundsCents === -1000 && b.stripeFeesCents === -1880 && b.greenReserveFeesCents === -150 && b.otherCents === -500, b);
  ok('…and they add up to the payout', b.addsUp);
  ok('a payout that doesn’t add up says so', !breakdownOf([{ type: 'charge', cents: 100, stripeFeeCents: 0, greenReserveFeeCents: 0, refundId: null }], new Set(), 99).addsUp);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, active = true) => prisma.course.create({ data: { name: `Pay ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'America/New_York', stripeAccountId: `acct_${n}`, stripeAccountActive: active } });
  const c = await mk('a'), other = await mk('b'), off = await mk('c', false);
  await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 3000, stripeId: 're_ours', actor: 'staff' });
  await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 1000, stripeId: 're_mirror', actor: 'stripe', note: 'refunded in Stripe' });
  await recordMove({ courseId: other.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 999, stripeId: 're_other', actor: 'staff' });

  // ── Stripe stubbed ──
  const po = stripe.payouts as unknown as { retrieve: unknown };
  const bt = stripe.balanceTransactions as unknown as { list: unknown };
  let asked: unknown[] = [];
  po.retrieve = async (...a: unknown[]) => { asked = a; if (a[0] === 'po_missing00') { const e = new Error('No such payout') as Error & { statusCode: number }; e.statusCode = 404; throw e; }
    return { id: a[0], status: 'paid', amount: 10000 - 3000 - 1000 - 999 - 290, automatic: true, arrival_date: 1_900_000_000, created: 1_899_900_000, destination: { object: 'bank_account', bank_name: 'CHASE', last4: '6789', routing_number: '110000000', fingerprint: 'fp' } }; };
  bt.list = () => ({ async *[Symbol.asyncIterator]() {
    yield { type: 'charge', currency: 'usd', amount: 10000, fee_details: [{ type: 'stripe_fee', amount: 290 }], source: 'ch_1' };
    yield { type: 'refund', currency: 'usd', amount: -3000, fee_details: [], source: 're_ours' };
    yield { type: 'refund', currency: 'usd', amount: -1000, fee_details: [], source: 're_mirror' };
    yield { type: 'refund', currency: 'usd', amount: -999, fee_details: [], source: 're_other' };
    yield { type: 'payout', currency: 'usd', amount: -4711, fee_details: [], source: 'po_abc12345' };
  } });
  const d = await payoutDetail(c.id, 'po_abc12345');
  ok('read on the course’s own account', JSON.stringify(asked).includes('acct_a'), asked);
  ok('the bank: name and last four only', JSON.stringify(d?.bank) === '{"name":"CHASE","last4":"6789"}', d?.bank);
  ok('nothing else of the bank account is returned', !JSON.stringify(d).includes('110000000') && !JSON.stringify(d).includes('fp'));
  ok('our refund is ours; a mirrored one and another course’s count as made in Stripe', d?.breakdown?.refundsCents === -3000 && d.breakdown.stripeDirectRefundsCents === -1999, d?.breakdown);
  ok('Stripe’s fee, and it adds up', d?.breakdown?.stripeFeesCents === -290 && d.breakdown.addsUp, d?.breakdown);
  ok('a payout not on this account: not found', (await payoutDetail(c.id, 'po_missing00')) === null);
  ok('a malformed id never reaches Stripe', (await payoutDetail(c.id, '../acct_b')) === null);
  ok('no active Stripe account: not found', (await payoutDetail(off.id, 'po_abc12345')) === null);

  // ── Event invoices ──
  const ev = await prisma.courseEvent.create({ data: { courseId: c.id, name: 'Charity Scramble', date: '2031-06-01', startTime: '08:00', holdFrom: '08:00', holdTo: '12:00' } });
  const evB = await prisma.courseEvent.create({ data: { courseId: other.id, name: 'Other', date: '2031-06-01', startTime: '08:00', holdFrom: '08:00', holdTo: '12:00' } });
  const pay = (courseId: string, eventId: string, x: Record<string, unknown>) => prisma.courseEventPayment.create({ data: { courseId, eventId, label: 'Deposit', amountCents: 50000, method: 'link', status: 'open', payToken: 'secret-token', ...x } as never });
  await pay(c.id, ev.id, { payerName: 'Org A', payerEmail: 'org@example.com' });
  await pay(c.id, ev.id, { payerName: 'No contact' });
  await pay(c.id, ev.id, { status: 'paid', paidAt: new Date(dayStart('America/New_York', '2031-05-10').getTime() + 3_600_000), method: 'link' });
  await pay(c.id, ev.id, { status: 'paid', paidAt: new Date(dayStart('America/New_York', '2031-01-10').getTime()), method: 'cash' });
  await pay(c.id, ev.id, { status: 'void', voidedAt: new Date() });
  await pay(other.id, evB.id, { payerEmail: 'x@example.com' });
  const inv = await eventInvoices(c.id, 'America/New_York', { from: '2031-05-01', to: '2031-05-31' }, { mayResend: true });
  ok('pending: every open one, this course only', inv.open.length === 2 && inv.open.every(x => x.eventName === 'Charity Scramble'), inv.open);
  ok('paid: only those paid in the range; void left out', inv.paid.length === 1, inv.paid);
  ok('resend offered only where there’s somewhere to send it', inv.open.filter(x => x.canResend).length === 1 && inv.open.find(x => x.canResend)?.resendVia.join() === 'email');
  ok('the pay link’s token is never returned', !JSON.stringify(inv).includes('secret-token') && !JSON.stringify(inv).includes('payerEmail'));
  const noResend = await eventInvoices(c.id, 'America/New_York', { from: '2031-05-01', to: '2031-05-31' }, { mayResend: false });
  ok('without "Run events" no resend is offered', noResend.open.every(x => !x.canResend));

  // ── The routes ──
  const pr = readFileSync('src/app/api/operator/stripe/payouts/[id]/route.ts', 'utf8');
  const ir = readFileSync('src/app/api/operator/money/event-invoices/route.ts', 'utf8');
  ok('payout detail needs the Payouts permission, like the payout list', pr.includes("requirePermission(session, 'money.payouts')"));
  ok('event invoices need money.payments; resend only with events.manage', ir.includes("requirePermission(session, 'money.payments')") && ir.includes("can(session, 'events.manage')"));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
  console.log('\npayouts-invoices-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
