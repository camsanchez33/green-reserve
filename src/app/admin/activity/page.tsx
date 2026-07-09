'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface Course { id: string; name: string; }
interface EventRow {
  id: string; type: 'booking' | 'cancellation' | 'membership' | 'membership_payment';
  courseName: string;
  golferName?: string; golferEmail?: string;
  description: string; amount?: number; timestamp: string;
}

const fmtDate = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

const TYPE_DOT: Record<EventRow['type'], string> = {
  booking: 'ok',
  cancellation: 'bad',
  membership: 'neutral',
  membership_payment: 'warn',
};
const TYPE_LABEL: Record<EventRow['type'], string> = {
  booking: 'Booking',
  cancellation: 'Cancellation',
  membership: 'Membership',
  membership_payment: 'Payment',
};

export default function ActivityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [to, setTo] = useState('');
  const [datePreset, setDatePreset] = useState<'30d' | '7d' | 'custom'>('30d');
  const initRef = useRef(false);

  const doLoad = useCallback(async (p: number, cId: string, f: string, t: string) => {
    setLoading(true);
    try {
      const sRes = await fetch('/api/admin/session');
      if (!sRes.ok) { router.push('/admin/login'); return; }
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (cId) params.set('courseId', cId);
      if (f) params.set('from', f);
      if (t) params.set('to', t);
      const [aRes, cRes] = await Promise.all([
        fetch(`/api/admin/activity?${params}`),
        fetch('/api/admin/courses?simple=1'),
      ]);
      const [aData, cData] = await Promise.all([aRes.json(), cRes.json()]);
      setEvents(Array.isArray(aData.items) ? aData.items : []);
      setHasMore(aData.page < aData.pages);
      setCourses(Array.isArray(cData) ? cData : (Array.isArray(cData.courses) ? cData.courses : []));
    } catch { /* stay on page */ }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    if (!initRef.current) { initRef.current = true; doLoad(1, '', '', ''); }
  }, [doLoad]);

  function handleLoad() { doLoad(page, courseId, from, to); }
  function handlePrev() { const p = Math.max(1, page - 1); setPage(p); doLoad(p, courseId, from, to); }
  function handleNext() { const p = page + 1; setPage(p); doLoad(p, courseId, from, to); }

  const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="activity" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Activity</h1>
              <p className="text-sm text-ink-soft mt-0.5">Cross-course event feed</p>
            </div>
            <button onClick={() => doLoad(page, courseId, from, to)} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white border border-line rounded-lg p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-pine"/>
              <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Filters</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <select value={courseId} onChange={e => setCourseId(e.target.value)} className={iCls + ' flex-1 min-w-44 cursor-pointer'}>
                <option value="">All courses</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex items-center gap-1 bg-white border border-line rounded-md p-1">
                {([['30d', 'Last 30 days'], ['7d', 'Last 7 days'], ['custom', 'Custom']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDatePreset(key);
                      if (key === '30d') { const d = new Date(); d.setDate(d.getDate() - 30); setFrom(d.toISOString().split('T')[0]); setTo(''); }
                      else if (key === '7d') { const d = new Date(); d.setDate(d.getDate() - 7); setFrom(d.toISOString().split('T')[0]); setTo(''); }
                    }}
                    className={'px-3 py-1.5 rounded text-[11px] font-medium transition-colors ' + (datePreset === key ? 'bg-paper text-ink border border-line' : 'text-ink-muted hover:text-ink')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={iCls + ' flex-1 min-w-36'}/>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className={iCls + ' flex-1 min-w-36'}/>
                </>
              )}
              <button onClick={handleLoad} className="bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors">
                Load
              </button>
            </div>
          </div>

          {/* Events */}
          <div className="bg-white border border-line rounded-lg overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-ink-muted text-sm">Loading...</div>
            ) : events.length === 0 ? (
              <div className="py-12 text-center text-ink-muted text-sm">No events found</div>
            ) : (
              <div className="divide-y divide-line-soft">
                {events.map(ev => (
                  <div key={ev.id} className="px-5 py-3.5 flex items-start gap-4 hover:bg-paper/60 transition-colors">
                    <div className="pt-0.5">
                      <StatusDot status={TYPE_DOT[ev.type]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{TYPE_LABEL[ev.type]}</span>
                        <span className="text-[11px] text-ink-faint">·</span>
                        <span className="text-[11px] text-ink-muted">{ev.courseName}</span>
                      </div>
                      <div className="text-sm text-ink">{ev.description}</div>
                      {ev.golferName && (
                        <div className="text-xs text-ink-soft mt-0.5">{ev.golferName} · {ev.golferEmail}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {ev.amount !== undefined && ev.amount !== null && (
                        <div className={`text-sm font-medium tabular-nums mb-0.5 ${ev.type === 'cancellation' ? 'text-bad' : ev.type === 'membership_payment' ? 'text-warn' : 'text-ok'}`}>
                          {ev.type === 'cancellation' ? '-' : ''}{fmtMoney(ev.amount)}
                        </div>
                      )}
                      <div className="text-xs text-ink-muted tabular-nums">{fmtDate(ev.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && events.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-ink-muted">Page {page}</span>
              <div className="flex items-center gap-2">
                <button onClick={handlePrev} disabled={page <= 1}
                  className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink disabled:opacity-30 px-3 py-1.5 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
                  <ChevronLeft className="w-4 h-4"/>Prev
                </button>
                <button onClick={handleNext} disabled={!hasMore}
                  className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink disabled:opacity-30 px-3 py-1.5 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
                  Next<ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
