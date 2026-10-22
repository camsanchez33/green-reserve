// AW-7: the admin course page — the four Setup checks, which tab has a
// problem, which tab it opens on, and players bucketed by week. Pure.
// Run: npx tsx scripts/admin-course-page-test.ts
import { setupChecks, tabProblems, openingTab, type SetupInput } from '../src/lib/admin-course-tabs';
import { bucketWeeks, weekStart } from '../src/lib/admin-course-tabs';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

const ready: SetupInput = {
  stripeAccountActive: true, agreements: { signed: 2, total: 2, missing: [] }, agreementAccepted: true,
  hasSchedule: true, owner: { emailVerified: true }, ownerLastLoginAt: null, staffCount: 1,
};
const done = (i: SetupInput) => Object.fromEntries(setupChecks(i).map(c => [c.key, c.done]));
check('a ready course: all four done', setupChecks(ready).every(c => c.done));
check('no Stripe → Stripe not done', done({ ...ready, stripeAccountActive: false }).stripe === false);
check('one of two agreements signed → not done', done({ ...ready, agreements: { signed: 1, total: 2, missing: ['x'] } }).agreement === false);
check('no documents on disk → the recorded acceptance decides', done({ ...ready, agreements: { signed: 0, total: 0, missing: [] }, agreementAccepted: false }).agreement === false);
check('no schedule → not done', done({ ...ready, hasSchedule: false }).schedule === false);
check('owner never verified or signed in → staff not done', done({ ...ready, owner: { emailVerified: false } }).staff === false);
check('…but a sign-in counts', done({ ...ready, owner: { emailVerified: false }, ownerLastLoginAt: '2030-01-01' }).staff === true);
check('no owner at all → not done', done({ ...ready, owner: null }).staff === false);

const base = { archived: false, failedCharges: 0, setup: setupChecks(ready), unreadMessages: 0, checkInOverdue: false };
check('nothing wrong → opens on the Timeline', openingTab(base) === 'timeline');
check('a failed charge → Money', openingTab({ ...base, failedCharges: 1, unreadMessages: 2 }) === 'money');
check('setup incomplete → Setup (before Contact)', openingTab({ ...base, setup: setupChecks({ ...ready, hasSchedule: false }), unreadMessages: 1 }) === 'setup');
check('unread message → Contact & notes', openingTab({ ...base, unreadMessages: 1 }) === 'contact');
check('check-in due → Contact & notes', openingTab({ ...base, checkInOverdue: true }) === 'contact');
check('?tab= wins', openingTab({ ...base, failedCharges: 3 }, 'bookings') === 'bookings');
check('an unknown ?tab= is ignored', openingTab(base, 'overview') === 'timeline');
check('archived → no tab has a problem', Object.values(tabProblems({ ...base, archived: true, failedCharges: 2 })).every(v => !v));

check('weeks start on Monday', weekStart('2030-06-12') === '2030-06-10' && weekStart('2030-06-10') === '2030-06-10' && weekStart('2030-06-16') === '2030-06-10');
const w = bucketWeeks([
  { date: '2030-06-12', source: 'online', players: 4 },
  { date: '2030-06-11', source: 'walk_in', players: 2 },
  { date: '2030-06-11', source: 'phone', players: 1 },
  { date: '2030-06-03', source: 'online', players: 3 },
  { date: '2030-06-13', source: 'online', players: 9 },  // after today — not played yet
  { date: '2030-01-01', source: 'online', players: 9 },  // before the window
], '2030-06-12', 8);
check('eight weeks, oldest first, ending this week', w.length === 8 && w[7].weekStart === '2030-06-10' && w[0].weekStart === '2030-04-22', JSON.stringify(w.map(x => x.weekStart)));
check('this week: online 4, counter 3 (walk-in + phone)', w[7].online === 4 && w[7].counter === 3, JSON.stringify(w[7]));
check('last week: online 3', w[6].online === 3 && w[6].counter === 0);
check('future and too-old rounds are left out', w.reduce((n, x) => n + x.online + x.counter, 0) === 10);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
