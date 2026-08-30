'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, AlertTriangle, X, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus,
  RotateCw, Clock, CheckCircle2, Search, ChevronUp, ChevronDown, Download, Landmark, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EXPENSE_CATEGORIES, EXPENSE_CADENCES, EXPENSE_CATEGORY_LABEL, EXPENSE_CADENCE_LABEL } from '@/lib/expenses';

const fmtMoney = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCount = (n: number) => n.toLocaleString('en-US');

type PeriodKind = 'day' | 'week' | 'mtd' | 'custom';
interface Delta { pct: number | null; direction: 'up' | 'down' | 'flat' | null }

interface CourseRow {
  courseId: string; name: string; active: boolean; archived: boolean; stripeActive: boolean;
  bookings: number; serviceFees: number; greenFeeVolume: number; failedCharges: number;
}
interface FailedCharge {
  bookingId: string; courseId: string; courseName: string; golferName: string; golferEmail: string;
  reason: string; teeDate: string; teeTime: string; amount: number; ourTake: number;
}
interface UpcomingCheckIn {
  bookingId: string; courseId: string; courseName: string; golferName: string; players: number;
  teeDate: string; teeTime: string; ourTake: number; total: number;
}
interface PendingFee {
  bookingId: string; courseId: string; courseName: string; golferName: string;
  fee: number; status: 'charged' | 'pending'; teeDate: string; teeTime: string;
}
interface Expense {
  id: string; name: string; category: string; amountCents: number; cadence: string;
  startedAt: string; endedAt: string | null;
}
interface PlatformStripeData {
  balance: { available: number; pending: number; currency: string };
  nextPayout: { amount: number; arrivalDate: string; status: string } | null;
  period: string;
}
type SortKey = 'name' | 'bookings' | 'serviceFees' | 'greenFeeVolume' | 'failedCharges';

interface RevenueData {
  period: { kind: PeriodKind; label: string; from: string; to: string };
  isOwner: boolean;
  ownerMfaRequired?: boolean;
  pnl: {
    feesEarned: number; feesEarnedDelta: Delta;
    stripeProcessing?: number; stripeUnavailable?: boolean;
    expenses?: number; expensesDelta?: Delta;
    net?: number; netDelta?: Delta;
  };
  byCourse: CourseRow[];
  moneyInMotion: { upcomingCheckIns: UpcomingCheckIn[]; pendingLateCancelFees: PendingFee[]; todayStr: string; tomorrowStr: string };
  problems: { failedCheckIn: FailedCharge[] };
  reconciliation?: { expected: number; actual: number; gap: number; reconciles: boolean; unavailable: boolean; composingBookingIds: string[] };
}

const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function DeltaBadge({ delta, goodWhenUp = true }: { delta?: Delta; goodWhenUp?: boolean }) {
  if (!delta || delta.pct === null || delta.direction === null) {
    return <span className="text-[11px] text-ink-faint">— no prior</span>;
  }
  const good = delta.direction === 'flat' ? null : (delta.direction === 'up') === goodWhenUp;
  const color = good === null ? 'text-ink-muted' : good ? 'text-ok' : 'text-bad';
  const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${color}`}>
      <Icon className="w-3 h-3" />{delta.pct >= 0 ? '+' : ''}{delta.pct.toFixed(0)}% vs prior
    </span>
  );
}

export default function RevenuePage() {
  const router = useRouter();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<PeriodKind>('mtd');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const initRef = useRef(false);

  // Expenses drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [draft, setDraft] = useState({ name: '', category: 'infra', amount: '', cadence: 'monthly' });
  const [savingExpense, setSavingExpense] = useState(false);

  // Money in motion + problems
  const [motionDay, setMotionDay] = useState<'today' | 'tomorrow'>('today');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  // Per-course table
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('serviceFees');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showArchived, setShowArchived] = useState(false);

  // Platform Stripe reference card (owner)
  const [platform, setPlatform] = useState<PlatformStripeData | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformError, setPlatformError] = useState('');

  const load = useCallback(async (p: PeriodKind, cFrom: string, cTo: string) => {
    setLoading(true);
    setError('');
    try {
      const sRes = await fetch('/api/admin/session');
      if (!sRes.ok) { router.push('/admin/login'); return; }
      const params = new URLSearchParams();
      if (p === 'custom' && cFrom && cTo) { params.set('period', 'custom'); params.set('from', cFrom); params.set('to', cTo); }
      else params.set('period', p);
      const res = await fetch(`/api/admin/revenue?${params}`);
      if (res.status === 403) { setError('This page requires elevated permissions.'); setLoading(false); return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || `Failed to load revenue (${res.status})`); setLoading(false); return; }
      setData(await res.json());
    } catch { setError('Network error — check your connection and try again.'); }
    setLoading(false);
  }, [router]);

  const loadPlatform = useCallback(async () => {
    setPlatformLoading(true); setPlatformError('');
    try {
      const res = await fetch('/api/admin/platform-stripe?period=30d');
      if (!res.ok) { const e = await res.json().catch(() => ({})); setPlatformError(e.error || 'Could not load Stripe balance.'); setPlatformLoading(false); return; }
      setPlatform(await res.json());
    } catch { setPlatformError('Network error loading Stripe balance.'); }
    setPlatformLoading(false);
  }, []);

  useEffect(() => { if (!initRef.current) { initRef.current = true; load('mtd', '', ''); } }, [load]);
  useEffect(() => { if (data?.isOwner && !platform && !platformLoading && !platformError) loadPlatform(); }, [data?.isOwner, platform, platformLoading, platformError, loadPlatform]);

  function changePeriod(p: PeriodKind) {
    setPeriod(p);
    if (p !== 'custom') load(p, '', '');
  }

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true); setExpenseError('');
    const res = await fetch('/api/admin/expenses');
    if (res.ok) setExpenses((await res.json()).expenses);
    else { const e = await res.json().catch(() => ({})); setExpenseError(e.error || 'Could not load expenses.'); }
    setExpensesLoading(false);
  }, []);

  function openDrawer() { setDrawerOpen(true); loadExpenses(); resetDraft(); }
  function resetDraft() { setEditing(null); setDraft({ name: '', category: 'infra', amount: '', cadence: 'monthly' }); setExpenseError(''); }
  function startEdit(e: Expense) {
    setEditing(e);
    setDraft({ name: e.name, category: e.category, amount: (e.amountCents / 100).toString(), cadence: e.cadence });
  }

  async function saveExpense() {
    const amountCents = Math.round(parseFloat(draft.amount) * 100);
    if (!draft.name.trim()) { setExpenseError('Name is required.'); return; }
    if (!Number.isFinite(amountCents) || amountCents <= 0) { setExpenseError('Amount must be a positive number.'); return; }
    setSavingExpense(true); setExpenseError('');
    const body = JSON.stringify({ name: draft.name.trim(), category: draft.category, amountCents, cadence: draft.cadence });
    const res = editing
      ? await fetch(`/api/admin/expenses/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
      : await fetch('/api/admin/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    setSavingExpense(false);
    if (res.ok) { resetDraft(); await loadExpenses(); load(period, customFrom, customTo); }
    else { const e = await res.json().catch(() => ({})); setExpenseError(e.error || 'Could not save.'); }
  }

  async function endExpense(e: Expense) {
    const res = await fetch(`/api/admin/expenses/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endedAt: new Date().toISOString() }) });
    if (res.ok) { await loadExpenses(); load(period, customFrom, customTo); }
    else { const err = await res.json().catch(() => ({})); setExpenseError(err.error || 'Could not update.'); }
  }
  async function deleteExpense(e: Expense) {
    const res = await fetch(`/api/admin/expenses/${e.id}`, { method: 'DELETE' });
    if (res.ok) { await loadExpenses(); load(period, customFrom, customTo); }
    else { const err = await res.json().catch(() => ({})); setExpenseError(err.error || 'Could not delete.'); }
  }

  // MP-1 fix-now #5: this used to silently check the golfer in and email them
  // a receipt for a round they had not played, because the endpoint was
  // performCheckIn verbatim. It now collects payment only, and says so before
  // moving any money.
  async function retryCharge(p: FailedCharge) {
    const ok = confirm(
      `Charge ${fmtMoney(p.amount)} to ${p.golferName}'s saved card for their ${p.teeDate} ${p.teeTime} round at ${p.courseName}?

`
      + `This collects payment only. They will NOT be checked in and will not be emailed a receipt — `
      + `check them in as normal when they arrive.`
    );
    if (!ok) return;
    setRetryingId(p.bookingId); setRetryMsg(null);
    // MP-1b B3: no try/catch meant a dropped connection left the button spinning
    // "Retrying…" forever with no message — on a money action, where the operator
    // most needs to know whether the card was charged.
    try {
      const res = await fetch(`/api/admin/retry-charge/${p.bookingId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkIn: false }),
      });
      if (res.ok) {
        setRetryMsg({ id: p.bookingId, ok: true, text: `Charged ${fmtMoney(p.amount)} to ${p.golferName}. They are NOT checked in — check them in when they arrive.` });
        load(period, customFrom, customTo);
      } else {
        const e = await res.json().catch(() => ({}));
        setRetryMsg({ id: p.bookingId, ok: false, text: e.error || 'Retry failed.' });
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
    const header = ['Course', 'Status', 'Bookings', 'Service fees', 'Green fee volume', 'Failed charges', 'Stripe'];
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const statusOf = (r: CourseRow) => r.archived ? 'Archived' : r.active ? 'Live' : 'Offline';
    const lines = rows.map(r => [r.name, statusOf(r), String(r.bookings), r.serviceFees.toFixed(2), r.greenFeeVolume.toFixed(2), String(r.failedCharges), r.stripeActive ? 'Connected' : 'Not connected'].map(esc).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `greenreserve-revenue_${data.period.from}_to_${data.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortHead({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    const Icon = sortKey !== col ? ChevronUp : sortDir === 'asc' ? ChevronUp : ChevronDown;
    return (
      <button onClick={() => toggleSort(col)} className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] text-ink-muted hover:text-ink transition-colors ${right ? 'ml-auto' : ''}`}>
        {label}<Icon className={'w-3 h-3 ' + (sortKey === col ? 'text-pine' : 'opacity-20')}/>
      </button>
    );
  }

  const pnl = data?.pnl;
  const isOwner = data?.isOwner;
  const motion = data?.moneyInMotion;
  const upcoming = (motion?.upcomingCheckIns ?? []).filter(u => u.teeDate === (motionDay === 'today' ? motion?.todayStr : motion?.tomorrowStr));
  const upcomingTake = upcoming.reduce((s, u) => s + u.ourTake, 0);
  const failed = data?.problems.failedCheckIn ?? [];
  const composingIds = new Set(data?.reconciliation?.composingBookingIds ?? []);

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="revenue"/>
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
          {/* Header + one period picker that rules the whole page */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">Admin</p>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Revenue</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-white border border-line rounded-md p-1">
                {([['day', 'Day'], ['week', 'Week'], ['mtd', 'Month to date'], ['custom', 'Custom']] as [PeriodKind, string][]).map(([p, lbl]) => (
                  <button key={p} onClick={() => changePeriod(p)}
                    className={'px-3 py-1.5 rounded text-[11px] font-medium transition-colors ' + (period === p ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}>
                    {lbl}
                  </button>
                ))}
              </div>
              <button onClick={() => load(period, customFrom, customTo)}
                className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
                <RefreshCw className="w-4 h-4"/>Refresh
              </button>
            </div>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 mb-6">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={iCls}/>
              <span className="text-ink-muted text-sm">–</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={iCls}/>
              <button onClick={() => customFrom && customTo && load('custom', customFrom, customTo)} disabled={!customFrom || !customTo}
                className="bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors">Load</button>
            </div>
          )}

          {error && (
            <div className="bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad mb-5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0"/>{error}
            </div>
          )}

          {/* An owner on a session that never presented a second factor sees the
              support-level page. Say so — otherwise the P&L silently vanishes. */}
          {data?.ownerMfaRequired && (
            <div className="bg-warn/5 border border-warn/20 rounded-lg px-4 py-3 text-sm text-ink mb-5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-warn mt-0.5"/>
              <span>
                Owner sections (expenses, net P&amp;L, Stripe balance) are hidden — this session
                was not verified with a second factor.{' '}
                <a href="/admin/owner-login" className="text-pine font-medium hover:underline">Sign in again at owner sign-in →</a>
              </span>
            </div>
          )}

          {/* SECTION 1 — Headline: fees earned leads, full P&L statement beneath (owner) */}
          {pnl && (
            <div className="bg-white border border-line rounded-lg p-6 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">Fees earned · {data?.period.label}</div>
                  <div className="text-[34px] font-serif font-medium text-ink tabular-nums leading-none">{fmtMoney(pnl.feesEarned)}</div>
                  <div className="mt-2"><DeltaBadge delta={pnl.feesEarnedDelta}/></div>
                </div>
                {isOwner && (
                  <button onClick={openDrawer}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
                    <Pencil className="w-3.5 h-3.5"/>Manage expenses
                  </button>
                )}
              </div>

              {/* Owner-only: the statement — fees − stripe − expenses = net */}
              {isOwner && pnl.net !== undefined && (
                <div className="mt-5 pt-5 border-t border-line-soft max-w-md space-y-2.5">
                  <StatementLine label="Fees earned" value={pnl.feesEarned}/>
                  <StatementLine label="Stripe processing" value={-(pnl.stripeProcessing ?? 0)} muted
                    note={pnl.stripeUnavailable ? 'Stripe unavailable' : undefined}/>
                  <StatementLine label="Operating expenses" value={-(pnl.expenses ?? 0)} muted delta={pnl.expensesDelta} deltaGoodWhenUp={false}/>
                  <div className="flex items-center justify-between pt-2.5 border-t border-line">
                    <span className="text-sm font-medium text-ink">Net</span>
                    <div className="flex items-center gap-3">
                      <DeltaBadge delta={pnl.netDelta}/>
                      <span className={'text-lg font-serif font-medium tabular-nums ' + ((pnl.net ?? 0) >= 0 ? 'text-ink' : 'text-bad')}>{fmtMoney(pnl.net ?? 0)}</span>
                    </div>
                  </div>
                  {pnl.stripeUnavailable && (
                    <p className="text-[11px] text-warn">Stripe processing costs couldn&apos;t be fetched — net excludes them for now.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECTION 4 — Problems made actionable */}
          {data && (failed.length > 0 || (data.reconciliation && !data.reconciliation.reconciles)) && (
            <div className="bg-bad/5 border border-bad/20 rounded-lg p-5 mb-6">
              {/* Reconciliation gap (owner) — lists the bookings composing it */}
              {isOwner && data.reconciliation && !data.reconciliation.reconciles && !data.reconciliation.unavailable && (
                <div className="mb-4 pb-4 border-b border-bad/15">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-bad"/>
                    <span className="text-sm font-medium text-bad">Fees don&apos;t reconcile with Stripe</span>
                  </div>
                  <p className="text-xs text-ink-soft">
                    Expected {fmtMoney(data.reconciliation.expected)} in fees, Stripe shows {fmtMoney(data.reconciliation.actual)} — a {fmtMoney(Math.abs(data.reconciliation.gap))} gap.
                    {composingIds.size > 0 ? ' The failed charges below are the likely cause — clear them to close the gap.' : ' No failed charges this period, so the difference is likely refund/payout timing at the period edge.'}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-bad"/>
                <span className="text-sm font-medium text-bad">Failed charges ({failed.length})</span>
              </div>
              {/* MP-1b B4: this lived inside the row it described. A successful
                  collect clears checkInFailReason, so the refetch dropped the row
                  and unmounted the message with it — and the message is the whole
                  point of fix #5, since it is the only place the operator is told
                  the golfer was NOT checked in. Section-level, so it survives. */}
              {retryMsg && (
                <div className={'mb-4 rounded-md px-4 py-2.5 flex items-start justify-between gap-3 ' + (retryMsg.ok ? 'bg-ok/5 border border-ok/20' : 'bg-bad/5 border border-bad/20')}>
                  <p className={'text-xs ' + (retryMsg.ok ? 'text-ok' : 'text-bad')}>{retryMsg.text}</p>
                  <button onClick={() => setRetryMsg(null)} className="text-ink-muted hover:text-ink transition-colors shrink-0" aria-label="Dismiss">
                    <X className="w-3.5 h-3.5"/>
                  </button>
                </div>
              )}
              {failed.length === 0 ? (
                <p className="text-xs text-ink-muted">None — nothing to collect.</p>
              ) : (
                <div className="space-y-3">
                  {failed.map(p => (
                    <div key={p.bookingId} className={'bg-white border rounded-md px-4 py-3 ' + (composingIds.has(p.bookingId) ? 'border-bad/30' : 'border-bad/15')}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-ink">{p.golferName}</span>
                            <span className="text-[11px] text-ink-faint">·</span>
                            <Link href={`/admin/courses/${p.courseId}`} className="text-xs text-pine hover:underline">{p.courseName}</Link>
                            <span className="text-[11px] text-ink-faint">·</span>
                            <span className="text-xs text-ink-muted">{p.teeDate} {p.teeTime}</span>
                          </div>
                          <div className="text-xs text-bad mt-1">{p.reason}</div>
                          <div className="text-xs text-ink-muted mt-0.5">{p.golferEmail}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium text-ink tabular-nums mb-1.5">{fmtMoney(p.amount)}</div>
                          <button onClick={() => retryCharge(p)} disabled={retryingId === p.bookingId}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-pine hover:bg-pine-hover disabled:opacity-50 px-2.5 py-1 rounded-md transition-colors">
                            <RotateCw className={'w-3 h-3 ' + (retryingId === p.bookingId ? 'animate-spin' : '')}/>{retryingId === p.bookingId ? 'Retrying…' : 'Retry charge'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-ink-muted mt-3">Retry collects payment on the saved card. It does not check the golfer in. A hard decline needs a new card or in-person payment.</p>
            </div>
          )}

          {/* SECTION 3 — Money in motion (forward ledger) */}
          {data && (
            <div className="bg-white border border-line rounded-lg p-5 mb-6">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Money in motion</span>
                <span className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">Expected · not booked revenue</span>
              </div>

              {/* Upcoming check-ins with today/tomorrow toggle */}
              <div className="flex items-center justify-between gap-3 mt-4 mb-3">
                <span className="text-sm font-medium text-ink">Upcoming check-ins</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-muted">Our take: <span className="font-medium text-ink tabular-nums">{fmtMoney(upcomingTake)}</span></span>
                  <div className="flex items-center gap-1 bg-paper border border-line rounded-md p-0.5">
                    {(['today', 'tomorrow'] as const).map(d => (
                      <button key={d} onClick={() => setMotionDay(d)}
                        className={'px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors ' + (motionDay === d ? 'bg-white text-ink border border-line' : 'text-ink-muted hover:text-ink')}>{d}</button>
                    ))}
                  </div>
                </div>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-xs text-ink-muted py-2">No check-ins scheduled for {motionDay}.</p>
              ) : (
                <div className="divide-y divide-line-soft">
                  {upcoming.map(u => (
                    <Link key={u.bookingId} href={`/admin/courses/${u.courseId}`} className="flex items-center justify-between gap-4 py-2 hover:bg-paper/60 -mx-2 px-2 rounded transition-colors">
                      <div className="min-w-0">
                        <span className="text-sm text-ink">{u.golferName}</span>
                        <span className="text-xs text-ink-muted"> · {u.courseName} · {u.teeTime} · {u.players}p</span>
                      </div>
                      <span className="text-sm font-medium text-ok tabular-nums shrink-0">{fmtMoney(u.ourTake)}</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Pending late-cancel fees */}
              {(motion?.pendingLateCancelFees.length ?? 0) > 0 && (
                <div className="mt-5 pt-4 border-t border-line-soft">
                  <div className="text-sm font-medium text-ink mb-2">Late-cancellation fees</div>
                  <div className="divide-y divide-line-soft">
                    {motion!.pendingLateCancelFees.map(f => (
                      <Link key={f.bookingId} href={`/admin/courses/${f.courseId}`} className="flex items-center justify-between gap-4 py-2 hover:bg-paper/60 -mx-2 px-2 rounded transition-colors">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-sm text-ink">{f.golferName}</span>
                          <span className="text-xs text-ink-muted truncate">· {f.courseName} · {f.teeDate}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ' + (f.status === 'charged' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn')}>
                            {f.status === 'charged' ? <CheckCircle2 className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}{f.status}
                          </span>
                          <span className="text-sm font-medium text-ink tabular-nums">{fmtMoney(f.fee)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 5 — Per-course table (follows the page period) */}
          {data && (
            <div className="bg-white border border-line rounded-lg overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">By course · {data.period.label}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-soft cursor-pointer select-none">
                    <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-pine"/>
                    Show archived
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none"/>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search courses…" className={iCls + ' pl-8 w-48'}/>
                  </div>
                  <button onClick={exportCsv} disabled={rows.length === 0}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-ink-soft hover:text-ink px-3 py-2 rounded-md border border-line hover:border-line-strong disabled:opacity-40 transition-colors">
                    <Download className="w-3.5 h-3.5"/>Export CSV
                  </button>
                </div>
              </div>
              {rows.length === 0 ? (
                <div className="py-16 text-center text-ink-muted text-sm">{search ? 'No courses match your search' : `No revenue for ${data.period.label}`}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line-soft">
                        <th className="text-left px-5 py-3 font-normal"><SortHead col="name" label="Course"/></th>
                        <th className="px-4 py-3 font-normal"><div className="flex justify-end"><SortHead col="bookings" label="Bookings" right/></div></th>
                        <th className="px-4 py-3 font-normal"><div className="flex justify-end"><SortHead col="serviceFees" label="Service fees" right/></div></th>
                        <th className="px-4 py-3 font-normal"><div className="flex justify-end"><SortHead col="greenFeeVolume" label="Green fee vol." right/></div></th>
                        <th className="px-4 py-3 font-normal"><div className="flex justify-end"><SortHead col="failedCharges" label="Failed" right/></div></th>
                        <th className="text-center px-4 py-3 font-normal"><span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Stripe</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {rows.map(r => (
                        <tr key={r.courseId} className="hover:bg-paper/60 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <Link href={`/admin/courses/${r.courseId}`} className={'font-medium hover:underline ' + (r.archived ? 'text-ink-muted' : 'text-ink')}>{r.name}</Link>
                              {r.archived
                                ? <span className="text-[10px] text-ink-faint bg-line rounded px-1.5 py-0.5">Archived</span>
                                : !r.active && <span className="text-[10px] text-ink-faint bg-line rounded px-1.5 py-0.5">Offline</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{fmtCount(r.bookings)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">{fmtMoney(r.serviceFees)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{fmtMoney(r.greenFeeVolume)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.failedCharges > 0 ? <span className="text-bad font-medium">{r.failedCharges}</span> : <span className="text-ink-faint">—</span>}</td>
                          <td className="px-4 py-3"><div className="flex justify-center"><StatusDot status={r.stripeActive ? 'ok' : 'warn'} label={r.stripeActive ? 'Connected' : 'Not connected'}/></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {rows.length > 0 && (
                <div className="px-5 py-3 border-t border-line-soft flex items-center justify-between">
                  <span className="text-xs text-ink-muted">{rows.length} course{rows.length !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}{!showArchived ? ' · archived hidden' : ''}</span>
                  <span className="text-xs text-ink-muted">{data.period.label}</span>
                </div>
              )}
            </div>
          )}

          {/* SECTION 6 — Platform Stripe reference card (owner, bottom) */}
          {isOwner && (
            <div className="bg-white border border-line rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-pine"/>
                  <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Platform Stripe account</span>
                </div>
                <a href="https://dashboard.stripe.com/balance" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-pine hover:text-pine-hover underline">Open Stripe dashboard<ExternalLink className="w-3 h-3"/></a>
              </div>
              {platformError && <div className="text-sm text-bad">{platformError}</div>}
              {platformLoading && !platform ? (
                <div className="py-4 text-center text-ink-muted text-sm">Loading Stripe balance…</div>
              ) : platform ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Available balance</div>
                    <div className="text-xl font-serif font-medium text-ink tabular-nums">{fmtMoney(platform.balance.available)}</div>
                    <div className="text-[11px] text-ink-faint mt-0.5">{fmtMoney(platform.balance.pending)} pending</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Next payout</div>
                    {platform.nextPayout ? (
                      <>
                        <div className="text-xl font-serif font-medium text-ink tabular-nums">{fmtMoney(platform.nextPayout.amount)}</div>
                        <div className="text-[11px] text-ink-faint mt-0.5">{platform.nextPayout.arrivalDate} · {platform.nextPayout.status}</div>
                      </>
                    ) : <div className="text-sm text-ink-faint mt-1">None scheduled</div>}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {loading && !data && <div className="py-16 text-center text-ink-muted text-sm">Loading…</div>}
        </div>
      </div>

      {/* SECTION 2 — Manage expenses drawer (owner) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setDrawerOpen(false)}/>
          <div className="relative w-full max-w-md bg-paper h-full shadow-xl border-l border-line overflow-y-auto">
            <div className="sticky top-0 bg-paper border-b border-line px-5 py-4 flex items-center justify-between">
              <h2 className="text-[15px] font-serif font-medium text-ink">Operating expenses</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-ink-muted hover:text-ink"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Add / edit form */}
              <div className="bg-white border border-line rounded-lg p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{editing ? 'Edit expense' : 'Add expense'}</div>
                <input placeholder="Name (e.g. Vercel Pro)" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={iCls + ' w-full'}/>
                <div className="grid grid-cols-2 gap-2">
                  <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={iCls}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c]}</option>)}
                  </select>
                  <select value={draft.cadence} onChange={e => setDraft({ ...draft, cadence: e.target.value })} className={iCls}>
                    {EXPENSE_CADENCES.map(c => <option key={c} value={c}>{EXPENSE_CADENCE_LABEL[c]}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                  <input type="number" step="0.01" placeholder="0.00" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} className={iCls + ' w-full pl-7'}/>
                </div>
                {expenseError && <p className="text-xs text-bad">{expenseError}</p>}
                <div className="flex items-center gap-2">
                  <button onClick={saveExpense} disabled={savingExpense}
                    className="flex items-center gap-1.5 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium px-3 py-1.5 rounded-md transition-colors">
                    <Plus className="w-3.5 h-3.5"/>{savingExpense ? 'Saving…' : editing ? 'Save changes' : 'Add'}
                  </button>
                  {editing && <button onClick={resetDraft} className="text-[12px] text-ink-muted hover:text-ink">Cancel</button>}
                </div>
              </div>

              {/* List */}
              {expensesLoading ? (
                <div className="py-8 text-center text-ink-muted text-sm">Loading…</div>
              ) : expenses.length === 0 ? (
                <div className="py-8 text-center text-ink-muted text-sm">No expenses yet. Add your fixed costs above.</div>
              ) : (
                <div className="space-y-2">
                  {expenses.map(e => (
                    <div key={e.id} className={'bg-white border rounded-lg px-4 py-3 ' + (e.endedAt ? 'border-line opacity-60' : 'border-line')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-ink">{e.name}</div>
                          <div className="text-[11px] text-ink-muted mt-0.5">
                            {EXPENSE_CATEGORY_LABEL[e.category as keyof typeof EXPENSE_CATEGORY_LABEL] ?? e.category} · {EXPENSE_CADENCE_LABEL[e.cadence as keyof typeof EXPENSE_CADENCE_LABEL] ?? e.cadence}
                            {e.endedAt && <span className="text-ink-faint"> · ended {e.endedAt.split('T')[0]}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium text-ink tabular-nums">{fmtMoney(e.amountCents / 100)}</div>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            <button onClick={() => startEdit(e)} className="text-ink-muted hover:text-ink" title="Edit"><Pencil className="w-3.5 h-3.5"/></button>
                            {!e.endedAt && <button onClick={() => endExpense(e)} className="text-[11px] text-ink-muted hover:text-warn" title="Stop counting this cost">End</button>}
                            <button onClick={() => deleteExpense(e)} className="text-ink-muted hover:text-bad" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatementLine({ label, value, muted, note, delta, deltaGoodWhenUp }: { label: string; value: number; muted?: boolean; note?: string; delta?: Delta; deltaGoodWhenUp?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={'text-sm ' + (muted ? 'text-ink-soft' : 'text-ink')}>
        {label}{note && <span className="text-[11px] text-warn ml-1.5">({note})</span>}
      </span>
      <div className="flex items-center gap-3">
        {delta && <DeltaBadge delta={delta} goodWhenUp={deltaGoodWhenUp ?? true}/>}
        <span className={'text-sm tabular-nums ' + (muted ? 'text-ink-soft' : 'text-ink font-medium')}>{fmtMoney(value)}</span>
      </div>
    </div>
  );
}
