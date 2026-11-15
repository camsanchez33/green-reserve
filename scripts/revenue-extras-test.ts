// Revenue page (Cam 2026-11-15): the pure parts of lib/revenue-extras — today against the
// 30-day average by time of day, Food & beverage, how it was paid, and the per-payment
// Stripe difference. Pure. Run: npx tsx scripts/revenue-extras-test.ts
import { allOf, splitOf, splitBy, lineOf, isFnb, fnbPart, howPaidOf, diffItems, segmentsOf, localDayMinute, type Side } from '../src/lib/revenue-extras';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

// ── The line ──
const today = '2026-11-15';
const moves = [
  { day: today, minute: 400, cents: 5000 }, { day: today, minute: 700, cents: 3000 },
  { day: '2026-11-14', minute: 380, cents: 3000 }, { day: '2026-11-13', minute: 380, cents: 6000 },
  { day: '2026-11-13', minute: 900, cents: 9000 },
  { day: '2026-10-01', minute: 380, cents: 99_999 }, // before the window: never counted
];
const L = lineOf(moves, today, 30, 610);
const at = (m: number) => L.points.find(p => p.minute === m)!;
ok('points every 30 minutes from 6 AM to 8 PM', L.points.length === 29 && L.points[0].minute === 360 && L.points[28].minute === 1200);
ok('today is cumulative so far', at(390).todayCents === 0 && at(420).todayCents === 5000 && at(600).todayCents === 5000, L.points.slice(0, 10));
ok('today is null after the clock', at(630).todayCents === null && at(1200).todayCents === null);
ok('today now counts up to the current minute', L.todayNowCents === 5000);
ok('average is cumulative, over the days covered', at(390).avgCents === 300 && at(900).avgCents === 600, [at(390), at(900)]);
ok('average now', L.avgNowCents === 300);
ok('a payment outside the window is never counted', at(1200).avgCents === 600);
const L3 = lineOf(moves, today, 3, 610);
ok('a course live 3 days averages over 3, not 30', L3.days === 3 && L3.points.find(p => p.minute === 390)!.avgCents === 3000, L3.points[1]);
const L0 = lineOf(moves, today, 0, 610);
ok('first day: no average, today still drawn', L0.avgNowCents === 0 && L0.todayNowCents === 5000);

// ── Course-local day and minute (one cached formatter) ──
const dm = localDayMinute('America/New_York', new Date('2026-11-01T06:30:00Z'));
ok('fall-back day: 1:30 AM EST is minute 90 of Nov 1', dm.day === '2026-11-01' && dm.minute === 90, dm);
const dm2 = localDayMinute('America/New_York', new Date('2026-11-15T04:59:00Z'));
ok('just before local midnight is the day before, minute 1439', dm2.day === '2026-11-14' && dm2.minute === 1439, dm2);

// ── Segments ──
const sg = segmentsOf({ collectedCents: 10000, cartCents: 2000, lateFeesKeptCents: 1000, walkUpCents: 5000, shopOnRoundsCents: 1000, eventCents: 3000 }, 2500);
ok('tee is rounds kept less carts plus late fees', sg.teeCents === 9000);
ok('shop is walk-up and items on rounds less F&B', sg.shopCents === 3500 && sg.fnbCents === 2500);
ok('the total is the segments’ sum, not collectedCents', sg.totalCents === 9000 + 2000 + 3500 + 3000 + 2500);

// ── Food & beverage ──
ok('food tax category is F&B', isFnb('food', ''));
ok('soft drinks, water, snacks, candy are F&B', ['soda', 'water', 'snack', 'candy'].every(t => isFnb(t, 'Misc')));
ok('a "Drinks" shop category is F&B even taxed as general', isFnb('general', 'Drinks'));
ok('"Halfway house" and "F&B" categories are F&B', isFnb('general', 'Halfway house') && isFnb('general', 'F&B'));
ok('balls and apparel are not', !isFnb('general', 'Balls') && !isFnb('clothing', 'Apparel'));
ok('a missing item (deleted) is not F&B', !isFnb(null, null));
ok('F&B part follows the lines’ gross share', fnbPart(900, [{ cents: 600, fnb: true }, { cents: 300, fnb: false }]) === 600);
ok('a sale refunded down scales the F&B part', fnbPart(450, [{ cents: 600, fnb: true }, { cents: 300, fnb: false }]) === 300);
ok('nothing kept → no F&B', fnbPart(0, [{ cents: 600, fnb: true }]) === 0);
ok('no lines → no F&B', fnbPart(500, []) === 0);

// ── How it was paid ──
const hp = howPaidOf([
  { method: 'card', direction: 'in', amountCents: 5150, platformFeeCents: 150 },
  { method: 'card', direction: 'in', amountCents: 2000, platformFeeCents: 0 },
  { method: 'card', direction: 'out', amountCents: 2000, platformFeeCents: 0 },
  { method: 'card_present', direction: 'in', amountCents: 2000, platformFeeCents: 0 },
  { method: 'cash', direction: 'in', amountCents: 1000, platformFeeCents: 0 },
  { method: 'other', direction: 'in', amountCents: 500, platformFeeCents: 0 },
]);
ok('online is card not at a reader, less GreenReserve’s fee and less what went back', hp.onlineCents === 5000);
ok('reader, cash and other each their own', hp.readerCents === 2000 && hp.cashCents === 1000 && hp.otherCents === 500);
ok('the total adds up', hp.totalCents === 8500);

// ── Every segment by payment day ──
{
  const r = (day: string, minute: number, method: string, amountCents: number, direction = 'in', platformFeeCents = 0, split: Record<string, number> = { teeCents: amountCents - platformFeeCents }) => ({ day, minute, method, direction, amountCents, platformFeeCents, split });
  const A = allOf([
    r('2026-11-09', 8 * 60 + 5, 'card', 5150, 'in', 150, { teeCents: 4000, cartCents: 1000 }), r('2026-11-09', 9 * 60, 'cash', 1000, 'in', 0, { fnbCents: 1000 }),
    r('2026-11-10', 14 * 60, 'card_present', 2000, 'in', 0, { shopCents: 2000 }), r('2026-11-10', 15 * 60, 'card', 500, 'out', 0, {}),
    r('2026-11-15', 7 * 60, 'cash', 700, 'in', 0, { duesCents: 700 }), r('2026-11-01', 7 * 60, 'cash', 99_999),
  ], { from: '2026-11-09', to: '2026-11-15' }, '2026-11-15', 4200);
  ok('Revenue is money in, the course’s part; refunds their own line; net after', A.grossCents === 5000 + 1000 + 2000 + 700 && A.refundsCents === 500 && A.netCents === A.grossCents - 500, A);
  const segSum = Object.values(A.segments).reduce((x, y) => x + y, 0), paidSum = Object.values(A.paid).reduce((x, y) => x + y, 0);
  ok('what was sold and how it was paid both add up to Revenue', segSum === A.grossCents && paidSum === A.grossCents, [A.segments, A.paid]);
  ok('…by segment, dues included', A.segments.teeCents === 4000 && A.segments.cartCents === 1000 && A.segments.fnbCents === 1000 && A.segments.shopCents === 2000 && A.segments.duesCents === 700);
  ok('a week by day, money in, oldest first', A.bucket === 'day' && A.series.length === 7 && A.series[0].cents === 6000 && A.series[1].cents === 2000, A.series);
  ok('by weekday leaves today out', A.byDow[0].days === 0 && A.byDow[0].cents === 0 && A.byDow[1].days === 1 && A.byDow[1].cents === 6000, A.byDow);
  ok('by hour of payment, money in', JSON.stringify(A.byHour) === JSON.stringify([{ hour: 7, cents: 700 }, { hour: 8, cents: 5000 }, { hour: 9, cents: 1000 }, { hour: 14, cents: 2000 }]), A.byHour);
  ok('the period before is passed through', A.beforeGrossCents === 4200);
  const F = allOf([r('2026-11-16', 600, 'cash', 100)], { from: '2026-11-09', to: '2026-11-22' }, '2026-11-15', 0);
  ok('days still to come never dilute a weekday average', F.byDow.every(x => x.days <= 1) && F.byDow[1].days === 1 && F.byDow[1].cents === 0, F.byDow);
  const W = allOf([], { from: '2026-08-01', to: '2026-11-15' }, '2026-11-15', 0);
  ok('a long range is by Monday-start week', W.bucket === 'week' && W.series[0].key === '2026-07-27' && W.series.every(x => dowOf(x.key) === 1), W.series.slice(0, 2));

  // What one row was for.
  const bk = { greenFeeTotal: 8000, cartFeeTotal: 2000, rangeBallsTotal: 0, shopTaxCents: 60, shopItems: [{ unitPriceCents: 500, quantity: 2, taxCategory: 'general', shopItem: { category: 'Drinks' } }, { unitPriceCents: 1000, quantity: 1, taxCategory: 'general', shopItem: { category: 'Balls' } }] };
  const sp = splitOf({ what: 'round', direction: 'in', amountCents: 12360, platformFeeCents: 300, bookingId: 'b', saleId: null }, bk, undefined);
  ok('a round splits by its booking: tee, cart, F&B and shop with their tax', sp.teeCents === 8000 && sp.cartCents === 2000 && sp.fnbCents === 1030 && sp.shopCents === 1030, sp);
  const part = splitOf({ what: 'round', direction: 'in', amountCents: 5000, platformFeeCents: 0, bookingId: 'b', saleId: null }, bk, undefined);
  ok('a part payment splits in proportion and adds up exactly', Object.values(part).reduce((x, y) => x + (y ?? 0), 0) === 5000, part);
  const sl = splitOf({ what: 'shop', direction: 'in', amountCents: 3240, platformFeeCents: 0, bookingId: null, saleId: 's' }, undefined, { taxCents: 240, lines: [
    { unitPriceCents: 1000, quantity: 1, returnedQty: 0, bookingId: null, shopItem: { category: 'Food', taxCategory: 'food' } },
    { unitPriceCents: 2000, quantity: 1, returnedQty: 0, bookingId: null, shopItem: { category: 'Balls', taxCategory: 'general' } }] });
  ok('a register sale splits by its lines, tax with them', sl.fnbCents === 1080 && sl.shopCents === 2160, sl);
  const reg = splitOf({ what: 'shop', direction: 'in', amountCents: 5000, platformFeeCents: 0, bookingId: null, saleId: 's' }, undefined, { taxCents: 0, lines: [{ unitPriceCents: 5000, quantity: 1, returnedQty: 0, bookingId: 'b', shopItem: null }] });
  ok('a round paid at the register is tee', reg.teeCents === 5000, reg);
  ok('late-cancel fee is tee; dues, events their own; money out splits nothing', splitOf({ what: 'late_fee', direction: 'in', amountCents: 1000, platformFeeCents: 0, bookingId: null, saleId: null }, undefined, undefined).teeCents === 1000
    && splitOf({ what: 'dues', direction: 'in', amountCents: 9000, platformFeeCents: 90, bookingId: null, saleId: null }, undefined, undefined).duesCents === 8910
    && splitOf({ what: 'event', direction: 'in', amountCents: 9000, platformFeeCents: 0, bookingId: null, saleId: null }, undefined, undefined).eventCents === 9000
    && Object.keys(splitOf({ what: 'round', direction: 'out', amountCents: 9000, platformFeeCents: 0, bookingId: null, saleId: null }, undefined, undefined)).length === 0);
  ok('splitBy hands the rounding remainder to the largest share', JSON.stringify(splitBy(100, { a: 1, b: 1, c: 1 })) === JSON.stringify({ a: 34, b: 33, c: 33 }));
}
function dowOf(d: string) { return new Date(d + 'T12:00:00Z').getUTCDay(); }

// ── Stripe difference, per payment ──
const day = '2026-11-04';
const s = (key: string, d: string, cents: number, kind: Side['kind'] = 'charge', paymentIntent: string | null = null): Side => ({ key, day: d, at: `${d}T15:00:00Z`, cents, kind, paymentIntent });
const ours = [s('pi_same', day, 5000), s('pi_amt', day, 4000), s('pi_ours_only', day, 3000), s('pi_late', day, 2000), s('re_ours', day, -1000, 'refund')];
const theirs = [s('pi_same', day, 5000), s('pi_amt', day, 3500), s('pi_late', '2026-11-05', 2000), s('re_ours', day, -1000, 'refund'),
  s('re_dash', day, -2500, 'refund', 'pi_old'), s('re_unknown', day, -700, 'refund', 'pi_never'), s('pi_theirs_only', day, 1200),
  s('pi_other_day_only', '2026-11-03', 999)];
const items = diffItems(day, ours, theirs, new Set(['pi_old']));
const kind = (k: string) => items.find(i => i.key === k)?.kind;
ok('a payment that matches is not listed', !kind('pi_same') && !kind('re_ours'));
ok('a different amount', kind('pi_amt') === 'amount_differs');
ok('ours only', kind('pi_ours_only') === 'not_in_stripe');
ok('across midnight reads as other day', kind('pi_late') === 'other_day');
ok('a Stripe refund on a payment we have: refunded in Stripe', kind('re_dash') === 'refund_in_stripe');
ok('a Stripe refund on a payment we never had: not here', kind('re_unknown') === 'not_here');
ok('a Stripe charge we never had: not here', kind('pi_theirs_only') === 'not_here');
ok('something only on another day is not this day’s', !kind('pi_other_day_only'));
ok('six lines, nothing else', items.length === 6, items.map(i => i.key));
const adjItems = diffItems(day, [], [s('txn_1', day, -700, 'adjustment')], new Set());
ok('a Stripe adjustment is its own kind', adjItems.length === 1 && adjItems[0].kind === 'stripe_adjustment');
const split = diffItems(day, [s('pi_x', day, 3000)], [s('pi_x', day, 1000), s('pi_x', day, 2000)], new Set());
ok('two Stripe movements on one payment add up before comparing', split.length === 0, split);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
