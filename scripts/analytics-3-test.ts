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
// ANALYTICS-5 (Cam 2026-11-17, approved mockup): the page's parts moved to components/dashboard/analytics.
const head = readFileSync('src/components/dashboard/analytics/Head.tsx', 'utf8');
const tabs = readFileSync('src/components/dashboard/analytics/Tabs.tsx', 'utf8');
const adata = readFileSync('src/components/dashboard/analytics/data.ts', 'utf8');
check('the title is Analytics', page.includes('leading-none text-ink">Analytics</h1>') && !page.includes('How your course is doing'));
check('one date button, no preset strip', page.includes('<Dates value={range}') && !page.includes("'Pick dates'") && !page.includes('<Seg '));
// ANALYTICS-5 supersedes AN-3's 7 days: a snapshot of the last month, the last 30 whole days ending yesterday.
check('opens on the last 30 whole days', page.includes('lastMonth(new Date()') && adata.includes('export const lastMonth = (today: string): Range => ({ from: addDays(today, -30), to: addDays(today, -1) });'));
// DENSE-1: the four now sit in METRICS (label: '…') and pick what the chart plots.
// ANALYTICS-5 (Cam 2026-11-17): Revenue, Bookings, Rounds played, Tee sheet filled.
check('the four headline numbers', ["label: 'Revenue'", "label: 'Bookings'", "label: 'Rounds played'", "label: 'Tee sheet filled'"].every(s => head.includes(s)) && !head.includes('Money collected') && !head.includes("'Empty spots'"));
// ANALYTICS-5 reverses AN-3 here: the approved mockup shows "Value of unsold spots" on the Tee sheet tab (Build asked, see the PR).
check('the value of unsold spots is on the Tee sheet tab only', tabs.includes("{ label: 'Value of unsold spots', value: usd(d.unfilled.lostCents) }") && !page.includes('lostCents') && !head.includes('lostCents'));
check('Ask Birdie offered, only when Birdie is on', tabs.includes('const birdie = useBirdieReady();') && tabs.includes('{birdie && (') && tabs.includes('askBirdie(q.trim())'));
check('six tabs, money left to Revenue', page.includes("[['sheet', 'Tee sheet'], ['book', 'Bookings'], ['golfers', 'Golfers'], ['noshow', 'No-shows'], ['shop', 'Pro shop'], ['review', 'Reviews']]") && !page.includes("['revenue', 'Revenue']"));
check('golfers tab says where the data comes from', tabs.includes('From bookings at your course') && tabs.includes('href="/privacy"'));
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
check('tile wording matches the numbers', terms.includes('of bookings whose tee time has passed') && terms.includes('in these dates or any time before'));
check('sign-in is a full page load, so no cached course survives', readFileSync('src/app/dashboard/login/page.tsx', 'utf8').includes("window.location.assign(data.redirect || '/dashboard')"));
// ANALYTICS-5: the Golfers row has three numbers; "kept from before" is off the page, its definition stays for the assistant.
check('“kept from before” says booked, not played', terms.includes('from the period before who booked with you again') && !tabs.includes('retentionPct'));
// DENSE-1 review: the dashed "period before" only in day mode (weekly buckets don't line up),
// and the no-show-fee action only for the owner (the cancellation policy is owner-only).
check('the period before is compared day by day only', head.includes("const day = d.revenue.bucket === 'day';") && head.includes('const before = day && d.compare?.series') && head.includes('ledger.beforeSeries.length === ledger.series.length && ledger.series.every(x => /^\\d{4}-\\d{2}-\\d{2}$/.test(x.key))'));
// ANALYTICS-5: "What to look at" is gone, so no settings action sits on the page for a staff login to misuse.
check('no no-show-fee action on the page', !page.includes('settings?section') && !tabs.includes('settings?section') && !head.includes('settings?section'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
