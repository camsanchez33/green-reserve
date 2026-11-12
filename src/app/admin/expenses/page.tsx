'use client';
// Expenses (owner only): the company's costs — add, edit, end, delete. Moved off Revenue as it was
// (ADMIN_REDO_SPEC.md "Revenue: APPROVED": expenses, profit and unit economics leave Revenue and get their own
// menu items). Data: /api/admin/expenses, owner-only at the route; this page only shows what it answers.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { stepUpFetch } from '@/lib/step-up-client';
import { EXPENSE_CATEGORIES, EXPENSE_CADENCES, EXPENSE_CATEGORY_LABEL, EXPENSE_CADENCE_LABEL, monthlyEquivalentCents } from '@/lib/expenses';
import { formatMoney as fmtMoney } from '@/lib/format';
import { INPUT_COMPACT } from '@/components/ui/field';

interface Expense {
  id: string; name: string; category: string; amountCents: number; cadence: string;
  startedAt: string; endedAt: string | null;
}

const H2 = 'text-[20px] font-bold text-ink';
const TH = 'py-2 pr-4 font-medium text-left';
const PRIMARY = 'text-[13px] font-medium px-3 py-1.5 rounded-md bg-pine hover:bg-pine-hover text-white disabled:opacity-50';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expenseError, setExpenseError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const blankDraft = () => ({ name: '', category: 'infra', amount: '', cadence: 'monthly', startedAt: new Date().toISOString().slice(0, 10) });
  const [draft, setDraft] = useState(blankDraft);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseBusy, setExpenseBusy] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true); setExpenseError('');
    try {
      const res = await fetch('/api/admin/expenses', { cache: 'no-store' });
      if (res.status === 401) { setSignedOut(true); setExpenseError('Your session ended — sign in again.'); }
      else if (res.ok) setExpenses((await res.json()).expenses);
      else { const e = await res.json().catch(() => ({})); setExpenseError(e.error || `Couldn’t load expenses (error ${res.status}). Try again.`); }
    } catch { setExpenseError('Network error loading expenses. Try again.'); }
    setExpensesLoading(false);
  }, []);
  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  function resetDraft() { setEditing(null); setDraft(blankDraft()); setExpenseError(''); }
  function startEdit(e: Expense) {
    setEditing(e);
    setDraft({ name: e.name, category: e.category, amount: (e.amountCents / 100).toString(), cadence: e.cadence, startedAt: e.startedAt.slice(0, 10) });
  }

  async function saveExpense() {
    const amountCents = Math.round(parseFloat(draft.amount) * 100);
    if (!draft.name.trim()) { setExpenseError('Give it a name.'); return; }
    if (!Number.isFinite(amountCents) || amountCents <= 0) { setExpenseError('The amount must be a number above zero.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startedAt)) { setExpenseError('Pick the date it started.'); return; }
    setSavingExpense(true); setExpenseError('');
    const body = JSON.stringify({ name: draft.name.trim(), category: draft.category, amountCents, cadence: draft.cadence, startedAt: `${draft.startedAt}T12:00:00.000Z` });
    try {
      const res = editing
        ? await fetch(`/api/admin/expenses/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/admin/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.ok) { resetDraft(); await loadExpenses(); }
      else { const e = await res.json().catch(() => ({})); setExpenseError(e.error || 'Couldn’t save it. Try again.'); }
    } catch {
      setExpenseError('Network error — nothing was saved. Try again.');
    }
    setSavingExpense(false);
  }

  async function endExpense(e: Expense) {
    if (expenseBusy) return;
    setExpenseBusy(e.id); setExpenseError('');
    try {
      const res = await fetch(`/api/admin/expenses/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endedAt: new Date().toISOString() }) });
      if (res.ok) { await loadExpenses(); }
      else { const err = await res.json().catch(() => ({})); setExpenseError(err.error || 'Couldn’t end it.'); }
    } catch {
      setExpenseError('Network error — the expense was not changed. Try again.');
    } finally {
      setExpenseBusy(null);
    }
  }
  async function deleteExpense(e: Expense) {
    if (expenseBusy) return;
    if (!confirm(`Delete "${e.name}"? It disappears from past months too. To stop counting it from today but keep the history, use End instead.`)) return;
    setExpenseBusy(e.id); setExpenseError('');
    try {
      const res = await stepUpFetch(`/api/admin/expenses/${e.id}`, { method: 'DELETE' });
      if (res.ok) { if (editing?.id === e.id) resetDraft(); await loadExpenses(); }
      else { const err = await res.json().catch(() => ({})); setExpenseError(err.error || 'Couldn’t delete it.'); }
    } catch {
      setExpenseError('Network error — the expense was not deleted. Try again.');
    } finally {
      setExpenseBusy(null);
    }
  }

  const activeExpenses = (expenses ?? []).filter(e => !e.endedAt);
  const monthly = activeExpenses.reduce((s, e) => s + monthlyEquivalentCents(e), 0);
  const byCategory = EXPENSE_CATEGORIES
    .map(c => ({ c, cents: activeExpenses.filter(e => e.category === c).reduce((s, e) => s + monthlyEquivalentCents(e), 0) }))
    .filter(x => x.cents > 0).sort((a, b) => b.cents - a.cents);

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar active="expenses"/>
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 pt-6 pb-10 flex flex-col gap-6">
          <h1 className="m-0 text-[32px] font-bold tracking-[-0.02em] text-ink leading-none">Expenses</h1>
          {signedOut && <Link href="/admin/login" className="text-[13px] text-pine hover:underline">Sign in</Link>}
            <div className="flex flex-wrap gap-8 items-start">
              <section className="flex-[1_1_640px] min-w-0">
                <h2 className={H2}>What we pay for {expenses && <span className="font-medium">{fmtMoney(monthly / 100)} a month</span>}</h2>
                {expenseError && (
                  <div role="alert" className="mt-3 rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex justify-between gap-3">
                    <p className="text-[13px] text-bad">{expenseError}</p>
                    {expenses === null && <button type="button" onClick={loadExpenses} className="text-[13px] font-medium text-ink-soft hover:text-ink">Try again</button>}
                  </div>
                )}
                {expensesLoading && expenses === null ? (
                  <p className="py-8 text-center text-ink-muted text-sm">Loading…</p>
                ) : expenses && expenses.length === 0 ? (
                  <p className="mt-3 text-[14px] text-ink-soft">No expenses yet. Add your fixed costs on the right.</p>
                ) : expenses && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px] border-collapse mt-3">
                      <thead><tr className="text-[12.5px] text-ink-muted border-b border-line"><th className={TH}>Name</th><th className={TH}>Category</th><th className={TH}>How often</th><th className={TH}>Amount</th><th className={TH}>Per month</th><th></th></tr></thead>
                      <tbody>
                        {expenses.map(e => (
                          <tr key={e.id} className={'border-b border-line-soft last:border-0 ' + (e.endedAt ? 'text-ink-muted' : '')}>
                            <td className="py-3 pr-4">{e.name}{e.endedAt && <span className="ml-2 text-[12.5px]">ended {e.endedAt.slice(0, 10)}</span>}<div className="text-[12.5px] text-ink-muted">since {e.startedAt.slice(0, 10)}</div></td>
                            <td className="py-3 pr-4">{EXPENSE_CATEGORY_LABEL[e.category as keyof typeof EXPENSE_CATEGORY_LABEL] ?? e.category}</td>
                            <td className="py-3 pr-4">{EXPENSE_CADENCE_LABEL[e.cadence as keyof typeof EXPENSE_CADENCE_LABEL] ?? e.cadence}</td>
                            <td className="py-3 pr-4 tabular-nums">{fmtMoney(e.amountCents / 100)}</td>
                            <td className="py-3 pr-4 tabular-nums">{e.endedAt || e.cadence === 'one-time' ? '—' : fmtMoney(monthlyEquivalentCents(e) / 100)}</td>
                            <td className="py-3 text-right whitespace-nowrap text-[13px]">
                              <button type="button" onClick={() => startEdit(e)} disabled={!!expenseBusy} className="text-pine hover:underline disabled:opacity-40">Edit</button>
                              {!e.endedAt && <> · <button type="button" onClick={() => endExpense(e)} disabled={!!expenseBusy} className="text-pine hover:underline disabled:opacity-40">{expenseBusy === e.id ? 'Ending…' : 'End'}</button></>}
                              {' · '}<button type="button" onClick={() => deleteExpense(e)} disabled={!!expenseBusy} className="text-bad hover:underline disabled:opacity-40">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[12.5px] text-ink-muted">End stops counting it from today and keeps the history; Delete removes it from past months too.</p>
                  </div>
                )}
              </section>

              <aside className="flex-[0_1_340px] min-w-[280px] flex flex-col gap-5">
                <form onSubmit={e => { e.preventDefault(); saveExpense(); }} className="bg-paper rounded-lg p-5 flex flex-col gap-2.5 text-[14px]">
                  <h2 className="text-[16px] font-semibold text-ink">{editing ? `Edit ${editing.name}` : 'Add an expense'}</h2>
                  <label className="flex flex-col gap-1 text-ink-soft">Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Vercel Pro" className={INPUT_COMPACT}/></label>
                  <label className="flex flex-col gap-1 text-ink-soft">Category
                    <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={INPUT_COMPACT}>
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-ink-soft">How often
                    <select value={draft.cadence} onChange={e => setDraft({ ...draft, cadence: e.target.value })} className={INPUT_COMPACT}>
                      {EXPENSE_CADENCES.map(c => <option key={c} value={c}>{EXPENSE_CADENCE_LABEL[c]}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-ink-soft">Amount ($)<input type="number" step="0.01" min="0" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} placeholder="0.00" className={INPUT_COMPACT}/></label>
                  <label className="flex flex-col gap-1 text-ink-soft">Started<input type="date" value={draft.startedAt} onChange={e => setDraft({ ...draft, startedAt: e.target.value })} className={INPUT_COMPACT}/></label>
                  <div className="flex items-center gap-3 mt-1">
                    <button type="submit" disabled={savingExpense} className={PRIMARY + ' py-2'}>{savingExpense ? 'Saving…' : editing ? 'Save changes' : 'Add'}</button>
                    {editing && <button type="button" onClick={resetDraft} className="text-[13px] text-ink-soft hover:text-ink">Cancel</button>}
                  </div>
                </form>
                {byCategory.length > 0 && (
                  <div className="text-[14px]">
                    <h2 className="text-[16px] font-semibold text-ink mb-2">By category, per month</h2>
                    {byCategory.map(x => (
                      <div key={x.c} className="flex justify-between py-0.5"><span>{EXPENSE_CATEGORY_LABEL[x.c]}</span><span className="tabular-nums">{fmtMoney(x.cents / 100)}</span></div>
                    ))}
                  </div>
                )}
              </aside>
            </div>
        </div>
      </div>
    </div>
  );
}
