// REVENUE-1 (coordinator 2026-11-15, from the approved mockup): ONE total for the same dates everywhere on the Revenue
// page — the chart's headline, What was sold, How it was paid and the Ledger's Revenue. With Build's sales.all (one basis:
// the ledger by payment day, the course's part) the page must show grossCents in all four, and the Ledger's Revenue,
// Refunds and Net must agree with it. Pure; run: npx tsx scripts/revenue-page-test.ts
import { soldRows, soldTotal, paidRows, ledgerTotals } from '../src/components/dashboard/money/revenue/totals';
import type { Sales, RevenueLedgerDay } from '../src/components/dashboard/money/revenue/data';

let failed = 0;
const ok = (label: string, cond: boolean, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : ' — ' + detail}`); if (!cond) failed++; };
const sum = (xs: { cents: number }[]) => xs.reduce((n, x) => n + x.cents, 0);

// One seeded range: two days. Day 1: a $100 round by card (GreenReserve's $3 fee on top: 10,300 in, 300 fee) and $50 cash
// in the shop. Day 2: a $40 card F&B sale, a $20 refund on the round with its $1 fee given back (2,100 out).
const base = { range: { from: '2026-11-01', to: '2026-11-02' }, today: '2026-11-02', lastWeek: '2026-10-26', clock: '12:00', bucket: 'day' as const,
  series: [], byDow: [], byHour: [], collectedCents: 0, beforeCollectedCents: 0,
  summary: { greenCents: 0, cartCents: 0, rangeCents: 0, lateFeesKeptCents: 0, shopOnRoundsCents: 0, walkUpCents: 0, walkUpSales: 0, greenReserveFeesCents: 0 },
  paid: { cardCents: 0, counterCents: 0, outstandingCents: 0, outstandingGroups: 0 },
  todayByHour: [], lastWeekByHour: [], todayCollectedCents: 0, lastWeekCollectedCents: 0, drawer: null };
const gross = 10_000 + 5_000 + 4_000;
const sales: Sales = { ...base,
  all: { bucket: 'day', grossCents: gross, refundsCents: 2_000, netCents: gross - 2_000, beforeGrossCents: 15_000,
    segments: { teeCents: 10_000, cartCents: 0, shopCents: 5_000, fnbCents: 4_000, eventCents: 0, duesCents: 0, otherCents: 0 },
    paid: { onlineCents: 14_000, readerCents: 0, cashCents: 5_000, otherCents: 0 },
    series: [{ key: '2026-11-01', cents: 15_000 }, { key: '2026-11-02', cents: 4_000 }], byDow: [], byHour: [] } };
const day = (d: Partial<RevenueLedgerDay> & { day: string }): RevenueLedgerDay => ({ cardInCents: 0, cashInCents: 0, otherInCents: 0, outCents: 0, netCents: 0, platformCents: 0, courseCardNetCents: 0, stripeNetCents: null, stripeFeeCents: null, match: 'unknown', moves: 0, ...d });
const days = [
  day({ day: '2026-11-02', cardInCents: 4_000, outCents: 2_100, netCents: 1_900, platformCents: -100, feesInCents: 0, feesBackCents: 100 }),
  day({ day: '2026-11-01', cardInCents: 10_300, cashInCents: 5_000, netCents: 15_300, platformCents: 300, feesInCents: 300, feesBackCents: 0 }),
];

const sold = soldRows(sales), paid = paidRows(sales), L = ledgerTotals(days);
ok('What was sold rows add up to its total', sum(sold) === soldTotal(sales), `${sum(sold)} vs ${soldTotal(sales)}`);
ok('How it was paid rows add up to its total', sum(paid.rows) === paid.total, `${sum(paid.rows)} vs ${paid.total}`);
ok('the headline, What was sold and How it was paid are one number (grossCents)', soldTotal(sales) === gross && paid.total === gross);
ok('the Ledger\'s Revenue is the same number', L.revenue === gross, `${L.revenue} vs ${gross}`);
ok('the Ledger\'s Refunds match all.refundsCents (the fee given back is not a course refund)', L.refunds === sales.all!.refundsCents, `${L.refunds}`);
ok('the Ledger\'s Net revenue = Revenue − Refunds = all.netCents', L.net === L.revenue - L.refunds && L.net === sales.all!.netCents, `${L.net}`);
ok('the chart\'s series is the same money in', sum(sales.all!.series) === gross);
ok('season passes count in the total and show only when there are some', (() => { const s2 = { ...sales, all: { ...sales.all!, grossCents: gross + 700, segments: { ...sales.all!.segments, passesCents: 700 } } }; return soldRows(s2).some(r => r.key === 'passes' && r.label === 'Season passes') && soldRows(s2).reduce((n, r) => n + r.cents, 0) === soldTotal(s2) && !soldRows(sales).some(r => r.key === 'passes'); })());
ok('memberships show as a row only when there are some', !sold.some(r => r.key === 'dues') && soldRows({ ...sales, all: { ...sales.all!, segments: { ...sales.all!.segments, duesCents: 500 } } }).some(r => r.key === 'dues'));
// Before Build's fee split arrives, the Ledger falls back to platformCents (right whenever no fee was given back).
const old = ledgerTotals([day({ day: '2026-11-01', cardInCents: 10_300, cashInCents: 5_000, netCents: 15_300, platformCents: 300 })]);
ok('without the fee split, Revenue takes out platformCents', old.revenue === 15_000, `${old.revenue}`);

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
