// Admin Revenue (ADMIN-REDO, Cam approved 2026-11-12): the page's pure rules. A period is never shown under another
// period's name, a percentage is never drawn across a zero or negative prior, and only paused payouts read as a
// course not being paid. Run: npx tsx scripts/admin-revenue-test.ts
import { readFileSync } from 'fs';
import { isGoal, parseGoalCents, fillPct, onTrackCents, KIND, fallbackQuery, isNewAnswer, isFallbackAnswer, pct, payoutState, periodDone, chartSummary, type Per } from '../src/app/admin/revenue/logic';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const NOW = new Date('2026-11-12T15:00:00Z');
const PERS: Per[] = ['month', 'last', 'd30', 'year'];

// The new route's answer counts only when it names the kind asked for.
for (const p of PERS) check(`${p}: the matching new answer is accepted`, isNewAnswer(p, { kind: KIND[p] }, true));
check('an mtd answer (the older route) is never taken as Last month', !isNewAnswer('last', { kind: 'mtd' }, false));
check('a new-shaped answer that defaulted to month is never taken as Last month', !isNewAnswer('last', { kind: 'month' }, true));
check('a new answer without its series is not accepted', !isNewAnswer('month', { kind: 'month' }, false));

// The fallback query and its answer.
check('fallback: This month asks mtd', fallbackQuery('month', NOW) === 'period=mtd');
check('fallback: Last month is October', fallbackQuery('last', NOW) === 'period=custom&from=2026-10-01&to=2026-10-31');
check('fallback: Last 30 days ends today', fallbackQuery('d30', NOW) === 'period=custom&from=2026-10-14&to=2026-11-12');
check('fallback: This year starts Jan 1', fallbackQuery('year', NOW) === 'period=custom&from=2026-01-01&to=2026-11-12');
check('fallback: an mtd answer is accepted for This month', isFallbackAnswer('month', { kind: 'mtd', from: '2026-11-01', to: '2026-11-12' }, NOW));
check('fallback: an mtd answer is refused for Last month', !isFallbackAnswer('last', { kind: 'mtd', from: '2026-11-01', to: '2026-11-12' }, NOW));
check('fallback: a custom answer for other dates is refused', !isFallbackAnswer('last', { kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, NOW));
check('fallback: the exact custom window is accepted', isFallbackAnswer('last', { kind: 'custom', from: '2026-10-01', to: '2026-10-31' }, NOW));
check('fallback: no period, no answer', !isFallbackAnswer('month', undefined, NOW));

// Percentages.
check('up 20%', pct(120, 100) === 20);
check('no prior → no percentage', pct(50, 0) === null);
check('a negative prior never flips the sign ("Down 300%" when it went up)', pct(600, -300) === null);

// Payout states.
check('paying out normally → nothing to show', payoutState({ error: null, payoutsEnabled: true, needsInfo: false }) === null);
check('paused → bad', payoutState({ error: null, payoutsEnabled: false, needsInfo: false })?.tone === 'bad');
check('needs information but paying out → warn, not "not paid"', payoutState({ error: null, payoutsEnabled: true, needsInfo: true })?.tone === 'warn');
check("Stripe didn't answer → warn (unknown, not unpaid)", payoutState({ error: 'timeout', payoutsEnabled: false, needsInfo: false })?.tone === 'warn');

// The chart sentence never contradicts the Revenue card (review 2026-11-12, Nov 2 08:00 example: Oct 1 $60,
// Oct 2 $70 taken after 9am, Nov 1 $65, Nov 2 nothing yet → the card says up $5, never "$65 behind").
const card = { cents: 6500, priorCents: 6000 };
const nov2 = chartSummary({ current: [65, 0], prior: [60, 70, 50] }, false, card);
check('on Build\'s route the sentence is the card\'s own difference', nov2.total === 65 && nov2.ahead === 5, JSON.stringify(nov2));
check('on the older route it is the series at the same day', chartSummary({ current: [65, 0], prior: [60, 70, 50] }, false).ahead === -65);
check('…and the whole prior period once the period is over', chartSummary({ current: [10, 10], prior: [5, 5, 5] }, true).ahead === 5);
check('the last day of a running month is not "over" on Build\'s route', !periodDone('month', true, '2026-11-30', '2026-11-30'));
check('Last 30 days and This year are never "over" on Build\'s route', !periodDone('d30', true, '2026-11-30', '2026-11-30') && !periodDone('year', true, '2026-11-30', '2026-11-30'));
check('Last month is over', periodDone('last', true, '2026-10-31', '2026-11-12'));
check('older route: a window that ended before today is over', periodDone('last', false, '2026-10-31', '2026-11-12') && !periodDone('month', false, '2026-11-12', '2026-11-12'));

// The page reads its rules from logic.ts, and never claims "Not paid".
const page = readFileSync('src/app/admin/revenue/page.tsx', 'utf8');
check('the page uses the period guards', /isNewAnswer\(/.test(page) && /isFallbackAnswer\(/.test(page));
check('the page has no own percentage rule', !/prior === 0 \?/.test(page));
check('the page never says "Not paid"', !/Not paid/.test(page));
check('nothing checked never reads as paid in full (checkedCourses 0 → "No payouts checked", before "Paid in full")', /checkedCourses === 0/.test(page) && page.indexOf('No payouts checked') > -1 && page.indexOf('No payouts checked') < page.indexOf('Paid in full'));

// The revenue goal card (owner, This month): Build's block, the amount typed, and the ONE pace rule.
check('a goal block with no target yet is usable', isGoal({ month: '2026-11', targetCents: null, progressCents: 0, dayOfPeriod: 11.5, daysInPeriod: 30 }));
check('a malformed goal block is refused', !isGoal({ month: 'Nov', targetCents: 5, progressCents: 0, dayOfPeriod: 1, daysInPeriod: 30 }) && !isGoal(undefined));
check('goal amounts: "$4,000" → 400000, "12,50" and over $20M refused', parseGoalCents('$4,000') === 400000 && parseGoalCents('12,50') === null && parseGoalCents('20000001') === null && parseGoalCents('0') === null);
const goalCard = readFileSync('src/app/admin/revenue/GoalCard.tsx', 'utf8');
check('the goal bar uses the shared pace rule as a goal to reach, with its early grey days', /goalPace\(\{[^}]*share: elapsedShare\(goal\.dayOfPeriod, goal\.daysInPeriod\)[^}]*kind: 'reach'[^}]*daysElapsed: goal\.dayOfPeriod/.test(goalCard) && !/0\.9\s*\*/.test(goalCard));
check('on track: so far ÷ elapsed share, to the nearest $100', onTrackCents(132_000, 11.5, 30, 3) === 340_000 && onTrackCents(1_00, 15, 30, 3) === null);
check('on track: never under what is already in (rounding down on the last day)', onTrackCents(132_000, 29.98, 30, 3) === null && onTrackCents(331_000, 29.9, 30, 3) === null);
check('on track: hidden in the grey first 3 days, once the month is over, and with nothing to project', onTrackCents(132_000, 2.9, 30, 3) === null && onTrackCents(132_000, 30, 30, 3) === null && onTrackCents(0, 10, 30, 3) === null && onTrackCents(-500, 10, 30, 3) === null);
check('the card shows the on-track line only when there is one', /\{onTrack !== null && <span/.test(goalCard) && /On track for about/.test(goalCard));
check('the goal prefill keeps cents (Change never rewrites the goal)', /\(target \/ 100\)\.toFixed\(2\)/.test(goalCard));
check('the bar never fills on a negative month nor past full', fillPct(-500, 400000) === 0 && fillPct(500000, 400000) === 100 && fillPct(100000, 400000) === 25);
check('a met goal says so', /goal\.progressCents >= target \?/.test(goalCard));
check('bad goal blocks refused: NaN, negative target, 0 days, month 13', !isGoal({ month: '2026-11', targetCents: NaN, progressCents: 0, dayOfPeriod: 1, daysInPeriod: 30 }) && !isGoal({ month: '2026-11', targetCents: -5, progressCents: 0, dayOfPeriod: 1, daysInPeriod: 30 }) && !isGoal({ month: '2026-11', targetCents: 5, progressCents: 0, dayOfPeriod: 1, daysInPeriod: 0 }) && !isGoal({ month: '2026-13', targetCents: 5, progressCents: 0, dayOfPeriod: 1, daysInPeriod: 30 }));
check('stray $ or spaces inside an amount are refused', parseGoalCents('40$00') === null && parseGoalCents('400 500') === null && parseGoalCents(' $4,000.50 ') === 400050);
check('setting the goal goes through step-up', /stepUpFetch\('\/api\/admin\/revenue-goal'/.test(goalCard));
check('the goal card shows only for This month, only for the owner', /per === 'month' && owner && isGoal\(/.test(page));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
