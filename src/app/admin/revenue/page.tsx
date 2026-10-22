'use client';
// ADMIN-C Money (Cam 2026-10-22, from the Money mockup he approved: "build it
// as shown"). One page, five tabs, every function the old Revenue page had:
//   Overview       the period's fees, fees by day, your profit (owner), by
//                  course + exports; beside it what needs you, money coming in
//                  today/tomorrow, and late-cancel fees (the course's money)
//   Not collected  cards that failed (retry, charge only), rounds never checked
//                  in, and online rounds paid at the counter (ALL TIME)
//   Disputes       open chargebacks, and whether the period matches Stripe (owner)
//   Payouts        GreenReserve's Stripe balance, payouts and unit economics (owner)
//   Expenses       the company's costs: add, edit, end, delete (owner)
// The period picker drives Overview; Not collected and Disputes are all-time.
// Data: /api/admin/revenue (+ platform-stripe and expenses for the owner).
import { stepUpFetch } from '@/lib/step-up-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EXPENSE_CATEGORIES, EXPENSE_CADENCES, EXPENSE_CATEGORY_LABEL, EXPENSE_CADENCE_LABEL, monthlyEquivalentCents } from '@/lib/expenses';
import { formatMoney as fmtMoney } from '@/lib/format';
import { INPUT_COMPACT } from '@/components/ui/field';

const fmtCount = (n: number) => n.toLocaleString('en-US');

type PeriodKind = 'day' | 'week' | 'mtd' | 'custom';
type Tab = 'overview' | 'uncollected' | 'disputes' | 'payouts' | 'expenses';
interface Delta { pct: number | null; direction: 'up' | 'down' | 'flat' | null }

interface CourseRow {
  courseId: string; name: string; active: boolean; archived: boolean; stripeActive: boolean;
  // MP-6a: two bases, each named. `booked` = rounds made in the period;
  // `collectedRounds` / `serviceFees` = rounds checked in and paid in it.
  // `failedCharges` is ALL-TIME, matching Not collected.
  booked: number; collectedRounds: number; serviceFees: number; greenFeeVolume: number; failedCharges: number;
  // PAY-2: online bookings paid at the counter (cash / course terminal) — GR's fee not collected.
  counterRounds: number; counterFeesUncollected: number;
}
interface FailedCharge {
  bookingId: string; courseId: string; courseName: string; golferName: string; golferEmail: string;
  reason: string; teeDate: string; teeTime: string; amount: number; ourTake: number;
}
interface UpcomingCheckIn {
  bookingId: string; courseId: string; courseName: string; golferName: string; players: number;
  teeDate: string; teeTime: string; ourTake: number; total: number;
}
interface MissedCheckIn {
  bookingId: string; courseId: string; courseName: string; golferName: string; golferEmail: string;
  players: number; teeDate: string; teeTime: string; amount: number; ourTake: number; noShowFeeCharged: boolean;
}
interface Dispute {
  eventId: string; bookingId: string; courseId: string; courseName: string; golferName: string; golferEmail: string;
  teeDate: string; teeTime: string; amount: number; detail: string; openedAt: string;
}
interface LateFee {
  bookingId: string; courseId: string; courseName: string; golferName: string;
  fee: number; status: 'charged' | 'refunded'; teeDate: string; teeTime: string;
}
interface Expense {
  id: string; name: string; category: string; amountCents: number; cadence: string;
  startedAt: string; endedAt: string | null;
}
interface PlatformStripeData {
  balance: { available: number; pending: number; currency: string };
  nextPayout: { amount: number; arrivalDate: string; status: string } | null;
  payouts: { id: string; amount: number; status: string; arrivalDate: string; automatic: boolean }[];
  paidOutRecent: number;
  unitEconomics: {
    charges: number; roundsCollected: number; playersCollected: number; avgPlayersPerRound: number | null;
    grossFeePerCharge: number; stripeCostPerCharge: number; netFeePerCharge: number; takeRate: number | null;
    stripeCostTotal: number; netTotal: number;
  };
  period: string;
}
type SortKey = 'name' | 'booked' | 'collectedRounds' | 'serviceFees' | 'counterFeesUncollected' | 'greenFeeVolume' | 'failedCharges';

interface RevenueData {
  period: { kind: PeriodKind; label: string; from: string; to: string };
  isOwner: boolean;
  ownerMfaRequired?: boolean;
  pnl: {
    feesCollected: number; collectedRounds: number; feesCollectedDelta: Delta;
    bookedPending: number; bookedPendingRounds: number;
    separateFees?: number; separateFeeCharges?: number;
    counterFeesUncollected?: number; counterRoundsUncollected?: number;
    counterFeesUncollectedAllTime?: number; counterRoundsUncollectedAllTime?: number;
    stripeProcessing?: number; stripeUnavailable?: boolean;
    expenses?: number; expensesDelta?: Delta;
    net?: number; netDeltaAbs?: number;
  };
  daily?: { current: number[]; prior: number[] };
  byCourse: CourseRow[];
  moneyInMotion: { upcomingCheckIns: UpcomingCheckIn[]; lateCancelFees: LateFee[]; todayStr: string; tomorrowStr: string };
  problems: { failedCheckIn: FailedCharge[]; missedCheckIn: MissedCheckIn[]; missedTotal: number; missedFees: number; disputes: Dispute[] };
  // reconciles: null = Stripe could not be reached, so nobody knows.
  reconciliation?: { expected: number; actual: number; gap: number; reconciles: boolean | null; unavailable: boolean };
}

const H2 = 'text-[20px] font-bold text-ink';
const TH = 'py-2 pr-4 font-medium text-left';
const BTN = 'text-[13px] font-medium px-3 py-1.5 rounded-md border border-line text-ink hover:border-pine/40 disabled:opacity-40';
const PRIMARY = 'text-[13px] font-medium px-3 py-1.5 rounded-md bg-pine hover:bg-pine-hover text-white disabled:opacity-50';

function deltaText(delta?: Delta): { text: string; cls: string } {
  if (!delta || delta.pct === null || delta.direction === null) return { text: 'nothing to compare yet', cls: 'text-ink-muted' };
  const cls = delta.direction === 'flat' ? 'text-ink-muted' : delta.direction === 'up' ? 'text-ok' : 'text-bad';
  return { text: `${delta.pct >= 0 ? '+' : '−'}${Math.abs(delta.pct).toFixed(0)}% vs the period before`, cls };
}

function Stat({ label, value, note, noteCls = 'text-ink-muted', cls }: { label: string; value: string; note: string; noteCls?: string; cls: string }) {
  return (
    <div className={`p-[18px] border-line ${cls}`}>
      <div className="text-[13.5px] text-ink-soft">{label}</div>
      <div className="mt-1.5 text-[26px] font-medium text-ink tabular-nums">{value}</div>
      <div className={`text-[12.5px] ${noteCls}`}>{note}</div>
    </div>
  );
}

/** Running total of fees through the period: this one solid, the one before dashed. */
function FeesChart({ current, prior, from }: { current: number[]; prior: number[]; from: string }) {
  const W = 800, base = 150, top = 14;
  const cum = (a: number[]) => a.reduce<number[]>((o, v) => [...o, (o.at(-1) ?? 0) + v], []);
  const c = cum(current), p = cum(prior);
  const n = Math.max(current.length, 2);
  const max = Math.max(1, c.at(-1) ?? 0, p.at(-1) ?? 0);
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => base - (v / max) * (base - top);
  const path = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const label = (iso: string, add: number) => {
    const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + add);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  };
  return (
    <>
      <svg viewBox={`0 0 ${W} 160`} preserveAspectRatio="none" className="w-full h-[160px] mt-3" role="img"
        aria-label={`Fees through the period: ${fmtMoney(c.at(-1) ?? 0)} so far, against ${fmtMoney(p.at(-1) ?? 0)} by the same point in the period before`}>
        <line x1="0" y1="156" x2={W} y2="156" stroke="#E3E4DE" />
        {p.length > 1 && <path d={path(p)} fill="none" stroke="#C9CEC8" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />}
        <path d={path(c)} fill="none" stroke="#173B2A" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[12px] text-ink-muted"><span>{label(from, 0)}</span><span>{label(from, n - 1)}</span></div>
    </>
  );
}

export default function MoneyPage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<PeriodKind>('mtd');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const initRef = useRef(false);

  // Expenses
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const blankDraft = () => ({ name: '', category: 'infra', amount: '', cadence: 'monthly', startedAt: new Date().toISOString().slice(0, 10) });
  const [draft, setDraft] = useState(blankDraft);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseBusy, setExpenseBusy] = useState<string | null>(null);

  // Money coming in + Not collected
  const [motionDay, setMotionDay] = useState<'today' | 'tomorrow'>('today');
  const [showAllComing, setShowAllComing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  // By course
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('serviceFees');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showArchived, setShowArchived] = useState(false);

  // Payouts (owner)
  const [platform, setPlatform] = useState<PlatformStripeData | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformError, setPlatformError] = useState('');

  const load = useCallback(async (p: PeriodKind, cFrom: string, cTo: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (p === 'custom' && cFrom && cTo) { params.set('period', 'custom'); params.set('from', cFrom); params.set('to', cTo); }
      else params.set('period', p);
      const res = await fetch(`/api/admin/revenue?${params}`);
      if (res.status === 403) { setError('Money is for support and above.'); setLoading(false); return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || `Couldn’t load Money (${res.status}). Try again.`); setLoading(false); return; }
      setData(await res.json());
    } catch { setError('Network error — check your connection and try again.'); }
    setLoading(false);
  }, []);

  const loadPlatform = useCallback(async () => {
    setPlatformLoading(true); setPlatformError('');
    try {
      const res = await fetch('/api/admin/platform-stripe?period=30d');
      if (!res.ok) { const e = await res.json().catch(() => ({})); setPlatformError(e.error || 'Couldn’t load the Stripe balance.'); setPlatformLoading(false); return; }
      setPlatform(await res.json());
    } catch { setPlatformError('Network error loading the Stripe balance.'); }
    setPlatformLoading(false);
  }, []);

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true); setExpenseError('');
    try {
      const res = await fetch('/api/admin/expenses');
      if (res.ok) setExpenses((await res.json()).expenses);
      else { const e = await res.json().catch(() => ({})); setExpenseError(e.error || 'Couldn’t load expenses.'); }
    } catch { setExpenseError('Network error loading expenses.'); }
    setExpensesLoading(false);
  }, []);

  // ?tab= opens a tab (links from Problems and Home land on the right one).
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'uncollected' || t === 'disputes' || t === 'payouts' || t === 'expenses') setTab(t);
    load('mtd', '', '');
  }, [load]);
  useEffect(() => { if (data?.isOwner && tab === 'payouts' && !platform && !platformLoading && !platformError) loadPlatform(); }, [data?.isOwner, tab, platform, platformLoading, platformError, loadPlatform]);
  useEffect(() => { if (data?.isOwner && tab === 'expenses' && expenses === null && !expensesLoading && !expenseError) loadExpenses(); }, [data?.isOwner, tab, expenses, expensesLoading, expenseError, loadExpenses]);

  function pickTab(t: Tab) {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === 'overview') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
    window.history.replaceState(null, '', u.toString());
  }

  function changePeriod(p: PeriodKind) {
    setPeriod(p);
    if (p !== 'custom') load(p, '', '');
  }

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
      if (res.ok) { resetDraft(); await loadExpenses(); load(period, customFrom, customTo); }
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
      if (res.ok) { await loadExpenses(); load(period, customFrom, customTo); }
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
      if (res.ok) { if (editing?.id === e.id) resetDraft(); await loadExpenses(); load(period, customFrom, customTo); }
      else { const err = await res.json().catch(() => ({})); setExpenseError(err.error || 'Couldn’t delete it.'); }
    } catch {
      setExpenseError('Network error — the expense was not deleted. Try again.');
    } finally {
      setExpenseBusy(null);
    }
  }

  // MP-1 fix-now #5: collects payment only, and says so before moving any money.
  async function retryCharge(p: FailedCharge) {
    const ok = confirm(
      `Charge ${fmtMoney(p.amount)} to ${p.golferName}'s saved card for their ${p.teeDate} ${p.teeTime} round at ${p.courseName}?\n\n`
      + `This collects payment only. They will NOT be checked in and will not be emailed a receipt — `
      + `check them in as normal when they arrive.`
    );
    if (!ok) return;
    setRetryingId(p.bookingId); setRetryMsg(null);
    try {
      const res = await stepUpFetch(`/api/admin/retry-charge/${p.bookingId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkIn: false }),
      });
      if (res.ok) {
        setRetryMsg({ id: p.bookingId, ok: true, text: `Charged ${fmtMoney(p.amount)} to ${p.golferName}. They are NOT checked in — check them in when they arrive.` });
        load(period, customFrom, customTo);
      } else {
        const e = await res.json().catch(() => ({}));
        setRetryMsg({ id: p.bookingId, ok: false, text: e.error || (res.status === 403 ? 'Retrying a charge needs manager access.' : 'The retry failed.') });
      }
    } catch {
      setRetryMsg({ id: p.bookingId, ok: false, text: 'Network error — the card may or may not have been charged. Check Stripe before retrying.' });
    } finally {
      setRetryingId(null);
    }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  const rows = (data?.byCourse ?? [])
    .filter(r => showArchived ? true : !r.archived)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return mul * a.name.localeCompare(b.name);
      return mul * (a[sortKey] - b[sortKey]);
    });

  function exportCsv() {
    if (!data) return;
    // MP-6a: the first line states the period, the basis and every filter in force.
    const header = ['Course', 'Status', 'Booked', 'Rounds collected', 'Fees collected', 'Paid at counter (rounds)', 'Fees not collected (paid at counter)', 'Green fee volume', 'Failed charges (all-time)', 'Stripe'];
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const statusOf = (r: CourseRow) => r.archived ? 'Archived' : r.active ? 'Live' : 'Not live';
    const filters = [search ? `search "${search}"` : null, showArchived ? null : 'archived courses hidden'].filter(Boolean).join('; ');
    const note = `# GreenReserve fees by course · ${data.period.label} (${data.period.from} to ${data.period.to}) · collected basis (rounds checked in and paid)${filters ? ' · filters: ' + filters : ' · no filters'} · ${rows.length} of ${data.byCourse.length} courses`;
    const lines = rows.map(r => [r.name, statusOf(r), String(r.booked), String(r.collectedRounds), r.serviceFees.toFixed(2), String(r.counterRounds), r.counterFeesUncollected.toFixed(2), r.greenFeeVolume.toFixed(2), String(r.failedCharges), r.stripeActive ? 'Connected' : 'Not connected'].map(esc).join(','));
    const csv = [note, header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `greenreserve-fees_${data.period.from}_to_${data.period.to}${filters ? '_filtered' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortHead({ col, label }: { col: SortKey; label: string }) {
    const Icon = sortKey !== col ? ChevronUp : sortDir === 'asc' ? ChevronUp : ChevronDown;
    return (
      <button type="button" onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink">
        {label}<Icon aria-hidden="true" className={'w-3 h-3 ' + (sortKey === col ? 'text-pine' : 'opacity-20')}/>
      </button>
    );
  }

  const pnl = data?.pnl;
  const isOwner = !!data?.isOwner;
  const motion = data?.moneyInMotion;
  const coming = (motion?.upcomingCheckIns ?? []).filter(u => u.teeDate === (motionDay === 'today' ? motion?.todayStr : motion?.tomorrowStr));
  const comingTake = coming.reduce((s, u) => s + u.ourTake, 0);
  const failed = data?.problems.failedCheckIn ?? [];
  const missed = data?.problems.missedCheckIn ?? [];
  const disputes = data?.problems.disputes ?? [];
  const recon = data?.reconciliation;
  const uncollectedCount = failed.length + (data?.problems.missedTotal ?? 0);
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'uncollected', label: 'Not collected', count: uncollectedCount },
    { key: 'disputes', label: 'Disputes', count: disputes.length },
    ...(isOwner ? [{ key: 'payouts' as Tab, label: 'Payouts' }, { key: 'expenses' as Tab, label: 'Expenses' }] : []),
  ];
  const activeExpenses = (expenses ?? []).filter(e => !e.endedAt);
  const monthly = activeExpenses.reduce((s, e) => s + monthlyEquivalentCents(e), 0);
  const byCategory = EXPENSE_CATEGORIES
    .map(c => ({ c, cents: activeExpenses.filter(e => e.category === c).reduce((s, e) => s + monthlyEquivalentCents(e), 0) }))
    .filter(x => x.cents > 0).sort((a, b) => b.cents - a.cents);
  const fc = deltaText(pnl?.feesCollectedDelta);

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar active="revenue"/>
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 pt-6 pb-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="m-0 text-[32px] font-bold tracking-[-0.02em] text-ink leading-none">Money</h1>
              {/* U-A: courses collect their green fees on their own Stripe accounts; none of that is here. */}
              <p className="mt-2 text-[14px] text-ink-soft">GreenReserve&rsquo;s money — not the courses&rsquo;.</p>
            </div>
            {tab === 'overview' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {([['day', 'Day'], ['week', 'Week'], ['mtd', 'Month to date'], ['custom', 'Custom']] as [PeriodKind, string][]).map(([p, lbl]) => (
                  <button key={p} type="button" onClick={() => changePeriod(p)} aria-pressed={period === p}
                    className={'text-[13px] px-3 py-1.5 rounded-md border ' + (period === p ? 'border-pine bg-pine/[0.06] text-pine font-semibold' : 'border-line text-ink-soft hover:text-ink')}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tab === 'overview' && period === 'custom' && (
            <div className="flex items-center gap-2 -mt-2">
              <input type="date" aria-label="From" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={INPUT_COMPACT}/>
              <span className="text-ink-muted text-sm">to</span>
              <input type="date" aria-label="To" value={customTo} onChange={e => setCustomTo(e.target.value)} className={INPUT_COMPACT}/>
              <button type="button" onClick={() => customFrom && customTo && load('custom', customFrom, customTo)} disabled={!customFrom || !customTo} className={PRIMARY}>Show</button>
            </div>
          )}

          <div role="tablist" aria-label="Money" className="flex gap-7 border-b border-line text-[14.5px] overflow-x-auto">
            {tabs.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pickTab(t.key)}
                className={'pb-2.5 -mb-px border-b-2 whitespace-nowrap ' + (tab === t.key ? 'border-fairway text-ink font-semibold' : 'border-transparent text-ink-soft hover:text-ink')}>
                {t.label}{t.count ? <span className="ml-1.5 text-bad font-semibold tabular-nums">{t.count}</span> : null}
              </button>
            ))}
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-[13px] text-bad">{error}</p>
              <button type="button" onClick={() => load(period, customFrom, customTo)} className="text-[13px] font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
            </div>
          )}
          {/* An owner on a session without a second factor sees the support-level page. Say so. */}
          {data?.ownerMfaRequired && (
            <div className="rounded-md border border-warn/20 bg-warn/5 px-4 py-2.5 text-[13px] text-ink flex items-start gap-2">
              <StatusDot status="warn" />
              <span>Your profit, Payouts and Expenses are hidden — this session wasn&rsquo;t confirmed with a second factor. <a href="/cam" className="text-pine font-medium hover:underline">Sign in again</a></span>
            </div>
          )}
          {loading && !data && <p className="py-16 text-center text-ink-muted text-sm">Loading…</p>}

          {/* ── Overview ─────────────────────────────────────────────── */}
          {data && pnl && tab === 'overview' && (
            <div className="flex flex-wrap gap-8 items-start">
              <div className="flex-[1_1_640px] min-w-0 flex flex-col gap-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 border border-line rounded-lg">
                  <Stat cls="border-b sm:border-r" label={`Fees collected · ${data.period.label}`} value={fmtMoney(pnl.feesCollected)} note={fc.text} noteCls={fc.cls} />
                  <Stat cls="border-b" label="Booked, not checked in yet" value={fmtMoney(pnl.bookedPending)}
                    note={`${fmtCount(pnl.bookedPendingRounds)} round${pnl.bookedPendingRounds === 1 ? '' : 's'}, collected at check-in`} />
                  <Stat cls="border-b sm:border-b-0 sm:border-r" label="No-show & late fees" value={fmtMoney(pnl.separateFees ?? 0)}
                    note={`${fmtCount(pnl.separateFeeCharges ?? 0)} charge${pnl.separateFeeCharges === 1 ? '' : 's'}, net of refunds`} />
                  <Stat cls="" label="Paid at the counter" value={fmtMoney(pnl.counterFeesUncollected ?? 0)}
                    note={`${fmtCount(pnl.counterRoundsUncollected ?? 0)} round${pnl.counterRoundsUncollected === 1 ? '' : 's'}, our fee not collected`}
                    noteCls={(pnl.counterRoundsUncollected ?? 0) > 0 ? 'text-warn' : 'text-ink-muted'} />
                </div>

                {data.daily && data.daily.current.length > 1 && (
                  <section>
                    <div className="flex flex-wrap justify-between items-baseline gap-2">
                      <h2 className={H2}>Fees through the period</h2>
                      <span className="text-[12.5px] text-ink-muted flex gap-4">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-[2.5px] bg-pine" />{data.period.label}</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-[#C9CEC8]" />The period before</span>
                      </span>
                    </div>
                    <FeesChart current={data.daily.current} prior={data.daily.prior} from={data.period.from} />
                  </section>
                )}

                {isOwner && pnl.net !== undefined && (
                  <section className="border border-line rounded-lg p-5">
                    <div className="flex justify-between items-baseline">
                      <h2 className={H2}>Your profit</h2>
                      <span className="text-[12.5px] text-ink-muted">Owner only · {data.period.label}</span>
                    </div>
                    <div className="mt-3.5 max-w-[520px] grid grid-cols-[1fr_auto] gap-y-2.5 text-[14.5px] tabular-nums">
                      <span>Fees collected</span><span className="text-right">{fmtMoney(pnl.feesCollected)}</span>
                      {(pnl.separateFees ?? 0) !== 0 && <><span className="text-ink-soft">No-show &amp; late fees</span><span className="text-right text-ink-soft">{fmtMoney(pnl.separateFees ?? 0)}</span></>}
                      <span className="text-ink-soft">Stripe processing{pnl.stripeUnavailable && <span className="ml-1.5 text-[12.5px] text-warn">(Stripe didn&rsquo;t answer — left out)</span>}</span>
                      <span className="text-right text-ink-soft">−{fmtMoney(pnl.stripeProcessing ?? 0)}</span>
                      <span className="text-ink-soft">Expenses <button type="button" onClick={() => pickTab('expenses')} className="ml-1 text-[13px] text-pine hover:underline">see Expenses</button></span>
                      <span className="text-right text-ink-soft">−{fmtMoney(pnl.expenses ?? 0)}</span>
                      <span className="font-semibold border-t border-line pt-2.5">Net</span>
                      <span className={'text-right font-semibold border-t border-line pt-2.5 ' + ((pnl.net ?? 0) < 0 ? 'text-bad' : '')}>
                        {fmtMoney(pnl.net ?? 0)}
                        {pnl.netDeltaAbs !== undefined && (
                          <span className={'ml-2 text-[12.5px] font-medium ' + (pnl.netDeltaAbs > 0 ? 'text-ok' : pnl.netDeltaAbs < 0 ? 'text-bad' : 'text-ink-muted')}>
                            {pnl.netDeltaAbs >= 0 ? '+' : '−'}{fmtMoney(Math.abs(pnl.netDeltaAbs))} vs before
                          </span>
                        )}
                      </span>
                    </div>
                  </section>
                )}

                <section>
                  <div className="flex flex-wrap gap-2.5 justify-between items-center mb-2.5">
                    <h2 className={H2}>By course</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1.5 text-[13px] text-ink-soft cursor-pointer select-none">
                        <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-pine"/>
                        Show archived
                      </label>
                      <div className="relative">
                        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none"/>
                        <input aria-label="Search courses" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search courses" className={INPUT_COMPACT + ' pl-8 w-44'}/>
                      </div>
                      <button type="button" onClick={exportCsv} disabled={rows.length === 0} className={BTN}>Export CSV</button>
                      {/* MP-6c: one row per charge / late fee / refund in the period. Manager+ (the route checks). */}
                      <a href={`/api/admin/transactions/export?from=${data.period.from}&to=${data.period.to}`} className={BTN}
                        title="Every charge, late fee and refund in this period, one row each">Export transactions</a>
                    </div>
                  </div>
                  {rows.length === 0 ? (
                    <p className="py-10 text-center text-ink-muted text-sm">{search ? 'No course matches that search.' : `Nothing collected for ${data.period.label}.`}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[14px] border-collapse">
                        <thead>
                          <tr className="text-[12.5px] border-b border-line">
                            <th className={TH}><SortHead col="name" label="Course"/></th>
                            <th className={TH}><SortHead col="booked" label="Booked"/></th>
                            <th className={TH}><SortHead col="collectedRounds" label="Checked in"/></th>
                            <th className={TH}><SortHead col="serviceFees" label="Fees"/></th>
                            <th className={TH} title="Online bookings paid in cash or on the course's own terminal — our fee not collected"><SortHead col="counterFeesUncollected" label="Paid at counter"/></th>
                            <th className={TH}><SortHead col="greenFeeVolume" label="Green fees through us"/></th>
                            <th className={TH} title="All time — the same list as Not collected"><SortHead col="failedCharges" label="Failed, all time"/></th>
                            <th className={TH + ' text-ink-muted'}>Stripe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.courseId} className="border-b border-line-soft last:border-0">
                              <td className="py-3 pr-4">
                                <Link href={`/admin/courses/${r.courseId}`} className={'font-medium hover:underline underline-offset-2 ' + (r.archived ? 'text-ink-muted' : 'text-ink')}>{r.name}</Link>
                                {r.archived ? <span className="ml-2 text-[12.5px] text-ink-muted">archived</span> : !r.active && <span className="ml-2 text-[12.5px] text-ink-muted">not live</span>}
                              </td>
                              <td className="py-3 pr-4 tabular-nums">{fmtCount(r.booked)}</td>
                              <td className="py-3 pr-4 tabular-nums">{fmtCount(r.collectedRounds)}</td>
                              <td className="py-3 pr-4 tabular-nums font-medium">{fmtMoney(r.serviceFees)}</td>
                              <td className="py-3 pr-4 tabular-nums">{r.counterRounds > 0 ? <>{fmtMoney(r.counterFeesUncollected)} <span className="text-ink-muted">· {fmtCount(r.counterRounds)}</span></> : <span className="text-ink-faint">—</span>}</td>
                              <td className="py-3 pr-4 tabular-nums">{fmtMoney(r.greenFeeVolume)}</td>
                              <td className="py-3 pr-4 tabular-nums">{r.failedCharges > 0 ? <button type="button" onClick={() => pickTab('uncollected')} className="text-bad font-medium hover:underline">{r.failedCharges}</button> : <span className="text-ink-faint">—</span>}</td>
                              <td className="py-3"><StatusDot status={r.stripeActive ? 'ok' : 'bad'} label={r.stripeActive ? 'Connected' : 'Not connected'}/></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[12px] text-ink-muted">{rows.length} course{rows.length !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}{!showArchived ? ' · archived hidden' : ''} · {data.period.label}</p>
                    </div>
                  )}
                </section>
              </div>

              <aside className="flex-[0_1_340px] min-w-[280px] bg-paper rounded-lg p-5 flex flex-col gap-[18px] text-[14px]">
                <div>
                  <h2 className="text-[16px] font-semibold text-ink">Needs you</h2>
                  <div className="mt-2.5 flex flex-col gap-2">
                    {failed.length > 0 && (
                      <button type="button" onClick={() => pickTab('uncollected')} className="flex justify-between gap-3 text-left hover:underline">
                        <span>{failed.length} card{failed.length === 1 ? '' : 's'} declined</span>
                        <span className="text-bad tabular-nums">{fmtMoney(failed.reduce((s, f) => s + f.amount, 0))}</span>
                      </button>
                    )}
                    {data.problems.missedTotal > 0 && (
                      <button type="button" onClick={() => pickTab('uncollected')} className="flex justify-between gap-3 text-left hover:underline">
                        <span>{data.problems.missedTotal} round{data.problems.missedTotal === 1 ? '' : 's'} never checked in</span>
                        <span className="text-warn tabular-nums">{fmtMoney(data.problems.missedFees)}</span>
                      </button>
                    )}
                    {disputes.length > 0 && (
                      <button type="button" onClick={() => pickTab('disputes')} className="flex justify-between gap-3 text-left hover:underline">
                        <span>{disputes.length} open dispute{disputes.length === 1 ? '' : 's'}</span>
                        <span className="text-bad tabular-nums">{fmtMoney(disputes.reduce((s, d) => s + d.amount, 0))}</span>
                      </button>
                    )}
                    {isOwner && recon && recon.reconciles === false && (
                      <button type="button" onClick={() => pickTab('disputes')} className="flex justify-between gap-3 text-left hover:underline">
                        <span>Fees don&rsquo;t match Stripe</span><span className="text-bad tabular-nums">{fmtMoney(Math.abs(recon.gap))} off</span>
                      </button>
                    )}
                    {isOwner && recon && recon.reconciles === null && <span className="text-warn">Couldn&rsquo;t check this period against Stripe.</span>}
                    {failed.length === 0 && data.problems.missedTotal === 0 && disputes.length === 0 && (!isOwner || !recon || recon.reconciles === true) && (
                      <span className="flex items-center gap-2"><StatusDot status="ok" />Nothing waiting{isOwner && recon ? ', and this period matches Stripe' : ''}.</span>
                    )}
                  </div>
                </div>

                <div className="border-t border-line pt-4">
                  <div className="flex justify-between items-baseline">
                    <h2 className="text-[16px] font-semibold text-ink">Coming in</h2>
                    <span className="text-[13px] flex gap-2">
                      {(['today', 'tomorrow'] as const).map(d => (
                        <button key={d} type="button" onClick={() => { setMotionDay(d); setShowAllComing(false); }} aria-pressed={motionDay === d}
                          className={'capitalize ' + (motionDay === d ? 'font-semibold text-pine' : 'text-ink-soft hover:text-ink')}>{d}</button>
                      ))}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[24px] font-medium tabular-nums">{fmtMoney(comingTake)}</div>
                  <div className="text-[12.5px] text-ink-muted">our take from {coming.length} check-in{coming.length === 1 ? '' : 's'} {motionDay}</div>
                  {coming.length > 0 && (
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {(showAllComing ? coming : coming.slice(0, 5)).map(u => (
                        <Link key={u.bookingId} href={`/admin/courses/${u.courseId}`} className="flex justify-between gap-3 hover:underline">
                          <span className="truncate">{u.teeTime} · {u.golferName} · {u.courseName}</span>
                          <span className="tabular-nums shrink-0">{fmtMoney(u.ourTake)}</span>
                        </Link>
                      ))}
                      {coming.length > 5 && (
                        <button type="button" onClick={() => setShowAllComing(v => !v)} className="self-start text-[13px] text-pine hover:underline">
                          {showAllComing ? 'Show fewer' : `All ${coming.length}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {(motion?.lateCancelFees.length ?? 0) > 0 && (
                  <div className="border-t border-line pt-4">
                    <h2 className="text-[16px] font-semibold text-ink">Late-cancel fees</h2>
                    {/* Charged with applicationFeeCents 0 — the course's money, refunded if the golfer checks in anyway. */}
                    <p className="mt-1 text-[12.5px] text-ink-muted">The course keeps these; GreenReserve takes $0.</p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {motion!.lateCancelFees.slice(0, 8).map(f => (
                        <Link key={f.bookingId} href={`/admin/courses/${f.courseId}`} className="flex justify-between gap-3 hover:underline">
                          <span className="truncate">{f.golferName} · {f.courseName} · {f.teeDate}</span>
                          <span className={'shrink-0 tabular-nums ' + (f.status === 'refunded' ? 'text-ink-muted' : '')}>{f.status === 'refunded' ? 'refunded' : fmtMoney(f.fee)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}

          {/* ── Not collected (all time) ─────────────────────────────── */}
          {data && tab === 'uncollected' && (
            <div className="flex flex-col gap-8">
              <p className="-mt-2 text-[14px] text-ink-soft">Money a golfer owes that hasn&rsquo;t reached anyone yet. All time — the period doesn&rsquo;t apply here.</p>

              <section>
                <div className="flex flex-wrap justify-between items-baseline gap-2">
                  <h2 className={H2}>Cards that failed {failed.length > 0 && <span className="font-medium text-bad">{failed.length} · {fmtMoney(failed.reduce((s, f) => s + f.amount, 0))}</span>}</h2>
                  <span className="text-[13px] text-ink-muted">Retrying charges the card only — it never checks them in</span>
                </div>
                {/* MP-1b B4: above the list so a successful retry (which drops the row) can't hide the message. */}
                {retryMsg && (
                  <div role="status" className={'mt-3 rounded-md px-4 py-2.5 flex items-start justify-between gap-3 ' + (retryMsg.ok ? 'bg-ok/5 border border-ok/20' : 'bg-bad/5 border border-bad/20')}>
                    <p className={'text-[13px] ' + (retryMsg.ok ? 'text-ok' : 'text-bad')}>{retryMsg.text}</p>
                    <button type="button" onClick={() => setRetryMsg(null)} className="text-ink-muted hover:text-ink shrink-0" aria-label="Dismiss"><X aria-hidden="true" className="w-3.5 h-3.5"/></button>
                  </div>
                )}
                {failed.length === 0 ? (
                  <p className="mt-3 text-[14px] text-ink flex items-center gap-2"><StatusDot status="ok" />Every card we tried went through.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px] border-collapse mt-3">
                      <thead><tr className="text-[12.5px] text-ink-muted border-b border-line"><th className={TH}>Golfer</th><th className={TH}>Course</th><th className={TH}>Round</th><th className={TH}>Why it failed</th><th className={TH}>Owed</th><th></th></tr></thead>
                      <tbody>
                        {failed.map(p => (
                          <tr key={p.bookingId} className="border-b border-line-soft last:border-0 align-top">
                            <td className="py-3 pr-4">{p.golferName}<div className="text-[12.5px] text-ink-muted">{p.golferEmail}</div></td>
                            <td className="py-3 pr-4"><Link href={`/admin/courses/${p.courseId}`} className="hover:underline">{p.courseName}</Link></td>
                            <td className="py-3 pr-4 tabular-nums">{p.teeDate} · {p.teeTime}</td>
                            <td className="py-3 pr-4 text-bad">{p.reason}</td>
                            <td className="py-3 pr-4 tabular-nums font-medium">{fmtMoney(p.amount)}</td>
                            <td className="py-3 text-right">
                              <button type="button" onClick={() => retryCharge(p)} disabled={retryingId !== null} className={PRIMARY}>
                                {retryingId === p.bookingId ? 'Charging…' : 'Retry charge'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[12.5px] text-ink-muted">A hard decline needs a new card or payment in person. Each course with a declined card is also on <Link href="/admin/problems" className="text-pine hover:underline">Problems</Link>, where someone takes it.</p>
                  </div>
                )}
              </section>

              <section>
                <h2 className={H2}>Rounds never checked in {data.problems.missedTotal > 0 && <span className="font-medium text-warn">{data.problems.missedTotal} · {fmtMoney(data.problems.missedFees)} of our fee</span>}</h2>
                <p className="mt-1 text-[13px] text-ink-soft">The tee time passed and nobody checked them in or marked a no-show, so nothing was charged. Either they played and the course forgot (it can still check them in — the card is on file), or it was a no-show.</p>
                {missed.length === 0 ? (
                  <p className="mt-3 text-[14px] text-ink flex items-center gap-2"><StatusDot status="ok" />Every past tee time was checked in or marked.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px] border-collapse mt-3">
                      <thead><tr className="text-[12.5px] text-ink-muted border-b border-line"><th className={TH}>Golfer</th><th className={TH}>Course</th><th className={TH}>Round</th><th className={TH}>Players</th><th className={TH}>Round total</th><th className={TH}>Our fee</th></tr></thead>
                      <tbody>
                        {missed.slice(0, 25).map(m => (
                          <tr key={m.bookingId} className="border-b border-line-soft last:border-0">
                            <td className="py-3 pr-4">{m.golferName}</td>
                            <td className="py-3 pr-4"><Link href={`/admin/courses/${m.courseId}`} className="hover:underline">{m.courseName}</Link></td>
                            <td className="py-3 pr-4 tabular-nums">{m.teeDate} · {m.teeTime}{m.noShowFeeCharged && <span className="ml-2 text-[12.5px] text-ink-muted">no-show fee went to the course</span>}</td>
                            <td className="py-3 pr-4 tabular-nums">{m.players}</td>
                            <td className="py-3 pr-4 tabular-nums">{fmtMoney(m.amount)}</td>
                            <td className="py-3 tabular-nums">{fmtMoney(m.ourTake)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.problems.missedTotal > 25 && <p className="mt-2 text-[12.5px] text-ink-muted">The 25 most recent of {data.problems.missedTotal}.</p>}
                  </div>
                )}
              </section>

              <section>
                <h2 className={H2}>Paid at the counter</h2>
                {/* PAY-2 (Cam 2026-10-06): eaten on purpose — counted, never chased. */}
                <p className="mt-1 text-[13px] text-ink-soft">Online bookings the golfer paid in cash or on the course&rsquo;s own terminal. We chose to eat these: they&rsquo;re counted here, never chased.</p>
                <div className="mt-3 flex gap-10 text-[14px]">
                  <div>
                    <div className="text-[12.5px] text-ink-muted">{data.period.label}</div>
                    <div className="text-[22px] font-medium tabular-nums">{fmtMoney(pnl?.counterFeesUncollected ?? 0)} <span className="text-[13px] font-normal text-ink-muted">{fmtCount(pnl?.counterRoundsUncollected ?? 0)} rounds</span></div>
                  </div>
                  <div>
                    <div className="text-[12.5px] text-ink-muted">All time</div>
                    <div className="text-[22px] font-medium tabular-nums">{fmtMoney(pnl?.counterFeesUncollectedAllTime ?? 0)} <span className="text-[13px] font-normal text-ink-muted">{fmtCount(pnl?.counterRoundsUncollectedAllTime ?? 0)} rounds</span></div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ── Disputes ─────────────────────────────────────────────── */}
          {data && tab === 'disputes' && (
            <div className="flex flex-col gap-8">
              <section>
                <h2 className={H2}>Open disputes {disputes.length > 0 && <span className="font-medium text-bad">{disputes.length} · {fmtMoney(disputes.reduce((s, d) => s + d.amount, 0))}</span>}</h2>
                <p className="mt-1 text-[13px] text-ink-soft">The golfer&rsquo;s bank reversed the charge until it sees evidence. Answer each one in Stripe before its deadline — an unanswered dispute is lost, and the course pays the bank&rsquo;s fee on top.</p>
                {disputes.length === 0 ? (
                  <p className="mt-3 text-[14px] text-ink flex items-center gap-2"><StatusDot status="ok" />No open disputes.</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-3">
                    {disputes.map(d => (
                      <div key={d.eventId} className="border border-line rounded-lg p-5 flex flex-wrap gap-6 justify-between">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-bad">Opened {new Date(d.openedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}</div>
                          <div className="mt-1 text-[20px] font-bold">{fmtMoney(d.amount)} · <Link href={`/admin/courses/${d.courseId}`} className="hover:underline">{d.courseName}</Link></div>
                          <p className="mt-1 text-[14px] text-ink-soft">{d.golferName} ({d.golferEmail}) · round {d.teeDate} {d.teeTime}</p>
                          {d.detail && <p className="mt-1 text-[13px] text-bad">{d.detail}</p>}
                        </div>
                        <div className="self-start">
                          <a href="https://dashboard.stripe.com/disputes" target="_blank" rel="noopener noreferrer" className={PRIMARY + ' inline-flex items-center gap-1.5'}>
                            Respond in Stripe<ExternalLink aria-hidden="true" className="w-3.5 h-3.5"/>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {isOwner && recon && (
                <section className="border-t border-line pt-6">
                  <h2 className={H2}>Do our numbers match Stripe?</h2>
                  <p className="mt-1 text-[13px] text-ink-soft">The fees we recorded for {data.period.label.toLowerCase()} against what Stripe shows as our fees for the same days. Same event, same clock — a gap means money is really missing.</p>
                  <div className="mt-3 flex flex-wrap gap-10 text-[14px]">
                    <div><div className="text-[12.5px] text-ink-muted">We recorded</div><div className="text-[22px] font-medium tabular-nums">{fmtMoney(recon.expected)}</div></div>
                    <div><div className="text-[12.5px] text-ink-muted">Stripe shows</div><div className="text-[22px] font-medium tabular-nums">{recon.unavailable ? '—' : fmtMoney(recon.actual)}</div></div>
                    <div>
                      <div className="text-[12.5px] text-ink-muted">Result</div>
                      <div className="mt-1.5">
                        {recon.reconciles === true && <StatusDot status="ok" label="Matches" />}
                        {recon.reconciles === false && <StatusDot status="bad" label={`${fmtMoney(Math.abs(recon.gap))} ${recon.gap > 0 ? 'short' : 'over'}`} />}
                        {recon.reconciles === null && <StatusDot status="warn" label="Stripe didn’t answer — not checked" />}
                      </div>
                    </div>
                  </div>
                  {recon.reconciles === false && (
                    <p className="mt-3 text-[13px] text-ink-soft">
                      {failed.length > 0
                        ? 'A charge that failed after we recorded it is the usual cause — start with Not collected.'
                        : 'No failed charges, so it is most likely a refund landing in this window or a payout at the edge of the period. Check the Stripe balance.'}
                    </p>
                  )}
                  <p className="mt-2 text-[12.5px] text-ink-muted">Pick a different period on Overview to check another stretch.</p>
                </section>
              )}
            </div>
          )}

          {/* ── Payouts (owner) ──────────────────────────────────────── */}
          {data && isOwner && tab === 'payouts' && (
            <div className="flex flex-col gap-8">
              <section>
                <div className="flex justify-between items-baseline gap-3">
                  <h2 className={H2}>To GreenReserve&rsquo;s bank</h2>
                  <a href="https://dashboard.stripe.com/balance" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13.5px] text-pine hover:underline">Open Stripe dashboard<ExternalLink aria-hidden="true" className="w-3 h-3"/></a>
                </div>
                {platformError && (
                  <div role="alert" className="mt-3 rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex justify-between gap-3">
                    <p className="text-[13px] text-bad">{platformError}</p>
                    <button type="button" onClick={loadPlatform} className="text-[13px] font-medium text-ink-soft hover:text-ink">Try again</button>
                  </div>
                )}
                {platformLoading && !platform && <p className="py-8 text-center text-ink-muted text-sm">Loading the Stripe balance…</p>}
                {platform && (
                  <>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 border border-line rounded-lg">
                      <Stat cls="border-b sm:border-b-0 sm:border-r" label="Available" value={fmtMoney(platform.balance.available)} note={`${fmtMoney(platform.balance.pending)} pending`} />
                      <Stat cls="border-b sm:border-b-0 sm:border-r" label="Next payout" value={platform.nextPayout ? fmtMoney(platform.nextPayout.amount) : '—'}
                        note={platform.nextPayout ? `${platform.nextPayout.arrivalDate} · ${platform.nextPayout.status.replace('_', ' ')}` : 'None scheduled'} />
                      <Stat cls="" label={`Paid out, last ${platform.payouts.length}`} value={fmtMoney(platform.paidOutRecent)} note="money that reached the bank" />
                    </div>
                    {platform.payouts.length === 0 ? (
                      <p className="mt-3 text-[14px] text-ink-soft">No payouts yet.</p>
                    ) : (
                      <table className="mt-3 w-full max-w-[640px] text-[14px] border-collapse">
                        <tbody>
                          {platform.payouts.map(p => (
                            <tr key={p.id} className="border-b border-line-soft last:border-0">
                              <td className="py-2.5 pr-4 tabular-nums">{p.arrivalDate}</td>
                              <td className="py-2.5 pr-4"><StatusDot status={p.status === 'paid' ? 'ok' : p.status === 'failed' || p.status === 'canceled' ? 'bad' : 'warn'} label={p.status.replace('_', ' ')} /></td>
                              <td className="py-2.5 text-right tabular-nums">{fmtMoney(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </section>

              {platform && (
                <section className="border-t border-line pt-6">
                  <h2 className={H2}>What each charge earns us <span className="text-[13px] font-normal text-ink-muted">last {platform.period}</span></h2>
                  {platform.unitEconomics.charges === 0 ? (
                    <p className="mt-3 text-[14px] text-ink-soft">No fees collected in this stretch yet.</p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-[14px]">
                        <div><div className="text-[12.5px] text-ink-muted">Charges</div><div className="text-[20px] font-medium tabular-nums">{fmtCount(platform.unitEconomics.charges)}</div></div>
                        <div><div className="text-[12.5px] text-ink-muted">Players per round</div><div className="text-[20px] font-medium tabular-nums">{platform.unitEconomics.avgPlayersPerRound !== null ? platform.unitEconomics.avgPlayersPerRound.toFixed(1) : '—'}</div></div>
                        <div><div className="text-[12.5px] text-ink-muted">Our fee per charge</div><div className="text-[20px] font-medium tabular-nums">{fmtMoney(platform.unitEconomics.grossFeePerCharge)}</div></div>
                        <div><div className="text-[12.5px] text-ink-muted">Stripe&rsquo;s cut</div><div className="text-[20px] font-medium tabular-nums">−{fmtMoney(platform.unitEconomics.stripeCostPerCharge)}</div></div>
                        <div><div className="text-[12.5px] text-ink-muted">We keep</div><div className="text-[20px] font-medium tabular-nums">{fmtMoney(platform.unitEconomics.netFeePerCharge)}{platform.unitEconomics.takeRate !== null ? ` · ${(platform.unitEconomics.takeRate * 100).toFixed(0)}%` : ''}</div></div>
                        <div><div className="text-[12.5px] text-ink-muted">Net</div><div className="text-[20px] font-medium tabular-nums">{fmtMoney(platform.unitEconomics.netTotal)}</div></div>
                      </div>
                      <p className="mt-3 text-[12.5px] text-ink-muted">Stripe takes a fixed amount plus a percentage of each fee, so a one-player round nets far less than a foursome. {fmtMoney(platform.unitEconomics.stripeCostTotal)} went to Stripe in this stretch.</p>
                    </>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ── Expenses (owner) ─────────────────────────────────────── */}
          {data && isOwner && tab === 'expenses' && (
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
          )}
        </div>
      </div>
    </div>
  );
}
