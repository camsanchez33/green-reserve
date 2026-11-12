// #385 review (Cam via Build 2026-11-12): a monthly cost is exactly its amount in every full
// calendar month, and a cost with an end date later this month is projected only to that end.
// Pure: run with `npx tsx scripts/expense-months-test.ts`.
import { prorateExpenseCents, sumExpensesForPeriodCents, monthCostPace, monthlyEquivalentCents, endedAtForLastDay, lastDayOf } from '../src/lib/expenses';
import { startOfPlatformDay } from '../src/lib/admin-day';
import { goalPace } from '../src/lib/goal-pace';

let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!cond) failed++;
};
/** Midnight Eastern on y-m-d. */
const et = (y: number, m: number, d: number) => startOfPlatformDay(new Date(Date.UTC(y, m - 1, d, 12)));
const at = (y: number, m: number, d: number, h: number) => new Date(et(y, m, d).getTime() + h * 3600_000);
const monthly = (cents: number, startedAt: Date, endedAt: Date | null = null) => ({ amountCents: cents, cadence: 'monthly', startedAt, endedAt });
const longAgo = et(2025, 1, 1);

// (1) Full calendar months count exactly the amount.
for (const [y, m, label] of [[2026, 10, '31-day October'], [2026, 9, '30-day September'], [2026, 2, '28-day February'], [2028, 2, '29-day February'], [2026, 11, 'November (the 25-hour DST day)'], [2026, 3, 'March (the 23-hour DST day)']] as [number, number, string][]) {
  const got = prorateExpenseCents(monthly(10000, longAgo), et(y, m, 1), et(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1));
  ok(`$100/mo in a full ${label} is exactly $100`, got === 10000, got);
}
ok('$100/mo over a whole calendar year is exactly $1,200', prorateExpenseCents(monthly(10000, longAgo), et(2026, 1, 1), et(2027, 1, 1)) === 120000);
ok('an annual $1,200 cost is exactly $100 in a full 31-day month (a twelfth, as monthlyEquivalentCents shows)',
  prorateExpenseCents({ amountCents: 120000, cadence: 'annual', startedAt: longAgo, endedAt: null }, et(2026, 10, 1), et(2026, 11, 1)) === monthlyEquivalentCents({ amountCents: 120000, cadence: 'annual' }));

// Part-months prorate by that month's own days.
ok('a cost starting Oct 16 counts 16 of October\'s 31 days', prorateExpenseCents(monthly(31000, et(2026, 10, 16)), et(2026, 10, 1), et(2026, 11, 1)) === 16000);
ok('a cost ending Sep 11 counts 10 of September\'s 30 days', prorateExpenseCents(monthly(30000, longAgo, et(2026, 9, 11)), et(2026, 9, 1), et(2026, 10, 1)) === 10000);
ok('a window spanning two part-months adds each month\'s share (Oct 17–Nov 16: 15/31 + 15/30)',
  prorateExpenseCents(monthly(31000 * 30, longAgo), et(2026, 10, 17), et(2026, 11, 16)) === Math.round(31000 * 30 * (15 / 31 + 15 / 30)));
ok('a one-time cost still lands whole on its day', sumExpensesForPeriodCents([{ amountCents: 5000, cadence: 'one-time', startedAt: et(2026, 10, 5), endedAt: null }], et(2026, 10, 1), et(2026, 11, 1)) === 5000);
ok('an ended cost adds nothing after its end', prorateExpenseCents(monthly(10000, longAgo, et(2026, 9, 1)), et(2026, 10, 1), et(2026, 11, 1)) === 0);

// The shape the Expenses form actually saves: the picked date at noon UTC (final review).
const stored = (day: string) => `${day}T12:00:00.000Z`;
const asSaved = (cents: number, day: string) => ({ amountCents: cents, cadence: 'monthly', startedAt: stored(day), endedAt: null });
ok('a cost dated Oct 1 (as saved) is exactly $100 for October', prorateExpenseCents(asSaved(10000, '2026-10-01'), et(2026, 10, 1), et(2026, 11, 1)) === 10000);
ok('…dated Nov 1 (the DST month) is exactly $100 for November', prorateExpenseCents(asSaved(10000, '2026-11-01'), et(2026, 11, 1), et(2026, 12, 1)) === 10000);
ok('…dated Jan 1 is exactly $1,200 over 2026', prorateExpenseCents(asSaved(10000, '2026-01-01'), et(2026, 1, 1), et(2027, 1, 1)) === 120000);
ok('…dated Oct 16 counts 16 of October\'s 31 days', prorateExpenseCents(asSaved(31000, '2026-10-16'), et(2026, 10, 1), et(2026, 11, 1)) === 16000);
ok('an unreadable start date counts from the window\'s start (and doesn\'t throw)', prorateExpenseCents({ amountCents: 10000, cadence: 'monthly', startedAt: 'not a date', endedAt: null }, et(2026, 10, 1), et(2026, 11, 1)) === 10000);
{
  const p = monthCostPace([asSaved(10000, '2026-11-01')], at(2026, 11, 12, 15));
  ok('the budget card schedules a cost dated Nov 1 at exactly its $100', p.scheduled === 10000, p);
}
{
  const p = monthCostPace([{ amountCents: 7000, cadence: 'one-time', startedAt: stored('2026-11-25'), endedAt: null }], at(2026, 11, 12, 15));
  ok('a one-time cost dated later this month is in the projection, not in what\'s spent', p.soFar === 0 && p.fixed === 0 && p.projected === 7000, p);
}

// The bug as reported: a budget equal to the monthly costs isn't red.
{
  const now = at(2026, 10, 20, 15);
  const p = monthCostPace([monthly(10000, longAgo)], now);
  const { tone, projected } = goalPace({ progress: p.progress, fixed: p.fixed, scheduled: p.scheduled, share: p.share, target: 10000, kind: 'cap', daysElapsed: 19.6 });
  ok('$100/mo against a $100 budget in October projects exactly $100 and is not red', projected === 10000 && tone !== 'bad', { projected, tone });
}

// (2) A future end date this month projects only to that end.
{
  const now = at(2026, 11, 10, 12); // Nov 10, noon Eastern
  const ending = monthly(30000, longAgo, et(2026, 11, 21)); // ends after Nov 20: 20 of November's 30 days
  const p = monthCostPace([ending], now);
  ok('a cost that stops at the start of Nov 21 is scheduled for 20 of November\'s 30 days, not the whole month', p.scheduled === 20000 && p.projected === 20000, p);
  const pace = goalPace({ progress: p.progress, fixed: p.fixed, scheduled: p.scheduled, share: p.share, target: 25000, kind: 'cap', daysElapsed: 9.5 });
  ok('…so a $250 budget is green (20,000 ≤ 90% of 25,000), where projecting the pace said $300 and red', pace.tone === 'ok' && pace.projected === 20000, pace);
  ok('…while the old way (progress ÷ share) would have projected the whole $300',
    Math.round(goalPace({ progress: p.progress, share: p.share, target: 25000, kind: 'cap' }).projected) === 30000);
}
{
  const now = at(2026, 11, 10, 12);
  const later = monthly(30000, et(2026, 11, 16)); // starts Nov 16: 15 of 30 days
  const p = monthCostPace([later, { amountCents: 7000, cadence: 'one-time', startedAt: et(2026, 11, 3), endedAt: null }], now);
  ok('a cost starting later this month projects from its start (nothing spent on it yet)', p.progress === 0 && p.scheduled === 15000, p);
  ok('…one-time costs ride along as spent, never projected', p.fixed === 7000 && p.soFar === 7000 && p.projected === 22000, p);
}

// Inclusive end dates (Cam via Build 2026-11-12): "ends Nov 21" runs through Nov 21.
{
  const end = endedAtForLastDay('2026-11-21');
  ok('"ends Nov 21" is saved as the start of Nov 22, Eastern', end?.getTime() === et(2026, 11, 22).getTime(), end);
  ok('…and shows as Nov 21 again', !!end && lastDayOf(end) === '2026-11-21');
  ok('…so a $300/mo cost counts 21 of November\'s 30 days', !!end && prorateExpenseCents({ amountCents: 30000, cadence: 'monthly', startedAt: '2026-01-01T12:00:00.000Z', endedAt: end }, et(2026, 11, 1), et(2026, 12, 1)) === 21000);
  ok('…ending on the DST day (Nov 1) counts just that day', endedAtForLastDay('2026-11-01')?.getTime() === et(2026, 11, 2).getTime());
  ok('…ending Dec 31 stops at the new year', endedAtForLastDay('2026-12-31')?.getTime() === et(2027, 1, 1).getTime());
  ok('a date that isn\'t one is refused (null)', endedAtForLastDay('2026-02-30') === null && endedAtForLastDay('nope') === null);
  ok('no end, or an unreadable one, shows nothing (no throw)', lastDayOf(null) === null && lastDayOf('garbage') === null);
  ok('End = now shows today as the last day paid', lastDayOf(at(2026, 11, 12, 15)) === '2026-11-12');
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
