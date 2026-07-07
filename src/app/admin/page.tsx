'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart2, Users, DollarSign, TrendingUp, Building2, RefreshCw,
  ArrowUpRight, ArrowDownRight, AlertCircle, ChevronRight, Activity,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface Stats {
  totalCourses: number; activeCourses: number; pendingInquiries: number;
  totalBookings: number; recentBookings: number; recentBookingsPrev30d: number;
  totalGolfers: number; newGolfers30d: number; newGolfersPrev30d: number;
  platformRevenue30d: number; platformRevenuePrev30d: number;
  newCourses30d: number; newCoursesPrev30d: number;
  revenueByDay: { date: string; platform: number; gross: number; bookings: number }[];
  topCourses: { id: string; name: string; slug: string; bookings: number; revenue: number }[];
  attentionItems: {
    staleInquiries: { id: string; courseName: string; status: string; createdAt: string }[];
    noStripe: { id: string; name: string; slug: string }[];
    stuckOperators: { id: string; email: string; name: string; onboardingStep: number; createdAt: string }[];
  };
  recentActivity: {
    bookings: { id: string; courseName: string; golferName: string; players: number; totalAmount: number; teeDate: string; teeTime: string; createdAt: string }[];
    inquiries: { id: string; courseName: string; contactName: string; status: string; createdAt: string }[];
  };
}

const fmtMoney = (n: number) => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Trend({ current, prev, prefix = '', suffix = '' }: { current: number; prev: number; prefix?: string; suffix?: string }) {
  if (prev === 0 && current === 0) return null;
  const delta = prev === 0 ? 100 : ((current - prev) / prev) * 100;
  const up = delta >= 0;
  const cls = up ? 'text-emerald-400' : 'text-red-400';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3"/>
      {prefix}{Math.abs(delta).toFixed(0)}{suffix}% vs prior 30d
    </span>
  );
}

function RevenueChart({ data }: { data: { date: string; platform: number; gross: number }[] }) {
  if (!data.length) return <div className="text-center text-gray-600 py-12 text-sm">No bookings yet</div>;
  const max = Math.max(...data.map(d => d.gross), 0.01);
  const platformMax = Math.max(...data.map(d => d.platform), 0.01);
  const totalGross = data.reduce((s, d) => s + d.gross, 0);
  const totalPlatform = data.reduce((s, d) => s + d.platform, 0);

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Total Gross</div>
          <div className="text-xl font-black text-white">{fmtMoney(totalGross)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">GR Fees Earned</div>
          <div className="text-xl font-black text-emerald-400">{fmtMoney(totalPlatform)}</div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-600 inline-block"/>Gross</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"/>GR Fees</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-24">
        {data.map(d => (
          <div key={d.date} className="flex-1 flex items-end gap-px group relative" title={`${fmtDateShort(d.date)}\nGross: ${fmtMoney(d.gross)}\nFees: ${fmtMoney(d.platform)}`}>
            <div className="flex-1 bg-gray-700/50 rounded-t-sm transition-all group-hover:bg-gray-600/70" style={{ height: `${Math.max(2, (d.gross / max) * 100)}%` }}/>
            <div className="flex-1 bg-emerald-500/80 rounded-t-sm transition-all group-hover:bg-emerald-400" style={{ height: `${Math.max(2, (d.platform / platformMax) * 100)}%` }}/>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-gray-600">
        <span>{data.length > 0 ? fmtDateShort(data[0].date) : ''}</span>
        <span>{data.length > 0 ? fmtDateShort(data[Math.floor(data.length / 2)].date) : ''}</span>
        <span>{data.length > 0 ? fmtDateShort(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
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
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadStats();
  }, [adminReady, loadStats]);

  if (!adminReady) return null;

  const attentionCount = stats
    ? stats.attentionItems.staleInquiries.length + stats.attentionItems.noStripe.length + stats.attentionItems.stuckOperators.length
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="overview" pendingInquiries={stats?.pendingInquiries ?? 0} />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="text-2xl font-black text-white">Platform Overview</h1>
              <div className="text-sm text-gray-500 mt-0.5">Everything happening across GreenReserve</div>
            </div>
            <button onClick={loadStats} disabled={loading} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>Refresh
            </button>
          </div>

          {!stats && loading && <div className="text-gray-600 text-center py-20 text-sm">Loading...</div>}

          {stats && <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                {
                  label: 'Live Courses', value: stats.activeCourses, sub: `${stats.totalCourses} total`,
                  icon: <Building2 className="w-4 h-4"/>, accent: false,
                  trend: <Trend current={stats.newCourses30d} prev={stats.newCoursesPrev30d}/>,
                },
                {
                  label: 'Golfer Accounts', value: stats.totalGolfers, sub: `+${stats.newGolfers30d} this month`,
                  icon: <Users className="w-4 h-4"/>, accent: false,
                  trend: <Trend current={stats.newGolfers30d} prev={stats.newGolfersPrev30d}/>,
                },
                {
                  label: 'Bookings (30d)', value: stats.recentBookings, sub: `${stats.totalBookings} all time`,
                  icon: <TrendingUp className="w-4 h-4"/>, accent: false,
                  trend: <Trend current={stats.recentBookings} prev={stats.recentBookingsPrev30d}/>,
                },
                {
                  label: 'GR Revenue (30d)', value: fmtMoney(stats.platformRevenue30d), sub: '$1.50/player access fee',
                  icon: <DollarSign className="w-4 h-4"/>, accent: true,
                  trend: <Trend current={stats.platformRevenue30d} prev={stats.platformRevenuePrev30d}/>,
                },
              ].map(card => (
                <div key={card.label} className={`rounded-lg border p-5 relative overflow-hidden ${card.accent ? 'bg-gradient-to-br from-emerald-900/60 to-emerald-800/30 border-emerald-700/50' : 'bg-gray-900 border-gray-800'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 rounded-lg ${card.accent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>{card.icon}</div>
                    {card.trend}
                  </div>
                  <div className={`text-3xl font-black mb-0.5 ${card.accent ? 'text-emerald-300' : 'text-white'}`}>{card.value}</div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{card.label}</div>
                  {card.sub && <div className="text-xs text-gray-600 mt-0.5">{card.sub}</div>}
                </div>
              ))}
            </div>

            {/* Revenue chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-gray-500"/>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Revenue — Last 30 Days</div>
              </div>
              <RevenueChart data={stats.revenueByDay}/>
            </div>

            <div className="grid grid-cols-5 gap-4 mb-5">
              {/* Top courses */}
              <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-5">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Courses (30d)</div>
                {stats.topCourses.length === 0 && <div className="text-xs text-gray-700 py-4">No bookings yet</div>}
                <div className="space-y-2">
                  {stats.topCourses.map((tc, idx) => (
                    <div key={tc.id} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-lg bg-gray-800 flex items-center justify-center text-[10px] font-black text-gray-500 shrink-0">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{tc.name}</div>
                        <div className="text-xs text-gray-600">{tc.bookings} bookings · {fmtMoney(tc.revenue)} fees</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attention items */}
              <div className="col-span-3 bg-gray-900 border border-gray-800 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500"/>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Needs Attention {attentionCount > 0 && <span className="text-amber-400">({attentionCount})</span>}</div>
                </div>
                {attentionCount === 0 && <div className="text-xs text-gray-700 py-4">All good — nothing stuck</div>}
                <div className="space-y-1.5">
                  {stats.attentionItems.staleInquiries.map(i => (
                    <button key={i.id} onClick={() => router.push('/admin/inquiries')}
                      className="w-full flex items-center gap-3 px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg hover:bg-amber-500/10 transition-colors text-left">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-amber-300 truncate">{i.courseName}</div>
                        <div className="text-[10px] text-amber-600">Stale inquiry · {i.status} · since {fmtDate(i.createdAt)}</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-amber-600 shrink-0"/>
                    </button>
                  ))}
                  {stats.attentionItems.noStripe.map(c => (
                    <button key={c.id} onClick={() => router.push(`/admin/courses?courseId=${c.id}&tab=overview`)}
                      className="w-full flex items-center gap-3 px-3 py-2 bg-purple-500/5 border border-purple-500/20 rounded-lg hover:bg-purple-500/10 transition-colors text-left">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-purple-300 truncate">{c.name}</div>
                        <div className="text-[10px] text-purple-600">Live but no Stripe — can&apos;t take payments</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-purple-600 shrink-0"/>
                    </button>
                  ))}
                  {stats.attentionItems.stuckOperators.map(o => (
                    <div key={o.id} className="flex items-center gap-3 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-300 truncate">{o.name}</div>
                        <div className="text-[10px] text-gray-600">Onboarding stuck at step {o.onboardingStep}/3 · {o.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</div>
              <div className="flex gap-3 flex-wrap">
                {stats.pendingInquiries > 0 && (
                  <button onClick={() => router.push('/admin/inquiries')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/15 transition-colors group">
                    <AlertCircle className="w-4 h-4 text-yellow-400"/>
                    <span className="text-sm font-semibold text-yellow-300">{stats.pendingInquiries} pending inquir{stats.pendingInquiries === 1 ? 'y' : 'ies'}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-yellow-500 group-hover:translate-x-0.5 transition-transform"/>
                  </button>
                )}
                <button onClick={() => router.push('/admin/courses')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 transition-colors group">
                  <Building2 className="w-4 h-4 text-gray-400"/>
                  <span className="text-sm font-medium text-gray-300">Manage courses</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:translate-x-0.5 transition-transform"/>
                </button>
                <button onClick={() => router.push('/admin/create')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 transition-colors group">
                  <Building2 className="w-4 h-4 text-gray-400"/>
                  <span className="text-sm font-medium text-gray-300">Add course</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:translate-x-0.5 transition-transform"/>
                </button>
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-3.5 h-3.5 text-gray-500"/>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Activity</div>
              </div>
              <div className="space-y-1">
                {stats.recentActivity.bookings.map(b => (
                  <div key={b.id} className="flex items-center gap-3 py-2 border-b border-gray-800/50 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-medium">{b.golferName}</span>
                      <span className="text-xs text-gray-500"> booked {b.courseName} · {b.players}p</span>
                    </div>
                    <div className="text-xs font-bold text-emerald-400 shrink-0">{fmtMoney(b.totalAmount / 100)}</div>
                    <div className="text-[10px] text-gray-600 shrink-0">{fmtDate(b.createdAt)}</div>
                  </div>
                ))}
                {stats.recentActivity.inquiries.map(i => (
                  <div key={i.id} className="flex items-center gap-3 py-2 border-b border-gray-800/50 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-medium">{i.courseName}</span>
                      <span className="text-xs text-gray-500"> inquiry from {i.contactName} · {i.status}</span>
                    </div>
                    <div className="text-[10px] text-gray-600 shrink-0">{fmtDate(i.createdAt)}</div>
                  </div>
                ))}
                {stats.recentActivity.bookings.length === 0 && stats.recentActivity.inquiries.length === 0 && (
                  <div className="text-xs text-gray-700 py-4 text-center">No activity yet</div>
                )}
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
