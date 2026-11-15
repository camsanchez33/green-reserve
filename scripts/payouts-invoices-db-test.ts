// Revenue page (Cam 2026-11-15): a payout taken apart (lib/payout-detail) and the course's event
// invoices (lib/event-invoices). Stripe is stubbed. Needs a database.
// Run: npx tsx scripts/payouts-invoices-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { recordMove } from '../src/lib/money-ledger';
import { breakdownOf, payoutDetail } from '../src/lib/payout-detail';
import { eventInvoices } from '../src/lib/event-invoices';
import { allSegments } from '../src/lib/revenue-extras';
import { paymentDetail, bookingLines } from '../src/lib/payment-detail';
import { dayStart, ledgerDays } from '../src/lib/ledger-view';

const TAG = 'payinvdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId: { in: ids } } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopItem.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingShopItem.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEventPayment.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEventPlayer.deleteMany({ where: { event: { courseId: { in: ids } } } });
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
    { type: 'refund', cents: -3000, stripeFeeCents: 0, greenReserveFeeCents: 0, refundId: 're_payinv_ours' },
    { type: 'refund', cents: -1000, stripeFeeCents: 0, greenReserveFeeCents: 0, refundId: 're_dash' },
    { type: 'adjustment', cents: -500, stripeFeeCents: 1500, greenReserveFeeCents: 0, refundId: null },
    { type: 'stripe_fee', cents: -200, stripeFeeCents: 0, greenReserveFeeCents: 0, refundId: null },
  ], new Set(['re_payinv_ours']), 10000 + 2000 - 3000 - 1000 - 500 - 320 - 150 - 60 - 1500 - 200);
  ok('card payments, our refunds, refunds made in Stripe, fees and the rest', b.cardCents === 12000 && b.refundsCents === -3000 && b.stripeDirectRefundsCents === -1000 && b.stripeFeesCents === -2080 && b.greenReserveFeesCents === -150 && b.otherCents === -500, b);
  ok('…and they add up to the payout', b.addsUp);
  ok('a payout that doesn’t add up says so', !breakdownOf([{ type: 'charge', cents: 100, stripeFeeCents: 0, greenReserveFeeCents: 0, refundId: null }], new Set(), 99).addsUp);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, active = true) => prisma.course.create({ data: { name: `Pay ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'America/New_York', stripeAccountId: `acct_${n}`, stripeAccountActive: active } });
  const c = await mk('a'), other = await mk('b'), off = await mk('c', false);
  await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 3000, stripeId: 're_payinv_ours', actor: 'staff' });
  await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 1000, stripeId: 're_payinv_mirror', actor: 'stripe', note: 'refunded in Stripe' });
  await recordMove({ courseId: other.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 999, stripeId: 're_payinv_other', actor: 'staff' });

  // ── Stripe stubbed ──
  const po = stripe.payouts as unknown as { retrieve: unknown };
  const bt = stripe.balanceTransactions as unknown as { list: unknown };
  let asked: unknown[] = [];
  po.retrieve = async (...a: unknown[]) => { asked = a; if (a[0] === 'po_missing00') { const e = new Error('No such payout') as Error & { statusCode: number }; e.statusCode = 404; throw e; }
    return { id: a[0], status: 'paid', amount: 10000 - 3000 - 1000 - 999 - 290, automatic: true, arrival_date: 1_900_000_000, created: 1_899_900_000, destination: { object: 'bank_account', bank_name: 'CHASE', last4: '6789', routing_number: '110000000', fingerprint: 'fp' } }; };
  bt.list = () => ({ async *[Symbol.asyncIterator]() {
    yield { type: 'charge', currency: 'usd', amount: 10000, fee_details: [{ type: 'stripe_fee', amount: 290 }], source: 'ch_1', created: 1_899_000_000 };
    yield { type: 'refund', currency: 'usd', amount: -3000, fee_details: [], source: 're_payinv_ours' };
    yield { type: 'refund', currency: 'usd', amount: -1000, fee_details: [], source: 're_payinv_mirror' };
    yield { type: 'refund', currency: 'usd', amount: -999, fee_details: [], source: 're_payinv_other' };
    yield { type: 'payout', currency: 'usd', amount: -4711, fee_details: [], source: 'po_abc12345' };
  } });
  const d = await payoutDetail(c.id, 'po_abc12345');
  ok('read on the course’s own account', JSON.stringify(asked).includes('acct_a'), asked);
  ok('the bank: name and last four only', JSON.stringify(d?.bank) === '{"name":"CHASE","last4":"6789"}', d?.bank);
  ok('nothing else of the bank account is returned', !JSON.stringify(d).includes('110000000') && !JSON.stringify(d).includes('fp'));
  ok('our refund is ours; a mirrored one and another course’s count as made in Stripe', d?.breakdown?.refundsCents === -3000 && d.breakdown.stripeDirectRefundsCents === -1999, d?.breakdown);
  ok('Stripe’s fee, and it adds up', d?.breakdown?.stripeFeesCents === -290 && d.breakdown.addsUp, d?.breakdown);
  ok('the payments it covers', d?.paymentsFrom === new Date(1_899_000_000_000).toISOString() && d.paymentsTo === d.paymentsFrom, d);
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
  // Sign-up page checkouts: a dead one (hold ran out, nobody opened the event since) and one mid-checkout are not
  // invoices; a group put on the list without paying is.
  const signup = async (status: string, holdUntil: Date | null, key: string) => {
    const pl = await prisma.courseEventPlayer.create({ data: { eventId: ev.id, name: `Lead ${key}`, status, holdUntil, source: 'signup', groupKey: key } as never });
    await pay(c.id, ev.id, { kind: 'player', label: `Entry ${key}`, groupKey: key, playerId: pl.id, payerName: `Lead ${key}`, payerEmail: `${key}@example.com` });
  };
  await signup('held', new Date(Date.now() - 3_600_000), 'dead');
  await signup('held', new Date(Date.now() + 600_000), 'mid');
  await signup('in', null, 'listed');
  const inv = await eventInvoices(c.id, 'America/New_York', { from: '2031-05-01', to: '2031-05-31' }, { mayResend: true });
  ok('pending: every open one, this course only', inv.open.length === 3 && inv.open.every(x => x.eventName === 'Charity Scramble'), inv.open.map(x => x.label));
  ok('a sign-up checkout whose hold ran out, or still mid-checkout, is not pending', !inv.open.some(x => x.label === 'Entry dead' || x.label === 'Entry mid'));
  ok('a sign-up group put on the list without paying is', inv.open.some(x => x.label === 'Entry listed'));
  ok('paid: only those paid in the range; void left out', inv.paid.length === 1, inv.paid);
  ok('resend offered only where there’s somewhere to send it', inv.open.filter(x => x.canResend).length === 2 && inv.open.find(x => x.canResend)?.resendVia.join() === 'email');
  ok('the pay link’s token is never returned', !JSON.stringify(inv).includes('secret-token') && !JSON.stringify(inv).includes('payerEmail'));
  const noResend = await eventInvoices(c.id, 'America/New_York', { from: '2031-05-01', to: '2031-05-31' }, { mayResend: false });
  ok('without "Run events" no resend is offered', noResend.open.every(x => !x.canResend));

  await prisma.courseEvent.update({ where: { id: ev.id }, data: { status: 'cancelled' } });
  const cancelled = await eventInvoices(c.id, 'America/New_York', { from: '2031-05-01', to: '2031-05-31' }, { mayResend: true });
  ok('a cancelled event’s link is never offered for resend', cancelled.open.every(x => !x.canResend));

  // ── Every segment, by payment day, from the database ──
  const tz = 'America/New_York';
  const at = (d: string, h: number) => new Date(dayStart(tz, d).getTime() + h * 3_600_000);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: [c.id, other.id] } } });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 5150, platformFeeCents: 150, stripeId: 'pi_payinv_s1', actor: 'golfer', at: at('2031-05-12', 9) });
  await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'cash', account: 'course', amountCents: 1000, actor: 'staff', at: at('2031-05-13', 14) });
  await recordMove({ courseId: c.id, what: 'dues', direction: 'in', method: 'card', account: 'course', amountCents: 90000, stripeId: 'pi_payinv_dues', actor: 'golfer', at: at('2031-05-13', 10) });
  await recordMove({ courseId: c.id, what: 'booking_fee', direction: 'in', method: 'card', account: 'platform', amountCents: 300, platformFeeCents: 300, stripeId: 'pi_payinv_fee', actor: 'golfer', at: at('2031-05-13', 10) });
  await recordMove({ courseId: other.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 77777, stripeId: 'pi_payinv_x', actor: 'golfer', at: at('2031-05-13', 10) });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'cash', account: 'course', amountCents: 2500, actor: 'staff', at: at('2031-05-05', 9) });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'cash', account: 'course', amountCents: 800, actor: 'staff', at: at('2031-05-11', 23) });
  const all = await allSegments(c.id, tz, { from: '2031-05-12', to: '2031-05-18' }, { from: '2031-05-05', to: '2031-05-11' }, at('2031-05-20', 12));
  ok('Revenue: the course’s part, dues in; GreenReserve’s own fee row and another course left out', all.grossCents === 5000 + 1000 + 90000 && all.refundsCents === 0, all);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
  ok('…what was sold and how it was paid add up to it', sum(all.segments) === all.grossCents && sum(all.paid) === all.grossCents, [all.segments, all.paid]);
  ok('…dues their own segment; a round with no booking is tee', all.segments.duesCents === 90000 && all.segments.teeCents === 5000, all.segments);
  ok('…by day, by local hour', all.series.find(x => x.key === '2031-05-12')?.cents === 5000 && all.byHour.some(h => h.hour === 9 && h.cents === 5000) && all.byHour.some(h => h.hour === 14 && h.cents === 1000), all.byHour);
  ok('…the period before is its own window (11 PM the night before counts there)', all.beforeGrossCents === 2500 + 800, all.beforeGrossCents);
  {
    // The one-total rule (Cam's approved mockup: the same figure four times): Revenue here equals the Ledger's money in,
    // less GreenReserve's part, for the same days; and Revenue − Refunds equals the Ledger's net after GreenReserve's part.
    await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 1030, platformFeeCents: 30, stripeId: 're_payinv_one', actor: 'staff', at: at('2031-05-14', 10) });
    const one = await allSegments(c.id, tz, { from: '2031-05-12', to: '2031-05-18' }, { from: '2031-05-05', to: '2031-05-11' }, at('2031-05-20', 12));
    const ld = await ledgerDays(c.id, '2031-05-12', '2031-05-18');
    const inLessFee = ld!.days.reduce((x, d) => x + d.cardInCents + d.cashInCents + d.otherInCents, 0) - (await prisma.moneyMove.aggregate({ where: { courseId: c.id, direction: 'in', at: { gte: dayStart(tz, '2031-05-12'), lt: dayStart(tz, '2031-05-19') } }, _sum: { platformFeeCents: true } }))._sum.platformFeeCents!;
    const ledgerNet = ld!.days.reduce((x, d) => x + d.netCents - d.platformCents, 0);
    ok('one total: Revenue equals the Ledger’s money in less GreenReserve’s part', one.grossCents === inLessFee, [one.grossCents, inLessFee]);
    ok('…and Revenue − Refunds equals the Ledger’s net after GreenReserve’s part', one.netCents === ledgerNet && one.refundsCents === 1000, [one.netCents, ledgerNet]);
    const feesIn = ld!.days.reduce((x, d) => x + d.feesInCents, 0), feesBack = ld!.days.reduce((x, d) => x + d.feesBackCents, 0);
    ok('…and the days carry both fee figures: Revenue = in − feesIn, Refunds = out − feesBack', feesIn === 150 + 300 && feesBack === 30
      && one.grossCents === ld!.days.reduce((x, d) => x + d.cardInCents + d.cashInCents + d.otherInCents, 0) - feesIn
      && one.refundsCents === ld!.days.reduce((x, d) => x + d.outCents, 0) - feesBack
      && ld!.days.every(d => d.platformCents === d.feesInCents - d.feesBackCents), [feesIn, feesBack]);
  }

  // ── One payment's side card ──
  ok('pure: a round’s lines, GreenReserve’s fee never one of them', JSON.stringify(bookingLines({ players: 2, greenFeeTotal: 10000, cartFeeTotal: 4000, rangeBallsTotal: 0, shopTaxCents: 80, shopItems: [{ name: 'Glove', unitPriceCents: 1000, quantity: 1 }] })) === JSON.stringify([{ label: 'Green fee × 2', cents: 10000 }, { label: 'Cart', cents: 4000 }, { label: 'Glove', cents: 1000 }, { label: 'Sales tax', cents: 80 }]));
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: '2031-05-12', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 4 } });
  const bk = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Pat Side', golferEmail: `${TAG}@noemail.greenreserve.app`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 4000, accessFeeTotal: 300, totalAmount: 14300, status: 'completed', paymentStatus: 'paid' } });
  await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 14300, platformFeeCents: 300, stripeId: 'pi_payinv_side', bookingId: bk.id, actor: 'golfer', at: at('2031-05-12', 9) });
  await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 4000, stripeId: 're_payinv_side', bookingId: bk.id, actor: 'staff', note: 'Cart broke down', at: at('2031-05-12', 13) });
  await recordMove({ courseId: c.id, what: 'hold', direction: 'out', method: 'card', account: 'course', amountCents: 2000, stripeId: 're_payinv_hold', bookingId: bk.id, actor: 'system', note: 'hold given back at check-in', at: at('2031-05-12', 8) });
  const roundMove = await prisma.moneyMove.findFirstOrThrow({ where: { courseId: c.id, stripeId: 'pi_payinv_side' } });
  const pi = stripe.paymentIntents as unknown as { retrieve: unknown };
  let piAsked: unknown[] = [];
  pi.retrieve = async (...a: unknown[]) => { piAsked = a; return { id: a[0], latest_charge: { payment_method_details: { card: { brand: 'visa', last4: '4242', fingerprint: 'fpx', exp_month: 1 } } } }; };
  const pd = await paymentDetail(c.id, roundMove.id);
  ok('side card: who, what for, how paid', pd?.who === 'Pat Side' && pd.lines.length === 2 && pd.lines[0].label === 'Green fee × 2' && pd.methodLabel === 'Card', pd);
  ok('…the card’s brand and last four only, read on this course’s account', JSON.stringify(pd?.card) === '{"brand":"visa","last4":"4242","present":false}' && JSON.stringify(piAsked).includes('acct_a') && !JSON.stringify(pd).includes('fpx'), [pd?.card, piAsked]);
  ok('…the refund on the round with its reason; the hold given back is not one', pd?.refunds.length === 1 && pd.refunds[0].reason === 'Cart broke down' && pd.refunds[0].amountCents === -4000 && pd.refunds[0].kind === 'refund' && !pd.refunds[0].inStripeDirectly, pd?.refunds);
  ok('…the round’s receipt and its booking id for the existing actions', pd?.receipt?.kind === 'booking' && pd.bookingId === bk.id);
  ok('another course’s payment is not found', (await paymentDetail(other.id, roundMove.id)) === null);
  const sale2 = await prisma.shopSale.create({ data: { courseId: c.id, status: 'paid_cash', totalCents: 1080, taxCents: 80, paidAt: at('2031-05-12', 10), lines: { create: [{ name: 'Hot dog', unitPriceCents: 500, quantity: 2 }] } } });
  await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'cash', account: 'course', amountCents: 1080, saleId: sale2.id, actor: 'staff', at: at('2031-05-12', 10) });
  const saleMove = await prisma.moneyMove.findFirstOrThrow({ where: { courseId: c.id, saleId: sale2.id } });
  const sd = await paymentDetail(c.id, saleMove.id);
  ok('a cash sale: its lines and tax, no card, the shop receipt', sd?.lines.map(l => l.label).join() === 'Hot dog × 2,Sales tax' && sd.card === null && sd.receipt?.kind === 'shop', sd);
  {
    // A dispute: the webhook writes the money taken back as an out row "<dispute>:withdrawn", and a won dispute as money back in.
    await recordMove({ courseId: c.id, what: 'round', direction: 'out', method: 'card', account: 'course', amountCents: 14300, stripeId: 'du_payinv:withdrawn', bookingId: bk.id, actor: 'stripe', note: 'disputed: fraudulent', at: at('2031-05-15', 9) });
    await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'card', account: 'course', amountCents: 14300, stripeId: 'du_payinv:reinstated', bookingId: bk.id, actor: 'stripe', note: 'dispute won — money back', at: at('2031-05-25', 9) });
    const dd = await paymentDetail(c.id, roundMove.id);
    const kinds = dd?.refunds.map(r => r.kind).join();
    ok('a chargeback is a dispute, not a refund made in Stripe; the win shows as money back', kinds === 'refund,dispute,dispute_won' && dd!.refunds.every(r => !r.inStripeDirectly) && dd!.refunds[2].amountCents === 14300, dd?.refunds);
  }
  {
    // A round paid at the register with a hot dog on the same sale: two rows, two cards.
    const tt3 = await prisma.teeTime.create({ data: { courseId: c.id, date: '2031-05-13', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
    const bk3 = await prisma.booking.create({ data: { teeTimeId: tt3.id, courseId: c.id, golferName: 'Reg Round', golferEmail: `${TAG}3@noemail.greenreserve.app`, players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 5000, status: 'completed', paymentStatus: 'paid_offline' } });
    const dogItem = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Hot dog', category: 'Grill', taxCategory: 'food', priceCents: 500 } });
    const rs = await prisma.shopSale.create({ data: { courseId: c.id, status: 'paid_cash', totalCents: 5533, taxCents: 33, roundsCents: 5000, paidAt: at('2031-05-13', 9), lines: { create: [{ name: 'Round', unitPriceCents: 5000, quantity: 1, bookingId: bk3.id }, { name: 'Hot dog', unitPriceCents: 500, quantity: 1, shopItemId: dogItem.id }] } } });
    await recordMove({ courseId: c.id, what: 'round', direction: 'in', method: 'cash', account: 'course', amountCents: 5000, bookingId: bk3.id, saleId: rs.id, actor: 'staff', at: at('2031-05-13', 9) });
    await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'cash', account: 'course', amountCents: 533, saleId: rs.id, actor: 'staff', at: at('2031-05-13', 9) });
    await recordMove({ courseId: c.id, what: 'shop', direction: 'out', method: 'cash', account: 'course', amountCents: 533, saleId: rs.id, actor: 'staff', note: 'Cold hot dog', at: at('2031-05-13', 10) });
    const rRow = await prisma.moneyMove.findFirstOrThrow({ where: { courseId: c.id, saleId: rs.id, what: 'round' } });
    const sRow = await prisma.moneyMove.findFirstOrThrow({ where: { courseId: c.id, saleId: rs.id, what: 'shop', direction: 'in' } });
    const rd = await paymentDetail(c.id, rRow.id), sd2 = await paymentDetail(c.id, sRow.id);
    ok('register round: the round’s lines, not the sale’s; the hot dog refund not on it', rd?.lines.map(l => l.label).join() === 'Green fee × 1' && rd.refunds.length === 0 && rd.receipt?.kind === 'booking', rd);
    ok('…the items row: the hot dog and its tax, its own refund', sd2?.lines.map(l => `${l.label}:${l.cents}`).join() === 'Hot dog:500,Sales tax:33' && sd2.refunds.length === 1 && sd2.refunds[0].reason === 'Cold hot dog', sd2);
    const seg = await allSegments(c.id, tz, { from: '2031-05-13', to: '2031-05-13' }, { from: '2031-05-12', to: '2031-05-12' }, at('2031-05-20', 12));
    ok('…and every segment: the round tee, the hot dog F&B', seg.segments.teeCents === 5000 && seg.segments.fnbCents === 533 && seg.segments.shopCents === 1000 /* the earlier $10 sale that day */, seg.segments);
    // A discounted sale: the lines add up to the payment.
    const ds = await prisma.shopSale.create({ data: { courseId: c.id, status: 'paid_cash', totalCents: 5331, taxCents: 331, discountCents: 1000, discountNote: 'Member', paidAt: at('2031-05-13', 11), lines: { create: [{ name: 'Shirt', unitPriceCents: 6000, quantity: 1 }] } } });
    await recordMove({ courseId: c.id, what: 'shop', direction: 'in', method: 'cash', account: 'course', amountCents: 5331, saleId: ds.id, actor: 'staff', at: at('2031-05-13', 11) });
    const dRow = await prisma.moneyMove.findFirstOrThrow({ where: { courseId: c.id, saleId: ds.id } });
    const dd2 = await paymentDetail(c.id, dRow.id);
    ok('a discounted sale: a Discount line, and the lines add up to the payment', !!dd2?.lines.some(l => l.label === 'Discount · Member' && l.cents === -1000) && dd2.lines.reduce((x, l) => x + l.cents, 0) === 5331, dd2?.lines);
  }
  ok('the payment route needs money.payments', readFileSync('src/app/api/operator/money/payment/route.ts', 'utf8').includes("requirePermission(session, 'money.payments')"));

  // ── The routes ──
  const pr = readFileSync('src/app/api/operator/stripe/payouts/[id]/route.ts', 'utf8');
  const ir = readFileSync('src/app/api/operator/money/event-invoices/route.ts', 'utf8');
  ok('payout detail needs the Payouts permission, like the payout list', pr.includes("requirePermission(session, 'money.payouts')"));
  ok('the sales route returns every segment', /\ball,\n/.test(readFileSync('src/app/api/operator/money/sales/route.ts', 'utf8')) && readFileSync('src/app/api/operator/money/sales/route.ts', 'utf8').includes('allSegments(session.courseId, tz, a.range, previousRange(a.range))'));
  ok('event invoices need money.payments; resend only with events.manage', ir.includes("requirePermission(session, 'money.payments')") && ir.includes("can(session, 'events.manage')"));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
  console.log('\npayouts-invoices-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
