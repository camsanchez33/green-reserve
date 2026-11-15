// Revenue page (Cam 2026-11-15): the pure parts of lib/revenue-extras — today against the
// 30-day average by time of day, Food & beverage, how it was paid, and the per-payment
// Stripe difference. Pure. Run: npx tsx scripts/revenue-extras-test.ts
import { lineOf, isFnb, fnbPart, howPaidOf, diffItems, type Side } from '../src/lib/revenue-extras';

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
const split = diffItems(day, [s('pi_x', day, 3000)], [s('pi_x', day, 1000), s('pi_x', day, 2000)], new Set());
ok('two Stripe movements on one payment add up before comparing', split.length === 0, split);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
