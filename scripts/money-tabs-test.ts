// ADMIN-C Money: the pure rules behind the new tabs — fees by day for the
// Overview chart, and what an expense comes to per month on Expenses.
// Run: npx tsx scripts/money-tabs-test.ts
import { feesByDay } from '../src/lib/fees-by-day';
import { monthlyEquivalentCents } from '../src/lib/expenses';
import { visibleMoneyTab, isMoneyTab } from '../src/lib/money-tabs';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed++; };

const d = (s: string) => new Date(s);
const current = { start: d('2026-10-01T00:00:00Z'), end: d('2026-10-04T12:00:00Z') };  // 3.5 days → 4 slots
const prior = { start: d('2026-09-01T00:00:00Z'), end: d('2026-09-04T12:00:00Z') };
const r = feesByDay([
  { paidAt: d('2026-10-01T09:00:00Z'), cents: 300 },
  { paidAt: d('2026-10-01T23:59:59Z'), cents: 150 },
  { paidAt: d('2026-10-03T10:00:00Z'), cents: 600 },
  { paidAt: d('2026-10-04T13:00:00Z'), cents: 999 },   // after the window ends: not counted
  { paidAt: d('2026-09-02T08:00:00Z'), cents: 450 },
  { paidAt: d('2026-09-04T13:00:00Z'), cents: 777 },   // after the prior window's same point: not counted
  { paidAt: null, cents: 5 },
], current, prior);
check('each day of the period gets its own slot', JSON.stringify(r.current) === JSON.stringify([450, 0, 600, 0]), r.current);
check('the period before overlays day for day', JSON.stringify(r.prior) === JSON.stringify([0, 450, 0, 0]), r.prior);
check('nothing outside either window is counted', r.current.reduce((a, b) => a + b, 0) + r.prior.reduce((a, b) => a + b, 0) === 1500);
const longPrior = feesByDay([], { start: d('2026-10-01T00:00:00Z'), end: d('2026-10-03T00:00:00Z') }, { start: d('2026-09-01T00:00:00Z'), end: d('2026-09-30T00:00:00Z') });
check('the prior line is never longer than the current one', longPrior.prior.length === longPrior.current.length && longPrior.current.length === 2, longPrior);

check('monthly costs count in full each month', monthlyEquivalentCents({ amountCents: 2000, cadence: 'monthly' }) === 2000);
check('a yearly cost counts a twelfth a month', monthlyEquivalentCents({ amountCents: 120000, cadence: 'annual' }) === 10000);
check('a one-time cost has no monthly rate', monthlyEquivalentCents({ amountCents: 50000, cadence: 'one-time' }) === 0);

check('a link to Expenses from someone who is not the owner opens Overview', visibleMoneyTab('expenses', false) === 'overview');
check('…and Payouts too', visibleMoneyTab('payouts', false) === 'overview');
check('the owner gets the tab the link names', visibleMoneyTab('expenses', true) === 'expenses');
check('everyone gets Not collected and Disputes', visibleMoneyTab('uncollected', false) === 'uncollected' && visibleMoneyTab('disputes', false) === 'disputes');
check('an unknown ?tab= is ignored', !isMoneyTab('ledger') && isMoneyTab('disputes'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
