'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, AlertCircle, DollarSign, RefreshCw, MessageSquare, Clock3,
  ArrowUpRight, ArrowDownRight, Minus, ChevronRight, CheckCircle2,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface QueueItem { id: string; label: string; ageDays: number; }
interface ActionRow {
  id: string; who: string; why: string; doThis: string; ageDays: number;
  actionLabel: string; href: string; amount?: string; count?: number; items?: QueueItem[];
  fire?: { kind: 'resend_preview' | 'resend_sheet' | 'send_nudge'; inquiryId?: string; courseId?: string };
}

interface Stats {
  pendingInquiries: number;
  topStrip: {
    feesToday: number; bookingsToday: number; checkInsToday: number; cancellationsToday: number;
    unreadMessages: number; unreadNewestSender: string | null;
    waitingNewInquiries: number; waitingOldestAgeDays: number | null;
    waitingDrafts: number; waitingDraftsList: { id: string; name: string }[];
  };
  actionQueue: { red: ActionRow[]; redCount: number; amber: ActionRow[]; amberCount: number };
  revenue: {
    day: { t: number; gross: number; fees: number; ghostGross: number; ghostFees: number }[];
    week: { t: number; gross: number; fees: number; ghostGross: number; ghostFees: number }[];
    month: { t: number; gross: number; fees: number; ghostGross: number; ghostFees: number }[];
  };
  thirtyDay: {
    activeCourses: number; totalCourses: number; archivedCourses: number;
    newCourses30d: number; newCoursesPrev30d: number;
    bookings30d: number; bookingsPrev30d: number;
    fees30d: number; feesPrev30d: number;
  };
  bottomTrio: {
    pipeline: { newInquiries: number; sheetsOut: number; building: number; wentLive: number };
    teeSheetToday: { roundsToday: number; checkInsDone: number; revenueExpected: number };
    courseHealthWatchlist: { id: string; name: string; reason: string }[];
  };
}

const SUPPORT_PLUS_ROLES = ['owner', 'manager', 'support'];
const MANAGER_PLUS_ROLES = ['owner', 'manager'];
const REFRESH_MS = 5 * 60 * 1000;

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function fmtAgo(ts: number, nowMs: number) {
  const s = Math.floor((nowMs - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function Trend({ current, prev, suffix = 'vs prior 30d' }: { current: number; prev: number; suffix?: string }) {
  if (prev === 0 && current === 0) return null;
  if (prev === 0) return <span className="text-[11px] text-ink-muted">— {suffix}</span>;
  const delta = ((current - prev) / prev) * 100;
  const up = delta >= 0;
  const cls = up ? 'text-ok' : 'text-bad';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="w-3 h-3"/>{Math.abs(delta).toFixed(0)}% {suffix}
    </span>
  );
}

type Gran = 'day' | 'week' | 'month';
type TickerPoint = { t: number; gross: number; fees: number; ghostGross: number; ghostFees: number };

const GRAN_COPY: Record<Gran, { period: string; periodLower: string; suffix: string; start: string; now: string }> = {
  day:   { period: 'Today',     periodLower: 'today',      suffix: 'vs yesterday, same time', start: '12am',  now: 'Now' },
  week:  { period: 'This Week', periodLower: 'this week',  suffix: 'vs last week, same day',  start: 'Mon',   now: 'Today' },
  month: { period: 'This Month', periodLower: 'this month', suffix: 'vs last month, same day', start: '1st',  now: 'Today' },
};

function RevenueChart({ data, gran }: { data: TickerPoint[]; gran: Gran }) {
  const [showGross, setShowGross] = useState(false);
  if (!data.length) return <div className="text-center text-ink-muted py-12 text-sm">No bookings yet</div>;
  const copy = GRAN_COPY[gran];
  const latest = data[data.length - 1];
  const noDataYet = latest.fees === 0 && latest.gross === 0;

  const tMin = data[0].t, tMax = data[data.length - 1].t;
  const vMax = Math.max(
    ...data.map(d => d.fees), ...data.map(d => d.ghostFees),
    showGross ? Math.max(...data.map(d => d.gross), ...data.map(d => d.ghostGross)) : 0,
    0.01,
  );
  const xFor = (t: number) => (tMax > tMin ? ((t - tMin) / (tMax - tMin)) * 100 : 100);
  const yFor = (v: number) => 38 - (v / vMax) * 36;
  const pointsFor = (key: 'fees' | 'ghostFees' | 'gross' | 'ghostGross') => data.map(d => `${xFor(d.t)},${yFor(d[key])}`).join(' ');
  const tipX = xFor(latest.t);
  const tipY = (yFor(latest.fees) / 40) * 100;

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        {noDataYet ? (
          <div className="text-sm text-ink-muted">No bookings yet {copy.periodLower}</div>
        ) : (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{copy.period} — GR Fees</div>
              <div className="flex items-baseline gap-2">
                <div className="text-xl font-serif font-medium text-ok">{fmtMoney(latest.fees)}</div>
                <Trend current={latest.fees} prev={latest.ghostFees} suffix={copy.suffix}/>
              </div>
            </div>
            {showGross && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{copy.period} — Gross</div>
                <div className="flex items-baseline gap-2">
                  <div className="text-xl font-serif font-medium text-ink">{fmtMoney(latest.gross)}</div>
                  <Trend current={latest.gross} prev={latest.ghostGross} suffix={copy.suffix}/>
                </div>
              </div>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-4 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok inline-block"/>GR Fees</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok/25 inline-block"/>Ghost (prior period)</span>
          <button
            onClick={() => setShowGross(v => !v)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${showGross ? 'border-line-strong text-ink' : 'border-line-soft text-ink-faint hover:text-ink-soft'}`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-line-strong inline-block"/>Gross
          </button>
        </div>
      </div>
      <div className="relative w-full h-40">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {showGross && <polyline points={pointsFor('ghostGross')} fill="none" vectorEffect="non-scaling-stroke" className="stroke-line-strong/20" strokeWidth="1"/>}
          {showGross && <polyline points={pointsFor('gross')} fill="none" vectorEffect="non-scaling-stroke" className="stroke-line-strong/70" strokeWidth="1.2"/>}
          <polyline points={pointsFor('ghostFees')} fill="none" vectorEffect="non-scaling-stroke" className="stroke-ok/25" strokeWidth="1.2"/>
          <polyline points={pointsFor('fees')} fill="none" vectorEffect="non-scaling-stroke" className="stroke-ok" strokeWidth="1.8"/>
        </svg>
        <div className="absolute w-2 h-2 rounded-full bg-ok ring-2 ring-white shadow-sm" style={{ left: `${tipX}%`, top: `${tipY}%`, transform: 'translate(-50%, -50%)' }}/>
        <div className="absolute text-xs font-medium text-ok whitespace-nowrap" style={{ left: `${tipX}%`, top: `${tipY}%`, transform: tipX > 85 ? 'translate(-100%, -140%)' : 'translate(8px, -50%)' }}>
          {fmtMoney(latest.fees)}
        </div>
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-ink-faint">
        <span>{copy.start}</span>
        <span>{copy.now}</span>
      </div>
    </div>
  );
}

type FireStatus = 'idle' | 'pending' | 'success' | 'error';
const FIRE_LABELS: Record<string, string> = { resend_preview: 'Resend preview', resend_sheet: 'Resend sheet', send_nudge: 'Send nudge' };

function QueueRow({ row, severity, router, expanded, onToggleExpand, fireStatus, onFire, canFire }: {
  row: ActionRow; severity: 'bad' | 'warn'; router: ReturnType<typeof useRouter>;
  expanded: boolean; onToggleExpand: () => void; fireStatus: FireStatus; onFire: () => void; canFire: boolean;
}) {
  const hasItems = (row.items?.length ?? 0) > 0;
  return (
    <div className="border border-line-soft hover:border-line rounded-md transition-colors">
      <div
        onClick={() => (hasItems ? onToggleExpand() : router.push(row.href))}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer"
      >
        <StatusDot status={severity}/>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink truncate">{row.who}</div>
          <div className="text-xs text-ink-muted mt-0.5 truncate">{row.why} · {row.ageDays}d</div>
          <div className="text-xs text-ink-faint mt-1 truncate">Do this: {row.doThis}</div>
        </div>
        {row.fire && canFire && (
          fireStatus === 'success' ? (
            <span className="shrink-0 text-xs font-medium text-ok flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Sent</span>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onFire(); }}
              disabled={fireStatus === 'pending'}
              className="shrink-0 text-xs font-medium text-pine hover:text-pine-hover px-2 py-1 rounded-md border border-line hover:border-pine/40 transition-colors disabled:opacity-50"
            >
              {fireStatus === 'pending' ? 'Sending…' : fireStatus === 'error' ? 'Failed — retry' : FIRE_LABELS[row.fire.kind]}
            </button>
          )
        )}
        <button onClick={e => { e.stopPropagation(); router.push(row.href); }} className="shrink-0 text-xs font-medium text-pine">{row.actionLabel}</button>
        <ChevronRight className={`w-3.5 h-3.5 text-ink-faint shrink-0 transition-transform ${hasItems && expanded ? 'rotate-90' : ''}`}/>
      </div>
      {hasItems && expanded && (
        <div className="border-t border-line-soft px-3 py-2 space-y-1 bg-paper/50">
          {row.items!.map(it => (
            <div key={it.id} className="text-xs text-ink-muted flex justify-between">
              <span>{it.label}</span><span>{it.ageDays}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminOverviewPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [role, setRole] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [gran, setGran] = useState<Gran>('day');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [fireStatuses, setFireStatuses] = useState<Record<string, FireStatus>>({});

  const loadStats = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/stats', { headers: { 'Content-Type': 'application/json' } });
    if (r.ok) { setStats(await r.json()); setLastUpdated(Date.now()); }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      return r.json();
    }).then(d => {
      if (d) { setRole(d.role ?? ''); setAdminReady(true); }
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (!adminReady) return;
    loadStats();
    const refreshInterval = setInterval(loadStats, REFRESH_MS);
    const tickInterval = setInterval(() => setTick(t => t + 1), 15000);
    return () => { clearInterval(refreshInterval); clearInterval(tickInterval); };
  }, [adminReady, loadStats]);

  function toggleExpand(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function canFireRow(row: ActionRow) {
    if (!row.fire) return false;
    if (row.fire.kind === 'resend_sheet') return MANAGER_PLUS_ROLES.includes(role);
    if (row.fire.kind === 'send_nudge') return SUPPORT_PLUS_ROLES.includes(role);
    return true;
  }

  async function fireAction(row: ActionRow) {
    if (!row.fire) return;
    setFireStatuses(s => ({ ...s, [row.id]: 'pending' }));
    try {
      let res: Response;
      if (row.fire.kind === 'resend_preview') {
        res = await fetch('/api/preview/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: row.fire.inquiryId }) });
      } else if (row.fire.kind === 'resend_sheet') {
        res = await fetch('/api/admin/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.fire.inquiryId, action: 'resend_details' }) });
      } else {
        res = await fetch('/api/admin/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: row.fire.courseId, body: 'Just checking in on this — let us know if you have any questions!' }) });
      }
      setFireStatuses(s => ({ ...s, [row.id]: res.ok ? 'success' : 'error' }));
    } catch {
      setFireStatuses(s => ({ ...s, [row.id]: 'error' }));
    }
  }

  if (!adminReady) return null;

  const isSupportPlus = SUPPORT_PLUS_ROLES.includes(role);

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="overview" pendingInquiries={stats?.pendingInquiries ?? 0} unreadMessages={stats?.topStrip.unreadMessages ?? 0} />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7">
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Platform Overview</h1>
              <p className="text-sm text-ink-soft mt-0.5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {lastUpdated && <span className="text-ink-faint"> · updated {fmtAgo(lastUpdated, Date.now())}</span>}
              </p>
            </div>
            <button onClick={loadStats} disabled={loading} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>Refresh
            </button>
          </div>

          {!stats && loading && <div className="text-ink-muted text-center py-20 text-sm">Loading...</div>}

          {stats && <>
            {/* 1. TOP STRIP — the morning pulse */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div onClick={() => router.push('/admin/revenue')} className="bg-white border border-line rounded-lg p-5 cursor-pointer hover:border-line-strong transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-md bg-pine/10"><DollarSign className="w-4 h-4 text-pine"/></div>
                </div>
                <div className="text-[26px] font-serif font-medium text-pine mb-0.5">{fmtMoney(stats.topStrip.feesToday)}</div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Fees Today</div>
                <div className="flex items-center gap-3 mt-2 text-xs text-ink-faint">
                  <span>{stats.topStrip.bookingsToday} booking{stats.topStrip.bookingsToday === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span>{stats.topStrip.checkInsToday} check-in{stats.topStrip.checkInsToday === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span>{stats.topStrip.cancellationsToday} cancelled</span>
                </div>
              </div>

              <div onClick={() => router.push('/admin/messages')} className="bg-white border border-line rounded-lg p-5 cursor-pointer hover:border-line-strong transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-md bg-paper"><MessageSquare className="w-4 h-4 text-ink-muted"/></div>
                </div>
                <div className="text-[26px] font-serif font-medium text-ink mb-0.5">{isSupportPlus ? stats.topStrip.unreadMessages : '—'}</div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Unread</div>
                <div className="text-xs text-ink-faint mt-2">
                  {!isSupportPlus ? 'Requires support access' : stats.topStrip.unreadNewestSender ? `Newest: ${stats.topStrip.unreadNewestSender}` : 'All caught up'}
                </div>
              </div>

              <div className="bg-white border border-line rounded-lg p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-md bg-paper"><Clock3 className="w-4 h-4 text-ink-muted"/></div>
                </div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Waiting</div>
                <div className="space-y-1.5">
                  {stats.topStrip.waitingNewInquiries > 0 ? (
                    <button onClick={() => router.push('/admin/inquiries')} className="w-full text-left text-sm text-ink hover:text-pine transition-colors">
                      {stats.topStrip.waitingNewInquiries} inquir{stats.topStrip.waitingNewInquiries === 1 ? 'y' : 'ies'} waiting · oldest {stats.topStrip.waitingOldestAgeDays}d
                    </button>
                  ) : (
                    <div className="text-sm text-ink-faint">No new inquiries waiting</div>
                  )}
                  {stats.topStrip.waitingDrafts === 1 && stats.topStrip.waitingDraftsList[0] ? (
                    <button onClick={() => router.push(`/admin/courses?courseId=${stats.topStrip.waitingDraftsList[0].id}&tab=overview`)} className="w-full text-left text-sm text-ink hover:text-pine transition-colors">
                      1 draft to review — {stats.topStrip.waitingDraftsList[0].name}
                    </button>
                  ) : stats.topStrip.waitingDrafts > 1 ? (
                    <button onClick={() => router.push('/admin/courses')} className="w-full text-left text-sm text-ink hover:text-pine transition-colors">
                      {stats.topStrip.waitingDrafts} drafts to review
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* 2. ACTION QUEUE — blockers + stalls only */}
            <div className="bg-white border border-line rounded-lg p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-3.5 h-3.5 text-warn"/>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Action Queue</div>
              </div>

              {stats.actionQueue.redCount === 0 && stats.actionQueue.amberCount === 0 ? (
                <div className="flex items-center gap-2 text-sm text-ok py-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0"/>
                  <span>All clear — nothing stuck.</span>
                </div>
              ) : (
                <div className="space-y-5">
                  {stats.actionQueue.redCount > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-bad font-medium mb-2">Money Broken ({stats.actionQueue.redCount})</div>
                      <div className="space-y-1.5">
                        {stats.actionQueue.red.map(row => (
                          <QueueRow key={row.id} row={row} severity="bad" router={router}
                            expanded={expandedRows.has(row.id)} onToggleExpand={() => toggleExpand(row.id)}
                            fireStatus={fireStatuses[row.id] ?? 'idle'} onFire={() => fireAction(row)} canFire={canFireRow(row)}/>
                        ))}
                      </div>
                      {stats.actionQueue.redCount > stats.actionQueue.red.length && (
                        <button onClick={() => router.push('/admin/revenue')} className="text-xs text-ink-muted hover:text-ink mt-2 flex items-center gap-1">
                          View all {stats.actionQueue.redCount} <ChevronRight className="w-3 h-3"/>
                        </button>
                      )}
                    </div>
                  )}
                  {stats.actionQueue.amberCount > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-warn font-medium mb-2">Stalled ({stats.actionQueue.amberCount})</div>
                      <div className="space-y-1.5">
                        {stats.actionQueue.amber.map(row => (
                          <QueueRow key={row.id} row={row} severity="warn" router={router}
                            expanded={expandedRows.has(row.id)} onToggleExpand={() => toggleExpand(row.id)}
                            fireStatus={fireStatuses[row.id] ?? 'idle'} onFire={() => fireAction(row)} canFire={canFireRow(row)}/>
                        ))}
                      </div>
                      {stats.actionQueue.amberCount > stats.actionQueue.amber.length && (
                        <button onClick={() => router.push('/admin/inquiries')} className="text-xs text-ink-muted hover:text-ink mt-2 flex items-center gap-1">
                          View all {stats.actionQueue.amberCount} <ChevronRight className="w-3 h-3"/>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. REVENUE CHART */}
            <div className="bg-white border border-line rounded-lg p-6 mb-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-ink-muted"/>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Revenue</div>
                </div>
                <div className="flex gap-1 bg-paper border border-line rounded-md p-0.5">
                  {(['day', 'week', 'month'] as Gran[]).map(g => (
                    <button
                      key={g}
                      onClick={() => setGran(g)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${gran === g ? 'bg-pine text-white' : 'text-ink-soft hover:text-ink'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <RevenueChart data={stats.revenue[gran]} gran={gran}/>
            </div>

            {/* 4. 30-DAY ROW */}
            <div className="bg-white border border-line rounded-lg mb-5 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line-soft">
              <div onClick={() => router.push('/admin/courses')} className="p-5 cursor-pointer hover:bg-paper transition-colors flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">Live Courses</div>
                  <div className="text-xl font-serif font-medium text-ink">{stats.thirtyDay.activeCourses}</div>
                  <div className="text-xs text-ink-faint mt-0.5">{stats.thirtyDay.archivedCourses > 0 ? `${stats.thirtyDay.totalCourses} active · ${stats.thirtyDay.archivedCourses} archived` : `${stats.thirtyDay.totalCourses} total`}</div>
                </div>
                <Trend current={stats.thirtyDay.newCourses30d} prev={stats.thirtyDay.newCoursesPrev30d}/>
              </div>
              <div onClick={() => router.push('/admin/activity')} className="p-5 cursor-pointer hover:bg-paper transition-colors flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">Bookings (30d)</div>
                  <div className="text-xl font-serif font-medium text-ink">{stats.thirtyDay.bookings30d}</div>
                </div>
                <Trend current={stats.thirtyDay.bookings30d} prev={stats.thirtyDay.bookingsPrev30d}/>
              </div>
              <div onClick={() => router.push('/admin/activity')} className="p-5 cursor-pointer hover:bg-paper transition-colors flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">GR Fees (30d)</div>
                  <div className="text-xl font-serif font-medium text-ok">{fmtMoney(stats.thirtyDay.fees30d)}</div>
                </div>
                <Trend current={stats.thirtyDay.fees30d} prev={stats.thirtyDay.feesPrev30d}/>
              </div>
            </div>

            {/* 5. BOTTOM TRIO — pipeline funnel, today's tee sheet, course health watchlist */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div className="bg-white border border-line rounded-lg p-5">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Pipeline (MTD)</div>
                <div className="space-y-1">
                  {([
                    { label: 'New inquiries', value: stats.bottomTrio.pipeline.newInquiries, href: '/admin/inquiries?tab=new' },
                    { label: 'Sheets out', value: stats.bottomTrio.pipeline.sheetsOut, href: '/admin/inquiries?tab=waiting' },
                    { label: 'Building', value: stats.bottomTrio.pipeline.building, href: '/admin/inquiries?tab=building' },
                    { label: 'Went live', value: stats.bottomTrio.pipeline.wentLive, href: '/admin/inquiries?tab=archived' },
                  ] as const).map((stage, idx, arr) => (
                    <button key={stage.label} onClick={() => router.push(stage.href)} className="w-full flex items-center justify-between text-left px-2 py-1.5 -mx-2 rounded-md hover:bg-paper transition-colors">
                      <span className="text-sm text-ink">{stage.label}</span>
                      <span className="flex items-center gap-2">
                        {idx > 0 && arr[idx - 1].value > 0 && (
                          <span className="text-[10px] text-ink-faint">{Math.round((stage.value / arr[idx - 1].value) * 100)}%</span>
                        )}
                        <span className="text-sm font-medium text-ink">{stage.value}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-line rounded-lg p-5">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Today's Tee Sheet</div>
                <div className="space-y-1">
                  <button onClick={() => router.push('/admin/activity')} className="w-full flex items-center justify-between text-left px-2 py-1.5 -mx-2 rounded-md hover:bg-paper transition-colors">
                    <span className="text-sm text-ink">Rounds today</span>
                    <span className="text-sm font-medium text-ink">{stats.bottomTrio.teeSheetToday.roundsToday}</span>
                  </button>
                  <button onClick={() => router.push('/admin/activity')} className="w-full flex items-center justify-between text-left px-2 py-1.5 -mx-2 rounded-md hover:bg-paper transition-colors">
                    <span className="text-sm text-ink">Checked in</span>
                    <span className="text-sm font-medium text-ink">{stats.bottomTrio.teeSheetToday.checkInsDone} / {stats.bottomTrio.teeSheetToday.roundsToday}</span>
                  </button>
                  <button onClick={() => router.push('/admin/revenue')} className="w-full flex items-center justify-between text-left px-2 py-1.5 -mx-2 rounded-md hover:bg-paper transition-colors">
                    <span className="text-sm text-ink">Expected at check-in</span>
                    <span className="text-sm font-medium text-ok">{fmtMoney(stats.bottomTrio.teeSheetToday.revenueExpected)}</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-line rounded-lg p-5">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Course Health Watchlist</div>
                {stats.bottomTrio.courseHealthWatchlist.length === 0 ? (
                  <div className="text-xs text-ink-faint py-4">No courses trending down.</div>
                ) : (
                  <div className="space-y-1.5">
                    {stats.bottomTrio.courseHealthWatchlist.map(c => (
                      <button key={c.id} onClick={() => router.push(`/admin/courses?courseId=${c.id}`)} className="w-full text-left px-2 py-1.5 -mx-2 rounded-md hover:bg-paper transition-colors">
                        <div className="text-sm font-medium text-ink truncate">{c.name}</div>
                        <div className="text-xs text-bad mt-0.5">{c.reason}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Systems — one dot, detail lives on /admin/system */}
            <button onClick={() => router.push('/admin/system')} className="flex items-center gap-2 px-1 py-2 text-xs text-ink-faint hover:text-ink-soft transition-colors">
              <StatusDot status="neutral"/>Systems<ChevronRight className="w-3 h-3"/>
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}
