// GOAL-PACE (Cam 2026-11-12, "one pace rule everywhere"): the bar is progress, the colour is where the period ends
// at the current pace — reach goals (revenue, bookings) and caps (costs), one helper for admin and dashboard.
// Pure. Run: npx tsx scripts/goal-pace-test.ts
import { goalPace, projectAtEnd, elapsedShare, elapsedDays, EARLY_DAYS } from '../src/lib/goal-pace';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

// Day 12 of 30 → 40% of the month gone.
const share = elapsedShare(12, 30);
ok('elapsed share is elapsed days over the period, capped 0–1', share === 0.4 && elapsedShare(30, 30) === 1 && elapsedShare(40, 30) === 1 && elapsedShare(0, 30) === 0);
ok('pace projects progress to the period end', projectAtEnd(400, 0.4) === 1000);
ok('a rate is not projected', projectAtEnd(70, 0.4, true) === 70);
ok('a finished period is its value', projectAtEnd(900, 1) === 900);
ok('nothing elapsed: no projection', projectAtEnd(0, 0) === 0);

const reach = (p: number, t: number) => goalPace({ progress: p, target: t, share }).tone;
ok('reach: on pace to hit is green', reach(400, 1000) === 'ok' && reach(1140, 1600) === 'ok');
ok('reach: within 10% short is yellow', reach(370, 1000) === 'warn' && reach(360, 1000) === 'warn'); // projects 925, 900
ok('reach: more than 10% short is red', reach(359, 1000) === 'bad' && reach(2, 20) === 'bad');
ok('reach: already reached is green', reach(20, 20) === 'ok');
ok('reach: the rate rule', goalPace({ progress: 70, target: 75, share, rate: true }).tone === 'warn' && goalPace({ progress: 60, target: 75, share, rate: true }).tone === 'bad' && goalPace({ progress: 76, target: 75, share, rate: true }).tone === 'ok');

const cap = (p: number, t: number) => goalPace({ progress: p, target: t, share, kind: 'cap' }).tone;
// Cap bands (Cam via Build 2026-11-12, CLAUDE.md GOAL-PACE): ok ≤ 0.9 × target · warn ≤ target · bad > target.
ok('cap: on pace to land 10% or more under is green', cap(360, 1000) === 'ok' && cap(300, 1000) === 'ok'); // 900, 750
ok('cap: on pace for the last 10% is yellow — landing exactly at the limit too', cap(361, 1000) === 'warn' && cap(400, 1000) === 'warn'); // 902.5, 1000
ok('cap: on pace to go over is red', cap(401, 1000) === 'bad'); // 1002.5
ok('cap: already over the budget is red', goalPace({ progress: 1001, target: 1000, share: 0.9, kind: 'cap' }).tone === 'bad');
ok('no target: nothing to judge (green)', goalPace({ progress: 5, target: 0, share }).tone === 'ok');
ok('the projection comes back with the tone', goalPace({ progress: 400, target: 1000, share }).projected === 1000);

// Final review 2026-11-12: shares are rounded floats, so an exact pace must still land inside its band.
const at = (p: number, t: number, d: number, D: number, kind: 'reach' | 'cap' = 'reach') => goalPace({ progress: p, target: t, share: elapsedShare(d, D), kind }).tone;
ok('exactly on pace is green whatever the day (23 of 30 on day 23; 9 of 28 on day 9; 18 of 31 on day 18)', at(23, 30, 23, 30) === 'ok' && at(9, 28, 9, 28) === 'ok' && at(18, 28, 18, 28) === 'ok' && at(9, 31, 9, 31) === 'ok' && at(18, 31, 18, 31) === 'ok');
ok('exactly 10% short is yellow (81 of 280 on day 9 of 28)', at(81, 280, 9, 28) === 'warn');
ok('…one under that is red', at(80, 280, 9, 28) === 'bad');
ok('cap exactly at 90% is green (2601 of 4930 on day 17 of 29)', at(2601, 4930, 17, 29, 'cap') === 'ok');
ok('…one over that is yellow', at(2602, 4930, 17, 29, 'cap') === 'warn');
ok('cap exactly at the limit is yellow (2890 of 4930 on day 17 of 29)', at(2890, 4930, 17, 29, 'cap') === 'warn');
ok('…one over that is red', at(2891, 4930, 17, 29, 'cap') === 'bad');
ok('a sweep: every exact pace in 28–31-day months is green', (() => { for (const D of [28, 29, 30, 31]) for (let d = 1; d <= D; d++) for (let perDay = 1; perDay <= 200; perDay++) { if (at(perDay * d, perDay * D, d, D) !== 'ok') return false; } return true; })());

// Today counts by the hour (the course clock): an on-pace course is green through the day, not red every morning.
ok('elapsed days count today by the hour', elapsedDays(12, '12:00') === 11.5 && elapsedDays(1, '00:00') === 0 && elapsedDays(30, '24:00') === 30);
const onPaceAt = (day: number, clock: string) => goalPace({ progress: 100 * elapsedDays(day, clock), target: 3000, share: elapsedShare(elapsedDays(day, clock), 30) }).tone;
ok('a course exactly on pace is green morning, noon and night', ['08:00', '12:00', '20:00'].every(c => [1, 2, 15, 30].every(d => onPaceAt(d, c) === 'ok')));

// Cam 2026-11-12 (b): no verdict for the first 3 days — neutral grey — then the pace rule.
const early = (p: number, t: number, days: number, kind: 'reach' | 'cap' = 'reach') => goalPace({ progress: p, target: t, share: elapsedShare(days, 30), kind, daysElapsed: days }).tone;
ok('the first 3 days are early (grey), even with nothing yet', EARLY_DAYS === 3 && early(0, 3000, 0.3) === 'early' && early(0, 3000, 2.99) === 'early' && early(10, 3000, 1.5) === 'early');
ok('after 3 full days (from day 4) the pace rule applies', early(0, 3000, 3) === 'bad' && early(300, 3000, 3) === 'ok');
ok('early: a reach goal already met is green; a budget already over is red', early(3000, 3000, 1) === 'ok' && early(1200, 1000, 1, 'cap') === 'bad' && early(100, 1000, 1, 'cap') === 'early');
ok('early: a budget whose KNOWN month total is already over is red (Cam 2026-11-14)', goalPace({ progress: 1000, scheduled: 50_000, target: 10_000, share: 0.05, kind: 'cap', daysElapsed: 1.5 }).tone === 'bad'
  && goalPace({ progress: 0, scheduled: 9_000, fixed: 2_000, target: 10_000, share: 0.05, kind: 'cap', daysElapsed: 1.5 }).tone === 'bad');
ok('early: a known total at or under the budget stays grey; an extrapolated one never turns red early', goalPace({ progress: 1000, scheduled: 10_000, target: 10_000, share: 0.05, kind: 'cap', daysElapsed: 1.5 }).tone === 'early'
  && goalPace({ progress: 1000, target: 10_000, share: 0.05, kind: 'cap', daysElapsed: 1.5 }).tone === 'early');
ok('no daysElapsed given: no early rule (callers opt in)', goalPace({ progress: 0, target: 10, share: 0.01 }).tone === 'bad');
ok('Home passes the elapsed days and greys an early goal', (() => { const b = require('fs').readFileSync('src/components/dashboard/home/HomeBoard.tsx', 'utf8'); return b.includes("daysElapsed: goals.elapsed ?? dayOfMonth") && b.includes("early: 'bg-dot-neutral'"); })());

// Expenses (Cam via Build 2026-11-12): one-time costs ride along unprojected. A $1,500 bill three days
// into a 30-day month must not extrapolate to $15,000.
{
  const share = elapsedShare(3, 30);
  const oneOff = goalPace({ progress: 0, fixed: 150_000, target: 200_000, share, kind: 'cap', daysElapsed: 5 });
  ok('a one-time $1,500 projects to $1,500, not $15,000', oneOff.projected === 150_000 && oneOff.tone === 'ok', oneOff);
  const wrong = goalPace({ progress: 150_000, target: 200_000, share, kind: 'cap', daysElapsed: 5 });
  ok('(the same bill counted as running cost would project to $15,000 and go red)', Math.round(wrong.projected) === 1_500_000 && wrong.tone === 'bad', wrong);
  const mixed = goalPace({ progress: 10_000, fixed: 150_000, target: 200_000, share, kind: 'cap', daysElapsed: 5 });
  ok('running costs are projected, the one-off is added once: $100 ÷ 0.1 + $1,500 = $2,500 → over a $2,000 budget', Math.round(mixed.projected) === 250_000 && mixed.tone === 'bad', mixed);
  ok('a one-off already past the budget is red even early', goalPace({ progress: 0, fixed: 250_000, target: 200_000, share: elapsedShare(1, 30), kind: 'cap', daysElapsed: 1 }).tone === 'bad');
  ok('no fixed given: unchanged', goalPace({ progress: 100, target: 3000, share: 0.5 }).projected === 200);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
