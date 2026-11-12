// Admin Financial analytics (ADMIN-REDO, Cam approved 2026-11-12): the page's pure rules — the route's numbers
// added up, profit and margin taken, nothing estimated. Run: npx tsx scripts/admin-finance-test.ts
import { readFileSync } from 'fs';
import { centsOf, isAnswer, totals, windowTotals, pct, pointsChange, monthLabel, spansYears, ticks, toCsv, cell, type Month } from '../src/app/admin/finance/logic';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const mo = (month: string, rev: number, exp: number, bookings = 0, partial = false): Month => ({
  month, partial, bookings,
  revenue: { cents: rev, bySource: { serviceFees: rev, noShowLateFees: 0, membershipDues: 0, other: 0 } },
  expenses: { cents: exp, byCategory: { infra: exp, tools: 0, legal: 0, other: 0 } },
  liveCourses: 2, newLiveCourses: 0, byCourse: [],
});

// Totals.
const t = windowTotals([mo('2026-10', 30000, 10000, 200), mo('2026-11', 10000, 12000, 80, true)]);
check('revenue, expenses and bookings add up', t.revenue === 40000 && t.expenses === 22000 && t.bookings === 280);
check('profit = revenue − expenses', t.profit === 18000);
check('margin = profit ÷ revenue', Math.round(t.margin! * 10) === 450);
check('no revenue → no margin (never −∞ or NaN)', totals(0, 5000).margin === null);
check('a loss is a negative profit and margin', totals(1000, 3000).profit === -2000 && totals(1000, 3000).margin === -200);

// Changes.
check('up 25%', pct(125, 100) === 25);
check('no prior → no percentage', pct(5, 0) === null && pct(5, -10) === null);
check('margin moves in points: −40% to −20% is up 20 points, not "down 50%"', pointsChange(-20, -40) === 20);
check('no margin on either side → no comparison', pointsChange(null, 10) === null);

// The route's answer counts only for the period asked.
const ok = { period: { kind: 'm6' }, months: [], prior: { revenueCents: 0, expensesCents: 0, bookings: 0 } };
check('the matching answer is accepted', isAnswer('m6', ok));
check('another period is refused', !isAnswer('y12', ok));
check('an answer without prior totals is refused', !isAnswer('m6', { period: { kind: 'm6' }, months: [] }));

check('the month before reads as an object or a plain number', centsOf({ cents: 5 }) === 5 && centsOf(7) === 7 && centsOf(null) === 0);

// Labels.
check('a running month says so', monthLabel('2026-11', true) === 'Nov so far');
check('with the year when the window spans two', monthLabel('2025-12', false, true) === 'Dec 2025');
check('spans years', spansYears([mo('2025-12', 0, 0), mo('2026-01', 0, 0)]) && !spansYears([mo('2026-01', 0, 0), mo('2026-02', 0, 0)]));

// Axis levels: round steps that reach the top value.
const tk = ticks(392000);
check('ticks are round and cover the top', tk.length >= 3 && tk[tk.length - 1] >= 392000 * 0.75 && tk.every(v => v % 10000 === 0), JSON.stringify(tk));
check('no values → no ticks', ticks(0).length === 0);

// CSV.
const csv = toCsv([mo('2026-10', 30000, 10000, 200), mo('2026-11', 10000, 12000, 80, true)], k => k);
const lines = csv.trim().split('\r\n');
check('a header and one row per month', lines.length === 3, String(lines.length));
check('dollars, profit and margin per month', lines[1].includes('"300.00"') && lines[1].includes('"200.00"') && lines[1].includes('"66.7"'));
check('a running month is marked "so far"', lines[2].startsWith('"2026-11 (so far)"'));
check('a formula-looking cell is written as text', cell('=HYPERLINK("x")') === `"'=HYPERLINK(""x"")"`);

// The page.
const page = readFileSync('src/app/admin/finance/page.tsx', 'utf8');
check('reads only /api/admin/finance', /\/api\/admin\/finance\?period=/.test(page) && !/\/api\/admin\/(revenue|expenses)['?]/.test(page));
check('expenses rising is the bad colour', /goodUp=\{false\}/.test(page));
check('the margin compares in points', /points \/>/.test(page));
check('a later Filter pick wins over an earlier answer', /mine !== seq\.current/.test(page));
check('never a chart library', !/from '(recharts|chart\.js|d3)/.test(page));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
