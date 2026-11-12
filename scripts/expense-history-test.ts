// ADMIN-REDO (Cam 2026-11-12): an expense's history (lib/expense-history) and the budget and
// history routes' gates. Pure. Run: npx tsx scripts/expense-history-test.ts
import { readFileSync } from 'fs';
import { expenseHistory } from '../src/lib/expense-history';
let failed = 0;
const check = (label: string, ok: boolean, info: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !info ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) failed++; };
// Expense history
const t = (s: string) => new Date(`2026-11-${s}T12:00:00Z`);
const h = expenseHistory([
  { action: 'expense_add', actorName: 'Cam Sanchez', before: null, after: { name: 'Vercel', amountCents: 2000 }, createdAt: t('01') },
  { action: 'expense_edit', actorName: 'Cam Sanchez', before: { amountCents: 2000 }, after: { amountCents: 2500 }, createdAt: t('03') },
  { action: 'expense_edit', actorName: 'Cam', before: { endedAt: null }, after: { endedAt: '2026-11-05T00:00:00.000Z' }, createdAt: t('05') },
  { action: 'expense_edit', actorName: 'Cam', before: { endedAt: '2026-11-05T00:00:00.000Z', amountCents: 2500 }, after: { endedAt: null, amountCents: 3000 }, createdAt: t('07') },
  { action: 'expense_edit', actorName: 'Cam', before: {}, after: {}, createdAt: t('08') },
]);
check('history is newest first, with kinds added / changed / ended — never restarted', JSON.stringify(h.map(x => x.kind)) === JSON.stringify(['changed', 'ended', 'changed', 'added']), h);
check('…an edit that changed nothing is left out', h.length === 4);
check('…"by" is the first name', h.every(x => x.by === 'Cam'));
check('…changes carry field, from and to', JSON.stringify(h[2].changes) === JSON.stringify([{ field: 'amountCents', from: 2000, to: 2500 }]));
check('…an old row that cleared endedAt reads as a change, endedAt included', JSON.stringify(h[0].changes) === JSON.stringify([{ field: 'amountCents', from: 2500, to: 3000 }, { field: 'endedAt', from: '2026-11-05T00:00:00.000Z', to: null }]), h[0]);
check('the PATCH route refuses to un-end an ended expense', /if \(existing\.endedAt\) return NextResponse\.json\(\{ error: 'This expense has ended/.test(readFileSync('src/app/api/admin/expenses/[id]/route.ts', 'utf8')));
check('…an end with nothing else has no changes', h[1].changes === undefined);

// Source guards
const budget = readFileSync('src/app/api/admin/expenses/budget/route.ts', 'utf8');
check('budget route: owner, then step-up, then audited', budget.indexOf('requireOwner(session)') < budget.indexOf('stepUpRequired(session)') && budget.indexOf('stepUpRequired(session)') < budget.indexOf('expenseBudget.upsert') && /action: 'expense_budget'/.test(budget));
check('history route: owner only', /requireOwner\(session\)/.test(readFileSync('src/app/api/admin/expenses/[id]/history/route.ts', 'utf8')));
check('the budget is company data: kept by the launch wipe', /KEPT_TABLES = \[[^\]]*'ExpenseBudget'/.test(readFileSync('src/lib/data-reset.ts', 'utf8')));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
