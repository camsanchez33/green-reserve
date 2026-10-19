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
check('the golf-standard four', ['label="Revenue"', 'label="Tee sheet filled"', 'label="Rounds played"', 'label="Average per round"'].every(s => page.includes(s)) && !page.includes('label="Money collected"') && !page.includes('label="Empty spots"'));
check('no dollar total for unsold spots on the page', !page.includes('d.unfilled.lostCents'));
check('Ask Birdie offered, only when Birdie is on', page.includes('useBirdieReady()') && page.includes('askBirdie(q)'));
check('five tabs', page.includes("['booking', 'How they book']") && page.includes("['revenue', 'Revenue']"));
check('golfers tab says where the data comes from', page.includes('Golfers are told this'));
const route = readFileSync('src/app/api/operator/analytics/route.ts', 'utf8');
check('the route takes days=N', route.includes("sp.get('days')"));
const bar = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');
check('the top bar remembers the course colour between tabs', bar.includes('cachedIdentity') && bar.includes('useLayoutEffect'));
check('…and forgets it on a course switch and sign-out', (bar.match(/saveIdentity\(null\)/g) || []).length >= 2);
const w = readFileSync('src/components/birdie/BirdieWidget.tsx', 'utf8');
check('Birdie fills the question but does not send it', w.includes('setInput(q.slice(0, 500))') && !/onAsk[\s\S]{0,400}ask\(q/.test(w));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
