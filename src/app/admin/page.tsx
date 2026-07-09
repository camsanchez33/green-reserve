'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart2, AlertCircle, DollarSign, TrendingUp, Building2, RefreshCw,
  ArrowUpRight, ArrowDownRight, ChevronRight, Activity, CheckCircle2,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface Stats {
  totalCourses: number; archivedCourses: number; activeCourses: number; pendingInquiries: number;
  totalBookings: number; recentBookings: number; recentBookingsPrev30d: number;
  totalGolfers: number; newGolfers30d: number; newGolfersPrev30d: number;
  platformRevenue30d: number; platformRevenuePrev30d: number;
  newCourses30d: number; newCoursesPrev30d: number;
  revenueByDay: { date: string; platform: number; gross: number; bookings: number }[];
  topCourses: { id: string; name: string; slug: string; bookings: number; revenue: number }[];
  attentionItems: {
    staleInquiries: { id: string; courseName: string; status: string; createdAt: string }[];
    noStripe: { id: string; name: string; slug: string }[];
    stuckOperators: { id: string; email: string; name: string; onboardingStep: number; createdAt: string; courseId: string | null }[];
  };
  recentActivity: {
    bookings: { id: string; courseId: string; courseName: string; golferName: string; players: number; totalAmount: number; teeDate: string; teeTime: string; createdAt: string }[];
    inquiries: { id: string; courseName: string; contactName: string; status: string; createdAt: string }[];
  };
  needsYou: {
    yourMoveInquiries: { id: string; courseName: string; status: string; updatedAt: string }[];
    draftCourses: { id: string; name: string; createdAt: string }[];
    failedChargesCount: number | null;
    unreadMessages: number;
  };
}

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Trend({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return null;
  if (prev === 0) return <span className="text-[11px] text-ink-muted">— vs prior 30d</span>;
  const delta = ((current - prev) / prev) * 100;
  const up = delta >= 0;
  const cls = up ? 'text-ok' : 'text-bad';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="w-3 h-3"/>{Math.abs(delta).toFixed(0)}% vs prior 30d
    </span>
  );
}

function RevenueChart({ data }: { data: { date: string; platform: number; gross: number }[] }) {
  if (!data.length) return <div className="text-center text-ink-muted py-12 text-sm">No bookings yet</div>;
  const max = Math.max(...data.map(d => d.gross), 0.01);
  const platformMax = Math.max(...data.map(d => d.platform), 0.01);
  const totalGross = data.reduce((s, d) => s + d.gross, 0);
  const totalPlatform = data.reduce((s, d) => s + d.platform, 0);

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Total Gross</div>
          <div className="text-xl font-serif font-medium text-ink">{fmtMoney(totalGross)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">GR Fees Earned</div>
          <div className="text-xl font-serif font-medium text-ok">{fmtMoney(totalPlatform)}</div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong inline-block"/>Gross</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok inline-block"/>GR Fees</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-24">
        {data.map(d => (
          <div key={d.date} className="flex-1 flex items-end gap-px group relative" title={`${fmtDateShort(d.date)}\nGross: ${fmtMoney(d.gross)}\nFees: ${fmtMoney(d.platform)}`}>
            <div className="flex-1 bg-line rounded-t-sm transition-all group-hover:bg-line-strong" style={{ height: `${Math.max(2, (d.gross / max) * 100)}%` }}/>
            <div className="flex-1 bg-ok/60 rounded-t-sm transition-all group-hover:bg-ok/80" style={{ height: `${Math.max(2, (d.platform / platformMax) * 100)}%` }}/>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-ink-muted">
        <span>{data.length > 0 ? fmtDateShort(data[0].date) : ''}</span>
        <span>{data.length > 0 ? fmtDateShort(data[Math.floor(data.length / 2)].date) : ''}</span>
        <span>{data.length > 0 ? fmtDateShort(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

const SUPPORT_PLUS_ROLES = ['owner', 'manager', 'support'];

function daysSince(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (86400000));
}

export default function AdminOverviewPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [role, setRole] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

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

  const attentionCount = stats
    ? stats.attentionItems.staleInquiries.length + stats.attentionItems.noStripe.length + stats.attentionItems.stuckOperators.length
    : 0;

  const statCards = stats ? [
    {
      label: 'Live Courses',
      value: stats.activeCourses,
      sub: stats.archivedCourses > 0 ? `${stats.totalCourses} active · ${stats.archivedCourses} archived` : `${stats.totalCourses} total`,
      icon: <Building2 className="w-4 h-4 text-ink-muted"/>,
      accent: false,
      href: '/admin/courses',
      trend: <Trend current={stats.newCourses30d} prev={stats.newCoursesPrev30d}/>,
    },
    {
      label: 'Pending Inquiries',
      value: stats.pendingInquiries,
      sub: 'awaiting review',
      icon: <AlertCircle className="w-4 h-4 text-ink-muted"/>,
      accent: false,
      href: '/admin/inquiries',
      trend: null,
    },
    {
      label: 'Bookings (30d)',
      value: stats.recentBookings,
      sub: `${stats.totalBookings} all time`,
      icon: <TrendingUp className="w-4 h-4 text-ink-muted"/>,
      accent: false,
      href: '/admin/activity',
      trend: <Trend current={stats.recentBookings} prev={stats.recentBookingsPrev30d}/>,
    },
    {
      label: 'GR Revenue (30d)',
      value: fmtMoney(stats.platformRevenue30d),
      sub: '$1.50/player access fee',
      icon: <DollarSign className="w-4 h-4 text-ok"/>,
      accent: true,
      href: '/admin/activity',
      trend: <Trend current={stats.platformRevenue30d} prev={stats.platformRevenuePrev30d}/>,
    },
  ] : [];

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="overview" pendingInquiries={stats?.pendingInquiries ?? 0} />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
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
            {/* Needs you */}
            {(() => {
              const ny = stats.needsYou;
              const isSupportPlus = SUPPORT_PLUS_ROLES.includes(role);
              const rows: { status: 'ok' | 'bad' | 'warn' | 'neutral'; text: string; subtext?: string; href: string }[] = [];

              if (ny.yourMoveInquiries.length > 0) {
                const top = ny.yourMoveInquiries[0];
                rows.push({
                  status: 'warn',
                  text: `${ny.yourMoveInquiries.length} inquir${ny.yourMoveInquiries.length === 1 ? 'y' : 'ies'} on your move`,
                  subtext: `${top.courseName} — ${top.status === 'building' ? 'building' : 'sheet submitted'} · ${daysSince(top.updatedAt)}d in stage`,
                  href: '/admin/inquiries?tab=your-move',
                });
              }

              if (isSupportPlus && ny.failedChargesCount !== null && ny.failedChargesCount > 0) {
                rows.push({
                  status: 'bad',
                  text: `${ny.failedChargesCount} failed charge${ny.failedChargesCount !== 1 ? 's' : ''} since yesterday`,
                  subtext: 'Golfers can\'t be charged at check-in — action needed',
                  href: '/admin/revenue',
                });
              }

              if (stats.attentionItems.noStripe.length > 0) {
                const top = stats.attentionItems.noStripe[0];
                rows.push({
                  status: 'bad',
                  text: `${stats.attentionItems.noStripe.length} course${stats.attentionItems.noStripe.length !== 1 ? 's' : ''} without Stripe`,
                  subtext: `${top.name}${stats.attentionItems.noStripe.length > 1 ? ` + ${stats.attentionItems.noStripe.length - 1} more` : ''} — can't take payments`,
                  href: `/admin/courses?courseId=${top.id}`,
                });
              }

              if (isSupportPlus && ny.unreadMessages > 0) {
                rows.push({
                  status: 'neutral',
                  text: `${ny.unreadMessages} unread message${ny.unreadMessages !== 1 ? 's' : ''}`,
                  subtext: 'From course operators',
                  href: '/admin/messages',
                });
              }

              if (ny.draftCourses.length > 0) {
                const top = ny.draftCourses[0];
                rows.push({
                  status: 'neutral',
                  text: `${ny.draftCourses.length} draft course${ny.draftCourses.length !== 1 ? 's' : ''} not yet live`,
                  subtext: `${top.name}${ny.draftCourses.length > 1 ? ` + ${ny.draftCourses.length - 1} more` : ''}`,
                  href: `/admin/courses?courseId=${top.id}`,
                });
              }

              return (
                <div className="bg-white border border-line rounded-lg p-5 mb-6">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Needs you</div>
                  {rows.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-ok">
                      <CheckCircle2 className="w-4 h-4 shrink-0"/>
                      <span>All clear — nothing needs your attention right now</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {rows.map((row, idx) => (
                        <button
                          key={idx}
                          onClick={() => router.push(row.href)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-paper transition-colors text-left border border-line-soft hover:border-line"
                        >
                          <StatusDot status={row.status}/>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-ink">{row.text}</div>
                            {row.subtext && <div className="text-xs text-ink-muted mt-0.5 truncate">{row.subtext}</div>}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0"/>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {statCards.map(card => (
                <div
                  key={card.label}
                  onClick={() => router.push(card.href)}
                  className={`rounded-lg border p-5 relative overflow-hidden cursor-pointer transition-all group ${
                    card.accent
                      ? 'bg-pine/5 border-pine/20 hover:border-pine/40'
                      : 'bg-white border-line hover:border-line-strong'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 rounded-md ${card.accent ? 'bg-pine/10' : 'bg-paper'}`}>{card.icon}</div>
                    {card.trend}
                  </div>
                  <div className={`text-[26px] font-serif font-medium mb-0.5 ${card.accent ? 'text-pine' : 'text-ink'}`}>{card.value}</div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{card.label}</div>
                  {card.sub && <div className="text-xs text-ink-faint mt-0.5">{card.sub}</div>}
                  <ChevronRight className="absolute bottom-4 right-4 w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity"/>
                </div>
              ))}
            </div>

            {/* Revenue chart */}
            <div className="bg-white border border-line rounded-lg p-6 mb-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-ink-muted"/>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Revenue — Last 30 Days</div>
              </div>
              <RevenueChart data={stats.revenueByDay}/>
            </div>

            <div className="grid grid-cols-5 gap-4 mb-5">
              {/* Top courses */}
              <div className="col-span-2 bg-white border border-line rounded-lg p-5">
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
                      <ChevronRight className="w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attention items */}
              <div className="col-span-3 bg-white border border-line rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 text-warn"/>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                    Needs Attention {attentionCount > 0 && <span className="text-warn">({attentionCount})</span>}
                  </div>
                </div>
                {attentionCount === 0 && <div className="text-xs text-ink-faint py-4">All good — nothing stuck</div>}
                <div className="space-y-1.5">
                  {stats.attentionItems.staleInquiries.map(i => (
                    <button key={i.id} onClick={() => router.push('/admin/inquiries')}
                      className="w-full flex items-center gap-3 px-3 py-2 bg-warn/5 border border-warn/20 rounded-md hover:bg-warn/10 transition-colors text-left">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-warn truncate">{i.courseName}</div>
                        <div className="text-[10px] text-ink-muted">Stale inquiry · {i.status} · since {fmtDate(i.createdAt)}</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-warn/60 shrink-0"/>
                    </button>
                  ))}
                  {stats.attentionItems.noStripe.map(c => (
                    <button key={c.id} onClick={() => router.push(`/admin/courses?courseId=${c.id}&tab=overview`)}
                      className="w-full flex items-center gap-3 px-3 py-2 bg-bad/5 border border-bad/20 rounded-md hover:bg-bad/10 transition-colors text-left">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-bad truncate">{c.name}</div>
                        <div className="text-[10px] text-ink-muted">Live but no Stripe — can&apos;t take payments</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-bad/60 shrink-0"/>
                    </button>
                  ))}
                  {stats.attentionItems.stuckOperators.map(o => (
                    <button key={o.id}
                      onClick={() => router.push(o.courseId ? `/admin/courses?courseId=${o.courseId}` : '/admin/courses')}
                      className="w-full flex items-center gap-3 px-3 py-2 bg-paper border border-line rounded-md hover:border-line-strong hover:bg-white transition-colors text-left">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-ink truncate">{o.name}</div>
                        <div className="text-[10px] text-ink-muted">Onboarding stuck at step {o.onboardingStep}/3 · {o.email}</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0"/>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white border border-line rounded-lg p-5 mb-5">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Quick Actions</div>
              <div className="flex gap-3 flex-wrap">
                {stats.pendingInquiries > 0 && (
                  <button onClick={() => router.push('/admin/inquiries')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-warn/5 border border-warn/30 rounded-md hover:bg-warn/10 transition-colors group">
                    <AlertCircle className="w-4 h-4 text-warn"/>
                    <span className="text-[12.5px] font-medium text-warn">{stats.pendingInquiries} pending inquir{stats.pendingInquiries === 1 ? 'y' : 'ies'}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-warn/60 group-hover:translate-x-0.5 transition-transform"/>
                  </button>
                )}
                <button onClick={() => router.push('/admin/courses')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-paper border border-line rounded-md hover:border-line-strong hover:bg-white transition-colors group">
                  <Building2 className="w-4 h-4 text-ink-muted"/>
                  <span className="text-[12.5px] font-medium text-ink-soft">Manage courses</span>
                  <ChevronRight className="w-3.5 h-3.5 text-ink-faint group-hover:translate-x-0.5 transition-transform"/>
                </button>
                <button onClick={() => router.push('/admin/create')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-paper border border-line rounded-md hover:border-line-strong hover:bg-white transition-colors group">
                  <Building2 className="w-4 h-4 text-ink-muted"/>
                  <span className="text-[12.5px] font-medium text-ink-soft">Add course</span>
                  <ChevronRight className="w-3.5 h-3.5 text-ink-faint group-hover:translate-x-0.5 transition-transform"/>
                </button>
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-white border border-line rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-3.5 h-3.5 text-ink-muted"/>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Recent Activity</div>
                <button onClick={() => router.push('/admin/activity')} className="ml-auto text-xs text-ink-muted hover:text-ink transition-colors flex items-center gap-1">
                  View all<ChevronRight className="w-3 h-3"/>
                </button>
              </div>
              <div className="space-y-0.5">
                {stats.recentActivity.bookings.map(b => (
                  <div
                    key={b.id}
                    onClick={() => router.push(`/admin/courses?courseId=${b.courseId}`)}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md border-b border-line-soft last:border-0 cursor-pointer hover:bg-paper transition-colors group"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-ok shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-ink font-medium">{b.golferName}</span>
                      <span className="text-xs text-ink-soft"> booked {b.courseName} · {b.players}p</span>
                    </div>
                    <div className="text-xs font-medium text-ok shrink-0">{fmtMoney(b.totalAmount / 100)}</div>
                    <div className="text-[10px] text-ink-muted shrink-0 hidden sm:block">{fmtDate(b.createdAt)}</div>
                    <ChevronRight className="w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"/>
                  </div>
                ))}
                {stats.recentActivity.inquiries.map(i => (
                  <div
                    key={i.id}
                    onClick={() => router.push('/admin/inquiries')}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md border-b border-line-soft last:border-0 cursor-pointer hover:bg-paper transition-colors group"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-warn shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-ink font-medium">{i.courseName}</span>
                      <span className="text-xs text-ink-soft"> inquiry from {i.contactName} · {i.status}</span>
                    </div>
                    <div className="text-[10px] text-ink-muted shrink-0 hidden sm:block">{fmtDate(i.createdAt)}</div>
                    <ChevronRight className="w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"/>
                  </div>
                ))}
                {stats.recentActivity.bookings.length === 0 && stats.recentActivity.inquiries.length === 0 && (
                  <div className="text-xs text-ink-faint py-4 text-center">No activity yet</div>
                )}
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
