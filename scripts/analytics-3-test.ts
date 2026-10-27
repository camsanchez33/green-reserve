// AN-3 (Cam 2026-10-19): Analytics reworked — the title, one date button with
// shortcuts defaulting to the past week, the golf-standard four numbers, no
// dollar total for empty spots, Ask Birdie, and the top bar keeps its colour
// between tabs. Pure + source guards. Run: npx tsx scripts/analytics-3-test.ts
import { readFileSync } from 'fs';
import { presets, rangeLabel } from '../src/components/dashboard/DateRangeButton';
let failed = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) failed++; };
const p = Object.fromEntries(presets('2026-10-19').map(x => [x.key, x.range])); // a Monday
check('last 7 days ends today', JSON.stringify(p['7d']) === '{"from":"2026-10-13","to":"2026-10-19"}', JSON.stringify(p['7d']));
check('this week starts Monday', p.week.from === '2026-10-19' && p.week.to === '2026-10-19', JSON.stringify(p.week));
check('last week is Mon–Sun', JSON.stringify(p.lastweek) === '{"from":"2026-10-12","to":"2026-10-18"}', JSON.stringify(p.lastweek));
check('last month is the whole of September', JSON.stringify(p.lastmonth) === '{"from":"2026-09-01","to":"2026-09-30"}', JSON.stringify(p.lastmonth));
check('this season starts Mar 1', p.season.from === '2026-03-01');
check('season before March is last year’s', presets('2027-02-10').find(x => x.key === 'season')!.range.from === '2026-03-01');
check('last month across a year end', JSON.stringify(presets('2027-01-05').find(x => x.key === 'lastmonth')!.range) === '{"from":"2026-12-01","to":"2026-12-31"}');
check('range label', rangeLabel({ from: '2026-10-12', to: '2026-10-18' }, '2026-10-19') === 'Oct 12 – Oct 18' && rangeLabel({ from: '2025-12-01', to: '2026-01-02' }, '2026-10-19').includes('2025'));

const page = readFileSync('src/app/dashboard/analytics/page.tsx', 'utf8');
check('the title is Analytics', page.includes('leading-none text-ink">Analytics</h1>') && !page.includes('How your course is doing'));
check('one date button, no preset strip', page.includes('<DateRangeButton') && !page.includes("'Pick dates'"));
check('opens on the last 7 days', page.includes("{ days: '7' }"));
// DENSE-1: the four now sit in METRICS (label: '…') and pick what the chart plots.
check('the golf-standard four', ["label: 'Revenue'", "label: 'Tee sheet filled'", "label: 'Rounds played'", "label: 'Average per round'"].every(s => page.includes(s)) && !page.includes('Money collected') && !page.includes("'Empty spots'"));
check('no dollar total for unsold spots on the page', !page.includes('d.unfilled.lostCents'));
check('Ask Birdie offered, only when Birdie is on', page.includes('useBirdieReady()') && page.includes('askBirdie(q)'));
check('five tabs', page.includes("['booking', 'How they book']") && page.includes("['revenue', 'Revenue']"));
check('golfers tab says where the data comes from', page.includes('From bookings at your course') && page.includes('href="/privacy"'));
const route = readFileSync('src/app/api/operator/analytics/route.ts', 'utf8');
check('the route takes days=N', route.includes("sp.get('days')"));
const bar = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');
check('the top bar remembers the course colour between tabs', bar.includes('cachedIdentity') && bar.includes('useLayoutEffect'));
check('…and forgets it on a course switch and sign-out', (bar.match(/saveIdentity\(null\)/g) || []).length >= 2);
const w = readFileSync('src/components/birdie/BirdieWidget.tsx', 'utf8');
check('Birdie fills the question but does not send it', /setInput\(q\.slice\(0, \d+\)\)/.test(w) && !/onAsk[\s\S]{0,400}ask\(q/.test(w));
check('no unsold-spot dollar figure reaches Birdie or the monthly review', !readFileSync('src/lib/monthly-review.ts', 'utf8').includes('unsoldTeeTimeLossDollars') && !readFileSync('src/lib/monthly-review.ts', 'utf8').includes('lostDollars: dollars(h.lostCents)') && !readFileSync('src/lib/birdie/tools.ts', 'utf8').includes('lostToEmptySpots'));
check('a new sign-in forgets the last course’s top bar', readFileSync('src/app/dashboard/login/page.tsx', 'utf8').includes("sessionStorage.removeItem('gr:op-identity')"));
// DENSE-1: definitions moved behind the labels, into lib/analytics-terms.ts.
const terms = readFileSync('src/lib/analytics-terms.ts', 'utf8');
check('tile wording matches the numbers', terms.includes('of bookings whose tee time has passed') && terms.includes('counting past visits'));
check('sign-in is a full page load, so no cached course survives', readFileSync('src/app/dashboard/login/page.tsx', 'utf8').includes("window.location.assign(data.redirect || '/dashboard')"));
check('“kept from before” says booked, not played', terms.includes('from the period before who booked with you again') && page.includes('term="keptFromBefore"'));
// DENSE-1 review: the dashed "period before" only in day mode (weekly buckets don't line up),
// and the no-show-fee action only for the owner (the cancellation policy is owner-only).
check('the period before is compared day by day only', page.includes("d.revenue.bucket === 'day' ? (d.compare?.series ?? []) : []"));
check('no-show fee action is the owner’s only', page.includes("go: isOwner ? { label: 'No-show fee'") && page.includes('access.loaded && !access.isStaff'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
