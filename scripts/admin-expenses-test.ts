// Admin Expenses (ADMIN-REDO, Cam approved 2026-11-12): the page's pure rules — counted from the Expense rows,
// never estimated. Run: npx tsx scripts/admin-expenses-test.ts
import { readFileSync } from 'fs';
import { goalPace } from '../src/lib/goal-pace';
import { monthCostPace, endedAtForLastDay } from '../src/lib/expenses';
import { isEnded, historyLine, cards, nextRenewal, monthEarlier, yearEarlier, pct, parseAmount, FILTERS, byCost, activeOn, type Exp } from '../src/app/admin/expenses/logic';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const NOW = new Date('2026-11-12T15:00:00Z');
let n = 0;
const ex = (o: Partial<Exp>): Exp => ({ id: String(++n), name: 'x', category: 'tools', amountCents: 2000, cadence: 'monthly', startedAt: '2026-03-01T12:00:00.000Z', endedAt: null, ...o });

// Calendar steps.
check('a month before Mar 31 is Feb 28', monthEarlier(new Date('2026-03-31T15:00:00Z')).toISOString().startsWith('2026-02-28'));
check('a month before Jan 15 is Dec 15', monthEarlier(new Date('2026-01-15T15:00:00Z')).toISOString().startsWith('2025-12-15'));
check('a year before Feb 29 2028 is Feb 28 2027', yearEarlier(new Date('2028-02-29T15:00:00Z')).toISOString().startsWith('2027-02-28'));

// Monthly costs: monthly + yearly/12, never one-time, only what runs today.
const list = [
  ex({ amountCents: 2000 }),
  ex({ amountCents: 12000, cadence: 'annual' }),
  ex({ amountCents: 150000, cadence: 'one-time', startedAt: '2026-08-10T12:00:00.000Z' }),
  ex({ amountCents: 1200, startedAt: '2026-01-01T12:00:00.000Z', endedAt: '2026-05-01T12:00:00.000Z' }),
  ex({ amountCents: 4500, startedAt: '2026-11-05T12:00:00.000Z' }),
];
const k = cards(list, NOW);
check('monthly costs = 20 + 120/12 + 45 (the ended and one-time costs left out)', k.monthly === 2000 + 1000 + 4500, String(k.monthly));
check('a month ago the Nov 5 cost had not started', k.monthlyPrior === 3000, String(k.monthlyPrior));
check('the month runs Nov 1 to Dec 1 on the platform clock', k.monthStart.toISOString() === '2026-11-01T04:00:00.000Z' && k.monthEnd.toISOString() === '2026-12-01T05:00:00.000Z');
check('elapsed share is between 0 and 1', k.elapsedShare > 0.3 && k.elapsedShare < 0.45, String(k.elapsedShare));
check('this month\'s one-time costs are split out (none in November here)', k.monthOneTime === 0 && cards([...list, ex({ amountCents: 9900, cadence: 'one-time', startedAt: '2026-11-03T12:00:00.000Z' })], NOW).monthOneTime === 9900);
check('this year counts the one-time cost', k.year > 150000);
check('last year by today had nothing (all started in 2026)', k.yearPrior === 0);
check('ended on May 1 → not running in November', !activeOn(list[3], NOW));

// The budget's pace (final review 2026-11-12): running costs are projected, one-time costs are added as they are.
// $200 a month running, a $150 one-off on Nov 10, a $400 budget, Nov 12 10:00 ET → the month ends at $350, green.
// #389 (full calendar months count exactly): the running $200 is exactly $200 for November, so the true end is
// $200 + $150 = $350.00 (it was $347.40 under the old mean-year proration). This page path still divides a
// day-counted figure by a clock-time share that includes November's 25-hour day, so it lands within a dollar
// ($349.55); monthCostPace, which the page moves to next, gives exactly $350. The one-off is never projected either way.
{
  const at = new Date('2026-11-12T15:00:00Z');
  const run = ex({ amountCents: 20000, startedAt: '2026-01-01T12:00:00.000Z' });
  const once = ex({ amountCents: 15000, cadence: 'one-time', startedAt: '2026-11-10T12:00:00.000Z' });
  const mp = monthCostPace([run, once], at);
  const p = goalPace({ progress: mp.progress, fixed: mp.fixed, scheduled: mp.scheduled, target: 40000, share: mp.share, kind: 'cap', daysElapsed: mp.share * 30 });
  check('a one-off is never projected: the month ends at $350, on pace to stay under', Math.abs(p.projected - 35000) < 100 && p.tone === 'ok', JSON.stringify(p));
  // A cost ending Nov 20 (inclusive) is counted only to its end, never as if it ran all month.
  const ending = ex({ amountCents: 30000, startedAt: '2026-01-01T12:00:00.000Z', endedAt: endedAtForLastDay('2026-11-20')!.toISOString() });
  const mp2 = monthCostPace([ending], at);
  const p2 = goalPace({ progress: mp2.progress, fixed: mp2.fixed, scheduled: mp2.scheduled, target: 30000, share: mp2.share, kind: 'cap', daysElapsed: mp2.share * 30 });
  check('a cost ending mid-month projects only to its end ($200 of a $300 month)', Math.abs(p2.projected - 20000) < 100, JSON.stringify(p2));
}
check('the page passes Build\'s month helper to the shared pace rule (progress, fixed, scheduled)', /monthCostPace\(list, now\)/.test(readFileSync('src/app/admin/expenses/page.tsx', 'utf8')) && /scheduled: mp\.scheduled/.test(readFileSync('src/app/admin/expenses/page.tsx', 'utf8')));
check('ends read inclusively (lastDayOf), never the next day', /lastDayOf\(iso\)/.test(readFileSync('src/app/admin/expenses/page.tsx', 'utf8')));

// Percentages.
check('up 50%', pct(150, 100) === 50);
check('nothing before → no percentage', pct(10, 0) === null);

// Renewals.
const r1 = nextRenewal(ex({ startedAt: '2026-03-30T12:00:00.000Z' }), NOW);
check('monthly on the 30th renews Nov 30, in 18 days', r1?.day === '2026-11-30' && r1.inDays === 18, JSON.stringify(r1));
const r2 = nextRenewal(ex({ startedAt: '2026-01-31T12:00:00.000Z' }), new Date('2027-02-10T15:00:00Z'));
check('started the 31st → renews Feb 28 in a short month', r2?.day === '2027-02-28', JSON.stringify(r2));
const r3 = nextRenewal(ex({ cadence: 'annual', startedAt: '2026-07-06T12:00:00.000Z' }), NOW);
check('annual renews on its date next year', r3?.day === '2027-07-06');
check('renews today when today is the day', nextRenewal(ex({ startedAt: '2026-10-12T12:00:00.000Z' }), NOW)?.inDays === 0);
check('one-time never renews', nextRenewal(ex({ cadence: 'one-time' }), NOW) === null);
const future = ex({ startedAt: '2026-03-30T12:00:00.000Z', endedAt: '2026-12-15T17:00:00.000Z' });
check('a future end is still running: not ended, still active, still counts', !isEnded(future, NOW) && activeOn(future, NOW) && FILTERS.find(f => f.key === 'active')!.test(future, NOW));
check('…and renews before its end, but never after its last day', nextRenewal(future, NOW)?.day === '2026-11-30' && nextRenewal(future, new Date('2026-12-02T15:00:00Z')) === null);
const endsNov30 = ex({ startedAt: '2026-03-30T12:00:00.000Z', endedAt: endedAtForLastDay('2026-11-30')!.toISOString() });
check('a cost whose last day is Nov 30 still renews on Nov 30', nextRenewal(endsNov30, NOW)?.day === '2026-11-30');
check('an ended cost never renews', nextRenewal(ex({ endedAt: '2026-10-01T12:00:00.000Z' }), NOW) === null);

// Amounts typed in the form.
check('"$1,200.50" → 120050', parseAmount('$1,200.50') === 120050);
check('"20" → 2000', parseAmount('20') === 2000);
check('0, negatives, letters and three decimals are refused', [ '0', '-5', 'abc', '1.005', '' ].every(s => parseAmount(s) === null));
check('commas only as thousands groups ("12,50" and "1,2,3" refused)', parseAmount('12,50') === null && parseAmount('1,2,3') === null && parseAmount('12,000') === 1200000);
check('over $20M is refused', parseAmount('20000001') === null && parseAmount('20000000') === 2000000000);
check('a cost dated today counts today, even before noon UTC', activeOn(ex({ startedAt: '2026-11-12T12:00:00.000Z' }), new Date('2026-11-12T11:00:00Z')));

// Filters and order.
const counts = Object.fromEntries(FILTERS.map(f => [f.key, list.filter(e => f.test(e, NOW)).length]));
check('filter counts', counts.active === 4 && counts.ended === 1 && counts.monthly === 2 && counts.annual === 1 && counts.once === 1 && counts.all === 5, JSON.stringify(counts));
check('biggest monthly cost first', [...list].sort(byCost)[0].amountCents === 4500);

// History lines (Build's /api/admin/expenses/[id]/history: raw values, cents as numbers, dates as ISO).
const fmt = (c: number) => '$' + (c / 100).toFixed(2);
const line = (h: Parameters<typeof historyLine>[0]) => historyLine(h, k2 => ({ tools: 'Tools & services' } as Record<string, string>)[k2] ?? k2, { monthly: 'Every month', annual: 'Every year' }, fmt, d => d);
check('added', line({ at: '2026-06-16T00:00:00Z', by: 'Cam', kind: 'added' }) === 'Added · Cam');
check('an amount change reads in dollars', line({ at: 'x', by: 'Cam', kind: 'changed', changes: [{ field: 'amountCents', from: 3000, to: 4500 }] }) === 'Amount changed $30.00 → $45.00 · Cam');
check('a cadence change reads in words', line({ at: 'x', by: '', kind: 'changed', changes: [{ field: 'cadence', from: 'monthly', to: 'annual' }] }) === 'How often changed Every month → Every year');
check('a date change reads as the day', line({ at: 'x', by: '', kind: 'changed', changes: [{ field: 'startedAt', from: '2026-03-01T12:00:00.000Z', to: '2026-03-05T12:00:00.000Z' }] }) === 'Started changed 2026-03-01 → 2026-03-05');
check('ended', line({ at: 'x', by: 'Cam', kind: 'ended' }) === 'Finished · Cam');

// The page: owner data only from the owner-only route, costs going up read red, no estimate.
const page = readFileSync('src/app/admin/expenses/page.tsx', 'utf8');
check('reads /api/admin/expenses', page.includes("'/api/admin/expenses'"));
check('a rise in costs is the bad colour', /n > 0 \? g\.down : g\.up/.test(page));
check('Delete goes through step-up', /stepUpFetch/.test(page) && /'DELETE'/.test(page));
check('the budget reads "Not set" until it is set', page.includes('Not set'));
check('the budget bar is coloured by the ONE shared pace rule, as a cap', /goalPace\(\{[^}]*kind: 'cap'/.test(page) && !/0\.9\s*\*|1\.1\s*\*/.test(page));
check('setting the budget goes through step-up', /stepUpFetch\('\/api\/admin\/expenses\/budget'/.test(page));
check('an ended one-time cost has no Restart (it would book it twice)', /ended \? e\.cadence !== 'one-time' &&/.test(page));
check('restart never wipes the stopped months (it adds the cost again from today)', /async function restart[\s\S]{0,300}'POST'/.test(page));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
