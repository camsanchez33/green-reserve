// GOAL-PACE (Cam 2026-11-12, "one pace rule everywhere"): the bar is progress, the colour is where the period ends
// at the current pace — reach goals (revenue, bookings) and caps (costs), one helper for admin and dashboard.
// Pure. Run: npx tsx scripts/goal-pace-test.ts
import { goalPace, projectAtEnd, elapsedShare } from '../src/lib/goal-pace';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

// Day 12 of 30 → 40% of the month gone.
const share = elapsedShare(12, 30);
ok('elapsed share counts today as gone', share === 0.4 && elapsedShare(30, 30) === 1 && elapsedShare(40, 30) === 1 && elapsedShare(0, 30) === 0);
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
ok('cap: on pace to stay under is green', cap(400, 1000) === 'ok' && cap(300, 1000) === 'ok');
ok('cap: within 10% over is yellow', cap(440, 1000) === 'warn'); // projects 1100
ok('cap: more than 10% over is red', cap(441, 1000) === 'bad');
ok('cap: already over the budget is red', goalPace({ progress: 1001, target: 1000, share: 0.9, kind: 'cap' }).tone === 'bad');
ok('no target: nothing to judge (green)', goalPace({ progress: 5, target: 0, share }).tone === 'ok');
ok('the projection comes back with the tone', goalPace({ progress: 400, target: 1000, share }).projected === 1000);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
