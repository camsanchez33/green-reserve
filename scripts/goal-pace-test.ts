// ADMIN-REDO (Cam 2026-11-12): goalPace (lib/goal-pace) and an expense's history
// (lib/expense-history). Pure. Run: npx tsx scripts/goal-pace-test.ts
import { readFileSync } from 'fs';
import { goalPace } from '../src/lib/goal-pace';
import { expenseHistory } from '../src/lib/expense-history';
let failed = 0;
const check = (label: string, ok: boolean, info: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !info ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) failed++; };
const p = (progressCents: number, targetCents: number | null, elapsedShare: number, kind: 'cost' | 'revenue') => goalPace({ progressCents, targetCents, elapsedShare, kind });

// Halfway through the month: projected = progress × 2.
check('projection is progress ÷ the share gone', p(40_00, 100_00, 0.5, 'cost').projectedCents === 80_00);
// COST, target $100
check('cost: projected $90 (= 0.9 × target) is ok', p(45_00, 100_00, 0.5, 'cost').state === 'ok');
check('cost: projected $90.02 is warn', p(45_01, 100_00, 0.5, 'cost').state === 'warn');
check('cost: projected exactly the target is warn', p(50_00, 100_00, 0.5, 'cost').state === 'warn');
check('cost: projected $100.02 is bad', p(50_01, 100_00, 0.5, 'cost').state === 'bad');
// REVENUE, target $100
check('revenue: projected exactly the target is ok', p(50_00, 100_00, 0.5, 'revenue').state === 'ok');
check('revenue: projected $99.98 is warn', p(49_99, 100_00, 0.5, 'revenue').state === 'warn');
check('revenue: projected $90 (= 0.9 × target) is warn', p(45_00, 100_00, 0.5, 'revenue').state === 'warn');
check('revenue: projected $89.98 is bad', p(44_99, 100_00, 0.5, 'revenue').state === 'bad');
// Guards
check('no share gone yet: no projection, no state', JSON.stringify(p(10_00, 100_00, 0, 'cost')) === '{"projectedCents":null,"state":null}');
check('a negative share is treated the same', p(10_00, 100_00, -0.1, 'revenue').state === null);
check('no target (null): projected, but no state', JSON.stringify(p(10_00, null, 0.5, 'cost')) === '{"projectedCents":2000,"state":null}');
check('a zero target: no state', p(10_00, 0, 0.5, 'revenue').state === null);
check('a share past the end counts as the whole period', p(120_00, 100_00, 1.4, 'cost').projectedCents === 120_00);
check('nothing yet against a revenue goal is bad', p(0, 100_00, 0.5, 'revenue').state === 'bad');
check('nothing yet against a cost budget is ok', p(0, 100_00, 0.5, 'cost').state === 'ok');

// Expense history
const t = (s: string) => new Date(`2026-11-${s}T12:00:00Z`);
const h = expenseHistory([
  { action: 'expense_add', actorName: 'Cam Sanchez', before: null, after: { name: 'Vercel', amountCents: 2000 }, createdAt: t('01') },
  { action: 'expense_edit', actorName: 'Cam Sanchez', before: { amountCents: 2000 }, after: { amountCents: 2500 }, createdAt: t('03') },
  { action: 'expense_edit', actorName: 'Cam', before: { endedAt: null }, after: { endedAt: '2026-11-05T00:00:00.000Z' }, createdAt: t('05') },
  { action: 'expense_edit', actorName: 'Cam', before: { endedAt: '2026-11-05T00:00:00.000Z', amountCents: 2500 }, after: { endedAt: null, amountCents: 3000 }, createdAt: t('07') },
  { action: 'expense_edit', actorName: 'Cam', before: {}, after: {}, createdAt: t('08') },
]);
check('history is newest first, with kinds added / changed / ended / restarted', JSON.stringify(h.map(x => x.kind)) === JSON.stringify(['restarted', 'ended', 'changed', 'added']), h);
check('…an edit that changed nothing is left out', h.length === 4);
check('…"by" is the first name', h.every(x => x.by === 'Cam'));
check('…changes carry field, from and to', JSON.stringify(h[2].changes) === JSON.stringify([{ field: 'amountCents', from: 2000, to: 2500 }]));
check('…a restart carries the other fields it changed, not endedAt', JSON.stringify(h[0].changes) === JSON.stringify([{ field: 'amountCents', from: 2500, to: 3000 }]));
check('…an end with nothing else has no changes', h[1].changes === undefined);

// Source guards
const budget = readFileSync('src/app/api/admin/expenses/budget/route.ts', 'utf8');
check('budget route: owner, then step-up, then audited', budget.indexOf('requireOwner(session)') < budget.indexOf('stepUpRequired(session)') && budget.indexOf('stepUpRequired(session)') < budget.indexOf('expenseBudget.upsert') && /action: 'expense_budget'/.test(budget));
check('history route: owner only', /requireOwner\(session\)/.test(readFileSync('src/app/api/admin/expenses/[id]/history/route.ts', 'utf8')));
check('the budget is company data: kept by the launch wipe', /KEPT_TABLES = \[[^\]]*'ExpenseBudget'/.test(readFileSync('src/lib/data-reset.ts', 'utf8')));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
