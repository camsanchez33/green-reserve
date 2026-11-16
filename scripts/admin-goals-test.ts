// Settings → Goals (Cam approved the mockup 2026-11-16, lanes/admin.md "Approved, to build: Settings → Goals").
// Pins the pace the page works out from what /api/admin/goals returns, and the behaviour the re-skin must keep.
// Run: npx tsx scripts/admin-goals-test.ts
import { readFileSync } from 'fs';
import { goalView, fmt, dueDay, type Goal } from '../src/app/admin/goals/logic';

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const DAY = 86_400_000;
const start = Date.UTC(2026, 9, 1, 4);              // Oct 1, 2026, platform midnight (EDT)
const due = start + 92 * DAY;                        // end of Dec 31 (EST): dueAt is the next midnight
const now = start + 46 * DAY;                        // half way
const G = (over: Partial<Goal>): Goal => ({
  id: 'g', metric: 'courses_live', label: 'Live courses', unit: 'count', target: 10, current: 4,
  startsAt: new Date(start).toISOString(), dueAt: new Date(due + 3_600_000).toISOString(), createdBy: 'Cam',
  status: 'behind', daysLeft: 46, ...over,
});

const a = goalView(G({}), now);
check('half way, 4 of 10: should be at 5, 1 behind', a.shouldBe === 'Should be at 5 by today (1 behind)', a.shouldBe);
check('4 is under 4.5 (10% under 5): red, "Behind pace"', a.tone === 'bad' && a.word === 'Behind pace', a);
check('percent, progress, mark at half', a.pct === 40 && a.progress === '4 of 10' && a.markPct === 50, a);
check('days left from the API', a.daysLeft === '46 days left');
check('still to go and needed each week (one decimal for courses)', a.toGo === '6' && a.perWeek === '1 course', a.perWeek);
check('ends at, at today’s rate', a.endsAt === '8', a.endsAt);
check('started date', a.started === 'Oct 1', a.started);

check('within 10% under: amber, "Close to pace"', goalView(G({ current: 4.6 as number }), now).tone === 'warn');
const b = goalView(G({ current: 6 }), now);
check('ahead: green, "Ahead of pace", "(1 ahead)"', b.tone === 'ok' && b.word === 'Ahead of pace' && b.shouldBe === 'Should be at 5 by today (1 ahead)', b);
check('exactly on it: no "(0 behind)"', goalView(G({ current: 5 }), now).shouldBe === 'Should be at 5 by today');

const early = goalView(G({ current: 0 }), start + 3_600_000);
check('an hour old: "Too early to tell", not red; no projection', early.tone === 'early' && early.word === 'Too early to tell' && early.endsAt === 'Too early to tell', early);

const fees = goalView(G({ metric: 'fees', label: 'GreenReserve fees', unit: 'cents', target: 500_000, current: 318_000 }), now);
check('fees in whole dollars', fees.progress === '$3,180 of $5,000' && fees.toGo === '$1,820', fees);
check('fees: needed each week in dollars, rounded up', /^\$\d/.test(fees.perWeek ?? ''), fees.perWeek);

const bk = goalView(G({ metric: 'online_rounds', label: 'Online bookings', target: 2000, current: 960 }), due - 2 * DAY);
check('two days left: needed this week is never more than what’s left', bk.perWeek === '1,040 bookings', bk.perWeek);

const met = goalView(G({ status: 'met', current: 3, target: 3 }), now);
check('reached: finished, green, "Reached", no boxes', met.finished && met.tone === 'ok' && met.word === 'Reached' && met.pct === 100 && met.perWeek === undefined, met);
const missed = goalView(G({ status: 'missed', current: 2, target: 3 }), due + DAY);
check('missed: finished, red, "Missed"', missed.finished && missed.tone === 'bad' && missed.word === 'Missed' && missed.pct === 66, missed);
check('99.6% that isn’t met never shows 100%', goalView(G({ current: 996, target: 1000 }), now).pct === 99);

check('due day steps back from the next midnight', dueDay(new Date(due).toISOString()) === 'Dec 31, 2026', dueDay(new Date(due).toISOString()));
check('fmt counts', fmt('count', 2000) === '2,000');

const page = readFileSync('src/app/admin/goals/page.tsx', 'utf8');
check('same GET', /adminFetch<[^>]+>\('\/api\/admin\/goals'/.test(page));
check('same POST and body', /fetch\('\/api\/admin\/goals', \{ method: 'POST'/.test(page) && /JSON\.stringify\(\{ metric, target, dueDate \}\)/.test(page));
check('remove: confirm first, then the step-up DELETE', /await ask\(REMOVE_TITLE/.test(page) && /stepUpFetch\(`\/api\/admin\/goals\?id=\$\{encodeURIComponent\(goal\.id\)\}`, \{ method: 'DELETE' \}\)/.test(page));
check('add and remove only when the API says canEdit', /top=\{canEdit \?/.test(page) && /\{canEdit && <button[^\n]*remove\(goal\)/.test(page));
check('reached / missed go to Finished', /title="Finished"/.test(page) && /x\.status === 'met' \|\| x\.status === 'missed'/.test(page));
check('My profile’s card build', /<ProfileCard title="Goals"/.test(page));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
