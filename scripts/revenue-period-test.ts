// ADMIN-REDO Revenue: the four periods on the platform clock (Eastern), their prior
// windows, the edges (year and month starts, short months, Feb 29) and the DST days.
// Pure + source guards. Run: npx tsx scripts/revenue-period-test.ts
import { readFileSync } from 'fs';
import {
  resolveRevenuePeriod, parseRevenuePeriod, centsPerDay, platformMoveLabel, platformSigned,
  stripePaymentUrl, stripePayoutUrl, liveAt,
} from '../src/lib/revenue-period';
let failed = 0;
const check = (label: string, ok: boolean, info: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !info ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) failed++; };
const iso = (d: Date) => d.toISOString();

// Mid-November, 2:30pm EST (UTC−5) = 19:30Z.
const nov12 = new Date('2026-11-12T19:30:00Z');
{
  const p = resolveRevenuePeriod('month', nov12);
  check('month starts at midnight Eastern on the 1st (EDT then: 04:00Z)', iso(p.current.start) === '2026-11-01T04:00:00.000Z', iso(p.current.start));
  check('…ends now', p.current.end.getTime() === nov12.getTime());
  check('…12 of 30 days elapsed, from/to are platform days', p.elapsedDays === 12 && p.totalDays === 30 && p.from === '2026-11-01' && p.to === '2026-11-12', p);
  check('prior = October 1 to October 12 at the same time of day (EDT: 18:30Z)', iso(p.prior.start) === '2026-10-01T04:00:00.000Z' && iso(p.prior.end) === '2026-10-12T18:30:00.000Z', [iso(p.prior.start), iso(p.prior.end)]);
  check('…the whole prior month for the series: 31 days ending at Nov 1', p.priorDays === 31 && p.priorFrom === '2026-10-01' && p.priorWhole.end.getTime() === p.current.start.getTime());
  check('labels', p.label === 'November 2026' && p.priorLabel === 'Oct 1–12, 2026', [p.label, p.priorLabel]);
}
{
  // DST: Nov 1 2026 is the fall-back day. 11pm EST on Nov 1 is 04:00Z Nov 2.
  const p = resolveRevenuePeriod('month', new Date('2026-11-02T04:00:00Z'));
  check('11pm Eastern on the DST day is still day 1', p.to === '2026-11-01' && p.elapsedDays === 1, p.to);
  check('…prior ends at 11pm Oct 1 Eastern (EDT: 03:00Z Oct 2), not an hour off', iso(p.prior.end) === '2026-10-02T03:00:00.000Z', iso(p.prior.end));
}
{
  // Spring forward: Mar 8 2026. Noon EDT on Mar 10 = 16:00Z; prior Feb 10 noon EST = 17:00Z.
  const p = resolveRevenuePeriod('month', new Date('2026-03-10T16:00:00Z'));
  check('month across spring-forward: March starts at 05:00Z (EST)', iso(p.current.start) === '2026-03-01T05:00:00.000Z', iso(p.current.start));
  check('…prior ends at noon Feb 10 Eastern (17:00Z)', iso(p.prior.end) === '2026-02-10T17:00:00.000Z', iso(p.prior.end));
}
{
  // Mar 31: February has no 31st — the prior window is the whole of February.
  const p = resolveRevenuePeriod('month', new Date('2026-03-31T16:00:00Z'));
  check('Mar 31 compares with the whole of February', p.prior.end.getTime() === p.current.start.getTime() && p.priorLabel === 'Feb 1–28, 2026', [iso(p.prior.end), p.priorLabel]);
}
{
  // 1am Eastern on Jan 1 (06:00Z): month and year both start that midnight; last month is December of last year.
  const jan1 = new Date('2027-01-01T06:00:00Z');
  const m = resolveRevenuePeriod('month', jan1);
  check('Jan 1: month is January, prior is December of last year', m.from === '2027-01-01' && m.priorFrom === '2026-12-01' && m.elapsedDays === 1, m);
  const y = resolveRevenuePeriod('year', jan1);
  check('Jan 1: year has 1 day elapsed of 365, prior is 2026 to Jan 1 1am', y.elapsedDays === 1 && y.totalDays === 365 && iso(y.prior.end) === '2026-01-01T06:00:00.000Z' && y.priorDays === 365, [y.elapsedDays, iso(y.prior.end)]);
  const lm = resolveRevenuePeriod('last_month', jan1);
  check('Jan 1: last month is December 2026, vs November', lm.label === 'December 2026' && lm.priorLabel === 'November 2026' && lm.elapsedDays === 31 && lm.priorDays === 30, lm);
  check('…whole months, prior ends where current starts', iso(lm.current.start) === '2026-12-01T05:00:00.000Z' && iso(lm.current.end) === '2027-01-01T05:00:00.000Z' && lm.prior.end.getTime() === lm.current.start.getTime());
  // 11pm Eastern Dec 31 is already Jan 1 in UTC — still December on the platform clock.
  const dec31 = resolveRevenuePeriod('month', new Date('2027-01-01T04:00:00Z'));
  check('11pm Dec 31 Eastern (04:00Z Jan 1) is still December', dec31.from === '2026-12-01' && dec31.to === '2026-12-31', dec31);
}
{
  const y = resolveRevenuePeriod('year', nov12);
  check('year: Jan 1 to now, 316 days elapsed', y.from === '2026-01-01' && y.elapsedDays === 316 && y.label === '2026 so far', [y.elapsedDays, y.label]);
  check('…prior ends Nov 12 2025 at the same time (EST: 19:30Z)', iso(y.prior.end) === '2025-11-12T19:30:00.000Z' && y.priorLabel === '2025 to Nov 12', [iso(y.prior.end), y.priorLabel]);
  // Feb 29 2028: last year has no Feb 29 → prior ends at the end of Feb 28 2027.
  const leap = resolveRevenuePeriod('year', new Date('2028-02-29T17:00:00Z'));
  check('Feb 29: prior ends at the end of Feb 28 last year, 366-day year', iso(leap.prior.end) === '2027-03-01T05:00:00.000Z' && leap.totalDays === 366 && leap.priorDays === 365, [iso(leap.prior.end), leap.totalDays]);
}
{
  const d = resolveRevenuePeriod('30d', nov12);
  check('30d: Oct 14 to Nov 12, 30 days', d.from === '2026-10-14' && d.to === '2026-11-12' && d.elapsedDays === 30 && d.totalDays === 30, d);
  check('…starts at midnight Oct 14 Eastern (EDT 04:00Z)', iso(d.current.start) === '2026-10-14T04:00:00.000Z');
  check('…prior is Sep 14 to Oct 13 at the same time (EDT 18:30Z)', d.priorFrom === '2026-09-14' && iso(d.prior.start) === '2026-09-14T04:00:00.000Z' && iso(d.prior.end) === '2026-10-13T18:30:00.000Z', [iso(d.prior.start), iso(d.prior.end)]);
  check('…whole prior is 30 days ending where current starts', d.priorDays === 30 && d.priorWhole.end.getTime() === d.current.start.getTime());
}
check('unknown period falls back to month', parseRevenuePeriod('day') === 'month' && parseRevenuePeriod(null) === 'month' && parseRevenuePeriod('year') === 'year');

// Series: platform days, so 11pm Eastern lands on its own day, not the next.
{
  const s = centsPerDay([
    { at: new Date('2026-11-01T04:30:00Z'), cents: 150 },   // 12:30am Nov 1 EDT
    { at: new Date('2026-11-02T04:00:00Z'), cents: 300 },   // 11pm Nov 1 EST
    { at: new Date('2026-11-02T06:00:00Z'), cents: -150 },  // 1am Nov 2
    { at: new Date('2026-10-31T12:00:00Z'), cents: 999 },   // before the window
  ], '2026-11-01', 3);
  check('cents per platform day (refunds negative, outside ignored)', JSON.stringify(s) === '[450,-150,0]', s);
}

check('labels: a round fee collected', platformMoveLabel('round', 'in') === 'Service fee collected');
check('labels: a booking fee refunded', platformMoveLabel('booking_fee', 'out') === 'Booking fee refunded');
check('labels: no-show', platformMoveLabel('no_show_fee', 'in') === 'Service fee collected (no-show)');
check('signed: out is negative', platformSigned({ direction: 'out', platformFeeCents: 150 }) === -150 && platformSigned({ direction: 'in', platformFeeCents: 150 }) === 150);

check('Stripe: direct charge, live', stripePaymentUrl('pi_1', 'course', 'acct_9', false) === 'https://dashboard.stripe.com/acct_9/payments/pi_1');
check('Stripe: direct charge, test', stripePaymentUrl('pi_1', 'course', 'acct_9', true) === 'https://dashboard.stripe.com/acct_9/test/payments/pi_1');
check('Stripe: platform charge, test', stripePaymentUrl('pi_1', 'platform', 'acct_9', true) === 'https://dashboard.stripe.com/test/payments/pi_1');
check('Stripe: refunds, cash and a course with no account get no link', stripePaymentUrl('re_1', 'course', 'acct_9', false) === null && stripePaymentUrl(null, 'course', 'acct_9', false) === null && stripePaymentUrl('pi_1', 'course', null, false) === null);
check('Stripe: payout link', stripePayoutUrl('po_1', 'acct_9', true) === 'https://dashboard.stripe.com/acct_9/test/payouts/po_1');

{
  const t = new Date('2026-11-01T00:00:00Z');
  const base = { active: true, archivedAt: null, firstWentLiveAt: new Date('2026-10-01T00:00:00Z'), offlineAt: null, createdAt: new Date('2026-09-01T00:00:00Z') };
  check('live: on since October', liveAt(base, t));
  check('live: went live after t → not yet', !liveAt({ ...base, firstWentLiveAt: new Date('2026-11-05T00:00:00Z') }, t));
  check('live: archived before t → no', !liveAt({ ...base, archivedAt: new Date('2026-10-20T00:00:00Z') }, t));
  check('live: off now but went offline after t → was live', liveAt({ ...base, active: false, offlineAt: new Date('2026-11-03T00:00:00Z') }, t));
  check('live: off now, offline before t → no', !liveAt({ ...base, active: false, offlineAt: new Date('2026-10-03T00:00:00Z') }, t));
  check('live: never went live and off → no', !liveAt({ ...base, active: false, firstWentLiveAt: null }, t));
}

// Source guards: the route reads GreenReserve's money from the ledger, real courses only.
const route = readFileSync('src/app/api/admin/revenue/route.ts', 'utf8');
check('route: ledger rows are GreenReserve\'s part on real courses', /const OURS = \{ platformFeeCents: \{ gt: 0 \}, course: \{ isTest: false \} \}/.test(route));
check('route: payouts and payout problems only on the owner branch', route.indexOf('coursePayoutProblems') > route.indexOf('if (!isOwner) return NextResponse.json(base);'));
check('route: the problemsCount badge mode is retired', !route.includes('problemsCount'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
