// Audit re-check 2026-11-01, batch A ("what the app counts wrong"):
//  1. a round refunded in part counts only what it kept (Money + Analytics), and a card-reader
//     duplicate given back never comes off the round;
//  2. event money has its own line on Money and Analytics;
//  3. a substitute takes an event player's spot in place, so the payment stays with it;
//  4. the shop's "Today's sales" and its total are the course's day, not the last 36 hours;
//  5. the payout tile trusts Stripe's own "connected" answer.
// Needs a database. Run: npx tsx scripts/audit-numbers-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { computeAnalytics } from '../src/lib/analytics';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'auditnumbersdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEventPayment.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  try {
    const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
    const c = await prisma.course.create({ data: { name: 'Numbers GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
    const yesterday = addDaysStr(todayIn('UTC'), -1);
    const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: yesterday, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'booked' } });
    const mk = (name: string) => prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: name, golferEmail: `${TAG}+${name}@t.local`, players: 1,
      greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, status: 'completed', paymentStatus: 'paid', checkedInAt: new Date() } });
    const part = await mk('part');
    const dup = await mk('dup');
    // Staff gave back $20 of the first round; the reader's second payment on the other was returned whole.
    await prisma.moneyMove.create({ data: { courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 2000, stripeId: `${TAG}-re1`, bookingId: part.id, actor: 'staff' } });
    await prisma.moneyMove.create({ data: { courseId: c.id, what: 'round', direction: 'out', method: 'card_present', account: 'course', amountCents: 5150, platformFeeCents: 150, stripeId: `${TAG}-re2`, bookingId: dup.id, actor: 'system' } });

    // A $30 shirt (+ $2 tax) on a $50 round, $32 given back: split pro rata between the round and the shop.
    const shirt = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'shirt', golferEmail: `${TAG}+shirt@t.local`, players: 1,
      greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, shopTotalCents: 3000, shopTaxCents: 200, status: 'completed', paymentStatus: 'paid', checkedInAt: new Date() } });
    await prisma.moneyMove.create({ data: { courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 3200, stripeId: `${TAG}-re3`, bookingId: shirt.id, actor: 'staff' } });
    // A dispute the webhook mirrored on the duplicate's round is not a refund.
    await prisma.moneyMove.create({ data: { courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 5000, stripeId: `dp_${TAG}:withdrawn`, bookingId: dup.id, actor: 'stripe' } });

    const ev = await prisma.courseEvent.create({ data: { courseId: c.id, name: 'Outing', date: yesterday, startTime: '08:00', holdFrom: '08:00', holdTo: '08:00' } });
    await prisma.courseEventPayment.create({ data: { eventId: ev.id, courseId: c.id, label: 'Deposit', amountCents: 10000, method: 'cash', status: 'paid', paidAt: new Date(), refundedCents: 2500 } });
    await prisma.courseEventPayment.create({ data: { eventId: ev.id, courseId: c.id, label: 'Balance', amountCents: 40000, method: 'link', status: 'open' } });

    const a = await computeAnalytics(c.id, { from: yesterday, to: todayIn('UTC') });
    // part 3000 + dup 5000 + shirt (5000 − 1951 round part of the $32) = 11049.
    ok('1. a partial refund comes off collected; a shop refund only its round part', a.revenue.collectedCents === 11049, a.revenue.collectedCents);
    ok('1. by card counts what the rounds kept', a.revenue.cardCents === 11049, a.revenue.cardCents);
    ok('1. the shop part of the refund comes off shop items on rounds ($30 − $11.71)', a.revenue.beyond.shopOnRoundsCents === 1829, a.revenue.beyond.shopOnRoundsCents);
    ok('1. a mirrored dispute (dp_…) is not counted as a refund', a.revenue.roundRefundsCents === 2000 + 1951, a.revenue.roundRefundsCents);
    ok('1. the refund has its own line, so green + cart − refunds = collected', a.revenue.roundRefundsCents > 0 && a.revenue.greenCents + a.revenue.cartCents - a.revenue.roundRefundsCents === a.revenue.collectedCents, a.revenue);
    ok('1. a card-reader duplicate given back ("system") never comes off the round', a.revenue.roundRefundsCents < 5000);
    ok('2. event money: paid less refunded, open links not counted', a.revenue.beyond.eventCents === 7500 && a.revenue.beyond.eventPayments === 1, a.revenue.beyond);

    const sales = read('src/app/api/operator/money/sales/route.ts');
    const panel = read('src/components/dashboard/money/SalesPanel.tsx');
    const an = read('src/app/dashboard/analytics/page.tsx');
    ok('1/2. Money sends and shows the refunds and event lines', sales.includes('refundedCents: r.roundRefundsCents') && sales.includes('eventCents: r.beyond.eventCents') && panel.includes('label="Refunded"') && panel.includes('Event payments ·'));
    ok('1/2. Analytics shows them and keeps range balls from going wrong', an.includes('d.revenue.collectedCents + refunds - d.revenue.greenCents') && an.includes('label="Event payments"'));

    const evRoute = read('src/app/api/operator/events/[id]/route.ts');
    const evUi = read('src/components/dashboard/events/EventDetail.tsx');
    ok('3. player_edit changes name and contact in place (never delete + add)', evRoute.includes("case 'player_edit':") && /player_edit[\s\S]{0,900}courseEventPlayer\.updateMany\(\{ where: \{ id: String\(body\.playerId \?\? ''\), eventId: id \}, data: \{ name, email, phone \} \}\)/.test(evRoute));
    ok('3. the list has Swap, and Remove on a paid player says the money stays on the event', evUi.includes(">Swap</button>") && evUi.includes("action: 'player_edit'") && evUi.includes('has paid; the money stays on the event'));

    const shopRoute = read('src/app/api/operator/shop-sales/route.ts');
    const shop = read('src/app/dashboard/shop/page.tsx');
    ok('4. today\'s sales start at the course\'s midnight, not 36 hours back', !shopRoute.includes('36 * 60 * 60 * 1000') && shopRoute.includes("teeToUtcMs(todayIn(tz), '00:00', tz)") && shopRoute.includes('dayStart: since.toISOString()') && shopRoute.includes('{ paidAt: { gte: since } }'));
    ok('4. the header total and Void use the course\'s day', shop.includes('isPaid(s) && paidToday(s.paidAt)') && shop.includes('paidToday(s.paidAt) && <button') && !shop.includes('new Date(s.paidAt).toDateString()'));

    const money = read('src/app/dashboard/money/page.tsx');
    ok('5. the payout tile uses Stripe\'s connected answer', money.includes('setPayoutsConnected(p && p.ok ? !!p.data.connected : null)') && money.includes('stripeConnected={payoutsConnected ?? (courseLoaded && course.stripeAccountActive)}'));
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})();
