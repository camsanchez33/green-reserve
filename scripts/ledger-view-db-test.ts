// LEDGER-2 (Cam 2026-10-30: "Days, then the rows"; dues "Amount + cash or check"; a CSV):
// the course's ledger read back by day and by row, the Stripe match, the CSV, and cash
// dues counted in the close-out. Stripe is stubbed. Needs a database.
// Run: npx tsx scripts/ledger-view-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { recordMove } from '../src/lib/money-ledger';
import { ledgerDays, ledgerRows, ledgerCsv, sumDay, matchOf } from '../src/lib/ledger-view';
import { daySummary } from '../src/lib/register-close';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'ledgerviewdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  // Pure.
  const s = sumDay('2031-05-13', [
    { direction: 'in', method: 'card', account: 'course', amountCents: 10300, platformFeeCents: 300 },
    { direction: 'in', method: 'cash', account: 'course', amountCents: 5000, platformFeeCents: 0 },
    { direction: 'in', method: 'card', account: 'platform', amountCents: 300, platformFeeCents: 300 },
    { direction: 'out', method: 'card', account: 'course', amountCents: 4000, platformFeeCents: 100 },
  ]);
  ok('a day adds card, cash and money given back', s.cardInCents === 10600 && s.cashInCents === 5000 && s.outCents === 4000 && s.netCents === 11600, s);
  ok('…GreenReserve\'s part is fees taken less fees given back', s.platformCents === 500, s);
  ok('…the Stripe match counts only card money on the course\'s own account', s.courseCardNetCents === 6300, s);
  ok('match: equal is ok, different is off, nothing is none, unread is unknown', matchOf(6300, 6300) === 'ok' && matchOf(6300, 6000) === 'off' && matchOf(0, 0) === 'none' && matchOf(1, null) === 'unknown');

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Ledger ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'America/New_York', stripeAccountId: 'acct_lv', stripeAccountActive: true } });
  const c = await mk('a'), other = await mk('b');
  const today = todayIn('America/New_York');
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Pat Ledger', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'completed', paymentStatus: 'paid' } });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 10300, platformFeeCents: 300, stripeId: 'pi_lv1', bookingId: b.id, actor: 'staff' });
  await recordMove({ courseId: c.id, what: 'dues', direction: 'in', method: 'cash', account: 'course', amountCents: 50000, actor: 'staff', note: 'cash at the course' });
  await recordMove({ courseId: other.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 999, stripeId: 'pi_lv_other' });

  // Stripe's own record of the day: the round charge.
  const bt = stripe.balanceTransactions as unknown as { list: unknown };
  let stripeAmount = 10300;
  bt.list = () => ({ async *[Symbol.asyncIterator]() { yield { currency: 'usd', type: 'charge', amount: stripeAmount, created: Math.floor(Date.now() / 1000) }; yield { currency: 'usd', type: 'payout', amount: -99999, created: Math.floor(Date.now() / 1000) }; } });
  const r = await ledgerDays(c.id, addDaysStr(today, -2), today);
  const d = r?.days[0];
  ok('the days are newest first, one per day, empty days included', r?.days.length === 3 && d?.day === today, r?.days.map(x => x.day));
  ok('today: the card round and the cash dues, nothing from another course', d?.cardInCents === 10300 && d.cashInCents === 50000 && d.moves === 2, d);
  ok('…matches Stripe (payouts aside)', d?.match === 'ok' && d.stripeNetCents === 10300, d);
  stripeAmount = 10000;
  ok('…and says so when Stripe recorded something else', (await ledgerDays(c.id, today, today))?.days[0].match === 'off');
  bt.list = () => ({ async *[Symbol.asyncIterator]() { throw new Error('Stripe down'); } });
  const down = await ledgerDays(c.id, today, today);
  ok('Stripe down: the ledger still shows, unchecked', down?.stripeRead === false && down.days[0].match === 'unknown' && down.days[0].cardInCents === 10300);

  const rows = await ledgerRows(c.id, today);
  ok('a day\'s rows: each movement, named and linked to its booking', rows?.length === 2 && rows.some(x => x.who === 'Pat Ledger' && x.href?.startsWith('/dashboard?date=')), rows);
  const csv = await ledgerCsv(c.id, today, today) ?? '';
  ok('the CSV has a header and a line per movement, in dollars', csv.split('\r\n').filter(Boolean).length === 3 && csv.includes('103.00') && csv.includes('500.00') && !csv.includes('9.99'), csv);
  await recordMove({ courseId: c.id, what: 'dues', direction: 'in', method: 'cash', account: 'course', amountCents: 100, actor: 'staff', note: '=HYPERLINK("x")' });
  ok('…a note can\'t run as a spreadsheet formula', (await ledgerCsv(c.id, today, today) ?? '').includes(`'=HYPERLINK`));

  // The close-out counts cash dues.
  const sum = await daySummary(c.id, today);
  ok('cash dues are in the day\'s cash taken', sum.ok && sum.value.otherCash.cents === 50100 && sum.value.cashTakenCents >= 50100, sum);

  // Wiring.
  const route = readFileSync('src/app/api/operator/money/ledger/route.ts', 'utf8');
  ok('the ledger route is the session\'s course only, gated like Payments', route.includes("requirePermission(session, 'money.payments')") && !/courseId: (sp|req|body)/.test(route));
  const members = readFileSync('src/app/api/operator/members/route.ts', 'utf8');
  ok('dues at the course record the amount taken and cash or check', members.includes("method: method === 'cash' ? 'cash' : 'other'") && members.includes('takenCents'));
  const page = readFileSync('src/app/dashboard/money/page.tsx', 'utf8');
  ok('Money has a Ledger tab under the Payments permission', page.includes("{ key: 'ledger', label: 'Ledger' }") && page.includes("ledger: 'money.payments'"));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('ledger-view-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
