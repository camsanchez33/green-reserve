// Revenue page (Cam 2026-11-15): the Stripe-mismatch detail per payment (lib/revenue-extras
// stripeDayDetail) read from Stripe's balance transactions with their source expanded, the
// range rows, and that nothing crosses courses. Stripe is stubbed. Needs a database.
// Run: npx tsx scripts/revenue-extras-db-test.ts
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { recordMove } from '../src/lib/money-ledger';
import { stripeDayDetail, todayVsAverage, howPaid } from '../src/lib/revenue-extras';
import { ledgerRowsRange, dayStart } from '../src/lib/ledger-view';
import { addDaysStr } from '../src/lib/course-time';

const TAG = 'revextrasdbtest';
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
  const tz = 'America/New_York';
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, active = true) => prisma.course.create({ data: { name: `Rev ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: tz, stripeAccountId: `acct_${n}`, stripeAccountActive: active } });
  const c = await mk('a'), other = await mk('b'), off = await mk('c', false);
  const day = '2031-05-13';
  const at = (d: string, hhmm: string) => new Date(dayStart(tz, d).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000);
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Pat Refund', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000, status: 'completed', paymentStatus: 'paid' } });
  // A round paid two weeks earlier, refunded in Stripe directly on the day (no webhook arrived).
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 10000, stripeId: 'pi_old', bookingId: b.id, actor: 'golfer', at: at(addDaysStr(day, -14), '09:00') });
  // The day: one matching charge, one we have that Stripe lacks, one recorded just before midnight that Stripe has the next day.
  await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'card_present', account: 'course', amountCents: 3000, stripeId: 'pi_same', actor: 'staff', at: at(day, '10:00') });
  await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'card', account: 'course', amountCents: 1500, stripeId: 'pi_ours_only', actor: 'staff', at: at(day, '11:00') });
  await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'card', account: 'course', amountCents: 2000, stripeId: 'pi_late', actor: 'staff', at: at(day, '23:59') });
  await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'cash', account: 'course', amountCents: 800, actor: 'staff', at: at(day, '12:00') });
  await recordMove({ courseId: other.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 999, stripeId: 'pi_other_course', at: at(day, '10:00') });

  const sec = (d: Date) => Math.floor(d.getTime() / 1000);
  const bt = stripe.balanceTransactions as unknown as { list: unknown };
  let seenArgs: unknown[] = [];
  let txns: unknown[] = [];
  bt.list = (...args: unknown[]) => { seenArgs = args; return { async *[Symbol.asyncIterator]() { for (const t of txns) yield t; } }; };
  txns = [
    { currency: 'usd', type: 'charge', amount: 3000, created: sec(at(day, '10:00')), source: { id: 'ch_same', object: 'charge', payment_intent: 'pi_same' } },
    { currency: 'usd', type: 'refund', amount: -10000, created: sec(at(day, '14:00')), source: { id: 're_dash', object: 'refund', payment_intent: 'pi_old' } },
    { currency: 'usd', type: 'charge', amount: 2000, created: sec(at(addDaysStr(day, 1), '00:01')), source: { id: 'ch_late', object: 'charge', payment_intent: 'pi_late' } },
    { currency: 'usd', type: 'payout', amount: -50000, created: sec(at(day, '15:00')), source: 'po_1' },
  ];
  const m = await stripeDayDetail(c.id, day);
  ok('the Stripe read asks for the sources expanded, on the course’s own account', JSON.stringify(seenArgs).includes('data.source') && JSON.stringify(seenArgs).includes('acct_a'), seenArgs);
  ok('the day differs: ours 6500 card, Stripe 3000 − 10000', !!m && m.ourCents === 6500 && m.stripeCents === -7000 && m.diffCents === -13500, m && { o: m.ourCents, s: m.stripeCents });
  const k = (id: string) => m?.payments.find(p => p.stripeId === id);
  ok('the Stripe refund on a payment we have reads as refunded in Stripe, named', k('re_dash')?.kind === 'refund_in_stripe' && k('re_dash')?.who === 'Pat Refund' && k('re_dash')?.stripeCents === -10000 && k('re_dash')?.ourCents === null, k('re_dash'));
  ok('…and links to the booking', !!k('re_dash')?.href?.includes('/dashboard?date=2031-05-13'), k('re_dash'));
  ok('a charge only we have', k('pi_ours_only')?.kind === 'not_in_stripe' && k('pi_ours_only')?.ourCents === 1500);
  ok('across midnight is the other day, not missing', k('pi_late')?.kind === 'other_day');
  ok('the matching charge, cash and the payout are not listed', !k('pi_same') && m?.payments.length === 3, m?.payments.map(p => p.stripeId));
  ok('nothing from another course', !JSON.stringify(m).includes('pi_other_course'));

  txns = [
    { currency: 'usd', type: 'charge', amount: 3000, created: sec(at(day, '10:00')), source: { id: 'ch_same', object: 'charge', payment_intent: 'pi_same' } },
    { currency: 'usd', type: 'charge', amount: 1500, created: sec(at(day, '11:00')), source: { id: 'ch_o', object: 'charge', payment_intent: 'pi_ours_only' } },
    { currency: 'usd', type: 'charge', amount: 2000, created: sec(at(day, '23:59')), source: { id: 'ch_late', object: 'charge', payment_intent: 'pi_late' } },
  ];
  ok('a day that matches has no detail', (await stripeDayDetail(c.id, day)) === null);
  bt.list = () => ({ async *[Symbol.asyncIterator]() { throw new Error('Stripe down'); } });
  ok('Stripe down: no detail, never a guess', (await stripeDayDetail(c.id, day)) === null);
  ok('a course without an active Stripe account: no detail', (await stripeDayDetail(off.id, day)) === null);

  const rows = await ledgerRowsRange(c.id, addDaysStr(day, -14), day);
  ok('range rows: every movement of the range, this course only, named', rows?.length === 5 && !rows.some(r => r.stripeId === 'pi_other_course') && rows.some(r => r.who === 'Pat Refund'), rows?.map(r => r.stripeId));

  const hp = await howPaid(c.id, tz, { from: day, to: day });
  ok('how it was paid on the day: online, reader, cash', hp.onlineCents === 3500 && hp.readerCents === 3000 && hp.cashCents === 800 && hp.totalCents === 7300, hp);
  const line = await todayVsAverage(c.id, tz, at(day, '12:30'));
  ok('the line on the day: 14 days of history averaged, today so far', line.days === 14 && line.todayNowCents === 3000 + 1500 + 800 && line.avgNowCents === Math.round(10000 / 14), line);

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
  console.log('\nrevenue-extras-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
