// LEDGER-1 (Cam 2026-10-30, "one new money table"): every dollar that moves for a
// course is a MoneyMove row. This fails on a file that charges or refunds through
// Stripe without writing the ledger, and checks the ledger's own rules and the
// membership dues fix (claim, charge outside a transaction, ledger, term).
// Stripe is stubbed. Needs a database. Run: npx tsx scripts/money-ledger-test.ts
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { recordMove, mirrorMove, feeBackCents } from '../src/lib/money-ledger';
import { createSale } from '../src/lib/shop-sales';
import { WIPED_TABLES } from '../src/lib/data-reset';
import { paidUntilRenewal } from '../src/lib/membership-renewal';

const TAG = 'moneyledgertest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

// ── 1. Every Stripe charge or refund writes the ledger ─────────────────────────
const MONEY_CALL = /paymentIntents\.(create|capture|confirm)|chargeOnConnectedAccount\(|refunds\.create|refundOnConnectedAccount\(/g;
const LEDGER = /recordMove\(|ledgerPaid\(/g;
// Files whose calls are recorded somewhere else, and where.
const RECORDED_ELSEWHERE: Record<string, { by: RegExp; why: string }> = {
  'src/lib/card-reader.ts': { by: /markCardPaid\(/, why: 'starts reader intents; the payment is recorded by markCardPaid (shop-sales)' },
  'src/lib/reader-rounds.ts': { by: /performCheckIn\(bookingId, actor, \{ cardPresent/, why: 'a reader round is recorded by performCheckIn (cardPresent); its duplicate refund records itself' },
};
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
const code = (f: string) => fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
for (const f of walk('src')) {
  if (f === path.join('src', 'lib', 'stripe.ts') || f === path.join('src', 'lib', 'money-ledger.ts')) continue;
  const src = code(f);
  const calls = (src.match(MONEY_CALL) ?? []).length;
  if (!calls) continue;
  const writes = (src.match(LEDGER) ?? []).length;
  const elsewhere = RECORDED_ELSEWHERE[f.split(path.sep).join('/')];
  if (elsewhere) ok(`${f}: ${elsewhere.why}`, elsewhere.by.test(src));
  else ok(`${f}: each of its ${calls} Stripe charge/refund call(s) writes the ledger`, writes >= calls, { calls, writes });
}
ok('cash paths write the ledger: the register, a cash sale, a sale taken in cash, a cash refund, a void', ((): boolean => {
  const sales = code('src/lib/shop-sales.ts');
  return /method: 'cash'[^\n]*what: 'shop'|what: 'shop', direction: 'in', method: 'cash'/.test(sales) && /note: 'voided'/.test(sales) && /pay link taken in cash/.test(sales) && /recordMove\(/.test(code('src/lib/register.ts'));
})());
ok('dues taken at the course write the ledger', /what: 'dues', direction: 'in', method: method === 'cash' \? 'cash' : 'other'/.test(code('src/app/api/operator/members/route.ts')));
ok('the webhook mirrors Stripe-dashboard refunds and dispute money', /charge\.dispute\.funds_withdrawn/.test(code('src/app/api/stripe/webhook/route.ts')) && /mirrorMove\(/.test(code('src/app/api/stripe/webhook/route.ts')));
ok('the ledger is cleared by the launch wipe and the test-course reset', WIPED_TABLES.includes('MoneyMove') && /moneyMove\.deleteMany/.test(code('src/lib/data-reset.ts')));
const dues = code('src/app/api/membership/[id]/route.ts');
ok('dues are no longer charged inside a database transaction', !/\$transaction/.test(dues) && /duesChargeStartedAt/.test(dues));
ok('…the ledger is written before the term is recorded', dues.indexOf("what: 'dues'") > 0 && dues.indexOf("what: 'dues'") < dues.indexOf('recordPaidTerm(') && /lastPaymentIntentId: paymentIntentId/.test(code('src/lib/membership-dues.ts')));

{
  const day = 86_400_000, t = Date.now(), paidLong = new Date(t - 5 * day);
  const at = (left: number) => ({ paymentStatus: 'paid', expiresAt: new Date(t + left * day), lastPaidAt: paidLong });
  ok('a monthly membership can be renewed from 10 days out, a yearly one from 30', !paidUntilRenewal(at(9), 1, t) && paidUntilRenewal(at(20), 1, t) && !paidUntilRenewal(at(29), 12, t) && paidUntilRenewal(at(31), 12, t));
  ok('the renewal reminder waits for the same window (and is not stamped before it)', /if \(paidUntilRenewal\(m, m\.tier\.termMonths\)\) continue;/.test(code('src/app/api/cron/send-reminders/route.ts')));
}
ok('GreenReserve\'s fee back on a part refund is pro rata', feeBackCents(5000, 10000, 600) === 300 && feeBackCents(20000, 10000, 600) === 600 && feeBackCents(100, 0, 600) === 0);

// ── 2. The ledger's rules, and the dues flow, against the database ──────────────
async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'membership:pay:' } } }).catch(() => {});
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Ledger GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });

  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 10300, platformFeeCents: 300, stripeId: 'pi_l1', bookingId: 'b1' });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 10300, platformFeeCents: 300, stripeId: 'pi_l1', bookingId: 'b1' });
  ok('the same Stripe charge recorded twice is one row', (await prisma.moneyMove.count({ where: { stripeId: 'pi_l1' } })) === 1);
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'cash', account: 'course', amountCents: 0 });
  ok('nothing moved, nothing recorded', (await prisma.moneyMove.count({ where: { courseId: c.id, method: 'cash' } })) === 0);
  await recordMove({ courseId: c.id, what: 'booking_fee', direction: 'in', method: 'card', account: 'platform', amountCents: 450, stripeId: 'pi_fee1' });
  ok('a charge on GreenReserve\'s own account is all GreenReserve\'s', (await prisma.moneyMove.findUnique({ where: { stripeId: 'pi_fee1' } }))?.platformFeeCents === 450);
  await recordMove({ courseId: 'no-such-course', what: 'round', direction: 'in', method: 'cash', account: 'course', amountCents: 100 });
  ok('a ledger write that fails never throws (the money has already moved)', true);

  ok('a dashboard refund is recorded against the charge it came from', await mirrorMove('pi_l1', { direction: 'out', amountCents: 4000, stripeId: 're_dash1', note: 'refunded in Stripe' }) && (await prisma.moneyMove.findUnique({ where: { stripeId: 're_dash1' } }))?.bookingId === 'b1');
  await mirrorMove('pi_l1', { direction: 'out', amountCents: 5150, stripeId: 're_ours1', note: 'refunded in Stripe' });
  await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 5150, platformFeeCents: 150, stripeId: 're_ours1', bookingId: 'b1', actor: 'staff', note: 'ours' });
  const ours = await prisma.moneyMove.findUniqueOrThrow({ where: { stripeId: 're_ours1' } });
  ok('our own refund arriving after the webhook\'s copy keeps GreenReserve\'s share', ours.platformFeeCents === 150 && ours.actor === 'staff', ours);
  ok('…a charge from before the ledger is skipped', !(await mirrorMove('pi_unknown', { direction: 'out', amountCents: 1, stripeId: 're_x', note: '' })));

  // Cash at the register: each round on its booking.
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: '2031-05-13', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Cash', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000, status: 'completed', paymentStatus: 'paid_offline' } });
  const sale = await createSale({ courseId: c.id, lines: [], pay: 'cash', soldBy: 'desk', rounds: [{ bookingId: b.id, name: '8:00 round', amountCents: 10000 }] });
  const cashRow = sale.ok ? await prisma.moneyMove.findFirst({ where: { saleId: sale.value.id } }) : null;
  ok('a round paid in cash at the register is on the ledger, on its booking and its sale', !!cashRow && cashRow.method === 'cash' && cashRow.bookingId === b.id && cashRow.amountCents === 10000 && cashRow.what === 'round', { sale, cashRow });

  // Membership dues: claim, charge (stubbed), ledger, term — once.
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', annualFeeCents: 100000, initiationFeeCents: 0 } });
  const m = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Pat', inviteEmail: `${TAG}+pat@t.local`, status: 'active', payToken: 'tok' } });
  const s = stripe as unknown as Record<string, Record<string, unknown>>;
  let charges = 0; let failNext = false;
  const seen = new Map<string, { id: string; amount: number }>();
  s.customers.create = async () => ({ id: 'cus_x' });
  s.paymentMethods.attach = async () => ({ id: 'pm_x' });
  s.paymentMethods.create = async () => ({ id: 'pm_clone' });
  s.paymentIntents.create = async (p: { amount: number }, o: { idempotencyKey: string }) => {
    if (failNext) { failNext = false; throw Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError' }); }
    const prior = seen.get(o.idempotencyKey); if (prior) return prior;
    await new Promise(r => setTimeout(r, 50));
    const pi = { id: `pi_dues_${++charges}`, amount: p.amount };
    seen.set(o.idempotencyKey, pi); return pi;
  };
  // Outside a request, after() has no scope: run the receipt email inline and drop it.
  (createRequire(__filename)('next/server') as { after: (p: Promise<unknown>) => void }).after = (p: Promise<unknown>) => { void Promise.resolve(p).catch(() => {}); };
  const { POST } = await import('../src/app/api/membership/[id]/route');
  const pay = (pm: string) => POST(new NextRequest(`http://x/api/membership/${m.id}`, { method: 'POST', body: JSON.stringify({ token: 'tok', paymentMethodId: pm }) }), { params: Promise.resolve({ id: m.id }) });

  failNext = true;
  const declined = await pay('pm_bad');
  const afterDecline = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id } });
  ok('a declined card leaves nothing claimed and nothing paid', declined.status === 402 && afterDecline.duesChargeStartedAt === null && afterDecline.paymentStatus !== 'paid');

  const [r1, r2] = await Promise.all([pay('pm_a'), pay('pm_b')]);
  const statuses = [r1.status, r2.status].sort();
  ok('two payments at once: one charges, the other is told it is being paid', charges === 1 && statuses[0] === 200 && statuses[1] === 409, { charges, statuses });
  const paid = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id } });
  const row = await prisma.moneyMove.findFirst({ where: { membershipId: m.id } });
  ok('the dues are on the ledger with the amount paid (dues + 1%) and GreenReserve\'s 1%', !!row && row.amountCents === 101000 && row.platformFeeCents === 1000 && row.what === 'dues', row);
  ok('…and the term is recorded, the claim gone', paid.paymentStatus === 'paid' && !!paid.lastPaidAt && paid.duesChargeStartedAt === null && !!paid.expiresAt);
  const again = await pay('pm_a');
  ok('paying again inside the term is refused, and nothing is charged', again.status === 409 && charges === 1);

  // A monthly tier: paying again right after paying is refused (every day of a 30-day term is "within 30 days").
  const monthly = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Monthly', annualFeeCents: 5000, termMonths: 1 } });
  const mm = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: monthly.id, inviteName: 'Mo', inviteEmail: `${TAG}+mo@t.local`, status: 'active', payToken: 'tok2' } });
  const payM = (pm: string) => POST(new NextRequest(`http://x/api/membership/${mm.id}`, { method: 'POST', body: JSON.stringify({ token: 'tok2', paymentMethodId: pm }) }), { params: Promise.resolve({ id: mm.id }) });
  const before = charges;
  const m1 = await payM('pm_m1');
  const m2 = await payM('pm_m2');
  ok('a monthly member paying twice in a row is charged once', m1.status === 200 && m2.status === 409 && charges === before + 1, { m1: m1.status, m2: m2.status, charges: charges - before });

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('money-ledger: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
