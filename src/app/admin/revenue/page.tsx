'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, RefreshCw, AlertTriangle, ChevronUp, ChevronDown,
  ExternalLink, Search,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

const fmtMoney = (n: number) =>
  n === 0 ? '$0' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCount = (n: number) => n.toLocaleString('en-US');

interface Stats {
  feesToday: number; fees7d: number; feesMonth: number;
  bookingsToday: number; bookings7d: number; bookingsMonth: number;
  failedChargesCount: number;
}

interface CourseRow {
  courseId: string; name: string; active: boolean; archived: boolean; stripeActive: boolean;
  bookings: number; serviceFees: number; greenFeeVolume: number; failedCharges: number;
}

interface FailedCheckIn {
  bookingId: string; courseId: string; courseName: string;
  golferName: string; golferEmail: string; failReason: string;
  teeDate: string; teeTime: string; amount: number;
}

interface RevenueData {
  stats: Stats;
  byCourse: CourseRow[];
  problems: { failedCheckIn: FailedCheckIn[] };
  period: { from: string; to: string; label: string };
}

type SortKey = 'name' | 'bookings' | 'serviceFees' | 'greenFeeVolume' | 'failedCharges';
type Period = '7d' | '30d' | '90d' | 'custom';

export default function RevenuePage() {
  const router = useRouter();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('serviceFees');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const initRef = useRef(false);

  const load = useCallback(async (p: Period, cFrom: string, cTo: string) => {
    setLoading(true);
    setError('');
    try {
      const sRes = await fetch('/api/admin/session');
      if (!sRes.ok) { router.push('/admin/login'); return; }
      const params = new URLSearchParams();
      if (p === 'custom' && cFrom && cTo) {
        params.set('from', cFrom);
        params.set('to', cTo);
      } else if (p !== 'custom') {
        params.set('period', p);
      }
      const res = await fetch(`/api/admin/revenue?${params}`);
      if (res.status === 403) { setError('This page requires elevated permissions.'); setLoading(false); return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || `Failed to load revenue data (${res.status})`); setLoading(false); return; }
      const d: RevenueData = await res.json();
      setData(d);
    } catch { setError('Network error — check your connection and try again.'); }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (!initRef.current) { initRef.current = true; load('30d', '', ''); }
  }, [load]);

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    if (p !== 'custom') load(p, '', '');
  }

  function handleCustomLoad() {
    if (customFrom && customTo) load('custom', customFrom, customTo);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

  const rows = data?.byCourse
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') return mul * a.name.localeCompare(b.name);
      return mul * (a[sortKey] - b[sortKey]);
    }) ?? [];

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 opacity-20"/>;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-pine"/>
      : <ChevronDown className="w-3 h-3 text-pine"/>;
  }

  function ColHeader({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] text-ink-muted hover:text-ink transition-colors ${right ? 'ml-auto' : ''}`}
      >
        {label}<SortIcon col={col}/>
      </button>
    );
  }

  const stats = data?.stats;
  const problems = data?.problems.failedCheckIn ?? [];

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="revenue"/>
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">Admin</p>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Revenue</h1>
            </div>
            <button
              onClick={() => load(period, customFrom, customTo)}
              className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors"
            >
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {error && (
            <div className="bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad mb-5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0"/>{error}
            </div>
          )}

          {/* Header stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              {/* Fees */}
              <div className="bg-white border border-line rounded-lg p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-pine"/>
                  <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Service fees</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Today</div>
                    <div className="text-2xl font-serif font-medium text-ink tabular-nums">{fmtMoney(stats.feesToday)}</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-line-soft">
                    <div>
                      <div className="text-[11px] text-ink-muted">Last 7 days</div>
                      <div className="text-base font-serif font-medium text-ink tabular-nums">{fmtMoney(stats.fees7d)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-ink-muted">This month</div>
                      <div className="text-base font-serif font-medium text-ink tabular-nums">{fmtMoney(stats.feesMonth)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bookings */}
              <div className="bg-white border border-line rounded-lg p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Bookings</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Today</div>
                    <div className="text-2xl font-serif font-medium text-ink tabular-nums">{fmtCount(stats.bookingsToday)}</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-line-soft">
                    <div>
                      <div className="text-[11px] text-ink-muted">Last 7 days</div>
                      <div className="text-base font-serif font-medium text-ink tabular-nums">{fmtCount(stats.bookings7d)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-ink-muted">This month</div>
                      <div className="text-base font-serif font-medium text-ink tabular-nums">{fmtCount(stats.bookingsMonth)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Failed charges alert */}
              <div className={`border rounded-lg p-5 ${stats.failedChargesCount > 0 ? 'bg-bad/5 border-bad/25' : 'bg-white border-line'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className={`w-4 h-4 ${stats.failedChargesCount > 0 ? 'text-bad' : 'text-ink-muted'}`}/>
                  <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Failed charges</span>
                </div>
                <div className="text-2xl font-serif font-medium tabular-nums" style={{ color: stats.failedChargesCount > 0 ? 'var(--color-bad)' : 'var(--color-ink)' }}>
                  {fmtCount(stats.failedChargesCount)}
                </div>
                <div className="text-[12px] text-ink-muted mt-2">
                  {stats.failedChargesCount === 0
                    ? 'No pending failed charges'
                    : `${stats.failedChargesCount} booking${stats.failedChargesCount !== 1 ? 's' : ''} need${stats.failedChargesCount === 1 ? 's' : ''} attention`}
                </div>
              </div>
            </div>
          )}

          {/* Problems section */}
          {problems.length > 0 && (
            <div className="bg-bad/5 border border-bad/20 rounded-lg p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-bad"/>
                <span className="text-sm font-medium text-bad">Failed check-in charges ({problems.length})</span>
              </div>
              <div className="space-y-3">
                {problems.map(p => (
                  <div key={p.bookingId} className="bg-white border border-bad/15 rounded-md px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink">{p.golferName}</span>
                          <span className="text-[11px] text-ink-faint">·</span>
                          <span className="text-xs text-ink-muted">{p.courseName}</span>
                          <span className="text-[11px] text-ink-faint">·</span>
                          <span className="text-xs text-ink-muted">{p.teeDate} {p.teeTime}</span>
                        </div>
                        <div className="text-xs text-bad mt-1">{p.failReason}</div>
                        <div className="text-xs text-ink-muted mt-0.5">{p.golferEmail}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium text-ink tabular-nums mb-1.5">{fmtMoney(p.amount)}</div>
                        <a
                          href={`/admin/courses/${p.courseId}`}
                          className="inline-flex items-center gap-1 text-[11px] text-pine hover:text-pine-hover underline"
                        >
                          View course<ExternalLink className="w-3 h-3"/>
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-muted mt-3">Collect payment in person or retry via the course dashboard. Contact support if the issue persists.</p>
            </div>
          )}

          {/* Period selector + course table */}
          <div className="bg-white border border-line rounded-lg overflow-hidden">
            {/* Table toolbar */}
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-1 bg-paper border border-line rounded-md p-1">
                {(['7d', '30d', '90d', 'custom'] as Period[]).map(p => (
                  <button
                    key={p}
                    onClick={() => handlePeriodChange(p)}
                    className={'px-3 py-1.5 rounded text-[11px] font-medium transition-colors ' + (period === p ? 'bg-white text-ink border border-line shadow-sm' : 'text-ink-muted hover:text-ink')}
                  >
                    {p === '7d' ? '7 days' : p === '30d' ? '30 days' : p === '90d' ? '90 days' : 'Custom'}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={iCls}/>
                  <span className="text-ink-muted text-sm">–</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={iCls}/>
                  <button
                    onClick={handleCustomLoad}
                    disabled={!customFrom || !customTo}
                    className="bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors"
                  >
                    Load
                  </button>
                </div>
              )}
              <div className="relative ml-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none"/>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search courses…"
                  className={iCls + ' pl-8 w-52'}
                />
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-ink-muted text-sm">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-ink-muted text-sm">
                {search ? 'No courses match your search' : `No revenue data for ${data?.period.label ?? 'this period'}`}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-soft">
                      <th className="text-left px-5 py-3 font-normal">
                        <ColHeader col="name" label="Course"/>
                      </th>
                      <th className="text-right px-4 py-3 font-normal">
                        <div className="flex justify-end"><ColHeader col="bookings" label="Bookings"/></div>
                      </th>
                      <th className="text-right px-4 py-3 font-normal">
                        <div className="flex justify-end"><ColHeader col="serviceFees" label="Service fees"/></div>
                      </th>
                      <th className="text-right px-4 py-3 font-normal">
                        <div className="flex justify-end"><ColHeader col="greenFeeVolume" label="Green fee vol."/></div>
                      </th>
                      <th className="text-right px-4 py-3 font-normal">
                        <div className="flex justify-end"><ColHeader col="failedCharges" label="Failed"/></div>
                      </th>
                      <th className="text-center px-4 py-3 font-normal">
                        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Stripe</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {rows.map(r => (
                      <tr key={r.courseId} className="hover:bg-paper/60 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className={'font-medium ' + (r.archived ? 'text-ink-muted' : 'text-ink')}>{r.name}</span>
                            {r.archived && (
                              <span className="text-[10px] text-ink-faint bg-line rounded px-1.5 py-0.5">archived</span>
                            )}
                            {!r.archived && !r.active && (
                              <span className="text-[10px] text-ink-faint bg-line rounded px-1.5 py-0.5">inactive</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{fmtCount(r.bookings)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">{fmtMoney(r.serviceFees)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-soft">{fmtMoney(r.greenFeeVolume)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.failedCharges > 0 ? (
                            <span className="text-bad font-medium">{r.failedCharges}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <StatusDot status={r.stripeActive ? 'ok' : 'warn'} label={r.stripeActive ? 'Connected' : 'Not connected'}/>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table footer */}
            {!loading && rows.length > 0 && (
              <div className="px-5 py-3 border-t border-line-soft flex items-center justify-between">
                <span className="text-xs text-ink-muted">{rows.length} course{rows.length !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}</span>
                <span className="text-xs text-ink-muted">{data?.period.label}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
