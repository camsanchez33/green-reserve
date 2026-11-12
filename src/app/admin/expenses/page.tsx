'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { stepUpFetch } from '@/lib/step-up-client';
import { dayKey } from '@/lib/admin-day';
import { EXPENSE_CATEGORIES, EXPENSE_CADENCES, EXPENSE_CATEGORY_LABEL, monthlyEquivalentCents, type ExpenseCategory } from '@/lib/expenses';
import g from '../admin-glass.module.css';
import c from '../courses/courses.module.css';
import r from '../revenue/revenue.module.css';
import s from './expenses.module.css';
import { TERMS, MSG, CADENCE_WORDS, SESSION_ENDED, loadFailed } from './terms';
import { type Exp, type FilterKey, type HistoryRow, FILTERS, isEnded, cards, pct, nextRenewal, startDay, byCost, parseAmount, historyLine } from './logic';
import { goalPace } from '@/lib/goal-pace';

// ADMIN-REDO Expenses (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Expenses: APPROVED"). Owner only:
// GreenReserve's own costs — what it is, category, how much, how often. Three cards (Monthly costs · <Month> budget ·
// Spent this year), the list beside the picked cost's card (renewal, the details, Edit · End it/Restart · Delete).
// Every number is counted from the Expense rows with src/lib/expenses.ts's proration — never estimated.
// Data (owner-only at every route): /api/admin/expenses (the rows + the monthly budget), PUT …/expenses/budget (step-up),
// …/expenses/[id]/history (each cost's dated log). The budget bar's colour is the shared pace rule (src/lib/goal-pace.ts,
// ADMIN_REDO_SPEC "Goals: one pace rule everywhere"): green on pace to stay under, yellow within 10%, red over.

const usd = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDay = (day: string) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
/** An end is a real instant: its day on the platform clock (ending at 9pm ET on Nov 12 is Nov 12). */
const endDay = (iso: string) => dayKey(new Date(iso));
const catLabel = (k: string) => EXPENSE_CATEGORY_LABEL[k as ExpenseCategory] ?? k;
const PACE_WORDS = { ok: 'On pace to stay under', warn: 'Close to the budget', bad: 'On pace to go over', early: 'Too early to tell' } as const;
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** A change in costs: going up is the bad direction. */
function Change({ now, was, vs }: { now: number; was: number; vs: string }) {
  const p = pct(now, was);
  if (p === null) return <>No comparison with {vs}</>;
  const n = Math.round(p);
  if (n === 0) return <>Same as {vs}</>;
  return <><span className={n > 0 ? g.down : g.up}>{n > 0 ? 'Up' : 'Down'} {Math.abs(n)}%</span> vs {vs}</>;
}

interface Draft { name: string; amount: string; cadence: string; category: string; startedAt: string }
const blank = (): Draft => ({ name: '', amount: '', cadence: 'monthly', category: 'tools', startedAt: todayKey() });

export default function ExpensesPage() {
  const [list, setList] = useState<Exp[] | null>(null);
  const [budget, setBudget] = useState<number | null | undefined>(undefined); // undefined = the route doesn't answer it yet
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('active');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const histFor = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'add'>('view');
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState('');
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null); // null = not editing the budget
  const [budgetErr, setBudgetErr] = useState('');
  const [history, setHistory] = useState<{ id: string; rows: HistoryRow[] | null; err: string; gone: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const res = await fetch('/api/admin/expenses', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.status === 401) setLoadErr(SESSION_ENDED);
      else if (!res.ok || !body) setLoadErr(body?.error ?? loadFailed(res.status));
      else {
        if (!Array.isArray(body.expenses)) { setLoadErr(loadFailed()); setLoading(false); return; }
        setList(body.expenses as Exp[]);
        setBudget(body.budget === undefined ? undefined : (body.budget?.cents ?? null));
      }
    } catch { setLoadErr(loadFailed()); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const loadHistory = useCallback(async (id: string) => {
    histFor.current = id;
    const done = (h: NonNullable<typeof history>) => { if (histFor.current === id) setHistory(h); }; // a later pick wins
    setHistory({ id, rows: null, err: '', gone: false });
    try {
      const res = await fetch(`/api/admin/expenses/${id}/history`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.status === 404 && !body?.error) { done({ id, rows: null, err: '', gone: true }); return; } // route not live yet
      if (res.status === 401) { done({ id, rows: null, err: SESSION_ENDED, gone: false }); return; }
      if (!res.ok || !body) { done({ id, rows: null, err: body?.error ?? MSG.historyFail(res.status), gone: false }); return; }
      if (!Array.isArray(body.history)) { done({ id, rows: null, err: MSG.historyFail(), gone: false }); return; }
      done({ id, rows: body.history as HistoryRow[], err: '', gone: false });
    } catch { done({ id, rows: null, err: MSG.historyFail(), gone: false }); }
  }, []);

  const now = useMemo(() => new Date(), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = useMemo(() => (list ? cards(list, now) : null), [list, now]);
  const shown = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)!;
    return (list ?? []).filter(e => f.test(e, now)).sort(byCost);
  }, [list, filter, now]);
  const picked = (list ?? []).find(e => e.id === pick) ?? (mode === 'add' ? null : shown[0] ?? null);
  const pickedId = picked?.id ?? null;
  useEffect(() => { if (pickedId && list) loadHistory(pickedId); }, [pickedId, list, loadHistory]);
  const filterLabel = FILTERS.find(x => x.key === filter)!.label;
  const monthName = k ? k.monthStart.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long' }) : '';

  const showPanel = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1150) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  function choose(e: Exp) { setPick(e.id); setMode('view'); setActErr(''); showPanel(); }
  function startAdd() { setMode('add'); setDraft(blank()); setActErr(''); showPanel(); }
  function startEdit(e: Exp) {
    setMode('edit'); setActErr('');
    setDraft({ name: e.name, amount: (e.amountCents / 100).toFixed(2), cadence: e.cadence, category: e.category, startedAt: startDay(e.startedAt) });
  }

  async function send(url: string, init: RequestInit, failMsg: string, step = false): Promise<Record<string, unknown> | null> {
    setBusy(true); setActErr('');
    try {
      const res = step ? await stepUpFetch(url, init) : await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { setActErr(SESSION_ENDED); return null; }
      if (!res.ok) { setActErr(body.error || `${failMsg} (error ${res.status}). Try again.`); return null; }
      return body;
    } catch {
      setActErr(`${failMsg} ${MSG.offline}`); return null;
    } finally { setBusy(false); }
  }
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  async function save() {
    const amountCents = parseAmount(draft.amount);
    if (!draft.name.trim()) { setActErr(MSG.noName); return; }
    if (amountCents === null) { setActErr(MSG.badAmount); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startedAt)) { setActErr(MSG.noDate); return; }
    const payload = { name: draft.name.trim(), amountCents, category: draft.category, cadence: draft.cadence, startedAt: `${draft.startedAt}T12:00:00.000Z` };
    const out = mode === 'edit' && picked
      ? await send(`/api/admin/expenses/${picked.id}`, json('PATCH', payload), MSG.saveFail)
      : await send('/api/admin/expenses', json('POST', payload), MSG.addFail);
    if (!out) return;
    const id = (out.expense as Exp | undefined)?.id;
    setMode('view'); if (id) setPick(id);
    await load();
  }

  async function end(e: Exp) {
    if (!confirm(MSG.confirmEnd(e.name))) return;
    if (await send(`/api/admin/expenses/${e.id}`, json('PATCH', { endedAt: new Date().toISOString() }), MSG.endFail)) await load();
  }
  // Restart adds the same cost again from today, so the months it was stopped never count as paid.
  async function restart(e: Exp) {
    const out = await send('/api/admin/expenses', json('POST', { name: e.name, amountCents: e.amountCents, category: e.category, cadence: e.cadence, startedAt: `${todayKey()}T12:00:00.000Z` }), MSG.restartFail);
    if (!out) return;
    const id = (out.expense as Exp | undefined)?.id;
    if (id) { setPick(id); if (filter === 'ended') setFilter('active'); }
    await load();
  }
  async function remove(e: Exp) {
    if (!confirm(MSG.confirmDelete(e.name))) return;
    if (await send(`/api/admin/expenses/${e.id}`, { method: 'DELETE' }, MSG.deleteFail, true)) { setPick(null); setMode('view'); await load(); }
  }

  async function saveBudget(clear = false) {
    const cents = clear ? null : parseAmount(budgetDraft ?? '');
    if (!clear && cents === null) { setBudgetErr(MSG.badBudget); return; }
    setBusy(true); setBudgetErr('');
    try {
      const res = await stepUpFetch('/api/admin/expenses/budget', json('PUT', { cents }));
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) setBudgetErr(SESSION_ENDED);
      else if (!res.ok) setBudgetErr(body.error || `${MSG.budgetFail} (error ${res.status}). Try again.`);
      else { setBudget(body.budget !== undefined ? (body.budget?.cents ?? null) : cents); setBudgetDraft(null); }
    } catch { setBudgetErr(`${MSG.budgetFail} ${MSG.offline}`); }
    setBusy(false);
  }

  // The budget card: spent so far this month against the budget, coloured by the shared pace rule (src/lib/goal-pace.ts).
  const monthDays = k ? (k.monthEnd.getTime() - k.monthStart.getTime()) / 86_400_000 : 0;
  const pace = k && budget ? goalPace({ progress: k.monthSoFar - k.monthOneTime, fixed: k.monthOneTime, target: budget, share: k.elapsedShare, kind: 'cap', daysElapsed: k.elapsedShare * monthDays }) : null;
  const monthLast = k ? new Date(k.monthEnd.getTime() - 3_600_000).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) : '';
  const budgetCard = k && (
    <div className={`${g.glass} ${r.rkc}`}>
      <div className={s.lrow}>
        <span className={r.l} title={TERMS.budget}>{monthName} budget</span>
        {budget !== undefined && budgetDraft === null && (
          <button type="button" className={c.plink} onClick={() => { setBudgetDraft(budget ? (budget / 100).toFixed(2) : ''); setBudgetErr(''); }} disabled={busy}>{budget ? 'Change' : 'Set'}</button>
        )}
      </div>
      {budgetDraft !== null ? (
        <form className={s.bform} onSubmit={e => { e.preventDefault(); if (!busy) saveBudget(); }}>
          <input inputMode="decimal" aria-label="Monthly budget" value={budgetDraft} onChange={e => setBudgetDraft(e.target.value)} placeholder="$0.00" autoFocus />
          <div className={s.btnrow}>
            <button type="submit" className={s.pri} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            {budget ? <button type="button" onClick={() => saveBudget(true)} disabled={busy}>Clear</button> : null}
            <button type="button" onClick={() => { setBudgetDraft(null); setBudgetErr(''); }} disabled={busy}>Cancel</button>
          </div>
          {budgetErr && <p className={s.err} role="alert">{budgetErr}</p>}
        </form>
      ) : budget ? (
        <>
          <b className={r.v}>{usd(k.monthSoFar)} <span className={s.of}>of {usd(budget)}</span></b>
          <div className={s.gbar}><i className={pace && pace.tone !== 'early' ? s[pace.tone] : undefined} style={{ width: `${Math.min(100, (k.monthSoFar / budget) * 100)}%` }} /></div>
          {pace && (pace.tone === 'early'
            ? <span className={r.c}>{PACE_WORDS.early}</span>
            : <span className={r.c}><span className={pace.tone === 'ok' ? g.up : pace.tone === 'warn' ? g.wa : g.down}>{PACE_WORDS[pace.tone]}</span> · {usd(Math.round(pace.projected))} by {monthLast}</span>)}
        </>
      ) : (
        <>
          <b className={r.v}>{usd(k.monthSoFar)} <span className={s.of}>spent so far</span></b>
          <span className={r.c}>Not set</span>
          {budgetErr && <p className={s.err} role="alert">{budgetErr}</p>}
        </>
      )}
    </div>
  );

  function Form({ submit }: { submit: string }) {
    return (
      <form className={s.form} onSubmit={e => { e.preventDefault(); if (!busy) save(); }}>
        <label>What it is<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Vercel" autoFocus /></label>
        <div className={s.row2}>
          <label>How much<input inputMode="decimal" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} placeholder="$0.00" /></label>
          <label>How often
            <select value={draft.cadence} onChange={e => setDraft({ ...draft, cadence: e.target.value })}>
              {EXPENSE_CADENCES.map(x => <option key={x} value={x}>{CADENCE_WORDS[x]}</option>)}
            </select>
          </label>
        </div>
        <div className={s.row2}>
          <label>Category
            <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map(x => <option key={x} value={x}>{EXPENSE_CATEGORY_LABEL[x]}</option>)}
            </select>
          </label>
          <label>Started<input type="date" value={draft.startedAt} onChange={e => setDraft({ ...draft, startedAt: e.target.value })} /></label>
        </div>
        {actErr && <p className={s.err} role="alert">{actErr}</p>}
        <div className={s.btnrow}>
          <button type="submit" className={s.pri} disabled={busy}>{busy ? 'Saving…' : submit}</button>
          <button type="button" onClick={() => { setMode('view'); setActErr(''); }} disabled={busy}>Cancel</button>
        </div>
      </form>
    );
  }

  function Panel() {
    if (mode === 'add') return (<><div className={c.ph}><div className={c.pname}><h2>Add an expense</h2></div></div>{Form({ submit: 'Add' })}</>);
    if (!picked) return <p className={c.muted}>{list && list.length === 0 ? MSG.none : MSG.noneHere}</p>;
    const e = picked;
    const today = todayKey();
    const begins = startDay(e.startedAt);
    const ren = nextRenewal(e, now);
    const ended = isEnded(e, now);
    const endsOn = e.endedAt && !ended ? ` · Ends ${longDay(endDay(e.endedAt))}` : '';
    const when = ended && e.endedAt ? `Finished ${longDay(endDay(e.endedAt))}`
      : e.cadence === 'one-time' ? `Paid once · ${longDay(begins)}`
      : begins > today ? `Starts ${longDay(begins)}`
      : (ren ? (ren.inDays === 0 ? `Renews today · ${longDay(ren.day)}` : `Renews in ${ren.inDays} day${ren.inDays === 1 ? '' : 's'} · ${longDay(ren.day)}`) + endsOn : endsOn.slice(3));
    const per = e.cadence === 'one-time' ? `${usd(e.amountCents)} once`
      : `${usd(monthlyEquivalentCents(e))} a month · ${usd(e.cadence === 'annual' ? e.amountCents : e.amountCents * 12)} a year`;
    return (
      <>
        <div className={c.ph}>
          <div className={c.pname}><h2>{e.name}</h2><p>{catLabel(e.category)}</p></div>
          {mode === 'view' && (
            <div className={c.plinks}>
              <button type="button" className={c.plink} onClick={() => startEdit(e)} disabled={busy}>Edit</button>
              {ended ? e.cadence !== 'one-time' && <button type="button" className={c.plink} onClick={() => restart(e)} disabled={busy}>Restart</button>
                : e.cadence !== 'one-time' && <button type="button" className={c.plink} onClick={() => end(e)} disabled={busy}>End it</button>}
              <button type="button" className={`${c.plink} ${s.pdel}`} onClick={() => remove(e)} disabled={busy}>Delete</button>
            </div>
          )}
        </div>
        <div className={s.estat}><b>{per}</b>{when && <span>{when}</span>}</div>
        {mode === 'edit' ? <div className={c.psec}>{Form({ submit: 'Save' })}</div> : (
          <div className={c.psec}>
            {actErr && <p className={s.err} role="alert">{actErr}</p>}
            <dl className={c.kv}>
              <dt>What it is</dt><dd>{e.name}</dd>
              <dt>Category</dt><dd>{catLabel(e.category)}</dd>
              <dt>How much</dt><dd>{usd(e.amountCents)}</dd>
              <dt>How often</dt><dd>{CADENCE_WORDS[e.cadence] ?? e.cadence}</dd>
              <dt>Started</dt><dd>{longDay(begins)}</dd>
              {e.endedAt && <><dt>{ended ? 'Finished' : 'Ends'}</dt><dd>{longDay(endDay(e.endedAt))}</dd></>}
            </dl>
          </div>
        )}
        {mode === 'view' && history?.id === e.id && !history.gone && !(history.rows && history.rows.length === 0) && (
          <div className={c.psec}>
            <h3>History</h3>
            {history.err ? <p className={s.err} role="alert">{history.err} <button type="button" className={c.plink} onClick={() => loadHistory(e.id)}>Try again</button></p>
              : !history.rows ? <p className={c.muted} aria-busy="true">Loading…</p>
              : <div className={s.log}>{history.rows.map((h, i) => <div key={i}><small>{longDay(dayKey(new Date(h.at)))}</small><span>{historyLine(h, catLabel, CADENCE_WORDS, usd, longDay)}</span></div>)}</div>}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <AdminSidebar active="expenses" />
      <main className={g.main}>
        <div className={g.head}><h1>Expenses</h1></div>

        <div className={s.bar}>
          <div className={c.fwrap} ref={menuRef}>
            <button type="button" className={`${g.glass} ${c.fbtn}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              {filter === 'active' ? 'Filter' : `Filter: ${filterLabel}`}
            </button>
            {menuOpen && (
              <div className={c.fmenu} role="group" aria-label="Show">
                {FILTERS.map(f => (
                  <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setPick(null); setMode('view'); setMenuOpen(false); }}>
                    <span>{f.label}</span><b>{(list ?? []).filter(e => f.test(e, now)).length}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className={`${g.glass} ${c.fbtn}`} onClick={startAdd} disabled={!list}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Add
          </button>
        </div>

        {loadErr && (
          <div className={`${g.glass} ${g.note}`} role="alert">
            <span className={g.down}>{loadErr}</span>
            {loadErr === SESSION_ENDED ? <Link href="/cam">Sign in</Link> : <button type="button" onClick={load} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}

        {!list && !loadErr && <div className={`${g.glass} ${r.skel}`} aria-busy="true" aria-label="Loading expenses" />}

        {list && k && (
          <>
            <div className={r.rk}>
              <div className={`${g.glass} ${r.rkc}`}>
                <span className={r.l} title={TERMS.monthly}>Monthly costs</span>
                <b className={r.v}>{usd(k.monthly)}</b>
                <span className={r.c}><Change now={k.monthly} was={k.monthlyPrior} vs="last month" /></span>
              </div>
              {budgetCard}
              <div className={`${g.glass} ${r.rkc}`}>
                <span className={r.l} title={TERMS.year}>Spent this year</span>
                <b className={r.v}>{usd(k.year)}</b>
                <span className={r.c}><Change now={k.year} was={k.yearPrior} vs="last year by today" /></span>
              </div>
            </div>

            <div className={c.split}>
              <section className={`${g.glass} ${c.dir}`} aria-label="Expenses">
                {shown.length === 0 ? <p className={c.empty}>{list.length === 0 ? MSG.none : MSG.noneHere}</p> : (
                  <table>
                    <thead><tr><th>What it is</th><th className={c.hideS}>Category</th><th className={c.n} title={TERMS.howMuch}>How much</th><th>How often</th></tr></thead>
                    <tbody>
                      {shown.map(e => (
                        <tr key={e.id} className={c.row} tabIndex={0} aria-selected={mode !== 'add' && picked?.id === e.id}
                          onClick={() => choose(e)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(e); } }}>
                          <td><span className={`${c.cname} ${isEnded(e, now) ? s.ended : ''}`}>{e.name}</span>{e.endedAt && <span className={s.tag}> · {isEnded(e, now) ? 'ended' : 'ends'} {longDay(endDay(e.endedAt))}</span>}</td>
                          <td className={`${s.tag} ${c.hideS}`}>{catLabel(e.category)}</td>
                          <td className={`${c.n} ${s.amt}`}>{usd(e.amountCents)}</td>
                          <td className={r.nw}>{CADENCE_WORDS[e.cadence] ?? e.cadence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <section className={`${g.glass} ${c.prof}`} ref={panelRef} aria-label={mode === 'add' ? 'Add an expense' : 'Expense'}>
                {Panel()}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
