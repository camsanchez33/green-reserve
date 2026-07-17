'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart2, AlertCircle, DollarSign, Building2, RefreshCw, MessageSquare, Clock3,
  ArrowUpRight, ArrowDownRight, Minus, ChevronRight, CheckCircle2, HardDrive, GitBranch, Zap, ExternalLink,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface ActionRow {
  id: string; who: string; why: string; ageDays: number; actionLabel: string; href: string; amount?: string;
}

interface Stats {
  pendingInquiries: number;
  topStrip: {
    feesToday: number; bookingsToday: number; checkInsToday: number; cancellationsToday: number;
    unreadMessages: number; unreadNewestSender: string | null;
    waitingNewInquiries: number; waitingOldestAgeDays: number | null; waitingDrafts: number;
  };
  actionQueue: { red: ActionRow[]; redCount: number; amber: ActionRow[]; amberCount: number };
  revenue: {
    day: { key: string; gross: number; fees: number; bookings: number; ghostGross: number; ghostFees: number }[];
    week: { key: string; gross: number; fees: number; bookings: number; ghostGross: number; ghostFees: number }[];
    month: { key: string; gross: number; fees: number; bookings: number; ghostGross: number; ghostFees: number }[];
  };
  thirtyDay: {
    activeCourses: number; totalCourses: number; archivedCourses: number;
    newCourses30d: number; newCoursesPrev30d: number;
    bookings30d: number; bookingsPrev30d: number;
    fees30d: number; feesPrev30d: number;
  };
  topCourses: { id: string; name: string; bookings: number; revenue: number; prevBookings: number }[];
}

const SUPPORT_PLUS_ROLES = ['owner', 'manager', 'support'];

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function fmtDayLabel(key: string) {
  return new Date(key + 'T00:00:00.000Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtWeekLabel(key: string) {
  return 'Wk of ' + fmtDayLabel(key);
}
function fmtMonthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
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

function TrendArrow({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return null;
  if (current === prev) return <Minus className="w-3 h-3 text-ink-faint"/>;
  return current > prev
    ? <ArrowUpRight className="w-3 h-3 text-ok"/>
    : <ArrowDownRight className="w-3 h-3 text-bad"/>;
}

type Gran = 'day' | 'week' | 'month';

function RevenueChart({ data, gran }: { data: Stats['revenue']['day']; gran: Gran }) {
  if (!data.length) return <div className="text-center text-ink-muted py-12 text-sm">No bookings yet</div>;
  const grossMax = Math.max(...data.map(d => Math.max(d.gross, d.ghostGross)), 0.01);
  const feesMax = Math.max(...data.map(d => Math.max(d.fees, d.ghostFees)), 0.01);
  const totalGross = data.reduce((s, d) => s + d.gross, 0);
  const totalFees = data.reduce((s, d) => s + d.fees, 0);
  const label = gran === 'day' ? fmtDayLabel : gran === 'week' ? fmtWeekLabel : fmtMonthLabel;

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Total Gross</div>
          <div className="text-xl font-serif font-medium text-ink">{fmtMoney(totalGross)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">GR Fees Earned</div>
          <div className="text-xl font-serif font-medium text-ok">{fmtMoney(totalFees)}</div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong inline-block"/>Gross</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok inline-block"/>GR Fees</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong/25 inline-block"/>Prior period</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {data.map(d => {
          const grossPct = Math.max(2, (d.gross / grossMax) * 100);
          const ghostGrossPct = Math.max(d.ghostGross > 0 ? 2 : 0, (d.ghostGross / grossMax) * 100);
          const feesPct = Math.max(2, (d.fees / feesMax) * 100);
          const ghostFeesPct = Math.max(d.ghostFees > 0 ? 2 : 0, (d.ghostFees / feesMax) * 100);
          return (
            <div
              key={d.key}
              className="flex-1 flex items-end gap-0.5 h-full group"
              title={`${label(d.key)}\nGross: ${fmtMoney(d.gross)} (prior: ${fmtMoney(d.ghostGross)})\nFees: ${fmtMoney(d.fees)} (prior: ${fmtMoney(d.ghostFees)})\nBookings: ${d.bookings}`}
            >
              <div className="flex-1 relative h-full">
                <div className="absolute inset-x-0 bottom-0 bg-line-strong/25 rounded-t-sm" style={{ height: `${ghostGrossPct}%` }}/>
                <div className="absolute inset-x-[20%] bottom-0 bg-line-strong rounded-t-sm transition-colors group-hover:bg-ink-muted" style={{ height: `${grossPct}%` }}/>
              </div>
              <div className="flex-1 relative h-full">
                <div className="absolute inset-x-0 bottom-0 bg-ok/15 rounded-t-sm" style={{ height: `${ghostFeesPct}%` }}/>
                <div className="absolute inset-x-[20%] bottom-0 bg-ok rounded-t-sm transition-colors group-hover:bg-ok/80" style={{ height: `${feesPct}%` }}/>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-ink-muted">
        <span>{label(data[0].key)}</span>
        <span>{label(data[Math.floor(data.length / 2)].key)}</span>
        <span>{label(data[data.length - 1].key)}</span>
      </div>
    </div>
  );
}

function QueueRow({ row, severity, router }: { row: ActionRow; severity: 'bad' | 'warn'; router: ReturnType<typeof useRouter> }) {
  return (
    <button
      onClick={() => router.push(row.href)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-line-soft hover:border-line hover:bg-paper transition-colors text-left"
    >
      <StatusDot status={severity}/>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink truncate">{row.who}</div>
        <div className="text-xs text-ink-muted mt-0.5 truncate">
          {row.why}{row.amount ? ` — ${row.amount}` : ''} · {row.ageDays}d
        </div>
      </div>
      <span className="shrink-0 text-xs font-medium text-pine">{row.actionLabel}</span>
      <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0"/>
    </button>
  );
}

export default function AdminOverviewPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [role, setRole] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [gran, setGran] = useState<Gran>('day');

  const loadStats = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/stats', { headers: { 'Content-Type': 'application/json' } });
    if (r.ok) setStats(await r.json());
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
    if (adminReady) loadStats();
  }, [adminReady, loadStats]);

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
              <p className="text-sm text-ink-soft mt-0.5">Everything happening across GreenReserve</p>
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

              <div onClick={() => router.push('/admin/inquiries')} className="bg-white border border-line rounded-lg p-5 cursor-pointer hover:border-line-strong transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-md bg-paper"><Clock3 className="w-4 h-4 text-ink-muted"/></div>
                </div>
                <div className="text-[26px] font-serif font-medium text-ink mb-0.5">{stats.topStrip.waitingNewInquiries}</div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Waiting</div>
                <div className="text-xs text-ink-faint mt-2">
                  {stats.topStrip.waitingOldestAgeDays !== null ? `Oldest ${stats.topStrip.waitingOldestAgeDays}d` : 'None new'}
                  {stats.topStrip.waitingDrafts > 0 && ` · ${stats.topStrip.waitingDrafts} draft${stats.topStrip.waitingDrafts === 1 ? '' : 's'} awaiting review`}
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
                        {stats.actionQueue.red.map(row => <QueueRow key={row.id} row={row} severity="bad" router={router}/>)}
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
                        {stats.actionQueue.amber.map(row => <QueueRow key={row.id} row={row} severity="warn" router={router}/>)}
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
                  <BarChart2 className="w-4 h-4 text-ink-muted"/>
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

            {/* 5. TOP COURSES */}
            <div className="bg-white border border-line rounded-lg p-5 mb-5">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Top Courses (30d)</div>
              {stats.topCourses.length === 0 && <div className="text-xs text-ink-faint py-4">No bookings yet</div>}
              <div className="space-y-0.5">
                {stats.topCourses.map((tc, idx) => (
                  <div
                    key={tc.id}
                    onClick={() => router.push(`/admin/courses?courseId=${tc.id}`)}
                    className="flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-paper transition-colors group"
                  >
                    <div className="w-5 h-5 rounded bg-paper group-hover:bg-line flex items-center justify-center text-[10px] font-medium text-ink-muted shrink-0 transition-colors">{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{tc.name}</div>
                      <div className="text-xs text-ink-muted">{tc.bookings} bookings · {fmtMoney(tc.revenue)} fees</div>
                    </div>
                    <TrendArrow current={tc.bookings} prev={tc.prevBookings}/>
                    <ChevronRight className="w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"/>
                  </div>
                ))}
              </div>
            </div>

            {/* 8. SYSTEMS LINE — quiet health-check row, links out (no live status wired up yet) */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 py-2 text-xs text-ink-faint">
              <a href="https://github.com/camsanchez33/green-reserve/actions/workflows/db-backup.yml" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-ink-soft transition-colors">
                <StatusDot status="neutral"/><HardDrive className="w-3 h-3"/>Backups<ExternalLink className="w-2.5 h-2.5"/>
              </a>
              <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-ink-soft transition-colors">
                <StatusDot status="neutral"/><Clock3 className="w-3 h-3"/>Crons<ExternalLink className="w-2.5 h-2.5"/>
              </a>
              <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-ink-soft transition-colors">
                <StatusDot status="neutral"/><Zap className="w-3 h-3"/>Stripe Webhook<ExternalLink className="w-2.5 h-2.5"/>
              </a>
              <a href="https://github.com/camsanchez33/green-reserve/actions" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-ink-soft transition-colors">
                <StatusDot status="neutral"/><GitBranch className="w-3 h-3"/>CI<ExternalLink className="w-2.5 h-2.5"/>
              </a>
              <span className="text-ink-faint/70">— manual check, live status not wired up yet</span>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
