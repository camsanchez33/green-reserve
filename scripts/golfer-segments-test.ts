// SEG-1 (Cam 2026-11-05, golfer segments): every golfer in one group as of a day.
//  New (first round in 30 days) > Inactive (180+ days, nothing booked ahead) > At risk (the gone-quiet rule, nothing booked ahead) > Regular (3+ days in 90) > Occasional. Analytics shows them on
//  the Golfers tab, each golfer linked to their record, the list downloadable.
// Run: npx tsx scripts/golfer-segments-test.ts
import { readFileSync } from 'fs';
import { segmentOf, golferSegments } from '../src/lib/golfer-segments';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const asOf = '2026-11-05';
const ago = (n: number) => new Date(Date.parse(`${asOf}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const seg = (dates: string[], ahead = false) => segmentOf(dates, asOf, ahead)?.segment;

ok('a first round 10 days ago is new — even with three rounds since', seg([ago(10), ago(5), ago(2)]) === 'new');
ok('three days in the last 90 is a regular', seg([ago(200), ago(80), ago(40), ago(5)]) === 'regular');
ok('…the same day twice counts once', seg([ago(200), ago(40), ago(40), ago(5)]) !== 'regular');
ok('every week for months, then 30 days quiet: at risk', seg([ago(100), ago(93), ago(86), ago(79), ago(72), ago(65), ago(58), ago(51), ago(44), ago(37), ago(30)]) === 'at_risk');
ok('…booked ahead: still a regular, not at risk', seg([ago(100), ago(93), ago(86), ago(79), ago(72), ago(65), ago(58), ago(51), ago(44), ago(37), ago(30)], true) === 'regular');
ok('last round 200 days ago: inactive', seg([ago(400), ago(200)]) === 'inactive');
ok('…even a weekly golfer gone a year is inactive, not at risk', seg([ago(400), ago(393), ago(386), ago(379), ago(372)]) === 'inactive');
ok('…booked ahead: not inactive', seg([ago(400), ago(200)], true) === 'occasional');
ok('a round now and then: occasional', seg([ago(300), ago(120)]) === 'occasional');
ok('rounds after the as-of day are not counted', segmentOf([ago(-5)], asOf, false) === null && seg([ago(400), ago(-3)]) === 'inactive');

const visits = new Map([
  ['e:a@x.co', { name: 'Ann', dates: [ago(60), ago(30), ago(3)] }],
  ['e:b@x.co', { name: 'Bob', dates: [ago(5)] }],
  ['p:5551234567', { name: 'Cy', dates: [ago(500), ago(300)] }],
]);
const g = golferSegments(visits, asOf, new Set());
ok('each golfer in exactly one group, counted', g.counts.regular === 1 && g.counts.new === 1 && g.counts.inactive === 1 && g.rows.length === 3 && Object.values(g.counts).reduce((a, b) => a + b, 0) === 3, g.counts);
ok('rows keep the golfer key for the record link', g.rows.some(r => r.key === 'p:5551234567' && r.name === 'Cy'));

const an = readFileSync('src/lib/analytics.ts', 'utf8');
ok('Analytics groups every golfer it knows as of the same day as gone-quiet, with the same booked-ahead set', an.includes('const seg = golferSegments(visits, asOf, bookedAhead);') && an.includes('segments,'));
const page = readFileSync('src/app/dashboard/analytics/page.tsx', 'utf8');
ok('the Golfers tab shows the groups, links each golfer to their record, and downloads a group', page.includes('<SegmentsSection d={d} />') && page.includes('href={`/dashboard/golfers/${encodeURIComponent(r.key)}`}') && page.includes('[...SEG_UI.csv]'));
const birdie = readFileSync('src/lib/birdie/tools.ts', 'utf8'); const review = readFileSync('src/lib/monthly-review.ts', 'utf8');
ok('the golfer list never reaches the assistant or the monthly AI review', !birdie.includes('segments') && !review.includes('segments'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
