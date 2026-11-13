// Admin Business analytics (ADMIN-REDO, Cam approved 2026-11-12): the page's pure rules — the route's numbers
// compared, scaled and exported; nothing estimated. Run: npx tsx scripts/admin-business-test.ts
import { readFileSync } from 'fs';
import { isAnswer, pct, points, stepRate, barScale, monthLabel, axisLabel, coursesCsv, cell } from '../src/app/admin/business/logic';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };

// The route's answer counts only for the period asked.
const ok = { period: { kind: 'm3' }, months: [], courses: [], cards: { liveCourses: {}, onlineBookings: {}, teeSheetFill: {} }, value: { paidBeforeArrival: {} }, joining: { steps: [], reachedToLive: {} } };
check('the matching answer is accepted', isAnswer('m3', ok));
check('another period is refused', !isAnswer('y12', ok));
check('an answer without the joining steps is refused', !isAnswer('m3', { ...ok, joining: {} }));
check('an answer missing a part the page reads is refused (no render crash)', !isAnswer('m3', { ...ok, cards: {}, value: {} }) && !isAnswer('m3', { ...ok, value: {} }));

// Changes.
check('up 50%', pct(150, 100) === 50);
check('no prior, or a zero prior → no percentage', pct(5, null) === null && pct(5, 0) === null);
check('a fill rate moves in points', points(58, 52) === 6 && points(null, 52) === null);

// The joining steps: each step's share of the one before; none for the first, none across a zero or a missing count.
const steps = [{ count: 80 }, { count: 20 }, { count: 10 }, { count: null }, { count: 0 }, { count: 0 }];
check('first step has no rate', stepRate(steps, 0) === null);
check('20 of 80 → 25%', stepRate(steps, 1) === 25);
check('a missing count has no rate', stepRate(steps, 3) === null && stepRate(steps, 4) === null);
check('after a zero step there is no rate', stepRate(steps, 5) === null);
check('the route\'s own rate wins (Responded counts inbound too)', stepRate([{ count: 10 }, { count: 30, fromPrevPct: 20 }], 1) === 20 && stepRate([{ count: 10 }, { count: 3, fromPrevPct: null }], 1) === null);

// The bar chart's scale: round steps, the top above the tallest bar.
const sc = barScale([310, 2613, 1228]);
check('the top is above the tallest bar', sc.max >= 2613 && sc.max % sc.step === 0, JSON.stringify(sc));
check('round steps', [1, 2, 2.5, 5].some(x => sc.step / Math.pow(10, Math.floor(Math.log10(sc.step))) === x), JSON.stringify(sc));
check('no bookings → a small empty scale, never a divide by zero', barScale([0, 0]).max > 0);

// Labels.
check('the running month is starred', monthLabel('2026-11', true) === 'Nov*' && monthLabel('2026-10', false) === 'Oct');
check('axis: 1.5k and 250', axisLabel(1500) === '1.5k' && axisLabel(250) === '250' && axisLabel(2000) === '2k');

// CSV.
const csv = coursesCsv([{ courseId: 'a', name: '=Example', online: 12, onlinePrior: null, fillPct: 54.25, onlineSharePct: null, ourRevenueCents: 1800 }]).trim().split('\r\n');
check('a header and one row per course', csv.length === 2);
check('a missing value is blank, money in dollars', csv[1] === `"'=Example","12","","54.3","","18.00"`, csv[1]);
check('a course netting below zero exports a number a spreadsheet can add', coursesCsv([{ courseId: 'a', name: 'A', online: 3, onlinePrior: 5, fillPct: 40, onlineSharePct: 50, ourRevenueCents: -1800 }]).split('\r\n')[1].endsWith('"-18.00"'));
check('without the Money area the CSV has no revenue column', coursesCsv([{ courseId: 'a', name: 'A', online: 1, onlinePrior: 1, fillPct: null, onlineSharePct: null, ourRevenueCents: null }], false).split('\r\n')[0].split(',').length === 5);
check('the page hides Our revenue when the route sends null', /showRevenue && <th/.test(readFileSync('src/app/admin/business/page.tsx', 'utf8')));
check('formula-looking cells are text', cell('+1') === `"'+1"` && cell('=Example') === `"'=Example"` && cell('-cmd') === `"'-cmd"`);
check('a negative amount stays a number', cell(-5) === '"-5"' && cell('-18.00') === '"-18.00"');

// The page.
const page = readFileSync('src/app/admin/business/page.tsx', 'utf8');
check('reads only /api/admin/business', /\/api\/admin\/business\?period=/.test(page) && !/\/api\/admin\/(revenue|finance|onboarding)/.test(page));
check('a later Filter pick wins over an earlier answer', /mine !== seq\.current/.test(page));
check('tee-sheet fill compares in points', /teeSheetFill\.prior\} vs=\{PD\.vs\} pts/.test(page));
check('the figures on screen keep their own period\'s words while a new pick loads', /const PD = d \?/.test(page) && /d\.period\.kind === 'm3'/.test(page));
check('after-hours shows a dash when the route can\'t count it (never a guess)', /d\.value\.afterHours \? n\(d\.value\.afterHours\.count\) : '—'/.test(page));
check('never a chart library', !/from '(recharts|chart\.js|d3)/.test(page));
const nav = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
check('first contact to live, never "reached out" (inbound counts too)', /First contact to live/.test(page) && !/Reached out to live/.test(page));
check('paid before arrival reads the route\'s {count, cents}', /paidBeforeArrival\.cents/.test(page) && /paidBeforeArrival\.count/.test(page));
check('the menu shows it to managers+ with the Courses area', /key: 'business'.*minRole: MANAGER_PLUS, area: 'courses'/.test(nav));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
